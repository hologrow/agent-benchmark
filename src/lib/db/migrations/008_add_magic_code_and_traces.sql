-- Migration: Add magic code support for Langfuse trace tracking
-- up

-- Add magic_code column to benchmark_results
ALTER TABLE benchmark_results ADD COLUMN magic_code TEXT;

-- Create execution_traces table to store result_id -> trace_id mapping
CREATE TABLE IF NOT EXISTS execution_traces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id INTEGER NOT NULL UNIQUE,
    trace_id TEXT NOT NULL,
    magic_code TEXT NOT NULL,
    trace_content TEXT,
    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (result_id) REFERENCES benchmark_results(id) ON DELETE CASCADE
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_benchmark_results_magic_code ON benchmark_results(magic_code);
CREATE INDEX IF NOT EXISTS idx_execution_traces_result_id ON execution_traces(result_id);
CREATE INDEX IF NOT EXISTS idx_execution_traces_trace_id ON execution_traces(trace_id);
CREATE INDEX IF NOT EXISTS idx_execution_traces_magic_code ON execution_traces(magic_code);

-- down
-- ALTER TABLE benchmark_results DROP COLUMN magic_code;
-- DROP TABLE IF EXISTS execution_traces;
-- DROP INDEX IF EXISTS idx_benchmark_results_magic_code;
-- DROP INDEX IF EXISTS idx_execution_traces_result_id;
-- DROP INDEX IF EXISTS idx_execution_traces_trace_id;
-- DROP INDEX IF EXISTS idx_execution_traces_magic_code;
