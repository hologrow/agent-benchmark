-- Migration: V2 Schema - Separate benchmark config from executions
-- Creates new benchmarks + benchmark_executions tables and migrates data

-- up

-- 1. Create new benchmarks table (config only)
CREATE TABLE IF NOT EXISTS benchmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    agent_ids TEXT NOT NULL,
    test_case_ids TEXT NOT NULL,
    evaluator_id INTEGER,
    run_config TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (evaluator_id) REFERENCES evaluators(id)
);

-- 2. Create new benchmark_executions table
CREATE TABLE IF NOT EXISTS benchmark_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    benchmark_id INTEGER NOT NULL,
    name TEXT,
    status TEXT DEFAULT 'pending',
    evaluation_status TEXT,
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (benchmark_id) REFERENCES benchmarks(id) ON DELETE CASCADE
);

-- 3. Migrate data from benchmark_runs to new tables (if old table exists)
-- First migrate configs to benchmarks table
INSERT INTO benchmarks (id, name, description, agent_ids, test_case_ids, evaluator_id, run_config, created_at, updated_at)
SELECT
    id,
    name,
    description,
    agent_ids,
    test_case_ids,
    evaluator_id,
    run_config,
    created_at,
    COALESCE(completed_at, created_at) as updated_at
FROM benchmark_runs
WHERE 1=1;

-- Then migrate runs to benchmark_executions
INSERT INTO benchmark_executions (id, benchmark_id, name, status, started_at, completed_at, created_at)
SELECT
    id,
    id as benchmark_id,
    name,
    status,
    started_at,
    completed_at,
    created_at
FROM benchmark_runs
WHERE 1=1;

-- 4. Recreate benchmark_results with execution_id instead of run_id
-- Rename old table
ALTER TABLE benchmark_results RENAME TO benchmark_results_old;

-- Create new table with execution_id
CREATE TABLE benchmark_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id INTEGER NOT NULL,
    agent_id INTEGER NOT NULL,
    test_case_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    actual_output TEXT,
    output_file TEXT,
    execution_time_ms INTEGER,
    error_message TEXT,
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (execution_id) REFERENCES benchmark_executions(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id),
    FOREIGN KEY (test_case_id) REFERENCES test_cases(id)
);

-- Migrate data
INSERT INTO benchmark_results (
    id, execution_id, agent_id, test_case_id, status,
    actual_output, output_file, execution_time_ms, error_message,
    started_at, completed_at, created_at
)
SELECT
    id, run_id as execution_id, agent_id, test_case_id, status,
    actual_output, output_file, execution_time_ms, error_message,
    started_at, completed_at, created_at
FROM benchmark_results_old;

-- Drop old table
DROP TABLE IF EXISTS benchmark_results_old;

-- 5. Recreate evaluations table with execution_id
ALTER TABLE evaluations RENAME TO evaluations_old;

CREATE TABLE evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id INTEGER NOT NULL,
    result_id INTEGER NOT NULL,
    score REAL,
    report TEXT,
    key_points_met TEXT,
    forbidden_points_violated TEXT,
    evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (execution_id) REFERENCES benchmark_executions(id) ON DELETE CASCADE,
    FOREIGN KEY (result_id) REFERENCES benchmark_results(id) ON DELETE CASCADE
);

INSERT INTO evaluations (
    id, execution_id, result_id, score, report,
    key_points_met, forbidden_points_violated, evaluated_at
)
SELECT
    id, run_id as execution_id, result_id, score, report,
    key_points_met, forbidden_points_violated, evaluated_at
FROM evaluations_old;

DROP TABLE IF EXISTS evaluations_old;

-- 6. Create indexes
CREATE INDEX IF NOT EXISTS idx_benchmarks_evaluator_id ON benchmarks(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_executions_benchmark_id ON benchmark_executions(benchmark_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_results_execution_id ON benchmark_results(execution_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_results_agent_id ON benchmark_results(agent_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_results_test_case_id ON benchmark_results(test_case_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_execution_id ON evaluations(execution_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_result_id ON evaluations(result_id);

-- 7. Drop old benchmark_runs table
DROP TABLE IF EXISTS benchmark_runs;

-- down
-- Note: Down migration is complex and may lose data. Manual restore recommended.
-- This migration creates a new schema that's fundamentally different from the old one.
