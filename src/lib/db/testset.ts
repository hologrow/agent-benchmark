// TestSet related operations

import { getDatabase } from '.';

export interface TestSet {
  id: number;
  name: string;
  description: string;
  source: 'lark' | 'manual' | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TestSetItem {
  id: number;
  test_set_id: number;
  test_case_id: number;
  order_index: number;
  created_at: string;
}

// Get all test sets
export function getAllTestSets(): TestSet[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM test_sets ORDER BY created_at DESC').all() as TestSet[];
}

// Get test set details (including test cases)
export function getTestSetById(id: number): (TestSet & { test_cases: any[] }) | undefined {
  const db = getDatabase();
  const testSet = db.prepare('SELECT * FROM test_sets WHERE id = ?').get(id) as TestSet | undefined;

  if (!testSet) return undefined;

  const testCases = db.prepare(`
    SELECT tc.* FROM test_cases tc
    JOIN test_set_items tsi ON tc.id = tsi.test_case_id
    WHERE tsi.test_set_id = ?
    ORDER BY tsi.order_index ASC, tc.id ASC
  `).all(id);

  return { ...testSet, test_cases: testCases };
}

// 创建测试集
export function createTestSet(
  testSet: Omit<TestSet, 'id' | 'created_at' | 'updated_at'>,
  testCaseIds: number[]
): TestSet {
  const db = getDatabase();

  const result = db.prepare(
    'INSERT INTO test_sets (name, description, source, source_url) VALUES (?, ?, ?, ?)'
  ).run(testSet.name, testSet.description, testSet.source, testSet.source_url);

  const testSetId = result.lastInsertRowid as number;

  // 添加测试用例关联
  const insertItem = db.prepare(
    'INSERT INTO test_set_items (test_set_id, test_case_id, order_index) VALUES (?, ?, ?)'
  );

  for (let i = 0; i < testCaseIds.length; i++) {
    insertItem.run(testSetId, testCaseIds[i], i);
  }

  return getTestSetById(testSetId)!;
}

// 更新测试集
export function updateTestSet(
  id: number,
  updates: Partial<Omit<TestSet, 'id' | 'created_at' | 'updated_at'>>,
  testCaseIds?: number[]
): TestSet {
  const db = getDatabase();

  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
  if (updates.description !== undefined) { sets.push('description = ?'); values.push(updates.description); }
  if (updates.source !== undefined) { sets.push('source = ?'); values.push(updates.source); }
  if (updates.source_url !== undefined) { sets.push('source_url = ?'); values.push(updates.source_url); }

  if (sets.length > 0) {
    sets.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    db.prepare(`UPDATE test_sets SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  // 更新测试用例关联
  if (testCaseIds !== undefined) {
    // 删除旧关联
    db.prepare('DELETE FROM test_set_items WHERE test_set_id = ?').run(id);

    // 添加新关联
    const insertItem = db.prepare(
      'INSERT INTO test_set_items (test_set_id, test_case_id, order_index) VALUES (?, ?, ?)'
    );

    for (let i = 0; i < testCaseIds.length; i++) {
      insertItem.run(id, testCaseIds[i], i);
    }
  }

  return getTestSetById(id)!;
}

// 删除测试集
export function deleteTestSet(id: number): void {
  const db = getDatabase();
  // 关联记录会通过外键级联删除
  db.prepare('DELETE FROM test_sets WHERE id = ?').run(id);
}

// 获取测试集的所有测试用例ID
export function getTestSetCaseIds(testSetId: number): number[] {
  const db = getDatabase();
  const items = db.prepare(
    'SELECT test_case_id FROM test_set_items WHERE test_set_id = ? ORDER BY order_index ASC'
  ).all(testSetId) as { test_case_id: number }[];

  return items.map(item => item.test_case_id);
}

// ==================== 数据迁移函数 ====================

// 将现有的 test_case_ids 迁移到 test_set_items
export function migrateTestCaseIdsToTestSets(): { migrated: number; errors: string[] } {
  const db = getDatabase();
  const errors: string[] = [];
  let migrated = 0;

  try {
    // 查找所有有 test_case_ids 但没有 test_set_id 的 benchmark
    const benchmarks = db.prepare(
      "SELECT id, name, test_case_ids FROM benchmarks WHERE test_case_ids IS NOT NULL AND test_case_ids != '[]' AND test_set_id IS NULL"
    ).all() as { id: number; name: string; test_case_ids: string }[];

    for (const benchmark of benchmarks) {
      try {
        const testCaseIds = JSON.parse(benchmark.test_case_ids) as number[];

        if (testCaseIds.length === 0) continue;

        // 创建测试集
        const testSetResult = db.prepare(
          'INSERT INTO test_sets (name, description, source) VALUES (?, ?, ?)'
        ).run(`${benchmark.name} - 默认测试集`, '自动迁移的测试集', 'manual');

        const testSetId = testSetResult.lastInsertRowid as number;

        // 添加测试用例关联
        const insertItem = db.prepare(
          'INSERT INTO test_set_items (test_set_id, test_case_id, order_index) VALUES (?, ?, ?)'
        );

        for (let i = 0; i < testCaseIds.length; i++) {
          insertItem.run(testSetId, testCaseIds[i], i);
        }

        // 更新 benchmark
        db.prepare('UPDATE benchmarks SET test_set_id = ? WHERE id = ?').run(testSetId, benchmark.id);

        migrated++;
      } catch (e) {
        errors.push(`Benchmark ${benchmark.id}: ${e}`);
      }
    }
  } catch (e) {
    errors.push(`Migration failed: ${e}`);
  }

  return { migrated, errors };
}
