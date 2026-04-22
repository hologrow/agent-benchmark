#!/usr/bin/env python3
"""
Benchmark evaluator — scores completed benchmark results with an LLM.

Usage:
    uv run python run_evaluator.py <execution_id>
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

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'benchmark.db')


def log(msg: str):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] {msg}", flush=True)


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def parse_template(template: str, context: Dict) -> str:
    result = template
    for key, value in context.items():
        placeholder = f"{{{{{key}}}}}"
        result = result.replace(placeholder, str(value))
    return result


def evaluate_with_llm(prompt: str, model_config: Dict) -> Dict:
    provider = model_config.get('provider', 'openai')
    model_id = model_config.get('model_id')
    api_key = model_config.get('api_key')
    base_url = model_config.get('base_url')
    config = model_config.get('config', {})

    log("[dbg] calling LLM")
    log(f"[dbg] provider: {provider}")
    log(f"[dbg] model_id: {model_id}")
    log(f"[dbg] base_url: {base_url}")
    log(f"[dbg] api_key: {'set' if api_key else 'missing'}")
    log(f"[dbg] prompt length: {len(prompt)} chars")

    if not api_key:
        return {
            'success': False,
            'error': 'API key is not configured for this model'
        }

    if not model_id:
        return {
            'success': False,
            'error': 'Model ID is not configured'
        }

    try:
        if provider == 'openai' or provider == 'openrouter':
            return evaluate_with_openai(prompt, model_id, api_key, base_url, config)
        else:
            return {
                'success': False,
                'error': f'Unsupported provider: {provider}'
            }
    except Exception as e:
        log(f"[err] evaluation failed: {str(e)}")
        import traceback
        log(f"[err] traceback: {traceback.format_exc()}")
        return {
            'success': False,
            'error': str(e)
        }


def evaluate_with_openai(prompt: str, model_id: str, api_key: str, base_url: Optional[str], config: Dict) -> Dict:
    try:
        from openai import OpenAI
    except ImportError:
        return {
            'success': False,
            'error': 'openai package not installed; run: pip install openai'
        }

    client_config = {
        'api_key': api_key
    }
    if base_url:
        client_config['base_url'] = base_url

    log(f"[dbg] OpenAI client config: {client_config}")

    client = OpenAI(**client_config)

    temperature = config.get('temperature', 0.7)
    max_tokens = config.get('max_tokens', 4096)

    try:
        log("[dbg] sending request to OpenAI API...")
        response = client.chat.completions.create(
            model=model_id,
            messages=[
                {"role": "system", "content": (
                    "You are an expert evaluator of AI agent outputs. "
                    "Score and explain them objectively against the test criteria."
                )},
                {"role": "user", "content": prompt}
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"}
        )

        log("[dbg] API response OK")
        content = response.choices[0].message.content
        log(f"[dbg] response length: {len(content) if content else 0} chars")

        if not content:
            return {
                'success': False,
                'error': 'API returned empty content'
            }

        try:
            evaluation = json.loads(content)
            return {
                'success': True,
                'evaluation': evaluation
            }
        except json.JSONDecodeError as e:
            log(f"[warn] JSON parse failed, using raw content: {str(e)}")
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
        log(f"[err] OpenAI API call failed: {str(e)}")
        return {
            'success': False,
            'error': f'OpenAI API call failed: {str(e)}'
        }



def evaluate_single_result(args: Dict) -> Dict:
    result_id = args['result_id']
    evaluator_config = args['evaluator_config']
    model_config = args.get('model_config', {})

    conn = get_db_connection()
    cursor = conn.cursor()

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
            tc.how,
            et.trace_content
        FROM benchmark_results br
        JOIN agents a ON br.agent_id = a.id
        JOIN test_cases tc ON br.test_case_id = tc.id
        LEFT JOIN execution_traces et ON et.result_id = br.id
        WHERE br.id = ?
    ''', (result_id,))

    result = cursor.fetchone()
    if not result:
        return {'error': 'Result not found'}

    key_points = json.loads(result['key_points']) if result['key_points'] else []
    forbidden_points = json.loads(result['forbidden_points']) if result['forbidden_points'] else []

    execution_steps = result['execution_steps'] if result['execution_steps'] else ''
    execution_answer = result['execution_answer'] if result['execution_answer'] else ''
    if not execution_answer and result['actual_output']:
        execution_answer = result['actual_output']

    trace_content = result['trace_content'] if result['trace_content'] else ''

    if trace_content:
        log(f"[dbg] trace from DB, length: {len(trace_content)} chars")
    else:
        log("[warn] no trace content in DB")

    context = {
        'agent_name': result['agent_name'],
        'test_id': result['test_id'],
        'test_case_name': result['test_case_name'],
        'input': result['input'],
        'expected_output': result['expected_output'] or '',
        'actual_output': result['actual_output'] or '',
        'execution_steps': execution_steps,
        'execution_answer': execution_answer,
        'key_points': json.dumps(key_points, ensure_ascii=False),
        'forbidden_points': json.dumps(forbidden_points, ensure_ascii=False),
        'how': result['how'] or '',
        'execution_time_ms': result['execution_time_ms'] or 0,
        'trace': trace_content,
        **evaluator_config.get('variables', {})
    }

    evaluation_prompt_template = evaluator_config.get('evaluation_prompt', '''
Evaluate the following AI agent response.

## Test case
- Test ID: {{test_id}}
- Name: {{test_case_name}}
- Input: {{input}}
- Expected output: {{expected_output}}
- How (implementation hint): {{how}}

## Key points
{{key_points}}

## Forbidden points
{{forbidden_points}}

## Agent raw output
{{actual_output}}

## Parsed final answer (prefer for correctness)
{{execution_answer}}

## Execution steps
{{execution_steps}}

## Langfuse trace
{{trace}}
Use trace details (steps, I/O, model calls) when present to judge behavior.

## Requirements
1. Check whether output/answer satisfies all key points
2. Check whether any forbidden points were violated
3. Score 0–100 based on satisfaction and violations
4. Write a clear evaluation report

## Template variables
- {{actual_output}}: raw agent output
- {{execution_answer}}: parsed final answer
- {{execution_steps}}: steps / tool calls
- {{trace}}: Langfuse trace when synced

Return JSON only:
{
    "score": 85,
    "report": "...",
    "key_points_met": ["..."],
    "forbidden_points_violated": ["..."]
}
''')

    evaluation_prompt = parse_template(evaluation_prompt_template, context)

    log(f"Evaluating result {result_id}, model: {model_config.get('model_id', 'unknown')}...")
    eval_result = evaluate_with_llm(evaluation_prompt, model_config)

    if not eval_result['success']:
        error_msg = eval_result.get('error', 'Unknown error')
        log(f"Evaluation failed: {error_msg}")
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
    log(f"Starting evaluation for execution {execution_id}")

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        "UPDATE benchmark_executions SET evaluation_status = 'running' WHERE id = ?",
        (execution_id,)
    )
    conn.commit()

    try:
        cursor.execute('''
            SELECT be.*, b.evaluator_id
            FROM benchmark_executions be
            JOIN benchmarks b ON be.benchmark_id = b.id
            WHERE be.id = ?
        ''', (execution_id,))
        execution = cursor.fetchone()

        if not execution:
            log(f"Error: benchmark execution {execution_id} not found")
            cursor.execute(
                "UPDATE benchmark_executions SET evaluation_status = 'failed' WHERE id = ?",
                (execution_id,)
            )
            conn.commit()
            sys.exit(1)

        if not execution['evaluator_id']:
            log("No evaluator on this execution; skipping evaluation")
            cursor.execute(
                "UPDATE benchmark_executions SET evaluation_status = 'completed' WHERE id = ?",
                (execution_id,)
            )
            conn.commit()
            return

        cursor.execute('SELECT * FROM evaluators WHERE id = ?', (execution['evaluator_id'],))
        evaluator = cursor.fetchone()

        if not evaluator:
            log(f"Error: evaluator {execution['evaluator_id']} not found")
            cursor.execute(
                "UPDATE benchmark_executions SET evaluation_status = 'failed' WHERE id = ?",
                (execution_id,)
            )
            conn.commit()
            sys.exit(1)

        evaluator_config = json.loads(evaluator['config'])
        log(f"Evaluator: {evaluator['name']}")
        log(f"[dbg] evaluator config: {evaluator_config}")

        model_config = {}
        model_id = evaluator.get('model_id') if hasattr(evaluator, 'get') else evaluator['model_id']
        log(f"[dbg] evaluator model_id: {model_id}")

        if model_id:
            cursor.execute('SELECT * FROM models WHERE id = ?', (model_id,))
            model_row = cursor.fetchone()
            log(f"[dbg] model row found: {model_row is not None}")
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
                log(f"Using model: {model_config['name']} (ID: {model_config['model_id']}, provider: {model_config['provider']})")
            else:
                log(f"[warn] no model row for model_id={model_id}")
        else:
            log("[warn] evaluator has no model_id")

        if not model_config:
            error_msg = "Evaluator has no model configured"
            log(f"[err] {error_msg}")
            cursor.execute(
                "UPDATE benchmark_executions SET evaluation_status = 'failed' WHERE id = ?",
                (execution_id,)
            )
            conn.commit()
            return

        cursor.execute('''
            SELECT br.id FROM benchmark_results br
            WHERE br.execution_id = ? AND br.status = 'completed'
            AND NOT EXISTS (
                SELECT 1 FROM evaluations e WHERE e.result_id = br.id
            )
        ''', (execution_id,))

        results_to_evaluate = [row['id'] for row in cursor.fetchall()]

        if not results_to_evaluate:
            log("No results to evaluate")
            cursor.execute(
                "UPDATE benchmark_executions SET evaluation_status = 'completed' WHERE id = ?",
                (execution_id,)
            )
            conn.commit()
            return

        log(f"Results to evaluate: {len(results_to_evaluate)}")

        eval_tasks = [
            {
                'result_id': result_id,
                'evaluator_config': evaluator_config,
                'model_config': model_config
            }
            for result_id in results_to_evaluate
        ]

        max_workers = evaluator_config.get('max_workers', 1)

        completed_count = 0
        failed_count = 0

        if max_workers > 1:
            with ProcessPoolExecutor(max_workers=max_workers) as executor:
                futures = {executor.submit(evaluate_single_result, task): task for task in eval_tasks}
                for future in as_completed(futures):
                    result = future.result()
                    if result.get('status') == 'completed':
                        completed_count += 1
                    else:
                        failed_count += 1
                    log(f"Eval progress: {completed_count + failed_count}/{len(eval_tasks)}")
        else:
            for task in eval_tasks:
                result = evaluate_single_result(task)
                if result.get('status') == 'completed':
                    completed_count += 1
                else:
                    failed_count += 1
                log(f"Eval progress: {completed_count + failed_count}/{len(eval_tasks)}")

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

        log("Evaluation finished.")
        log(f"Total: {len(eval_tasks)}, ok: {completed_count}, failed: {failed_count}")
        log(f"evaluation_status: {final_status}")

    except Exception as e:
        log(f"Evaluation error: {e}")
        cursor.execute(
            "UPDATE benchmark_executions SET evaluation_status = 'failed' WHERE id = ?",
            (execution_id,)
        )
        conn.commit()
        raise


def main():
    if len(sys.argv) < 2:
        log(__doc__)
        log("\nUsage:")
        log("    uv run python run_evaluator.py <execution_id>")
        sys.exit(1)

    execution_id = int(sys.argv[1])
    run_evaluation(execution_id)


if __name__ == "__main__":
    main()
