-- Migration: Add PID column to benchmark_executions table
-- 用于跟踪执行进程ID，便于检测进程是否正常运行

ALTER TABLE benchmark_executions ADD COLUMN pid INTEGER;
