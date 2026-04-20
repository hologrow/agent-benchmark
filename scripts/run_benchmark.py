#!/usr/bin/env python3
"""
Benchmark 执行脚本 V2
用于执行 benchmark execution 中的所有测试用例

用法:
    python run_benchmark.py <execution_id>
"""

import subprocess
import time
import sys
import os
import json
import sqlite3
import shlex
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
from concurrent.futures import ProcessPoolExecutor, as_completed

# 导入输出解析器
from output_parser import parse_agent_output


def generate_magic_code() -> str:
    """生成唯一的 magic code 用于追踪 Langfuse trace"""
    return f"BM-{uuid.uuid4().hex[:12].upper()}"

# 数据库路径
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'benchmark.db')
RESULTS_DIR = Path(os.path.dirname(os.path.dirname(__file__))) / 'results'


def get_db_connection():
    """获取数据库连接"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_execution_details(execution_id: int) -> Optional[Dict]:
    """获取 execution 详情"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT be.*, b.agent_ids, b.test_case_ids, b.run_config, b.evaluator_id
        FROM benchmark_executions be
        JOIN benchmarks b ON be.benchmark_id = b.id
        WHERE be.id = ?
    ''', (execution_id,))
    execution = cursor.fetchone()

    if not execution:
        return None

    # 解析 run_config，确保返回字典
    run_config = {}
    if execution['run_config']:
        try:
            parsed = json.loads(execution['run_config'])
            if isinstance(parsed, dict):
                run_config = parsed
        except (json.JSONDecodeError, TypeError):
            run_config = {}

    return {
        'id': execution['id'],
        'benchmark_id': execution['benchmark_id'],
        'name': execution['name'],
        'agent_ids': json.loads(execution['agent_ids']),
        'test_case_ids': json.loads(execution['test_case_ids']),
        'run_config': run_config,
        'evaluator_id': execution['evaluator_id']
    }


def get_agent_details(agent_id: int) -> Optional[Dict]:
    """获取 agent 详情"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM agents WHERE id = ?', (agent_id,))
    agent = cursor.fetchone()

    if not agent:
        return None

    # 解析 config_json，向后兼容
    config_json = {}
    if agent['config_json']:
        try:
            config_json = json.loads(agent['config_json'])
        except (json.JSONDecodeError, TypeError):
            config_json = {}

    # 获取 agent_type，默认 'other'
    agent_type = agent['agent_type'] if agent['agent_type'] else 'other'

    return {
        'id': agent['id'],
        'name': agent['name'],
        'command': agent['command'],
        'agent_type': agent_type,
        'config_json': config_json
    }


def get_test_case_details(test_case_id: int) -> Optional[Dict]:
    """获取测试用例详情"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM test_cases WHERE id = ?', (test_case_id,))
    tc = cursor.fetchone()

    if not tc:
        return None

    return {
        'id': tc['id'],
        'test_id': tc['test_id'],
        'name': tc['name'],
        'input': tc['input'],
        'expected_output': tc['expected_output'],
        'key_points': json.loads(tc['key_points']) if tc['key_points'] else [],
        'forbidden_points': json.loads(tc['forbidden_points']) if tc['forbidden_points'] else []
    }


def get_result_id(execution_id: int, agent_id: int, test_case_id: int) -> Optional[int]:
    """获取结果记录 ID"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        'SELECT id FROM benchmark_results WHERE execution_id = ? AND agent_id = ? AND test_case_id = ?',
        (execution_id, agent_id, test_case_id)
    )
    result = cursor.fetchone()
    return result['id'] if result else None


def parse_template(template: str, context: Dict) -> str:
    """解析模板，替换变量"""
    result = template
    for key, value in context.items():
        placeholder = f"{{{{{key}}}}}"
        result = result.replace(placeholder, str(value))
    return result


def run_single_test(args: Dict) -> Dict:
    """执行单个测试（用于多进程）"""
    execution_id = args['execution_id']
    agent_id = args['agent_id']
    test_case_id = args['test_case_id']
    run_config = args['run_config']

    conn = get_db_connection()
    cursor = conn.cursor()

    # 获取 agent 和测试用例信息
    agent = get_agent_details(agent_id)
    test_case = get_test_case_details(test_case_id)

    if not agent or not test_case:
        return {'error': 'Agent or test case not found'}

    # 生成唯一的 magic code
    magic_code = generate_magic_code()

    # 获取或创建结果记录
    result_id = get_result_id(execution_id, agent_id, test_case_id)
    if not result_id:
        cursor.execute(
            'INSERT INTO benchmark_results (execution_id, agent_id, test_case_id, status, started_at, magic_code) VALUES (?, ?, ?, ?, ?, ?)',
            (execution_id, agent_id, test_case_id, 'running', datetime.now().isoformat(), magic_code)
        )
        conn.commit()
        result_id = cursor.lastrowid
    else:
        cursor.execute(
            'UPDATE benchmark_results SET status = ?, started_at = ?, magic_code = ? WHERE id = ?',
            ('running', datetime.now().isoformat(), magic_code, result_id)
        )
        conn.commit()

    start_time = time.time()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # 确保结果目录存在
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    output_file = RESULTS_DIR / f"execution_log_{agent['name']}_{test_case['test_id']}_{timestamp}.md"

    # 构建 prompt，支持变量替换
    prompt_template = run_config.get('prompt_template', '{{input}}')
    context = {
        'input': test_case['input'],
        'expected_output': test_case.get('expected_output', ''),
        'key_points': json.dumps(test_case.get('key_points', []), ensure_ascii=False),
        'forbidden_points': json.dumps(test_case.get('forbidden_points', []), ensure_ascii=False),
        'test_id': test_case['test_id'],
        'test_name': test_case['name'],
        'magic_code': magic_code,
        **run_config.get('variables', {})
    }
    prompt = parse_template(prompt_template, context)

    # 如果 prompt_template 不包含 magic_code，自动在末尾添加
    if '{{magic_code}}' not in prompt_template:
        prompt = f"{prompt}\n\n[DEBUG: {magic_code}]"

    try:
        # 根据 agent_type 构建命令
        agent_type = agent.get('agent_type', 'other')
        config_json = agent.get('config_json', {})

        if agent_type == 'openclaw':
            # OpenClaw: 使用 URL 和 Token
            url = config_json.get('url', '')
            token = config_json.get('token', '')
            if not url or not token:
                raise ValueError('OpenClaw agent requires url and token in config_json')
            # 转义 prompt 中的特殊字符
            escaped_prompt = prompt.replace('"', '\\"').replace('$', '\\$')
            command_str = f'openclaw --url {url} --token {token} --prompt "{escaped_prompt}"'
            print(f"[执行] openclaw --url {url} --token *** --prompt \"...\"")
        else:
            # Hermes / Other: 使用命令模板
            agent_command = config_json.get('command', agent['command'])
            if not agent_command:
                raise ValueError('Command is required for this agent type')

            # 替换变量
            command_str = agent_command.replace('{{prompt}}', prompt)
            command_str = command_str.replace('{{execution_id}}', f'#{execution_id}')
            print(f"[执行] {command_str}")

        # 执行命令
        process = subprocess.Popen(
            command_str,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            shell=True
        )

        output_lines = []
        with open(output_file, 'w', encoding='utf-8') as f:
            while True:
                line = process.stdout.readline()
                if not line and process.poll() is not None:
                    break
                if line:
                    print(line, end='')
                    output_lines.append(line)
                    f.write(line)
                    f.flush()

        process.wait(timeout=300)

        end_time = time.time()
        execution_time_ms = int((end_time - start_time) * 1000)

        actual_output = ''.join(output_lines)
        status = 'completed' if process.returncode == 0 else 'failed'

        # 解析输出，分离执行步骤和答案
        parsed = parse_agent_output(actual_output)
        execution_steps = parsed['execution_steps']
        execution_answer = parsed['execution_answer']

        # 更新结果
        cursor.execute(
            '''UPDATE benchmark_results
               SET status = ?, actual_output = ?, execution_steps = ?, execution_answer = ?, output_file = ?, execution_time_ms = ?, completed_at = ?
               WHERE id = ?''',
            (status, actual_output, execution_steps, execution_answer, str(output_file), execution_time_ms, datetime.now().isoformat(), result_id)
        )
        conn.commit()

        return {
            'result_id': result_id,
            'status': status,
            'execution_time_ms': execution_time_ms,
            'magic_code': magic_code
        }

    except subprocess.TimeoutExpired:
        process.kill()
        end_time = time.time()
        execution_time_ms = int((end_time - start_time) * 1000)

        cursor.execute(
            '''UPDATE benchmark_results
               SET status = ?, execution_time_ms = ?, completed_at = ?
               WHERE id = ?''',
            ('timeout', execution_time_ms, datetime.now().isoformat(), result_id)
        )
        conn.commit()

        return {
            'result_id': result_id,
            'status': 'timeout',
            'execution_time_ms': execution_time_ms,
            'magic_code': magic_code
        }

    except Exception as e:
        end_time = time.time()
        execution_time_ms = int((end_time - start_time) * 1000)

        cursor.execute(
            '''UPDATE benchmark_results
               SET status = ?, error_message = ?, execution_time_ms = ?, completed_at = ?
               WHERE id = ?''',
            ('error', str(e), execution_time_ms, datetime.now().isoformat(), result_id)
        )
        conn.commit()

        return {
            'result_id': result_id,
            'status': 'error',
            'error': str(e),
            'magic_code': magic_code
        }


def run_benchmark(execution_id: int):
    """执行 benchmark execution"""
    print(f"开始执行 Benchmark Execution {execution_id}")

    # 获取 execution 详情
    execution = get_execution_details(execution_id)
    if not execution:
        print(f"错误: 未找到 benchmark execution {execution_id}")
        sys.exit(1)

    print(f"Execution: {execution['name']}")
    print(f"Benchmark ID: {execution['benchmark_id']}")
    print(f"Agents: {execution['agent_ids']}")
    print(f"Test Cases: {execution['test_case_ids']}")

    conn = get_db_connection()
    cursor = conn.cursor()

    # 更新状态为 running
    cursor.execute(
        'UPDATE benchmark_executions SET status = ?, started_at = ? WHERE id = ?',
        ('running', datetime.now().isoformat(), execution_id)
    )
    conn.commit()

    try:
        # 准备测试任务
        test_tasks = []
        for agent_id in execution['agent_ids']:
            for test_case_id in execution['test_case_ids']:
                test_tasks.append({
                    'execution_id': execution_id,
                    'agent_id': agent_id,
                    'test_case_id': test_case_id,
                    'run_config': execution['run_config']
                })

        # 获取并行度配置
        max_workers = execution['run_config'].get('max_workers', 1)

        # 执行测试
        completed_count = 0
        failed_count = 0

        if max_workers > 1:
            # 并行执行
            with ProcessPoolExecutor(max_workers=max_workers) as executor:
                futures = {executor.submit(run_single_test, task): task for task in test_tasks}
                for future in as_completed(futures):
                    result = future.result()
                    if result.get('status') in ['completed']:
                        completed_count += 1
                    else:
                        failed_count += 1
                    print(f"进度: {completed_count + failed_count}/{len(test_tasks)}")
        else:
            # 串行执行
            for task in test_tasks:
                result = run_single_test(task)
                if result.get('status') in ['completed']:
                    completed_count += 1
                else:
                    failed_count += 1
                print(f"进度: {completed_count + failed_count}/{len(test_tasks)}")

        # 更新状态为 completed
        cursor.execute(
            'UPDATE benchmark_executions SET status = ?, completed_at = ? WHERE id = ?',
            ('completed', datetime.now().isoformat(), execution_id)
        )
        conn.commit()

        print(f"\nBenchmark 完成!")
        print(f"总计: {len(test_tasks)}, 成功: {completed_count}, 失败: {failed_count}")

        # 注意: Langfuse Trace 同步和评估现在由 Next.js 服务处理
        # 在 benchmark 执行完成后，Next.js 会先同步 traces，然后再触发评估
        # 这里不再直接触发评估，以避免 trace 未同步就进行评估

    except Exception as e:
        print(f"执行出错: {e}")
        cursor.execute(
            'UPDATE benchmark_executions SET status = ? WHERE id = ?',
            ('failed', execution_id)
        )
        conn.commit()
        raise


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("\n用法:")
        print("    python run_benchmark.py <execution_id>")
        sys.exit(1)

    execution_id = int(sys.argv[1])
    run_benchmark(execution_id)


if __name__ == "__main__":
    main()
