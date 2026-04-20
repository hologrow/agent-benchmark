"""
测试数据库工具
提供内存数据库创建和测试数据插入功能
"""

import sqlite3
import json
from datetime import datetime
from typing import Optional


def create_test_db() -> sqlite3.Connection:
    """创建内存测试数据库并初始化表结构"""
    conn = sqlite3.connect(':memory:')
    conn.row_factory = sqlite3.Row

    # 启用外键约束
    conn.execute("PRAGMA foreign_keys = ON")

    # 创建 agents 表
    conn.execute('''
        CREATE TABLE agents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            command TEXT NOT NULL,
            description TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 创建 test_cases 表
    conn.execute('''
        CREATE TABLE test_cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            test_id TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            input TEXT NOT NULL,
            expected_output TEXT,
            key_points TEXT DEFAULT '[]',
            forbidden_points TEXT DEFAULT '[]',
            how TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 创建 benchmarks 表
    conn.execute('''
        CREATE TABLE benchmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            agent_ids TEXT NOT NULL,
            test_case_ids TEXT NOT NULL,
            test_set_id INTEGER,
            evaluator_id INTEGER,
            run_config TEXT DEFAULT '{}',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 创建 benchmark_executions 表
    conn.execute('''
        CREATE TABLE benchmark_executions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            benchmark_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            evaluation_status TEXT DEFAULT 'pending',
            started_at TEXT,
            completed_at TEXT,
            pid INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 创建 benchmark_results 表
    conn.execute('''
        CREATE TABLE benchmark_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            execution_id INTEGER NOT NULL,
            agent_id INTEGER NOT NULL,
            test_case_id INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            actual_output TEXT,
            execution_steps TEXT,
            execution_answer TEXT,
            output_file TEXT,
            execution_time_ms INTEGER,
            error_message TEXT,
            evaluation_error TEXT,
            started_at TEXT,
            completed_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (execution_id) REFERENCES benchmark_executions(id),
            FOREIGN KEY (agent_id) REFERENCES agents(id),
            FOREIGN KEY (test_case_id) REFERENCES test_cases(id)
        )
    ''')

    # 创建 evaluations 表
    conn.execute('''
        CREATE TABLE evaluations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            execution_id INTEGER NOT NULL,
            result_id INTEGER NOT NULL,
            score INTEGER,
            report TEXT,
            key_points_met TEXT DEFAULT '[]',
            forbidden_points_violated TEXT DEFAULT '[]',
            evaluated_at TEXT,
            FOREIGN KEY (execution_id) REFERENCES benchmark_executions(id),
            FOREIGN KEY (result_id) REFERENCES benchmark_results(id)
        )
    ''')

    # 创建 evaluators 表
    conn.execute('''
        CREATE TABLE evaluators (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            config TEXT DEFAULT '{}',
            model_id INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 创建 models 表
    conn.execute('''
        CREATE TABLE models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            model_id TEXT NOT NULL,
            provider TEXT DEFAULT 'openai',
            api_key TEXT,
            base_url TEXT,
            config TEXT DEFAULT '{}',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 创建 test_sets 表
    conn.execute('''
        CREATE TABLE test_sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            test_case_ids TEXT DEFAULT '[]',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.commit()
    return conn


def insert_test_agent(conn: sqlite3.Connection, name: str = "test_agent",
                      command: str = "echo '{{prompt}}'") -> int:
    """插入测试 Agent"""
    cursor = conn.execute(
        'INSERT INTO agents (name, command, description) VALUES (?, ?, ?)',
        (name, command, 'Test agent description')
    )
    conn.commit()
    return cursor.lastrowid


def insert_test_test_case(conn: sqlite3.Connection, test_id: str = "TC_001",
                          name: str = "Test Case 1") -> int:
    """插入测试用例"""
    cursor = conn.execute(
        '''INSERT INTO test_cases (test_id, name, input, expected_output, key_points, forbidden_points)
           VALUES (?, ?, ?, ?, ?, ?)''',
        (test_id, name, 'Test input', 'Expected output',
         json.dumps(['key point 1', 'key point 2']),
         json.dumps(['forbidden 1']))
    )
    conn.commit()
    return cursor.lastrowid


def insert_test_benchmark(conn: sqlite3.Connection, agent_ids: list,
                          test_case_ids: list, evaluator_id: Optional[int] = None,
                          run_config: Optional[dict] = None) -> int:
    """插入测试 Benchmark"""
    cursor = conn.execute(
        '''INSERT INTO benchmarks (name, description, agent_ids, test_case_ids, evaluator_id, run_config)
           VALUES (?, ?, ?, ?, ?, ?)''',
        ('Test Benchmark', 'Test description',
         json.dumps(agent_ids), json.dumps(test_case_ids),
         evaluator_id, json.dumps(run_config or {}))
    )
    conn.commit()
    return cursor.lastrowid


def insert_test_execution(conn: sqlite3.Connection, benchmark_id: int,
                          status: str = 'pending') -> int:
    """插入测试 Execution"""
    cursor = conn.execute(
        '''INSERT INTO benchmark_executions (benchmark_id, name, status)
           VALUES (?, ?, ?)''',
        (benchmark_id, 'Test Execution', status)
    )
    conn.commit()
    return cursor.lastrowid


def insert_test_result(conn: sqlite3.Connection, execution_id: int,
                       agent_id: int, test_case_id: int,
                       status: str = 'pending') -> int:
    """插入测试结果"""
    cursor = conn.execute(
        '''INSERT INTO benchmark_results (execution_id, agent_id, test_case_id, status)
           VALUES (?, ?, ?, ?)''',
        (execution_id, agent_id, test_case_id, status)
    )
    conn.commit()
    return cursor.lastrowid


def insert_test_evaluator(conn: sqlite3.Connection, name: str = "Test Evaluator",
                          config: Optional[dict] = None,
                          model_id: Optional[int] = None) -> int:
    """插入测试评估器"""
    cursor = conn.execute(
        '''INSERT INTO evaluators (name, description, config, model_id)
           VALUES (?, ?, ?, ?)''',
        (name, 'Test evaluator description',
         json.dumps(config or {}), model_id)
    )
    conn.commit()
    return cursor.lastrowid


def insert_test_model(conn: sqlite3.Connection, name: str = "Test Model",
                      model_id: str = "gpt-4",
                      provider: str = "openai",
                      api_key: str = "test-api-key") -> int:
    """插入测试模型"""
    cursor = conn.execute(
        '''INSERT INTO models (name, model_id, provider, api_key, config)
           VALUES (?, ?, ?, ?, ?)''',
        (name, model_id, provider, api_key, json.dumps({}))
    )
    conn.commit()
    return cursor.lastrowid


def setup_test_data(conn: sqlite3.Connection) -> dict:
    """设置完整的测试数据集，返回所有 ID"""
    # 创建 Agent
    agent_id = insert_test_agent(conn, "hermes", "echo '{{prompt}}'")

    # 创建测试用例
    tc1_id = insert_test_test_case(conn, "TC_001", "Fibonacci Test")
    tc2_id = insert_test_test_case(conn, "TC_002", "Decorator Test")

    # 创建模型
    model_id = insert_test_model(conn, "GPT-4", "gpt-4", "openai", "sk-test-key")

    # 创建评估器
    evaluator_id = insert_test_evaluator(conn, "LLM Evaluator",
                                          {"max_workers": 1}, model_id)

    # 创建 Benchmark
    benchmark_id = insert_test_benchmark(
        conn, [agent_id], [tc1_id, tc2_id], evaluator_id,
        {"prompt_template": "{{input}}", "max_workers": 1}
    )

    # 创建 Execution
    execution_id = insert_test_execution(conn, benchmark_id, 'pending')

    # 创建 Results
    result1_id = insert_test_result(conn, execution_id, agent_id, tc1_id, 'completed')
    result2_id = insert_test_result(conn, execution_id, agent_id, tc2_id, 'completed')

    return {
        'agent_id': agent_id,
        'test_case_ids': [tc1_id, tc2_id],
        'model_id': model_id,
        'evaluator_id': evaluator_id,
        'benchmark_id': benchmark_id,
        'execution_id': execution_id,
        'result_ids': [result1_id, result2_id]
    }
