-- Migration 005: Add execution_steps and execution_answer columns to benchmark_results
-- 用于存储解析后的执行步骤和执行答案

-- up

ALTER TABLE benchmark_results ADD COLUMN execution_steps TEXT;
ALTER TABLE benchmark_results ADD COLUMN execution_answer TEXT;

-- down

-- SQLite 不支持删除列，需要重建表（这里仅作记录）
-- ALTER TABLE benchmark_results DROP COLUMN execution_steps;
-- ALTER TABLE benchmark_results DROP COLUMN execution_answer;
