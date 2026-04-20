"""
测试用的 LLM 输出样本
"""

# 完整的 Agent 执行日志样本（包含步骤和答案）
SAMPLE_EXECUTION_LOG_1 = """[client] initialize (running)

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
这是测试用例的答案部分。

[done] end_turn"""

# 只有思考没有工具调用的简单输出
SAMPLE_SIMPLE_OUTPUT = """[client] initialize (running)

[client] session/new (running)

[thinking] ಠ_ಠ ruminating...

这是简单的答案，没有工具调用。
只有思考过程和最终答案。

[done] end_turn"""

# 包含多个工具调用的复杂输出
SAMPLE_COMPLEX_TOOLS_OUTPUT = """[client] initialize (running)

[client] session/new (running)

[thinking] ಠ_ಠ ruminating...

[tool] search (running)
  input: {"query": "Python best practices"}

[tool] search (completed)
  kind: search
  input: {"query": "Python best practices"}
  output:
    {"results": [{"title": "PEP 8", "content": "Style guide"}]}

[thinking] (¬‿¬) musing...

[tool] execute code (running)
  input: {"code": "import json; print(json.dumps({'key': 'value'}))"}

[tool] execute code (completed)
  kind: execute
  input: {"code": "import json; print(json.dumps({'key': 'value'}))"}
  output:
    {"status": "success", "output": "{\\"key\\": \\"value\\"}\\n"}

[thinking] (✿◠‿◠) reflecting...
基于以上工具调用结果，我得出最终答案。

答案包含多个步骤的分析结果。

[done] end_turn"""

# 空输出
SAMPLE_EMPTY_OUTPUT = ""

# 只有工具调用没有答案（异常情况）
SAMPLE_TOOLS_ONLY = """[client] initialize (running)

[tool] execute code (running)
  input: {"code":"print('test')"}

[tool] execute code (completed)
  kind: execute
  input: {"code":"print('test')"}
  output:
    {"status": "success", "output": "test\\n"}

[done] end_turn"""

# 包含错误信息的输出
SAMPLE_ERROR_OUTPUT = """[client] initialize (running)

[client] session/new (running)

[thinking] ಠ_ಠ ruminating...

[tool] execute code (running)
  input: {"code":"1/0"}

[tool] execute code (completed)
  kind: execute
  input: {"code":"1/0"}
  output:
    {"status": "error", "error": "ZeroDivisionError: division by zero"}

[thinking] (╯°□°）╯︵ ┻━┬ 遇到错误
执行过程中遇到了除零错误，让我修复这个问题。

最终答案：代码执行失败，需要修复错误。

[done] end_turn"""

# 多行代码块输出
SAMPLE_MULTILINE_CODE = """[client] initialize (running)

[thinking] ಠ_ಠ ruminating...

[tool] execute code (running)
  input:
    {"code": "def hello():\\n    return 'world'\\n\\nprint(hello())"}

[tool] execute code (completed)
  kind: execute
  input:
    {"code": "def hello():\\n    return 'world'\\n\\nprint(hello())"}
  output:
    {"status": "success", "output": "world\\n"}

[thinking] (¬‿¬) musing...
函数执行成功，返回了 'world'。

最终答案：代码运行正常，输出为 world。

[done] end_turn"""

# LLM 评估返回的 JSON 样本
SAMPLE_EVALUATION_RESPONSE = """{
    "score": 85,
    "report": "Agent 的输出整体质量良好，满足了大部分关键测试点。答案结构清晰，逻辑合理。",
    "key_points_met": ["关键点1：回答了问题", "关键点2：结构清晰"],
    "forbidden_points_violated": []
}"""

SAMPLE_EVALUATION_LOW_SCORE = """{
    "score": 30,
    "report": "Agent 的输出未能满足关键测试点，存在明显错误。",
    "key_points_met": [],
    "forbidden_points_violated": ["禁止点1：包含错误信息"]
}"""

SAMPLE_EVALUATION_INVALID_JSON = """这不是有效的 JSON 格式
得分：85分
报告：输出质量不错"""

# 测试用例数据样本
SAMPLE_TEST_CASE = {
    "id": "TC_001",
    "name": "测试用例1",
    "input": "请编写一个 Python 函数计算斐波那契数列",
    "expected_output": "def fibonacci(n): ...",
    "key_points": ["函数定义正确", "递归或迭代实现", "处理边界条件"],
    "forbidden_points": ["使用全局变量", "没有错误处理"]
}

SAMPLE_TEST_CASE_2 = {
    "id": "TC_002",
    "name": "测试用例2",
    "input": "解释什么是 Python 的装饰器",
    "expected_output": "装饰器是一种函数...",
    "key_points": ["解释清晰", "提供示例"],
    "forbidden_points": ["包含错误概念"]
}
