#!/usr/bin/env python3
"""
Benchmark diagnosis script — analyzes why a test case execution failed.

Usage:
    uv run python run_diagnosis.py <result_id> [model_id]
"""

import subprocess
import sys
import os
import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'benchmark.db')


def log(msg: str):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] {msg}", flush=True)


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_result_details(result_id: int) -> Optional[Dict]:
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT
            br.id,
            br.execution_id,
            br.agent_id,
            br.test_case_id,
            br.status,
            br.actual_output,
            br.execution_steps,
            br.execution_answer,
            br.error_message,
            br.execution_time_ms,
            br.magic_code,
            a.name as agent_name,
            tc.test_id,
            tc.name as test_case_name,
            tc.input as test_input,
            tc.expected_output,
            tc.key_points,
            tc.forbidden_points,
            et.trace_content
        FROM benchmark_results br
        JOIN agents a ON br.agent_id = a.id
        JOIN test_cases tc ON br.test_case_id = tc.id
        LEFT JOIN execution_traces et ON et.result_id = br.id
        WHERE br.id = ?
    ''', (result_id,))

    result = cursor.fetchone()
    if not result:
        return None

    return {
        'id': result['id'],
        'execution_id': result['execution_id'],
        'agent_name': result['agent_name'],
        'test_id': result['test_id'],
        'test_case_name': result['test_case_name'],
        'status': result['status'],
        'test_input': result['test_input'],
        'expected_output': result['expected_output'],
        'actual_output': result['actual_output'],
        'execution_answer': result['execution_answer'],
        'execution_steps': result['execution_steps'],
        'error_message': result['error_message'],
        'execution_time_ms': result['execution_time_ms'],
        'magic_code': result['magic_code'],
        'key_points': result['key_points'],
        'forbidden_points': result['forbidden_points'],
        'trace_content': result['trace_content']
    }


def get_model_config(model_id: int) -> Optional[Dict]:
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, name, model_id, provider, api_key, base_url, config
        FROM models WHERE id = ?
    ''', (model_id,))

    model = cursor.fetchone()
    if not model:
        return None

    config = {}
    if model['config']:
        try:
            config = json.loads(model['config'])
        except json.JSONDecodeError:
            pass

    return {
        'id': model['id'],
        'name': model['name'],
        'model_id': model['model_id'],
        'provider': model['provider'],
        'api_key': model['api_key'],
        'base_url': model['base_url'],
        'config': config
    }


def get_default_model() -> Optional[Dict]:
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, name, model_id, provider, api_key, base_url, config
        FROM models WHERE is_default = 1 LIMIT 1
    ''')

    model = cursor.fetchone()
    if not model:
        cursor.execute('''
            SELECT id, name, model_id, provider, api_key, base_url, config
            FROM models LIMIT 1
        ''')
        model = cursor.fetchone()

    if not model:
        return None

    config = {}
    if model['config']:
        try:
            config = json.loads(model['config'])
        except json.JSONDecodeError:
            pass

    return {
        'id': model['id'],
        'name': model['name'],
        'model_id': model['model_id'],
        'provider': model['provider'],
        'api_key': model['api_key'],
        'base_url': model['base_url'],
        'config': config
    }


def call_llm(prompt: str, model_config: Dict) -> Dict:
    provider = model_config.get('provider', 'openai')
    model_id = model_config.get('model_id')
    api_key = model_config.get('api_key')
    base_url = model_config.get('base_url')
    config = model_config.get('config', {})

    log(f"Calling LLM: {model_id} (provider: {provider})")

    if not api_key:
        return {'success': False, 'error': 'Model has no API key configured'}

    if not model_id:
        return {'success': False, 'error': 'Model has no model_id configured'}

    try:
        if provider == 'openai' or provider == 'openrouter':
            return call_openai(prompt, model_id, api_key, base_url, config)
        else:
            return {'success': False, 'error': f'Unsupported provider: {provider}'}
    except Exception as e:
        log(f"LLM call error: {str(e)}")
        import traceback
        log(f"Traceback: {traceback.format_exc()}")
        return {'success': False, 'error': str(e)}


def call_openai(prompt: str, model_id: str, api_key: str, base_url: Optional[str], config: Dict) -> Dict:
    try:
        from openai import OpenAI

        client_kwargs = {'api_key': api_key}
        if base_url:
            client_kwargs['base_url'] = base_url

        client = OpenAI(**client_kwargs)

        messages = [
            {'role': 'system', 'content': (
                'You are an expert in AI agent testing and failure analysis. '
                'Analyze why the test run failed, contrast expected vs actual output, '
                'and produce a clear diagnostic report.'
            )},
            {'role': 'user', 'content': prompt}
        ]

        response = client.chat.completions.create(
            model=model_id,
            messages=messages,
            temperature=config.get('temperature', 0.3),
            max_tokens=config.get('max_tokens', 4000)
        )

        content = response.choices[0].message.content
        return {'success': True, 'content': content}

    except Exception as e:
        return {'success': False, 'error': f'OpenAI API call failed: {str(e)}'}


def build_diagnosis_prompt(result: Dict) -> str:
    na = '(none)'
    prompt = f"""Diagnose the following test execution in depth.

## Test case
- Test ID: {result['test_id']}
- Name: {result['test_case_name']}
- Agent: {result['agent_name']}
- Status: {result['status']}

## Input
{result['test_input']}

## Expected output
{result['expected_output']}

## Key points
{result['key_points'] or na}

## Forbidden points
{result['forbidden_points'] or na}

## Actual output
{result['actual_output'] or na}

## Parsed answer
{result['execution_answer'] or na}

## Execution steps
{result['execution_steps'] or na}

## Error message
{result['error_message'] or na}

## Langfuse trace
{result['trace_content'] or '(no trace)'}

---

Produce a detailed diagnosis in Markdown with:

### 1. Failure localization
- Failure type (misunderstanding, logic error, tool failure, timeout, etc.)
- Which stage failed

### 2. Gap analysis
- Key gaps between expected and actual output
- Whether key points were met
- Whether forbidden points were violated

### 3. Root cause
- Issues visible in trace (if any)
- Unusual agent behavior patterns
- Possible config or environment issues

### 4. Recommendations
- How to fix
- Improvements for the agent or test case
"""

    return prompt


def save_diagnosis_result(result_id: int, report: str, model_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('DELETE FROM diagnosis_results WHERE result_id = ?', (result_id,))

    cursor.execute('''
        INSERT INTO diagnosis_results (result_id, diagnosis_report, model_id)
        VALUES (?, ?, ?)
    ''', (result_id, report, model_id))

    conn.commit()
    log(f"Diagnosis saved (result_id={result_id})")


def run_diagnosis(result_id: int, model_id: Optional[int] = None):
    log(f"Starting diagnosis result_id={result_id}")

    result = get_result_details(result_id)
    if not result:
        log(f"Error: benchmark result not found {result_id}")
        sys.exit(1)

    log(f"Loaded result: {result['test_id']} — {result['test_case_name']}")

    if model_id:
        model_config = get_model_config(model_id)
    else:
        model_config = get_default_model()

    if not model_config:
        log("Error: no model configuration available")
        sys.exit(1)

    log(f"Using model: {model_config['name']} ({model_config['model_id']})")

    prompt = build_diagnosis_prompt(result)
    log(f"Diagnosis prompt length: {len(prompt)} chars")

    log("Calling LLM...")
    llm_result = call_llm(prompt, model_config)

    if not llm_result['success']:
        log(f"Diagnosis failed: {llm_result['error']}")
        sys.exit(1)

    diagnosis_report = llm_result['content']
    log(f"Done, report length: {len(diagnosis_report)} chars")

    save_diagnosis_result(result_id, diagnosis_report, model_config['id'])

    print("\n" + "=" * 80)
    print("DIAGNOSIS REPORT")
    print("=" * 80)
    print(diagnosis_report)
    print("=" * 80)

    log("Diagnosis finished")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("\nUsage:")
        print("    uv run python run_diagnosis.py <result_id> [model_id]")
        sys.exit(1)

    result_id = int(sys.argv[1])
    model_id = int(sys.argv[2]) if len(sys.argv) > 2 else None

    run_diagnosis(result_id, model_id)


if __name__ == "__main__":
    main()
