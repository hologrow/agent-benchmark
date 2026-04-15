-- Benchmark Runner 数据库 Schema V2
-- 分离 benchmark 配置和执行记录

-- Agents 表：存储 Agent 配置
CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    command TEXT NOT NULL, -- 执行命令行，支持变量如 {{prompt}}
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Test Cases 表：存储测试用例
CREATE TABLE IF NOT EXISTS test_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id TEXT NOT NULL UNIQUE, -- 自动生成，如 TC_001
    name TEXT NOT NULL, -- 自动生成，取自 input 前 50 字符
    description TEXT, -- 自动生成，取自 input 前 200 字符
    input TEXT NOT NULL, -- 用户输入/问题
    expected_output TEXT, -- 期望输出
    key_points TEXT, -- JSON 数组，关键测试点
    forbidden_points TEXT, -- JSON 数组，关键禁止点
    category TEXT, -- 分类
    how TEXT, -- 如何实现（方法/步骤）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Evaluators 表：存储评估器配置
CREATE TABLE IF NOT EXISTS evaluators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    script_path TEXT NOT NULL, -- Python 脚本路径
    config TEXT NOT NULL, -- JSON 格式，包含变量引用配置
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Benchmarks 表：存储 benchmark 配置（测试计划）
CREATE TABLE IF NOT EXISTS benchmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    agent_ids TEXT NOT NULL, -- JSON 数组，参与的 agent ids
    test_case_ids TEXT NOT NULL, -- JSON 数组，测试的 case ids
    evaluator_id INTEGER,
    run_config TEXT, -- JSON 格式，运行配置（变量注入等）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (evaluator_id) REFERENCES evaluators(id)
);

-- Benchmark Executions 表：存储每次执行的记录（批次）
CREATE TABLE IF NOT EXISTS benchmark_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    benchmark_id INTEGER NOT NULL,
    name TEXT, -- 执行批次名称，如 "第1次执行"
    status TEXT DEFAULT 'pending', -- pending, running, completed, failed
    evaluation_status TEXT, -- pending, running, completed, failed
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (benchmark_id) REFERENCES benchmarks(id) ON DELETE CASCADE
);

-- Benchmark Results 表：存储每个测试用例的执行结果
CREATE TABLE IF NOT EXISTS benchmark_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id INTEGER NOT NULL, -- 关联到 benchmark_executions
    agent_id INTEGER NOT NULL,
    test_case_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, running, completed, failed, timeout
    actual_output TEXT, -- Agent 实际输出
    output_file TEXT, -- 输出文件路径
    execution_time_ms INTEGER,
    error_message TEXT, -- Agent 执行错误信息
    evaluation_error TEXT, -- 评估过程错误信息
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (execution_id) REFERENCES benchmark_executions(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id),
    FOREIGN KEY (test_case_id) REFERENCES test_cases(id)
);

-- Evaluations 表：存储评估结果
CREATE TABLE IF NOT EXISTS evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id INTEGER NOT NULL, -- 关联到 benchmark_executions
    result_id INTEGER NOT NULL, -- 关联到 benchmark_results
    score REAL, -- 0-100 分
    report TEXT, -- 评估报告（Markdown 格式）
    key_points_met TEXT, -- JSON 数组，满足的关键点
    forbidden_points_violated TEXT, -- JSON 数组，违反的禁止点
    evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (execution_id) REFERENCES benchmark_executions(id) ON DELETE CASCADE,
    FOREIGN KEY (result_id) REFERENCES benchmark_results(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_benchmarks_evaluator_id ON benchmarks(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_executions_benchmark_id ON benchmark_executions(benchmark_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_results_execution_id ON benchmark_results(execution_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_results_agent_id ON benchmark_results(agent_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_results_test_case_id ON benchmark_results(test_case_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_execution_id ON evaluations(execution_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_result_id ON evaluations(result_id);
