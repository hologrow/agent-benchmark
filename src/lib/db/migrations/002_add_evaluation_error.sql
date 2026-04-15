-- Migration: 添加 evaluation_error 字段到 benchmark_results 表
-- 用于存储单个结果评估时的错误信息

-- up
ALTER TABLE benchmark_results ADD COLUMN evaluation_error TEXT;

-- down
-- ALTER TABLE benchmark_results DROP COLUMN evaluation_error;
