#!/usr/bin/env python3
"""
Benchmark 评估器脚本
用于评估 benchmark run 的结果

用法:
    python run_evaluator.py <run_id>
"""

import subprocess
import sys
import os
import json
import sqlite3
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
from concurrent.futures import ProcessPoolExecutor, as_completed

# 数据库路径
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'benchmark.db')


def get_db_connection():
    """获取数据库连接"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def parse_template(template: str, context: Dict) -> str:
    """解析模板，替换变量"""
    result = template
    for key, value in context.items():
        placeholder = f"{{{{{key}}}}}"
        result = result.replace(placeholder, str(value))
    return result


def evaluate_with_llm(prompt: str, model: str = "claude-sonnet-4-6") -> Dict:
    """使用 LLM 进行评估"""
    try:
        # 使用 acpx 调用 LLM 进行评估
        cmd = [
            "acpx",
            "--approve-all",
            "--format", "json",
            "--model", model,
            "general",
            "exec",
            prompt
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120
        )

        if result.returncode != 0:
            return {
                'success': False,
                'error': f"LLM 调用失败: {result.stderr}"
            }

        # 尝试从输出中提取 JSON
        output = result.stdout
        # 查找 JSON 块
        json_match = re.search(r'```json\s*(.*?)\s*```', output, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            json_str = output

        try:
            evaluation = json.loads(json_str)
            return {
                'success': True,
                'evaluation': evaluation
            }
        except json.JSONDecodeError:
            # 如果无法解析 JSON，将整个输出作为报告
            return {
                'success': True,
                'evaluation': {
                    'score': 0,
                    'report': output,
                    'key_points_met': [],
                    'forbidden_points_violated': []
                }
            }

    except subprocess.TimeoutExpired:
        return {
            'success': False,
            'error': 'LLM 评估超时'
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def evaluate_single_result(args: Dict) -> Dict:
    """评估单个结果（用于多进程）"""
    result_id = args['result_id']
    evaluator_config = args['evaluator_config']

    conn = get_db_connection()
    cursor = conn.cursor()

    # 获取结果详情
    cursor.execute('''
        SELECT
            br.*,
            a.name as agent_name,
            tc.test_id,
            tc.name as test_case_name,
            tc.input,
            tc.expected_output,
            tc.key_points,
            tc.forbidden_points
        FROM benchmark_results br
        JOIN agents a ON br.agent_id = a.id
        JOIN test_cases tc ON br.test_case_id = tc.id
        WHERE br.id = ?
    ''', (result_id,))

    result = cursor.fetchone()
    if not result:
        return {'error': 'Result not found'}

    # 构建评估上下文
    key_points = json.loads(result['key_points']) if result['key_points'] else []
    forbidden_points = json.loads(result['forbidden_points']) if result['forbidden_points'] else []

    context = {
        'agent_name': result['agent_name'],
        'test_id': result['test_id'],
        'test_case_name': result['test_case_name'],
        'input': result['input'],
        'expected_output': result['expected_output'] or '',
        'actual_output': result['actual_output'] or '',
        'key_points': json.dumps(key_points, ensure_ascii=False),
        'forbidden_points': json.dumps(forbidden_points, ensure_ascii=False),
        'execution_time_ms': result['execution_time_ms'] or 0,
        **evaluator_config.get('variables', {})
    }

    # 解析评估 prompt
    evaluation_prompt_template = evaluator_config.get('evaluation_prompt', '''
请评估以下 AI Agent 的回复质量。

## 测试用例信息
- 测试 ID: {{test_id}}
- 测试名称: {{test_case_name}}
- 输入: {{input}}
- 期望输出: {{expected_output}}

## 关键测试点
{{key_points}}

## 禁止点
{{forbidden_points}}

## Agent 实际输出
{{actual_output}}

## 评估要求
1. 检查实际输出是否满足所有关键测试点
2. 检查实际输出是否触犯了任何禁止点
3. 根据满足程度和违规情况打分（0-100）
4. 生成详细的评估报告

请以 JSON 格式返回评估结果：
{
    "score": 85,
    "report": "详细的评估报告...",
    "key_points_met": ["满足的关键点1", "满足的关键点2"],
    "forbidden_points_violated": ["违反的禁止点1"]
}
''')

    evaluation_prompt = parse_template(evaluation_prompt_template, context)

    # 执行评估
    model = evaluator_config.get('model', 'claude-sonnet-4-6')
    print(f"评估结果 {result_id}，使用模型: {model}...")
    eval_result = evaluate_with_llm(evaluation_prompt, model)

    if not eval_result['success']:
        print(f"评估失败: {eval_result.get('error')}")
        return {
            'result_id': result_id,
            'status': 'failed',
            'error': eval_result.get('error')
        }

    evaluation = eval_result['evaluation']

    # 保存评估结果
    cursor.execute(
        '''INSERT INTO evaluations
           (run_id, result_id, score, report, key_points_met, forbidden_points_violated, evaluated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)''',
        (
            result['run_id'],
            result_id,
            evaluation.get('score'),
            evaluation.get('report'),
            json.dumps(evaluation.get('key_points_met', []), ensure_ascii=False),
            json.dumps(evaluation.get('forbidden_points_violated', []), ensure_ascii=False),
            datetime.now().isoformat()
        )
    )
    conn.commit()

    return {
        'result_id': result_id,
        'status': 'completed',
        'score': evaluation.get('score')
    }


def run_evaluation(run_id: int):
    """执行评估"""
    print(f"开始评估 Benchmark Run {run_id}")

    conn = get_db_connection()
    cursor = conn.cursor()

    # 获取 run 详情
    cursor.execute('SELECT * FROM benchmark_runs WHERE id = ?', (run_id,))
    run = cursor.fetchone()

    if not run:
        print(f"错误: 未找到 benchmark run {run_id}")
        sys.exit(1)

    if not run['evaluator_id']:
        print("该 run 没有配置评估器，跳过评估")
        return

    # 获取评估器配置
    cursor.execute('SELECT * FROM evaluators WHERE id = ?', (run['evaluator_id'],))
    evaluator = cursor.fetchone()

    if not evaluator:
        print(f"错误: 未找到评估器 {run['evaluator_id']}")
        sys.exit(1)

    evaluator_config = json.loads(evaluator['config'])
    print(f"使用评估器: {evaluator['name']}")

    # 获取所有需要评估的结果
    cursor.execute('''
        SELECT br.id FROM benchmark_results br
        WHERE br.run_id = ? AND br.status = 'completed'
        AND NOT EXISTS (
            SELECT 1 FROM evaluations e WHERE e.result_id = br.id
        )
    ''', (run_id,))

    results_to_evaluate = [row['id'] for row in cursor.fetchall()]

    if not results_to_evaluate:
        print("没有需要评估的结果")
        return

    print(f"需要评估的结果数: {len(results_to_evaluate)}")

    # 准备评估任务
    eval_tasks = [
        {
            'result_id': result_id,
            'evaluator_config': evaluator_config
        }
        for result_id in results_to_evaluate
    ]

    # 获取并行度配置
    max_workers = evaluator_config.get('max_workers', 1)

    # 执行评估
    completed_count = 0
    failed_count = 0

    if max_workers > 1:
        # 并行执行
        with ProcessPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(evaluate_single_result, task): task for task in eval_tasks}
            for future in as_completed(futures):
                result = future.result()
                if result.get('status') == 'completed':
                    completed_count += 1
                else:
                    failed_count += 1
                print(f"评估进度: {completed_count + failed_count}/{len(eval_tasks)}")
    else:
        # 串行执行
        for task in eval_tasks:
            result = evaluate_single_result(task)
            if result.get('status') == 'completed':
                completed_count += 1
            else:
                failed_count += 1
            print(f"评估进度: {completed_count + failed_count}/{len(eval_tasks)}")

    print(f"\n评估完成!")
    print(f"总计: {len(eval_tasks)}, 成功: {completed_count}, 失败: {failed_count}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("\n用法:")
        print("    python run_evaluator.py <run_id>")
        sys.exit(1)

    run_id = int(sys.argv[1])
    run_evaluation(run_id)


if __name__ == "__main__":
    main()
