/**
 * Lark 插件浏览器侧：调用 `/api/plugins/:id` 与 `/api/test-cases/sync`（Bitable），类型见 `./api-types`。
 */

import { apiRequest } from "@/lib/api-request";
import type {
  LegacySyncFetchResult,
  SyncTestCasesToDatabaseInput,
  SyncTestCasesToDatabaseResult,
} from "@/lib/plugins/types";
import type { PluginImportCommand } from "@/types/api";
import type {
  ListLarkFieldsResponse,
  ListLarkTablesResponse,
} from "./api-types";

async function postPluginImport<T>(
  pluginId: string,
  command: PluginImportCommand,
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
    action: "listImportTables",
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
    action: "listImportFields",
    payload: { sourceId, tableId },
  });
}

/**
 * 仅拉数不落库：走 `POST /api/plugins/:pluginId` 插件路由 `bitable.fetchRecords`（服务端 Lark SDK）。
 */
export function getBitTableData(
  pluginId: string,
  payload: SyncTestCasesToDatabaseInput,
): Promise<{ fetchResult: LegacySyncFetchResult }> {
  return apiRequest<{ fetchResult: LegacySyncFetchResult }>(
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
