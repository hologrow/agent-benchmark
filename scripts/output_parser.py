#!/usr/bin/env python3
"""
Agent 输出解析器
用于解析 execution log，分离执行步骤和执行答案
"""

import re
from typing import Dict, Tuple


def parse_agent_output(content: str) -> Dict[str, str]:
    """
    解析 Agent 输出，分离执行步骤和执行答案

    Args:
        content: Agent 原始输出内容

    Returns:
        Dict 包含:
            - execution_steps: 执行步骤（所有 [client] 和 [tool] 相关内容）
            - execution_answer: 执行答案（最后一个 thinking 后的内容）
            - raw_output: 原始输出
    """
    if not content:
        return {
            'execution_steps': '',
            'execution_answer': '',
            'raw_output': ''
        }

    lines = content.split('\n')

    # 用于收集执行步骤的索引范围
    step_indices = set()

    # 标记当前是否在步骤区域内
    in_step_block = False
    current_block_start = -1

    for i, line in enumerate(lines):
        # 检测步骤标记的开始
        if line.startswith('[client]') or line.startswith('[tool]'):
            in_step_block = True
            current_block_start = i
            step_indices.add(i)
        # 检测步骤块内的内容（input/output/kind 等缩进行）
        elif in_step_block and (line.startswith('  ') or line.startswith('\t') or line.strip() == ''):
            step_indices.add(i)
        # 遇到非缩进且非空行，结束步骤块
        elif in_step_block and line.strip() and not line.startswith('  ') and not line.startswith('\t'):
            in_step_block = False
            current_block_start = -1

    # 收集执行步骤
    execution_steps_lines = []
    for i in range(len(lines)):
        if i in step_indices:
            execution_steps_lines.append(lines[i])

    # 查找最后一个 [thinking] 之后的内容作为答案
    # thinking 行的模式：[thinking] 表情符号 ...
    thinking_pattern = re.compile(r'^\[thinking\]\s*')

    last_thinking_idx = -1
    for i, line in enumerate(lines):
        if thinking_pattern.match(line):
            last_thinking_idx = i

    execution_answer_lines = []

    if last_thinking_idx >= 0:
        # 从 thinking 行之后开始收集，直到 [done] end_turn
        for i in range(last_thinking_idx + 1, len(lines)):
            line = lines[i]
            # 遇到结束标记停止
            if line.strip() == '[done] end_turn':
                break
            # 跳过步骤相关的内容（避免重复）
            if i in step_indices:
                continue
            execution_answer_lines.append(line)

    # 清理答案的前后空行
    execution_answer = '\n'.join(execution_answer_lines).strip()

    # 如果没有找到 thinking 标记，尝试其他策略
    if not execution_answer and not last_thinking_idx >= 0:
        # 尝试找 [done] end_turn 之前的内容
        done_idx = -1
        for i, line in enumerate(lines):
            if line.strip() == '[done] end_turn':
                done_idx = i
                break

        if done_idx > 0:
            # 收集所有非步骤内容作为答案
            answer_lines = []
            for i in range(done_idx):
                if i not in step_indices:
                    answer_lines.append(lines[i])
            execution_answer = '\n'.join(answer_lines).strip()

    return {
        'execution_steps': '\n'.join(execution_steps_lines).strip(),
        'execution_answer': execution_answer,
        'raw_output': content
    }


def parse_execution_log(file_path: str) -> Dict[str, str]:
    """
    从文件解析 execution log

    Args:
        file_path: 日志文件路径

    Returns:
        Dict 包含 execution_steps, execution_answer, raw_output
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return parse_agent_output(content)
    except Exception as e:
        return {
            'execution_steps': '',
            'execution_answer': '',
            'raw_output': f'Error reading file: {str(e)}'
        }


if __name__ == '__main__':
    # 测试解析器
    import sys

    if len(sys.argv) > 1:
        file_path = sys.argv[1]
        result = parse_execution_log(file_path)

        print("=" * 80)
        print("执行步骤:")
        print("=" * 80)
        print(result['execution_steps'][:2000] if result['execution_steps'] else '(无)')
        print("\n")

        print("=" * 80)
        print("执行答案:")
        print("=" * 80)
        print(result['execution_answer'][:2000] if result['execution_answer'] else '(无)')
    else:
        # 使用示例内容进行测试
        sample = """[client] initialize (running)

[client] session/new (running)

[thinking] ಠ_ಠ ruminating...

[tool] execute code (running)
  input: {"code":"print('hello')"}

[tool] execute code (completed)
  kind: execute
  input: {"code":"print('hello')"}
  output:
    {"status": "success", "output": "hello\\n"}

[thinking] (¬‿¬) musing...
这是最终答案的内容。

包含多行。

[done] end_turn"""

        result = parse_agent_output(sample)
        print("测试样例解析结果:")
        print(f"\n执行步骤长度: {len(result['execution_steps'])}")
        print(f"执行答案长度: {len(result['execution_answer'])}")
        print("\n执行步骤:")
        print(result['execution_steps'])
        print("\n执行答案:")
        print(result['execution_answer'])
