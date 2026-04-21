#!/usr/bin/env python3
"""
Benchmark 诊断脚本
用于分析测试用例执行失败的原因

用法:
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


def get_result_details(result_id: int) -> Optional[Dict]:
    """获取测试结果详情"""
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
    """获取模型配置"""
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
        except:
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
    """获取默认模型"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, name, model_id, provider, api_key, base_url, config
        FROM models WHERE is_default = 1 LIMIT 1
    ''')

    model = cursor.fetchone()
    if not model:
        # 如果没有默认模型，获取第一个
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
        except:
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
    """调用 LLM 进行分析"""
    provider = model_config.get('provider', 'openai')
    model_id = model_config.get('model_id')
    api_key = model_config.get('api_key')
    base_url = model_config.get('base_url')
    config = model_config.get('config', {})

    log(f"调用 LLM: {model_id} (provider: {provider})")

    if not api_key:
        return {'success': False, 'error': '模型未配置 API Key'}

    if not model_id:
        return {'success': False, 'error': '模型未配置 Model ID'}

    try:
        if provider == 'openai' or provider == 'openrouter':
            return call_openai(prompt, model_id, api_key, base_url, config)
        else:
            return {'success': False, 'error': f'不支持的 provider: {provider}'}
    except Exception as e:
        log(f"调用 LLM 异常: {str(e)}")
        import traceback
        log(f"堆栈: {traceback.format_exc()}")
        return {'success': False, 'error': str(e)}


def call_openai(prompt: str, model_id: str, api_key: str, base_url: Optional[str], config: Dict) -> Dict:
    """使用 OpenAI 兼容接口调用"""
    try:
        from openai import OpenAI

        client_kwargs = {'api_key': api_key}
        if base_url:
            client_kwargs['base_url'] = base_url

        client = OpenAI(**client_kwargs)

        messages = [
            {'role': 'system', 'content': '你是一位专业的 AI Agent 测试分析专家。你的任务是分析测试用例执行失败的原因，找出期望输出和实际输出之间的差异，并提供详细的诊断报告。'},
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
        return {'success': False, 'error': f'OpenAI API 调用失败: {str(e)}'}


def build_diagnosis_prompt(result: Dict) -> str:
    """构建诊断提示词"""
    prompt = f"""请对以下测试用例执行情况进行深入诊断分析。

## 测试用例信息
- 测试 ID: {result['test_id']}
- 测试名称: {result['test_case_name']}
- Agent: {result['agent_name']}
- 执行状态: {result['status']}

## 输入
{result['test_input']}

## 期望输出
{result['expected_output']}

## 关键测试点
{result['key_points'] or '无'}

## 禁止点
{result['forbidden_points'] or '无'}

## 实际输出
{result['actual_output'] or '无输出'}

## 执行答案（解析后）
{result['execution_answer'] or '无'}

## 执行步骤
{result['execution_steps'] or '无'}

## 错误信息
{result['error_message'] or '无'}

## Langfuse Trace
{result['trace_content'] or '无 Trace 数据'}

---

请提供详细的诊断报告，包含以下内容：

### 1. 问题定位
- 失败类型（如：理解错误、逻辑错误、工具调用失败、超时等）
- 具体在哪个环节出现问题

### 2. 差异分析
- 期望输出与实际输出的关键差异
- 是否满足关键测试点
- 是否违反禁止点

### 3. 根因分析
- 从 Trace 中发现的异常或问题
- Agent 行为的异常模式
- 可能的配置或环境问题

### 4. 修复建议
- 如何修复此问题
- 对 Agent 或测试用例的改进建议

请使用 Markdown 格式输出诊断报告。"""

    return prompt


def save_diagnosis_result(result_id: int, report: str, model_id: int):
    """保存诊断结果到数据库"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 先删除旧的诊断结果
    cursor.execute('DELETE FROM diagnosis_results WHERE result_id = ?', (result_id,))

    # 插入新的诊断结果
    cursor.execute('''
        INSERT INTO diagnosis_results (result_id, diagnosis_report, model_id)
        VALUES (?, ?, ?)
    ''', (result_id, report, model_id))

    conn.commit()
    log(f"诊断结果已保存到数据库 (result_id={result_id})")


def run_diagnosis(result_id: int, model_id: Optional[int] = None):
    """执行诊断"""
    log(f"开始诊断 result_id={result_id}")

    # 获取测试结果详情
    result = get_result_details(result_id)
    if not result:
        log(f"错误：未找到测试结果 {result_id}")
        sys.exit(1)

    log(f"获取到测试结果: {result['test_id']} - {result['test_case_name']}")

    # 获取模型配置
    if model_id:
        model_config = get_model_config(model_id)
    else:
        model_config = get_default_model()

    if not model_config:
        log("错误：未找到可用的模型配置")
        sys.exit(1)

    log(f"使用模型: {model_config['name']} ({model_config['model_id']})")

    # 构建诊断提示词
    prompt = build_diagnosis_prompt(result)
    log(f"诊断提示词长度: {len(prompt)} 字符")

    # 调用 LLM 进行分析
    log("开始调用 LLM 进行分析...")
    llm_result = call_llm(prompt, model_config)

    if not llm_result['success']:
        log(f"诊断失败: {llm_result['error']}")
        sys.exit(1)

    diagnosis_report = llm_result['content']
    log(f"诊断完成，报告长度: {len(diagnosis_report)} 字符")

    # 保存诊断结果
    save_diagnosis_result(result_id, diagnosis_report, model_config['id'])

    # 输出结果
    print("\n" + "=" * 80)
    print("诊断报告")
    print("=" * 80)
    print(diagnosis_report)
    print("=" * 80)

    log("诊断完成")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("\n用法:")
        print("    uv run python run_diagnosis.py <result_id> [model_id]")
        sys.exit(1)

    result_id = int(sys.argv[1])
    model_id = int(sys.argv[2]) if len(sys.argv) > 2 else None

    run_diagnosis(result_id, model_id)


if __name__ == "__main__":
    main()
