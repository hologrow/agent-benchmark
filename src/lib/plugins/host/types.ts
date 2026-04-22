/**
 * 插件宿主上下文（应用顶层注入）——所有插件从宿主拿到的能力都从这里扩展，
 * 避免按能力拆散多个顶层入口文件。
 */

import type {
  LegacySyncFetchResult,
  LegacySyncParsedTestCasePayload,
  SyncTestCasesToDatabaseInput,
  SyncTestCasesToDatabaseResult,
} from "@/lib/plugins/types";

/** 外部表同步落库所需的低层端口（由宿主在 server/browser 分别实现）。 */
export interface TestCasePersistencePort {
  getAllTestCasesForSync: () => Promise<Array<{ id: number; test_id: string }>>;
  createTestCase: (
    row: LegacySyncParsedTestCasePayload,
  ) => Promise<{ id: number }>;
  updateTestCase: (
    id: number,
    row: LegacySyncParsedTestCasePayload,
  ) => Promise<void>;
  createTestSet: (
    meta: {
      name: string;
      description: string;
      source: string;
      source_url: string | null;
    },
    testCaseIds: number[],
  ) => Promise<{ id: number; name: string; testCaseCount: number }>;
}

/**
 * 应用注入给插件运行时的统一入口。
 * 新能力在此增加命名空间即可（例如 future: `notifications`）。
 */
export interface PluginHostContext {
  externalTableSync: {
    persistAfterFetch(
      input: SyncTestCasesToDatabaseInput,
      fetchResult: LegacySyncFetchResult,
    ): Promise<SyncTestCasesToDatabaseResult>;
  };
}
