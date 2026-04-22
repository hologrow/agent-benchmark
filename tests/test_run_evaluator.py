#!/usr/bin/env python3
"""
run_evaluator.py 的单元测试
"""

import sys
import os
import json
import tempfile
import sqlite3
from datetime import datetime
from unittest.mock import patch, MagicMock, Mock

# 添加 scripts 目录到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))

import unittest
import run_evaluator as re
from fixtures.database import create_test_db, setup_test_data, insert_test_result
from fixtures.sample_llm_outputs import (
    SAMPLE_EVALUATION_RESPONSE,
    SAMPLE_EVALUATION_LOW_SCORE,
    SAMPLE_EVALUATION_INVALID_JSON
)


class TestParseTemplate(unittest.TestCase):
    """测试模板解析功能"""

    def test_simple_variable_replacement(self):
        """测试简单变量替换"""
        template = "Score: {{score}}"
        context = {"score": 85}
        result = re.parse_template(template, context)
        self.assertEqual(result, "Score: 85")

    def test_multiple_variables(self):
        """测试多个变量替换"""
        template = "Agent: {{agent_name}}, Test: {{test_id}}"
        context = {"agent_name": "hermes", "test_id": "TC_001"}
        result = re.parse_template(template, context)
        self.assertEqual(result, "Agent: hermes, Test: TC_001")

    def test_missing_variable(self):
        """测试缺失变量保持原样"""
        template = "{{missing}}"
        context = {}
        result = re.parse_template(template, context)
        self.assertEqual(result, "{{missing}}")

    def test_special_characters_in_value(self):
        """测试特殊字符值"""
        template = "Output: {{output}}"
        context = {"output": "Line1\nLine2\tTabbed"}
        result = re.parse_template(template, context)
        self.assertEqual(result, "Output: Line1\nLine2\tTabbed")


class TestEvaluateWithOpenAI(unittest.TestCase):
    """测试 OpenAI 评估功能

    注意：这些测试需要安装 openai 包才能正常工作
    pip install openai
    """

    def setUp(self):
        # 检查是否安装了 openai
        try:
            import openai
            self.openai_available = True
        except ImportError:
            self.openai_available = False

    @patch('run_evaluator.OpenAI')
    def test_successful_evaluation(self, mock_openai_class):
        """测试成功的评估"""
        if not self.openai_available:
            self.skipTest("openai 包未安装")

        # Mock OpenAI 客户端
        mock_client = MagicMock()
        mock_openai_class.return_value = mock_client

        # Mock API 响应
        mock_response = MagicMock()
        mock_response.choices[0].message.content = SAMPLE_EVALUATION_RESPONSE
        mock_client.chat.completions.create.return_value = mock_response

        prompt = "Evaluate this output"
        model_config = {
            'provider': 'openai',
            'model_id': 'gpt-4',
            'api_key': 'test-key',
            'base_url': None,
            'config': {'temperature': 0.7}
        }

        result = re.evaluate_with_openai(prompt, 'gpt-4', 'test-key', None, {'temperature': 0.7})

        self.assertTrue(result['success'])
        self.assertIn('evaluation', result)
        self.assertEqual(result['evaluation']['score'], 85)

    @patch('run_evaluator.OpenAI')
    def test_evaluation_with_base_url(self, mock_openai_class):
        """测试带 base_url 的评估"""
        mock_client = MagicMock()
        mock_openai_class.return_value = mock_client

        mock_response = MagicMock()
        mock_response.choices[0].message.content = SAMPLE_EVALUATION_RESPONSE
        mock_client.chat.completions.create.return_value = mock_response

        result = re.evaluate_with_openai(
            "prompt", 'gpt-4', 'test-key', 'https://api.example.com', {}
        )

        self.assertTrue(result['success'])
        # 验证 base_url 被正确传递
        mock_openai_class.assert_called_once()
        call_args = mock_openai_class.call_args
        self.assertEqual(call_args.kwargs['base_url'], 'https://api.example.com')

    @unittest.skipIf(re.evaluate_with_openai.__doc__ and 'openai' in str(re.evaluate_with_openai.__doc__),
                     "需要安装 openai 包")
    def test_missing_api_key(self):
        """测试缺少 API Key"""
        if not self.openai_available:
            self.skipTest("openai 包未安装")

        result = re.evaluate_with_openai("prompt", 'gpt-4', '', None, {})

        self.assertFalse(result['success'])
        self.assertIn('api key', result['error'].lower())

    def test_empty_model_id(self):
        """测试空 model_id"""
        if not self.openai_available:
            self.skipTest("openai 包未安装")

        result = re.evaluate_with_openai("prompt", '', 'test-key', None, {})

        self.assertFalse(result['success'])
        self.assertIn('Model ID', result['error'])

    @patch('run_evaluator.OpenAI')
    def test_empty_response_content(self, mock_openai_class):
        """测试空响应内容"""
        mock_client = MagicMock()
        mock_openai_class.return_value = mock_client

        mock_response = MagicMock()
        mock_response.choices[0].message.content = None
        mock_client.chat.completions.create.return_value = mock_response

        result = re.evaluate_with_openai("prompt", 'gpt-4', 'test-key', None, {})

        self.assertFalse(result['success'])
        self.assertIn('empty content', result['error'].lower())

    @patch('run_evaluator.OpenAI')
    def test_invalid_json_response(self, mock_openai_class):
        """测试无效 JSON 响应"""
        mock_client = MagicMock()
        mock_openai_class.return_value = mock_client

        mock_response = MagicMock()
        mock_response.choices[0].message.content = SAMPLE_EVALUATION_INVALID_JSON
        mock_client.chat.completions.create.return_value = mock_response

        result = re.evaluate_with_openai("prompt", 'gpt-4', 'test-key', None, {})

        # 应该返回成功，但包含原始内容作为报告
        self.assertTrue(result['success'])
        self.assertIn('report', result['evaluation'])
        self.assertEqual(result['evaluation']['score'], 0)

    @patch('run_evaluator.OpenAI')
    def test_api_exception(self, mock_openai_class):
        """测试 API 异常"""
        mock_client = MagicMock()
        mock_openai_class.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("API Error")

        result = re.evaluate_with_openai("prompt", 'gpt-4', 'test-key', None, {})

        self.assertFalse(result['success'])
        self.assertIn('API Error', result['error'])


class TestEvaluateWithLLM(unittest.TestCase):
    """测试 LLM 评估主函数"""

    @patch('run_evaluator.evaluate_with_openai')
    def test_openai_provider(self, mock_evaluate):
        """测试 OpenAI provider"""
        mock_evaluate.return_value = {
            'success': True,
            'evaluation': {'score': 90}
        }

        model_config = {
            'provider': 'openai',
            'model_id': 'gpt-4',
            'api_key': 'test-key'
        }

        result = re.evaluate_with_llm("prompt", model_config)

        self.assertTrue(result['success'])
        mock_evaluate.assert_called_once()

    @patch('run_evaluator.evaluate_with_openai')
    def test_openrouter_provider(self, mock_evaluate):
        """测试 OpenRouter provider"""
        mock_evaluate.return_value = {'success': True, 'evaluation': {'score': 85}}

        model_config = {
            'provider': 'openrouter',
            'model_id': 'anthropic/claude-3-opus',
            'api_key': 'test-key',
            'base_url': 'https://openrouter.ai/api/v1'
        }

        result = re.evaluate_with_llm("prompt", model_config)

        self.assertTrue(result['success'])
        mock_evaluate.assert_called_once()

    def test_unsupported_provider(self):
        """测试不支持的 provider"""
        model_config = {
            'provider': 'unsupported',
            'model_id': 'model',
            'api_key': 'test-key'
        }

        result = re.evaluate_with_llm("prompt", model_config)

        self.assertFalse(result['success'])
        self.assertIn('unsupported provider', result['error'].lower())

    def test_missing_api_key_in_config(self):
        """测试配置中缺少 API Key"""
        model_config = {
            'provider': 'openai',
            'model_id': 'gpt-4'
            # 缺少 api_key
        }

        result = re.evaluate_with_llm("prompt", model_config)

        self.assertFalse(result['success'])
        self.assertIn('api key', result['error'].lower())


class TestEvaluateSingleResult(unittest.TestCase):
    """测试单个结果评估"""

    def setUp(self):
        self.conn = create_test_db()
        self.temp_db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.temp_db.close()

    def tearDown(self):
        self.conn.close()
        os.unlink(self.temp_db.name)

    @patch('run_evaluator.evaluate_with_llm')
    def test_successful_single_evaluation(self, mock_evaluate):
        """测试成功的单个结果评估"""
        # 设置测试数据
        ids = setup_test_data(self.conn)

        # 更新结果状态
        self.conn.execute(
            '''UPDATE benchmark_results
               SET status = 'completed', actual_output = 'Test output'
               WHERE id = ?''',
            (ids['result_ids'][0],)
        )
        self.conn.commit()

        # 保存到临时文件
        with sqlite3.connect(self.temp_db.name) as file_conn:
            self.conn.backup(file_conn)

        # Mock LLM 评估
        mock_evaluate.return_value = {
            'success': True,
            'evaluation': {
                'score': 85,
                'report': 'Good output',
                'key_points_met': ['point1'],
                'forbidden_points_violated': []
            }
        }

        with patch.object(re, 'DB_PATH', self.temp_db.name):
            args = {
                'result_id': ids['result_ids'][0],
                'evaluator_config': {
                    'evaluation_prompt': 'Evaluate: {{actual_output}}',
                    'variables': {}
                },
                'model_config': {
                    'provider': 'openai',
                    'model_id': 'gpt-4',
                    'api_key': 'test-key'
                }
            }

            result = re.evaluate_single_result(args)

            self.assertEqual(result['status'], 'completed')
            self.assertEqual(result['score'], 85)

    @patch('run_evaluator.evaluate_with_llm')
    def test_evaluation_with_execution_steps(self, mock_evaluate):
        """测试带执行步骤的评估"""
        ids = setup_test_data(self.conn)

        self.conn.execute(
            '''UPDATE benchmark_results
               SET status = 'completed',
                   actual_output = 'Raw output',
                   execution_steps = 'Step 1\nStep 2',
                   execution_answer = 'Final answer'
               WHERE id = ?''',
            (ids['result_ids'][0],)
        )
        self.conn.commit()

        with sqlite3.connect(self.temp_db.name) as file_conn:
            self.conn.backup(file_conn)

        mock_evaluate.return_value = {
            'success': True,
            'evaluation': {'score': 90, 'report': 'Great'}
        }

        with patch.object(re, 'DB_PATH', self.temp_db.name):
            args = {
                'result_id': ids['result_ids'][0],
                'evaluator_config': {
                    'evaluation_prompt': 'Steps: {{execution_steps}}, Answer: {{execution_answer}}',
                    'variables': {}
                },
                'model_config': {
                    'provider': 'openai',
                    'model_id': 'gpt-4',
                    'api_key': 'test-key'
                }
            }

            result = re.evaluate_single_result(args)

            self.assertEqual(result['status'], 'completed')
            # 验证模板中包含了执行步骤和答案变量

    @patch('run_evaluator.evaluate_with_llm')
    def test_evaluation_failure(self, mock_evaluate):
        """测试评估失败处理"""
        ids = setup_test_data(self.conn)

        self.conn.execute(
            '''UPDATE benchmark_results
               SET status = 'completed', actual_output = 'Test'
               WHERE id = ?''',
            (ids['result_ids'][0],)
        )
        self.conn.commit()

        with sqlite3.connect(self.temp_db.name) as file_conn:
            self.conn.backup(file_conn)

        mock_evaluate.return_value = {
            'success': False,
            'error': 'API timeout'
        }

        with patch.object(re, 'DB_PATH', self.temp_db.name):
            args = {
                'result_id': ids['result_ids'][0],
                'evaluator_config': {'evaluation_prompt': 'Test'},
                'model_config': {
                    'provider': 'openai',
                    'model_id': 'gpt-4',
                    'api_key': 'test-key'
                }
            }

            result = re.evaluate_single_result(args)

            self.assertEqual(result['status'], 'failed')
            self.assertIn('API timeout', result['error'])

    def test_result_not_found(self):
        """测试结果不存在"""
        with patch.object(re, 'DB_PATH', self.temp_db.name):
            args = {
                'result_id': 99999,
                'evaluator_config': {},
                'model_config': {}
            }

            result = re.evaluate_single_result(args)

            self.assertIn('error', result)
            self.assertIn('not found', result['error'].lower())


class TestRunEvaluation(unittest.TestCase):
    """测试完整的评估运行流程"""

    def setUp(self):
        self.conn = create_test_db()
        self.temp_db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.temp_db.close()

    def tearDown(self):
        self.conn.close()
        os.unlink(self.temp_db.name)

    @patch('run_evaluator.evaluate_single_result')
    def test_run_evaluation_no_results(self, mock_evaluate):
        """测试没有需要评估的结果"""
        ids = setup_test_data(self.conn)

        # 标记所有结果为已评估
        for result_id in ids['result_ids']:
            self.conn.execute(
                'INSERT INTO evaluations (execution_id, result_id, score) VALUES (?, ?, ?)',
                (ids['execution_id'], result_id, 80)
            )
        self.conn.commit()

        with sqlite3.connect(self.temp_db.name) as file_conn:
            self.conn.backup(file_conn)

        with patch.object(re, 'DB_PATH', self.temp_db.name):
            re.run_evaluation(ids['execution_id'])

            # 验证状态被更新为 completed
            cursor = self.conn.execute(
                'SELECT evaluation_status FROM benchmark_executions WHERE id = ?',
                (ids['execution_id'],)
            )
            status = cursor.fetchone()[0]
            self.assertEqual(status, 'completed')

    def test_run_evaluation_no_evaluator(self):
        """测试没有配置评估器的 execution"""
        # 创建没有 evaluator 的 benchmark
        from fixtures.database import insert_test_agent, insert_test_test_case, insert_test_benchmark, insert_test_execution

        agent_id = insert_test_agent(self.conn)
        tc_id = insert_test_test_case(self.conn)
        benchmark_id = insert_test_benchmark(
            self.conn, [agent_id], [tc_id], evaluator_id=None
        )
        execution_id = insert_test_execution(self.conn, benchmark_id)

        with sqlite3.connect(self.temp_db.name) as file_conn:
            self.conn.backup(file_conn)

        with patch.object(re, 'DB_PATH', self.temp_db.name):
            re.run_evaluation(execution_id)

            # 应该跳过评估，状态为 completed
            cursor = self.conn.execute(
                'SELECT evaluation_status FROM benchmark_executions WHERE id = ?',
                (execution_id,)
            )
            status = cursor.fetchone()[0]
            self.assertEqual(status, 'completed')

    def test_run_evaluation_missing_model(self):
        """测试评估器未配置模型"""
        from fixtures.database import insert_test_agent, insert_test_test_case, insert_test_benchmark, insert_test_execution, insert_test_evaluator

        agent_id = insert_test_agent(self.conn)
        tc_id = insert_test_test_case(self.conn)
        # 创建没有 model_id 的 evaluator
        evaluator_id = insert_test_evaluator(self.conn, "Test Eval", {}, model_id=None)
        benchmark_id = insert_test_benchmark(
            self.conn, [agent_id], [tc_id], evaluator_id=evaluator_id
        )
        execution_id = insert_test_execution(self.conn, benchmark_id)

        with sqlite3.connect(self.temp_db.name) as file_conn:
            self.conn.backup(file_conn)

        with patch.object(re, 'DB_PATH', self.temp_db.name):
            re.run_evaluation(execution_id)

            # 应该失败，因为没有配置模型
            cursor = self.conn.execute(
                'SELECT evaluation_status FROM benchmark_executions WHERE id = ?',
                (execution_id,)
            )
            status = cursor.fetchone()[0]
            self.assertEqual(status, 'failed')


if __name__ == '__main__':
    unittest.main()
