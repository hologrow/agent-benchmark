-- 添加诊断结果表

CREATE TABLE IF NOT EXISTS diagnosis_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id INTEGER NOT NULL UNIQUE,
    diagnosis_report TEXT NOT NULL,
    model_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (result_id) REFERENCES benchmark_results(id) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE SET NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_diagnosis_result_id ON diagnosis_results(result_id);
