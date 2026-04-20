#!/usr/bin/env python3
"""
output_parser.py 的单元测试
"""

import sys
import os
import tempfile

# 添加 scripts 目录到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))

import unittest
from output_parser import parse_agent_output, parse_execution_log
from fixtures.sample_llm_outputs import (
    SAMPLE_EXECUTION_LOG_1,
    SAMPLE_SIMPLE_OUTPUT,
    SAMPLE_COMPLEX_TOOLS_OUTPUT,
    SAMPLE_EMPTY_OUTPUT,
    SAMPLE_TOOLS_ONLY,
    SAMPLE_ERROR_OUTPUT,
    SAMPLE_MULTILINE_CODE
)


class TestParseAgentOutput(unittest.TestCase):
    """测试 parse_agent_output 函数"""

    def test_parse_complete_execution_log(self):
        """测试解析完整的执行日志"""
        result = parse_agent_output(SAMPLE_EXECUTION_LOG_1)

        # 验证返回结构
        self.assertIn('execution_steps', result)
        self.assertIn('execution_answer', result)
        self.assertIn('raw_output', result)

        # 验证执行步骤包含工具调用
        self.assertIn('[client]', result['execution_steps'])
        self.assertIn('[tool]', result['execution_steps'])

        # 验证执行答案包含最终内容
        self.assertIn('最终答案', result['execution_answer'])

        # 验证原始输出完整保留
        self.assertEqual(result['raw_output'], SAMPLE_EXECUTION_LOG_1)

    def test_parse_simple_output(self):
        """测试解析简单输出（无工具调用）"""
        result = parse_agent_output(SAMPLE_SIMPLE_OUTPUT)

        # [client] 行被视为步骤
        self.assertIn('[client]', result['execution_steps'])

        # 答案应该包含思考后的内容
        self.assertIn('简单的答案', result['execution_answer'])

    def test_parse_complex_tools_output(self):
        """测试解析包含多个工具调用的复杂输出"""
        result = parse_agent_output(SAMPLE_COMPLEX_TOOLS_OUTPUT)

        # 验证所有工具调用都被捕获
        self.assertIn('[tool] search', result['execution_steps'])
        self.assertIn('[tool] execute code', result['execution_steps'])

        # 验证答案包含分析结果
        self.assertIn('最终答案', result['execution_answer'])
        self.assertIn('多个步骤的分析结果', result['execution_answer'])

    def test_parse_empty_output(self):
        """测试解析空输出"""
        result = parse_agent_output(SAMPLE_EMPTY_OUTPUT)

        self.assertEqual(result['execution_steps'], '')
        self.assertEqual(result['execution_answer'], '')
        self.assertEqual(result['raw_output'], '')

    def test_parse_tools_only_output(self):
        """测试解析只有工具调用没有答案的输出"""
        result = parse_agent_output(SAMPLE_TOOLS_ONLY)

        # 步骤应该被捕获
        self.assertIn('[tool]', result['execution_steps'])

        # 没有思考标记，答案可能为空
        # 但由于有 [done] end_turn，会尝试提取答案

    def test_parse_error_output(self):
        """测试解析包含错误信息的输出"""
        result = parse_agent_output(SAMPLE_ERROR_OUTPUT)

        # 验证错误相关的步骤被捕获
        self.assertIn('ZeroDivisionError', result['execution_steps'])

        # 验证答案包含错误处理
        self.assertIn('除零错误', result['execution_answer'])

    def test_parse_multiline_code(self):
        """测试解析包含多行代码的输出"""
        result = parse_agent_output(SAMPLE_MULTILINE_CODE)

        # 验证多行代码被正确捕获到步骤中
        self.assertIn('def hello()', result['execution_steps'])

        # 验证答案正确
        self.assertIn('world', result['execution_answer'])

    def test_execution_steps_not_in_answer(self):
        """验证执行步骤不会重复出现在答案中"""
        result = parse_agent_output(SAMPLE_EXECUTION_LOG_1)

        # 答案中不应该包含工具调用的内容
        self.assertNotIn('[tool]', result['execution_answer'])
        self.assertNotIn('[client]', result['execution_answer'])

    def test_whitespace_handling(self):
        """测试空白字符处理"""
        content_with_extra_whitespace = """

[client] initialize (running)

[thinking] ಠ_ಠ ruminating...

答案内容

[done] end_turn

"""
        result = parse_agent_output(content_with_extra_whitespace)

        # 答案应该被清理前后空白
        self.assertNotEqual(result['execution_answer'][0], '\n')
        self.assertNotEqual(result['execution_answer'][-1], '\n')


class TestParseExecutionLog(unittest.TestCase):
    """测试 parse_execution_log 函数"""

    def test_parse_from_file(self):
        """测试从文件解析"""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False) as f:
            f.write(SAMPLE_EXECUTION_LOG_1)
            temp_path = f.name

        try:
            result = parse_execution_log(temp_path)

            self.assertIn('execution_steps', result)
            self.assertIn('execution_answer', result)
            self.assertIn('[client]', result['execution_steps'])
        finally:
            os.unlink(temp_path)

    def test_parse_nonexistent_file(self):
        """测试解析不存在的文件"""
        result = parse_execution_log('/nonexistent/path/file.md')

        # 应该返回错误信息
        self.assertIn('Error reading file', result['raw_output'])
        self.assertEqual(result['execution_steps'], '')
        self.assertEqual(result['execution_answer'], '')

    def test_parse_empty_file(self):
        """测试解析空文件"""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False) as f:
            f.write('')
            temp_path = f.name

        try:
            result = parse_execution_log(temp_path)
            self.assertEqual(result['execution_steps'], '')
            self.assertEqual(result['execution_answer'], '')
        finally:
            os.unlink(temp_path)


class TestEdgeCases(unittest.TestCase):
    """测试边界情况"""

    def test_no_thinking_marker(self):
        """测试没有 thinking 标记的输出"""
        content = """[client] initialize (running)

一些内容
没有思考标记

[done] end_turn"""
        result = parse_agent_output(content)

        # 应该尝试提取答案
        self.assertIn('没有思考标记', result['execution_answer'])

    def test_multiple_thinking_markers(self):
        """测试多个 thinking 标记 - 应该取最后一个"""
        content = """[client] initialize (running)

[thinking] 第一个思考
第一个答案

[thinking] 第二个思考
第二个答案（应该被采用）

[done] end_turn"""
        result = parse_agent_output(content)

        self.assertIn('第二个答案', result['execution_answer'])
        self.assertNotIn('第一个答案', result['execution_answer'])

    def test_nested_tool_calls(self):
        """测试嵌套工具调用场景"""
        content = """[client] initialize (running)

[thinking] 开始思考

[tool] tool1 (running)
  input: data1

[tool] tool1 (completed)
  output: result1

[tool] tool2 (running)
  input: data2

[thinking] 中间思考

[tool] tool2 (completed)
  output: result2

[thinking] 最终思考
最终答案

[done] end_turn"""
        result = parse_agent_output(content)

        # 所有工具调用都应该在步骤中
        self.assertIn('tool1', result['execution_steps'])
        self.assertIn('tool2', result['execution_steps'])

        # 最终答案
        self.assertIn('最终答案', result['execution_answer'])


if __name__ == '__main__':
    unittest.main()
