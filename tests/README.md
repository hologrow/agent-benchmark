# Benchmark Runner 测试套件

本目录包含 benchmark runner 项目的 Python 脚本测试。

## 目录结构

```
tests/
├── __init__.py                    # 测试包初始化
├── conftest.py                    # pytest 配置
├── run_tests.py                   # 测试运行脚本
├── requirements.txt               # 测试依赖
├── README.md                      # 本文件
├── fixtures/                      # 测试 fixtures
│   ├── __init__.py
│   ├── database.py               # 数据库 fixtures
│   └── sample_llm_outputs.py     # 测试用的 LLM 输出样本
├── test_output_parser.py         # output_parser.py 测试
├── test_run_benchmark.py         # run_benchmark.py 测试
├── test_run_evaluator.py         # run_evaluator.py 测试
└── test_integration.py           # 集成测试
```

## 运行测试

### 运行所有测试

```bash
cd /Users/quanwei/git/benchmark-runner
python tests/run_tests.py
```

### 运行特定测试模块

```bash
# 运行单个测试文件
python -m unittest tests.test_output_parser

# 运行特定测试类
python -m unittest tests.test_output_parser.TestParseAgentOutput

# 运行特定测试方法
python -m unittest tests.test_output_parser.TestParseAgentOutput.test_parse_complete_execution_log
```

### 使用 pytest 运行

```bash
# 安装 pytest
pip install pytest pytest-cov

# 运行所有测试
pytest tests/

# 运行并生成覆盖率报告
pytest tests/ --cov=scripts --cov-report=html

# 运行特定测试
pytest tests/test_output_parser.py::TestParseAgentOutput::test_parse_complete_execution_log -v
```

### 生成覆盖率报告

```bash
python tests/run_tests.py --coverage
```

## 测试分类

### 单元测试

- **test_output_parser.py**: 测试 Agent 输出解析功能
  - 解析完整执行日志
  - 处理各种边界情况
  - 文件读取功能

- **test_run_benchmark.py**: 测试 benchmark 执行功能
  - 模板解析
  - 数据库操作
  - Agent 和测试用例管理

- **test_run_evaluator.py**: 测试评估器功能
  - LLM 评估调用
  - 评分逻辑
  - 结果存储

### 集成测试

- **test_integration.py**: 测试完整工作流程
  - 端到端 benchmark 执行和评估
  - 组件间集成
  - 错误处理

### Fixtures

- **fixtures/database.py**: 提供测试数据库和测试数据
  - 内存 SQLite 数据库
  - 预设测试数据集
  - 辅助函数

- **fixtures/sample_llm_outputs.py**: 提供测试用的 LLM 输出样本
  - 各种格式的执行日志
  - 评估响应样本
  - 边界情况样本

## 测试数据

所有测试使用内存 SQLite 数据库，不会修改真实数据。

### 测试数据库表结构

- `agents`: 测试 Agent 配置
- `test_cases`: 测试用例
- `benchmarks`: Benchmark 配置
- `benchmark_executions`: 执行记录
- `benchmark_results`: 测试结果
- `evaluations`: 评估结果
- `evaluators`: 评估器配置
- `models`: 模型配置

## 编写新测试

1. 在 `tests/` 目录创建 `test_*.py` 文件
2. 导入所需的 fixtures:
   ```python
   from fixtures.database import create_test_db
   from fixtures.sample_llm_outputs import SAMPLE_EXECUTION_LOG_1
   ```
3. 继承 `unittest.TestCase` 编写测试类
4. 使用 `setUp` 和 `tearDown` 管理测试环境

### 示例

```python
import unittest
from fixtures.database import create_test_db

class TestMyFeature(unittest.TestCase):
    def setUp(self):
        self.conn = create_test_db()

    def tearDown(self):
        self.conn.close()

    def test_something(self):
        # 编写测试代码
        pass
```

## 持续集成

测试可以在 CI 环境中运行：

```bash
# 安装依赖
pip install -r tests/requirements.txt

# 运行测试
python tests/run_tests.py

# 或
pytest tests/ --cov=scripts --cov-report=xml
```

## 注意事项

1. 所有数据库操作使用内存数据库，不会污染真实数据
2. LLM 调用使用 mock，不需要真实 API key
3. 文件操作使用临时目录，测试结束后自动清理
4. 测试用例设计为独立运行，不依赖执行顺序
