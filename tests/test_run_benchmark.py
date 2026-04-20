#!/usr/bin/env python3
"""
run_benchmark.py 的单元测试
"""

import sys
import os
import json
import tempfile
import shutil
from datetime import datetime
from unittest.mock import patch, MagicMock

# 添加 scripts 目录到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))

import unittest
from fixtures.database import (
    create_test_db, insert_test_agent, insert_test_test_case,
    insert_test_benchmark, insert_test_execution, setup_test_data
)
from fixtures.sample_llm_outputs import SAMPLE_EXECUTION_LOG_1

# 导入被测模块的函数（需要 mock 数据库路径）
import run_benchmark as rb


class TestGetDbConnection(unittest.TestCase):
    """测试数据库连接"""

    def test_get_db_connection(self):
        """测试获取数据库连接"""
        with patch.object(rb, 'DB_PATH', ':memory:'):
            # 需要先创建表结构
            conn = rb.get_db_connection()
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = cursor.fetchall()
            # 内存数据库初始为空，需要创建表
            conn.close()


class TestParseTemplate(unittest.TestCase):
    """测试模板解析功能"""

    def test_simple_variable_replacement(self):
        """测试简单变量替换"""
        template = "Hello {{name}}!"
        context = {"name": "World"}
        result = rb.parse_template(template, context)
        self.assertEqual(result, "Hello World!")

    def test_multiple_variables(self):
        """测试多个变量替换"""
        template = "{{greeting}} {{name}}, your score is {{score}}"
        context = {"greeting": "Hi", "name": "Alice", "score": 100}
        result = rb.parse_template(template, context)
        self.assertEqual(result, "Hi Alice, your score is 100")

    def test_missing_variable(self):
        """测试缺失变量"""
        template = "Hello {{name}}!"
        context = {}
        result = rb.parse_template(template, context)
        # 缺失的变量保持原样
        self.assertEqual(result, "Hello {{name}}!")

    def test_special_characters_in_value(self):
        """测试值中包含特殊字符"""
        template = "Code: {{code}}"
        context = {"code": "print('hello\\nworld')"}
        result = rb.parse_template(template, context)
        self.assertEqual(result, "Code: print('hello\\nworld')")

    def test_prompt_template_placeholder(self):
        """测试 prompt 模板占位符"""
        template = "{{input}}"
        context = {"input": "Calculate 1+1"}
        result = rb.parse_template(template, context)
        self.assertEqual(result, "Calculate 1+1")


class TestGetExecutionDetails(unittest.TestCase):
    """测试获取 execution 详情"""

    def setUp(self):
        self.conn = create_test_db()
        self.temp_db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.temp_db.close()
        # 复制内存数据库到文件
        with sqlite3.connect(self.temp_db.name) as file_conn:
            self.conn.backup(file_conn)

    def tearDown(self):
        self.conn.close()
        os.unlink(self.temp_db.name)

    def test_get_existing_execution(self):
        """测试获取存在的 execution"""
        # 插入测试数据
        agent_id = insert_test_agent(self.conn, "test_agent")
        tc_id = insert_test_test_case(self.conn, "TC_001")
        benchmark_id = insert_test_benchmark(
            self.conn, [agent_id], [tc_id],
            run_config={"prompt_template": "{{input}}", "max_workers": 2}
        )
        execution_id = insert_test_execution(self.conn, benchmark_id)

        # 保存到文件以便被测模块读取
        with sqlite3.connect(self.temp_db.name) as file_conn:
            self.conn.backup(file_conn)

        with patch.object(rb, 'DB_PATH', self.temp_db.name):
            result = rb.get_execution_details(execution_id)

            self.assertIsNotNone(result)
            self.assertEqual(result['id'], execution_id)
            self.assertEqual(result['benchmark_id'], benchmark_id)
            self.assertIn('agent_ids', result)
            self.assertIn('test_case_ids', result)
            self.assertIsInstance(result['run_config'], dict)

    def test_get_nonexistent_execution(self):
        """测试获取不存在的 execution"""
        with patch.object(rb, 'DB_PATH', self.temp_db.name):
            result = rb.get_execution_details(99999)
            self.assertIsNone(result)

    def test_run_config_parsing(self):
        """测试 run_config JSON 解析"""
        agent_id = insert_test_agent(self.conn, "test_agent")
        tc_id = insert_test_test_case(self.conn, "TC_001")
        benchmark_id = insert_test_benchmark(
            self.conn, [agent_id], [tc_id],
            run_config={"key": "value", "nested": {"a": 1}}
        )
        execution_id = insert_test_execution(self.conn, benchmark_id)

        with sqlite3.connect(self.temp_db.name) as file_conn:
            self.conn.backup(file_conn)

        with patch.object(rb, 'DB_PATH', self.temp_db.name):
            result = rb.get_execution_details(execution_id)
            self.assertEqual(result['run_config']['key'], 'value')
            self.assertEqual(result['run_config']['nested']['a'], 1)

    def test_invalid_run_config(self):
        """测试无效的 run_config"""
        # 手动插入无效 JSON
        agent_id = insert_test_agent(self.conn, "test_agent")
        tc_id = insert_test_test_case(self.conn, "TC_001")

        cursor = self.conn.execute(
            '''INSERT INTO benchmarks (name, agent_ids, test_case_ids, run_config)
               VALUES (?, ?, ?, ?)''',
            ('Test', json.dumps([agent_id]), json.dumps([tc_id]), 'invalid json')
        )
        benchmark_id = cursor.lastrowid

        cursor = self.conn.execute(
            '''INSERT INTO benchmark_executions (benchmark_id, name, status)
               VALUES (?, ?, ?)''',
            (benchmark_id, 'Test', 'pending')
        )
        execution_id = cursor.lastrowid
        self.conn.commit()

        with sqlite3.connect(self.temp_db.name) as file_conn:
            self.conn.backup(file_conn)

        with patch.object(rb, 'DB_PATH', self.temp_db.name):
            result = rb.get_execution_details(execution_id)
            # 无效 JSON 应该返回空字典
            self.assertEqual(result['run_config'], {})


class TestGetAgentDetails(unittest.TestCase):
    """测试获取 Agent 详情"""

    def test_get_existing_agent(self):
        """测试获取存在的 Agent"""
        conn = create_test_db()
        agent_id = insert_test_agent(conn, "hermes", "echo '{{prompt}}'")

        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as temp:
            temp.close()
            with sqlite3.connect(temp.name) as file_conn:
                conn.backup(file_conn)

            try:
                with patch.object(rb, 'DB_PATH', temp.name):
                    result = rb.get_agent_details(agent_id)

                    self.assertIsNotNone(result)
                    self.assertEqual(result['id'], agent_id)
                    self.assertEqual(result['name'], 'hermes')
                    self.assertEqual(result['command'], "echo '{{prompt}}'")
            finally:
                os.unlink(temp.name)
                conn.close()

    def test_get_nonexistent_agent(self):
        """测试获取不存在的 Agent"""
        with patch.object(rb, 'DB_PATH', ':memory:'):
            result = rb.get_agent_details(99999)
            self.assertIsNone(result)


class TestGetTestCaseDetails(unittest.TestCase):
    """测试获取测试用例详情"""

    def test_get_existing_test_case(self):
        """测试获取存在的测试用例"""
        conn = create_test_db()
        tc_id = insert_test_test_case(conn, "TC_032", "Hermes Test")

        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as temp:
            temp.close()
            with sqlite3.connect(temp.name) as file_conn:
                conn.backup(file_conn)

            try:
                with patch.object(rb, 'DB_PATH', temp.name):
                    result = rb.get_test_case_details(tc_id)

                    self.assertIsNotNone(result)
                    self.assertEqual(result['id'], tc_id)
                    self.assertEqual(result['test_id'], 'TC_032')
                    self.assertEqual(result['name'], 'Hermes Test')
                    self.assertIsInstance(result['key_points'], list)
                    self.assertIsInstance(result['forbidden_points'], list)
            finally:
                os.unlink(temp.name)
                conn.close()


class TestGetResultId(unittest.TestCase):
    """测试结果记录 ID 获取"""

    def test_get_existing_result(self):
        """测试获取存在的结果 ID"""
        conn = create_test_db()
        ids = setup_test_data(conn)

        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as temp:
            temp.close()
            with sqlite3.connect(temp.name) as file_conn:
                conn.backup(file_conn)

            try:
                with patch.object(rb, 'DB_PATH', temp.name):
                    result_id = rb.get_result_id(
                        ids['execution_id'],
                        ids['agent_id'],
                        ids['test_case_ids'][0]
                    )
                    self.assertEqual(result_id, ids['result_ids'][0])
            finally:
                os.unlink(temp.name)
                conn.close()

    def test_get_nonexistent_result(self):
        """测试获取不存在的结果 ID"""
        conn = create_test_db()

        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as temp:
            temp.close()
            with sqlite3.connect(temp.name) as file_conn:
                conn.backup(file_conn)

            try:
                with patch.object(rb, 'DB_PATH', temp.name):
                    result_id = rb.get_result_id(999, 999, 999)
                    self.assertIsNone(result_id)
            finally:
                os.unlink(temp.name)
                conn.close()


import sqlite3

if __name__ == '__main__':
    unittest.main()
