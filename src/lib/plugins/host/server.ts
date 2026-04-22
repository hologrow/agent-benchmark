import "server-only";
/**
 * 服务端：默认插件bridge
 */

import { createTestCase, getAllTestCases, updateTestCase } from "@/lib/db";
import { createTestSet } from "@/lib/db/testset";
import { applyExternalTableSyncWithPersistence } from "./apply-external-sync";
import type { PluginHostContext, HostBridge } from "./types";

function createServerBridge(): HostBridge {
  return {
    async getAllTestCasesForSync() {
      return getAllTestCases().map((tc) => ({
        id: tc.id,
        test_id: tc.test_id,
      }));
    },
    async createTestCase(row) {
      const tc = createTestCase(row);
      return { id: tc.id };
    },
    async updateTestCase(id, row) {
      updateTestCase(id, row);
    },
    async createTestSet(meta, testCaseIds) {
      const ts = createTestSet(meta, testCaseIds);
      return {
        id: ts.id,
        name: ts.name,
        testCaseCount: testCaseIds.length,
      };
    },
  };
}

const serverBridge = createServerBridge();

export function createServerPluginHostContext(): PluginHostContext {
  return {
    bridge: serverBridge,
    externalTableSync: {
      persistAfterFetch: (input, fetchResult) =>
        applyExternalTableSyncWithPersistence(serverBridge, input, fetchResult),
    },
  };
}
