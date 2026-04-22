/**
 * Lark 插件浏览器侧：调用 `/api/plugins/:id` 与 `/api/test-cases/sync`（Bitable），类型见 `./api-types`。
 */

import { apiRequest } from "@/lib/api-request";
import type { BitableFetchJson, SyncTestCasesToDatabaseResult } from "@/lib/plugins/types";
import type { SyncTestCasesInput } from "./api-types";
import type { PluginPayload } from "@/types/api";
import type {
  ListLarkFieldsResponse,
  ListLarkTablesResponse,
} from "./api-types";

async function postPluginImport<T>(
  pluginId: string,
  command: PluginPayload,
): Promise<T> {
  return apiRequest<T>(`/api/plugins/${encodeURIComponent(pluginId)}`, {
    method: "POST",
    body: JSON.stringify(command),
  });
}

/** `listImportTables` — 返回 Bitable 表列表。 */
export function larkListImportTables(
  pluginId: string,
  sourceId: string,
): Promise<ListLarkTablesResponse> {
  return postPluginImport(pluginId, {
    route: "listImportTables",
    payload: { sourceId },
  });
}

/** `listImportFields` — 返回字段列表。 */
export function larkListImportFields(
  pluginId: string,
  sourceId: string,
  tableId: string,
): Promise<ListLarkFieldsResponse> {
  return postPluginImport(pluginId, {
    route: "listImportFields",
    payload: { sourceId, tableId },
  });
}

/**
 * 仅拉数不落库：`POST /api/plugins/:pluginId`，body `{ route: 'bitable.fetchRecords', payload }`；
 * 响应体为顶层 JSON，与 {@link BitableFetchJson} 一致（非 `{ fetchResult: ... }` 包裹）。
 */
export function getBitTableData(
  pluginId: string,
  payload: SyncTestCasesInput,
): Promise<BitableFetchJson> {
  return apiRequest<BitableFetchJson>(
    `/api/plugins/${encodeURIComponent(pluginId)}`,
    {
      method: "POST",
      body: JSON.stringify({
        route: "bitable.fetchRecords",
        payload,
      }),
    },
  );
}

/**
 * 同步 Bitable 到测试用例：服务端拉取、解析并落库。
 * `POST /api/plugins/:pluginId`，body `{ route: 'bitable.syncToTestCases', payload }`。
 */
export function syncBitableToTestCases(
  pluginId: string,
  payload: SyncTestCasesInput,
): Promise<SyncTestCasesToDatabaseResult> {
  return apiRequest<SyncTestCasesToDatabaseResult>(
    `/api/plugins/${encodeURIComponent(pluginId)}`,
    {
      method: "POST",
      body: JSON.stringify({
        route: "bitable.syncToTestCases",
        payload,
      }),
    },
  );
}
