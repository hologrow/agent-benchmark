#!/usr/bin/env python3
"""
集成测试 - 测试完整的 benchmark 执行和评估流程
"""

import sys
import os
import json
import tempfile
import sqlite3
from pathlib import Path
from datetime import datetime
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))

import unittest
from fixtures.database import create_test_db, setup_test_data
from fixtures.sample_llm_outputs import (
    SAMPLE_EXECUTION_LOG_1,
    SAMPLE_EVALUATION_RESPONSE
)

import run_benchmark as rb
import run_evaluator as re
from output_parser import parse_agent_output


class TestEndToEndWorkflow(unittest.TestCase):
    """测试完整的端到端工作流程"""

    def setUp(self):
        self.conn = create_test_db()
        self.temp_dir = tempfile.mkdtemp()
        self.temp_db_path = os.path.join(self.temp_dir, 'test.db')

        # 保存数据库到文件
        with sqlite3.connect(self.temp_db_path) as file_conn:
            self.conn.backup(file_conn)

    def tearDown(self):
        self.conn.close()
        import shutil
        shutil.rmtree(self.temp_dir)

    @patch('run_benchmark.subprocess.run')
    @patch('run_benchmark.subprocess.Popen')
    @patch('run_evaluator.evaluate_with_llm')
    def test_full_benchmark_and_evaluation(self, mock_evaluate, mock_popen, mock_run):
        """测试完整的 benchmark 执行和评估流程"""
        # 设置测试数据
        ids = setup_test_data(self.conn)

        # Mock agent 输出
        mock_stdout = MagicMock()
        # side_effect 耗尽后继续返回空字符串
        lines = [
            '[client] initialize (running)\n',
            '[thinking] Thinking...\n',
            'Final answer\n',
            '[done] end_turn\n',
            ''
        ]
        def readline_side_effect():
            return lines.pop(0) if lines else ''
        mock_stdout.readline.side_effect = readline_side_effect

        mock_process = MagicMock()
        mock_process.stdout = mock_stdout
        # poll() 需要返回 None（运行中）或 0（完成）
        poll_count = [0]
        def poll_side_effect():
            poll_count[0] += 1
            return 0 if poll_count[0] > 5 else None
        mock_process.poll.side_effect = poll_side_effect
        mock_process.returncode = 0
        mock_process.wait.return_value = 0
        mock_popen.return_value = mock_process

        # Mock 评估响应
        mock_evaluate.return_value = {
            'success': True,
            'evaluation': {
                'score': 85,
                'report': 'Good result',
                'key_points_met': ['point1'],
                'forbidden_points_violated': []
            }
        }

        # Mock subprocess.run
        mock_run.return_value = MagicMock(returncode=0, stdout='', stderr='')

        # 保存更新后的数据库
        with sqlite3.connect(self.temp_db_path) as file_conn:
            self.conn.backup(file_conn)

        # 执行 benchmark
        results_dir = Path(tempfile.mkdtemp())
        with patch.object(rb, 'DB_PATH', self.temp_db_path):
            with patch.object(rb, 'RESULTS_DIR', results_dir):
                # 运行两个测试用例
                for tc_id in ids['test_case_ids']:
                    single_result = rb.run_single_test({
                        'execution_id': ids['execution_id'],
                        'agent_id': ids['agent_id'],
                        'test_case_id': tc_id,
                        'run_config': {'prompt_template': '{{input}}'}
                    })
                    print(f"Test case {tc_id} result: {single_result}")

        # 验证 benchmark 执行结果
        # 注意：run_benchmark 写入的是文件数据库，不是内存数据库
        with sqlite3.connect(self.temp_db_path) as file_conn:
            file_conn.row_factory = sqlite3.Row
            cursor = file_conn.execute(
                '''SELECT status, actual_output, execution_steps, execution_answer
                   FROM benchmark_results WHERE execution_id = ?''',
                (ids['execution_id'],)
            )
            results = cursor.fetchall()

        self.assertEqual(len(results), 2)  # 两个测试用例
        for result in results:
            result_dict = dict(result)
            self.assertEqual(result_dict['status'], 'completed')
            self.assertIsNotNone(result_dict['actual_output'])
            self.assertIsNotNone(result_dict['execution_steps'])
            self.assertIsNotNone(result_dict['execution_answer'])


class TestOutputParserIntegration(unittest.TestCase):
    """测试输出解析器与其他组件的集成"""

    def test_parser_with_benchmark_output(self):
        """测试解析器处理 benchmark 输出"""
        result = parse_agent_output(SAMPLE_EXECUTION_LOG_1)

        # 验证可以正确分离步骤和答案
        self.assertTrue(len(result['execution_steps']) > 0)
        self.assertTrue(len(result['execution_answer']) > 0)

        # 验证步骤包含工具调用标记
        self.assertIn('[tool]', result['execution_steps'])

        # 验证答案不包含工具调用
        self.assertNotIn('[tool]', result['execution_answer'])

    def test_parser_handles_various_formats(self):
        """测试解析器处理各种输出格式"""
        test_cases = [
            # 标准格式
            """[client] init
[thinking] ...
Answer
[done] end_turn""",
            # 多工具调用
            """[tool] t1
  input: {}
[tool] t1 (completed)
[thinking] ...
Answer
[done] end_turn""",
            # 无工具
            """[client] init
[thinking] ...
Simple answer
[done] end_turn""",
        ]

        for content in test_cases:
            result = parse_agent_output(content)
            self.assertIn('execution_steps', result)
            self.assertIn('execution_answer', result)
            self.assertIn('raw_output', result)


class TestDatabaseIntegration(unittest.TestCase):
    """测试数据库集成"""

    def test_database_schema_consistency(self):
        """测试数据库 schema 一致性"""
        conn = create_test_db()

        # 验证所有表都存在
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
        tables = {row['name'] for row in cursor.fetchall()}

        required_tables = {
            'agents', 'test_cases', 'benchmarks',
            'benchmark_executions', 'benchmark_results',
            'evaluations', 'evaluators', 'models', 'test_sets'
        }

        self.assertTrue(required_tables.issubset(tables))
        conn.close()

    def test_foreign_key_constraints(self):
        """测试外键约束"""
        conn = create_test_db()

        # SQLite 默认不启用外键约束，需要手动启用
        conn.execute("PRAGMA foreign_keys = ON")

        # 尝试插入违反外键约束的数据
        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute(
                '''INSERT INTO benchmark_results
                   (execution_id, agent_id, test_case_id, status)
                   VALUES (999, 999, 999, 'pending')'''
            )

        conn.close()


class TestErrorHandling(unittest.TestCase):
    """测试错误处理"""

    def test_parser_with_malformed_input(self):
        """测试解析器处理畸形输入"""
        malformed_inputs = [
            None,
            '',
            '[done] end_turn',  # 没有 thinking
            '[thinking] ...',  # 没有 done
            'Random text without markers',
        ]

        for content in malformed_inputs:
            try:
                result = parse_agent_output(content or '')
                self.assertIn('execution_steps', result)
                self.assertIn('execution_answer', result)
            except Exception as e:
                self.fail(f"Parser failed on input {content!r}: {e}")

    @patch('run_benchmark.subprocess.Popen')
    def test_benchmark_handles_agent_failure(self, mock_popen):
        """测试 benchmark 处理 agent 失败"""
        mock_stdout = MagicMock()
        lines = ['Error output\n', '']
        def readline_side_effect():
            return lines.pop(0) if lines else ''
        mock_stdout.readline.side_effect = readline_side_effect

        mock_process = MagicMock()
        mock_process.stdout = mock_stdout
        mock_process.poll.return_value = 0
        mock_process.returncode = 1  # 失败状态
        mock_popen.return_value = mock_process

        conn = create_test_db()
        ids = setup_test_data(conn)

        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as temp:
            temp.close()
            with sqlite3.connect(temp.name) as file_conn:
                conn.backup(file_conn)

            try:
                with patch.object(rb, 'DB_PATH', temp.name):
                    rb.run_single_test({
                        'execution_id': ids['execution_id'],
                        'agent_id': ids['agent_id'],
                        'test_case_id': ids['test_case_ids'][0],
                        'run_config': {}
                    })

                # 验证状态为 failed (从文件数据库读取)
                with sqlite3.connect(temp.name) as verify_conn:
                    verify_conn.row_factory = sqlite3.Row
                    cursor = verify_conn.execute(
                        'SELECT status FROM benchmark_results WHERE id = ?',
                        (ids['result_ids'][0],)
                    )
                    status = cursor.fetchone()[0]
                    self.assertEqual(status, 'failed')
            finally:
                os.unlink(temp.name)
                conn.close()


if __name__ == '__main__':
    unittest.main()
