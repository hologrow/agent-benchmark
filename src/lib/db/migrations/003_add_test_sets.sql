-- Migration: 添加测试集功能
-- 新增 test_sets 和 test_set_items 表，修改 benchmarks 表

-- up

-- 1. 创建测试集表
CREATE TABLE IF NOT EXISTS test_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,                          -- 测试集名称
    description TEXT,                            -- 测试集描述
    source TEXT,                                 -- 来源：lark | manual
    source_url TEXT,                             -- Lark 文档 URL
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 创建测试集与测试用例的关联表
CREATE TABLE IF NOT EXISTS test_set_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_set_id INTEGER NOT NULL,
    test_case_id INTEGER NOT NULL,
    order_index INTEGER DEFAULT 0,               -- 用例在测试集中的顺序
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (test_set_id) REFERENCES test_sets(id) ON DELETE CASCADE,
    FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
    UNIQUE(test_set_id, test_case_id)            -- 防止重复关联
);

-- 3. 修改 benchmarks 表，添加 test_set_id 字段
-- 先添加新字段
ALTER TABLE benchmarks ADD COLUMN test_set_id INTEGER;

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS idx_test_sets_source ON test_sets(source);
CREATE INDEX IF NOT EXISTS idx_test_set_items_test_set_id ON test_set_items(test_set_id);
CREATE INDEX IF NOT EXISTS idx_test_set_items_test_case_id ON test_set_items(test_case_id);
CREATE INDEX IF NOT EXISTS idx_benchmarks_test_set_id ON benchmarks(test_set_id);

-- 5. 数据迁移：将现有的 test_case_ids 转换为 test_set
-- 为每个有 test_case_ids 的 benchmark 创建一个默认测试集
INSERT INTO test_sets (name, description, source)
SELECT
    b.name || ' - 默认测试集' as name,
    '自动迁移的测试集' as description,
    'manual' as source
FROM benchmarks b
WHERE b.test_case_ids IS NOT NULL AND b.test_case_ids != '[]';

-- 6. 关联测试用例到测试集
-- 注意：这需要应用层在启动时执行额外的迁移逻辑
-- 因为 SQLite 的 JSON 解析能力有限

-- down
-- DROP TABLE IF EXISTS test_set_items;
-- DROP TABLE IF EXISTS test_sets;
-- ALTER TABLE benchmarks DROP COLUMN test_set_id;

-- 数据迁移说明：
-- 需要在应用启动时执行 migrateTestCaseIdsToTestSets() 函数
-- 该函数会将现有的 test_case_ids JSON 数组转换为 test_set_items 记录
