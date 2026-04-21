'use client';

/**
 * 浏览器：默认插件宿主（经站点 REST API 落库）。
 */

import { api } from '@/lib/api';
import type { CreateTestCaseRequest } from '@/types/api';
import type {
  LegacySyncFetchResult,
  SyncTestCasesToDatabaseInput,
  SyncTestCasesToDatabaseResult,
} from '@/lib/plugins/types';
import type { LegacySyncParsedTestCasePayload } from '@/lib/plugins/types';
import { applyExternalTableSyncWithPersistence } from './apply-external-sync';
import type { PluginHostContext, TestCasePersistencePort } from './types';

function rowToCreateRequest(
  row: LegacySyncParsedTestCasePayload,
): CreateTestCaseRequest {
  return {
    test_id: row.test_id,
    name: row.name,
    description: row.description,
    input: row.input,
    expected_output: row.expected_output,
    key_points: row.key_points,
    forbidden_points: row.forbidden_points,
    category: row.category,
    how: row.how,
  };
}

function createBrowserTestCasePersistencePort(): TestCasePersistencePort {
  return {
    async getAllTestCasesForSync() {
      const { testCases } = await api.testCases.list();
      return testCases.map((tc) => ({ id: tc.id, test_id: tc.test_id }));
    },
    async createTestCase(row) {
      const { testCase } = await api.testCases.create(rowToCreateRequest(row));
      return { id: testCase.id };
    },
    async updateTestCase(id, row) {
      await api.testCases.update(id, rowToCreateRequest(row));
    },
    async createTestSet(meta, testCaseIds) {
      const { testSet } = await api.testSets.create({
        name: meta.name,
        description: meta.description,
        source: meta.source ?? undefined,
        source_url: meta.source_url ?? undefined,
        test_case_ids: testCaseIds,
      });
      return {
        id: testSet.id,
        name: testSet.name,
        testCaseCount: testCaseIds.length,
      };
    },
  };
}

/** 默认单例端口（可按需在测试中替换为自定义 host）。 */
const browserPortSingleton = createBrowserTestCasePersistencePort();

export function createBrowserPluginHostContext(): PluginHostContext {
  return {
    externalTableSync: {
      persistAfterFetch: (
        input: SyncTestCasesToDatabaseInput,
        fetchResult: LegacySyncFetchResult,
      ): Promise<SyncTestCasesToDatabaseResult> =>
        applyExternalTableSyncWithPersistence(
          browserPortSingleton,
          input,
          fetchResult,
        ),
    },
  };
}
