#!/usr/bin/env python3
"""
Benchmark 评估器脚本
用于评估 benchmark run 的结果

用法:
    uv run python run_evaluator.py <run_id>
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


def log(msg: str):
    """打印带时间戳的日志"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] {msg}", flush=True)


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


def evaluate_with_llm(prompt: str, model_config: Dict) -> Dict:
    """使用 LLM 进行评估

    Args:
        prompt: 评估提示词
        model_config: 模型配置，包含 model_id, provider, api_key, base_url, config 等
    """
    provider = model_config.get('provider', 'openai')
    model_id = model_config.get('model_id')
    api_key = model_config.get('api_key')
    base_url = model_config.get('base_url')
    config = model_config.get('config', {})

    log(f"[调试] 开始调用 LLM")
    log(f"[调试] Provider: {provider}")
    log(f"[调试] Model ID: {model_id}")
    log(f"[调试] Base URL: {base_url}")
    log(f"[调试] API Key: {'已配置' if api_key else '未配置'}")
    log(f"[调试] Prompt 长度: {len(prompt)} 字符")

    if not api_key:
        return {
            'success': False,
            'error': '未配置 API Key，请在模型配置中设置 API Key'
        }

    if not model_id:
        return {
            'success': False,
            'error': '未配置 Model ID'
        }

    try:
        if provider == 'openai' or provider == 'openrouter':
            return evaluate_with_openai(prompt, model_id, api_key, base_url, config)
        else:
            return {
                'success': False,
                'error': f'不支持的 provider: {provider}'
            }
    except Exception as e:
        log(f"[错误] 评估异常: {str(e)}")
        import traceback
        log(f"[错误] 堆栈: {traceback.format_exc()}")
        return {
            'success': False,
            'error': str(e)
        }


def evaluate_with_openai(prompt: str, model_id: str, api_key: str, base_url: Optional[str], config: Dict) -> Dict:
    """使用 OpenAI 兼容接口进行评估"""
    try:
        from openai import OpenAI
    except ImportError:
        return {
            'success': False,
            'error': '未安装 openai 包，请运行: pip install openai'
        }

    # 构建客户端配置
    client_config = {
        'api_key': api_key
    }
    if base_url:
        client_config['base_url'] = base_url

    log(f"[调试] OpenAI 客户端配置: {client_config}")

    client = OpenAI(**client_config)

    # 获取配置参数
    temperature = config.get('temperature', 0.7)
    max_tokens = config.get('max_tokens', 4096)

    try:
        log(f"[调试] 发送请求到 OpenAI API...")
        response = client.chat.completions.create(
            model=model_id,
            messages=[
                {"role": "system", "content": "你是一个专业的 AI Agent 评估专家。请根据给定的测试用例和评估标准，对 Agent 的输出进行客观、公正的评估。"},
                {"role": "user", "content": prompt}
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"}  # 要求返回 JSON 格式
        )

        log(f"[调试] API 响应成功")
        content = response.choices[0].message.content
        log(f"[调试] 响应内容长度: {len(content) if content else 0} 字符")

        if not content:
            return {
                'success': False,
                'error': 'API 返回空内容'
            }

        try:
            evaluation = json.loads(content)
            return {
                'success': True,
                'evaluation': evaluation
            }
        except json.JSONDecodeError as e:
            log(f"[警告] 无法解析 JSON 响应，将返回原始内容: {str(e)}")
            # 如果无法解析 JSON，将整个输出作为报告
            return {
                'success': True,
                'evaluation': {
                    'score': 0,
                    'report': content,
                    'key_points_met': [],
                    'forbidden_points_violated': []
                }
            }

    except Exception as e:
        log(f"[错误] OpenAI API 调用失败: {str(e)}")
        return {
            'success': False,
            'error': f'OpenAI API 调用失败: {str(e)}'
        }


def evaluate_single_result(args: Dict) -> Dict:
    """评估单个结果（用于多进程）"""
    result_id = args['result_id']
    evaluator_config = args['evaluator_config']
    model_config = args.get('model_config', {})

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
            tc.forbidden_points,
            tc.how
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
        'how': result['how'] or '',
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
- 如何实现: {{how}}

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
    log(f"评估结果 {result_id}，使用模型: {model_config.get('model_id', 'unknown')}...")
    eval_result = evaluate_with_llm(evaluation_prompt, model_config)

    if not eval_result['success']:
        error_msg = eval_result.get('error', 'Unknown error')
        log(f"评估失败: {error_msg}")
        # 保存评估错误到 benchmark_results 表
        cursor.execute(
            'UPDATE benchmark_results SET evaluation_error = ? WHERE id = ?',
            (error_msg, result_id)
        )
        conn.commit()
        return {
            'result_id': result_id,
            'status': 'failed',
            'error': error_msg
        }

    evaluation = eval_result['evaluation']

    # 保存评估结果
    cursor.execute(
        '''INSERT INTO evaluations
           (execution_id, result_id, score, report, key_points_met, forbidden_points_violated, evaluated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)''',
        (
            result['execution_id'],
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


def run_evaluation(execution_id: int):
    """执行评估"""
    log(f"开始评估 Benchmark Execution {execution_id}")

    conn = get_db_connection()
    cursor = conn.cursor()

    # 更新 evaluation_status 为 running
    cursor.execute(
        "UPDATE benchmark_executions SET evaluation_status = 'running' WHERE id = ?",
        (execution_id,)
    )
    conn.commit()

    try:
        # 获取 execution 详情
        cursor.execute('''
            SELECT be.*, b.evaluator_id
            FROM benchmark_executions be
            JOIN benchmarks b ON be.benchmark_id = b.id
            WHERE be.id = ?
        ''', (execution_id,))
        execution = cursor.fetchone()

        if not execution:
            log(f"错误: 未找到 benchmark execution {execution_id}")
            cursor.execute(
                "UPDATE benchmark_executions SET evaluation_status = 'failed' WHERE id = ?",
                (execution_id,)
            )
            conn.commit()
            sys.exit(1)

        if not execution['evaluator_id']:
            log("该 execution 没有配置评估器，跳过评估")
            cursor.execute(
                "UPDATE benchmark_executions SET evaluation_status = 'completed' WHERE id = ?",
                (execution_id,)
            )
            conn.commit()
            return

        # 获取评估器配置
        cursor.execute('SELECT * FROM evaluators WHERE id = ?', (execution['evaluator_id'],))
        evaluator = cursor.fetchone()

        if not evaluator:
            log(f"错误: 未找到评估器 {execution['evaluator_id']}")
            cursor.execute(
                "UPDATE benchmark_executions SET evaluation_status = 'failed' WHERE id = ?",
                (execution_id,)
            )
            conn.commit()
            sys.exit(1)

        evaluator_config = json.loads(evaluator['config'])
        log(f"使用评估器: {evaluator['name']}")
        log(f"[调试] 评估器配置: {evaluator_config}")

        # 获取模型配置
        model_config = {}
        model_id = evaluator.get('model_id') if hasattr(evaluator, 'get') else evaluator['model_id']
        log(f"[调试] 评估器 model_id: {model_id}")

        if model_id:
            cursor.execute('SELECT * FROM models WHERE id = ?', (model_id,))
            model_row = cursor.fetchone()
            log(f"[调试] 查询模型结果: {model_row is not None}")
            if model_row:
                model_config = {
                    'id': model_row['id'],
                    'name': model_row['name'],
                    'model_id': model_row['model_id'],
                    'provider': model_row['provider'],
                    'api_key': model_row['api_key'],
                    'base_url': model_row['base_url'],
                    'config': json.loads(model_row['config']) if model_row['config'] else {}
                }
                log(f"使用配置的模型: {model_config['name']} (ID: {model_config['model_id']}, Provider: {model_config['provider']})")
            else:
                log(f"[警告] 未找到 model_id={model_id} 的模型")
        else:
            log("[警告] 评估器未配置模型")

        # 如果没有配置模型，报错
        if not model_config:
            error_msg = "评估器未配置模型，请先配置模型"
            log(f"[错误] {error_msg}")
            cursor.execute(
                "UPDATE benchmark_executions SET evaluation_status = 'failed' WHERE id = ?",
                (execution_id,)
            )
            conn.commit()
            return

        # 获取所有需要评估的结果
        cursor.execute('''
            SELECT br.id FROM benchmark_results br
            WHERE br.execution_id = ? AND br.status = 'completed'
            AND NOT EXISTS (
                SELECT 1 FROM evaluations e WHERE e.result_id = br.id
            )
        ''', (execution_id,))

        results_to_evaluate = [row['id'] for row in cursor.fetchall()]

        if not results_to_evaluate:
            log("没有需要评估的结果")
            cursor.execute(
                "UPDATE benchmark_executions SET evaluation_status = 'completed' WHERE id = ?",
                (execution_id,)
            )
            conn.commit()
            return

        log(f"需要评估的结果数: {len(results_to_evaluate)}")

        # 准备评估任务
        eval_tasks = [
            {
                'result_id': result_id,
                'evaluator_config': evaluator_config,
                'model_config': model_config
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
                    log(f"评估进度: {completed_count + failed_count}/{len(eval_tasks)}")
        else:
            # 串行执行
            for task in eval_tasks:
                result = evaluate_single_result(task)
                if result.get('status') == 'completed':
                    completed_count += 1
                else:
                    failed_count += 1
                log(f"评估进度: {completed_count + failed_count}/{len(eval_tasks)}")

        # Update evaluation_status based on results
        if failed_count > 0:
            final_status = 'failed'
        else:
            final_status = 'completed'

        cursor.execute(
            "UPDATE benchmark_executions SET evaluation_status = ? WHERE id = ?",
            (final_status, execution_id)
        )
        conn.commit()

        log("评估完成!")
        log(f"总计: {len(eval_tasks)}, 成功: {completed_count}, 失败: {failed_count}")
        log(f"评估状态: {final_status}")

    except Exception as e:
        log(f"评估过程发生错误: {e}")
        cursor.execute(
            "UPDATE benchmark_executions SET evaluation_status = 'failed' WHERE id = ?",
            (execution_id,)
        )
        conn.commit()
        raise


def main():
    if len(sys.argv) < 2:
        log(__doc__)
        log("\n用法:")
        log("    uv run python run_evaluator.py <execution_id>")
        sys.exit(1)

    execution_id = int(sys.argv[1])
    run_evaluation(execution_id)


if __name__ == "__main__":
    main()
