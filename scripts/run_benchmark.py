#!/usr/bin/env python3
"""
Benchmark runner — executes all test cases in a benchmark execution.

Usage:
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

from output_parser import parse_agent_output


def generate_magic_code() -> str:
    """Unique magic code for Langfuse trace correlation."""
    return f"BM-{uuid.uuid4().hex[:12].upper()}"

DB_PATH = os.environ.get(
    "DATABASE_PATH",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "benchmark.db"),
)
RESULTS_DIR = Path(os.path.dirname(os.path.dirname(__file__))) / 'results'


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_execution_details(execution_id: int) -> Optional[Dict]:
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
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM agents WHERE id = ?', (agent_id,))
    agent = cursor.fetchone()

    if not agent:
        return None

    config_json = {}
    if agent['config_json']:
        try:
            config_json = json.loads(agent['config_json'])
        except (json.JSONDecodeError, TypeError):
            config_json = {}

    agent_type = agent['agent_type'] if agent['agent_type'] else 'other'

    return {
        'id': agent['id'],
        'name': agent['name'],
        'command': agent['command'],
        'agent_type': agent_type,
        'config_json': config_json
    }


def get_test_case_details(test_case_id: int) -> Optional[Dict]:
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
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        'SELECT id FROM benchmark_results WHERE execution_id = ? AND agent_id = ? AND test_case_id = ?',
        (execution_id, agent_id, test_case_id)
    )
    result = cursor.fetchone()
    return result['id'] if result else None


def parse_template(template: str, context: Dict) -> str:
    result = template
    for key, value in context.items():
        placeholder = f"{{{{{key}}}}}"
        result = result.replace(placeholder, str(value))
    return result


def run_single_test(args: Dict) -> Dict:
    execution_id = args['execution_id']
    agent_id = args['agent_id']
    test_case_id = args['test_case_id']
    run_config = args['run_config']

    conn = get_db_connection()
    cursor = conn.cursor()

    agent = get_agent_details(agent_id)
    test_case = get_test_case_details(test_case_id)

    if not agent or not test_case:
        return {'error': 'Agent or test case not found'}

    magic_code = generate_magic_code()

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

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    output_file = RESULTS_DIR / f"execution_log_{agent['name']}_{test_case['test_id']}_{timestamp}.md"

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

    if '{{magic_code}}' not in prompt_template:
        prompt = f"{prompt}\n\n[DEBUG: {magic_code}]"

    try:
        agent_type = agent.get('agent_type', 'other')
        config_json = agent.get('config_json', {})

        if agent_type == 'openclaw':
            url = config_json.get('url', '')
            token = config_json.get('token', '')
            if not url or not token:
                raise ValueError('OpenClaw agent requires url and token in config_json')
            escaped_prompt = prompt.replace('"', '\\"').replace('$', '\\$')
            command_str = f'openclaw --url {url} --token {token} --prompt "{escaped_prompt}"'
            print(f"[run] openclaw --url {url} --token *** --prompt \"...\"")
        else:
            agent_command = config_json.get('command', agent['command'])
            if not agent_command:
                raise ValueError('Command is required for this agent type')

            command_str = agent_command.replace('{{prompt}}', prompt)
            command_str = command_str.replace('{{execution_id}}', f'#{execution_id}')
            print(f"[run] {command_str}")

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

        parsed = parse_agent_output(actual_output)
        execution_steps = parsed['execution_steps']
        execution_answer = parsed['execution_answer']

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
    print(f"Starting benchmark execution {execution_id}")

    execution = get_execution_details(execution_id)
    if not execution:
        print(f"Error: benchmark execution {execution_id} not found")
        sys.exit(1)

    print(f"Execution: {execution['name']}")
    print(f"Benchmark ID: {execution['benchmark_id']}")
    print(f"Agents: {execution['agent_ids']}")
    print(f"Test Cases: {execution['test_case_ids']}")

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        'UPDATE benchmark_executions SET status = ?, started_at = ? WHERE id = ?',
        ('running', datetime.now().isoformat(), execution_id)
    )
    conn.commit()

    try:
        test_tasks = []
        for agent_id in execution['agent_ids']:
            for test_case_id in execution['test_case_ids']:
                test_tasks.append({
                    'execution_id': execution_id,
                    'agent_id': agent_id,
                    'test_case_id': test_case_id,
                    'run_config': execution['run_config']
                })

        max_workers = execution['run_config'].get('max_workers', 1)

        completed_count = 0
        failed_count = 0

        if max_workers > 1:
            with ProcessPoolExecutor(max_workers=max_workers) as executor:
                futures = {executor.submit(run_single_test, task): task for task in test_tasks}
                for future in as_completed(futures):
                    result = future.result()
                    if result.get('status') in ['completed']:
                        completed_count += 1
                    else:
                        failed_count += 1
                    print(f"Progress: {completed_count + failed_count}/{len(test_tasks)}")
        else:
            for task in test_tasks:
                result = run_single_test(task)
                if result.get('status') in ['completed']:
                    completed_count += 1
                else:
                    failed_count += 1
                print(f"Progress: {completed_count + failed_count}/{len(test_tasks)}")

        cursor.execute(
            'UPDATE benchmark_executions SET status = ?, completed_at = ? WHERE id = ?',
            ('completed', datetime.now().isoformat(), execution_id)
        )
        conn.commit()

        print(f"\nBenchmark finished.")
        print(f"Total: {len(test_tasks)}, succeeded: {completed_count}, failed: {failed_count}")

    except Exception as e:
        print(f"Run error: {e}")
        cursor.execute(
            'UPDATE benchmark_executions SET status = ? WHERE id = ?',
            ('failed', execution_id)
        )
        conn.commit()
        raise


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("\nUsage:")
        print("    python run_benchmark.py <execution_id>")
        sys.exit(1)

    execution_id = int(sys.argv[1])
    run_benchmark(execution_id)


if __name__ == "__main__":
    main()
