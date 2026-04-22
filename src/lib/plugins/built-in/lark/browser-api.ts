/**
 * Lark 插件浏览器侧：调用 `/api/plugins/:id` 与 `/api/test-cases/sync`（Bitable），类型见 `./api-types`。
 */

import { apiRequest } from '@/lib/api-request';
import type {
  LegacySyncFetchResult,
  SyncTestCasesToDatabaseInput,
  SyncTestCasesToDatabaseResult,
} from '@/lib/plugins/types';
import type { PluginImportCommand } from '@/types/api';
import type { ListLarkFieldsResponse, ListLarkTablesResponse } from './api-types';

async function postPluginImport<T>(
  pluginId: string,
  command: PluginImportCommand,
): Promise<T> {
  return apiRequest<T>(`/api/plugins/${encodeURIComponent(pluginId)}`, {
    method: 'POST',
    body: JSON.stringify(command),
  });
}

/** `listImportTables` — 返回 Bitable 表列表。 */
export function larkListImportTables(
  pluginId: string,
  sourceId: string,
): Promise<ListLarkTablesResponse> {
  return postPluginImport(pluginId, {
    action: 'listImportTables',
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
    action: 'listImportFields',
    payload: { sourceId, tableId },
  });
}

/** POST `/api/test-cases/sync`：拉取并落库（Bitable 向导「导入」）。 */
export function larkLegacySyncToDatabase(
  pluginId: string,
  payload: SyncTestCasesToDatabaseInput,
): Promise<SyncTestCasesToDatabaseResult> {
  return apiRequest<SyncTestCasesToDatabaseResult>('/api/test-cases/sync', {
    method: 'POST',
    body: JSON.stringify({ ...payload, pluginId }),
  });
}

/** POST `/api/test-cases/sync` + `persist: false`，仅拉数不落库。 */
export function larkLegacySyncFetchOnly(
  pluginId: string,
  payload: SyncTestCasesToDatabaseInput,
): Promise<{ fetchResult: LegacySyncFetchResult }> {
  return apiRequest<{ fetchResult: LegacySyncFetchResult }>(
    '/api/test-cases/sync',
    {
      method: 'POST',
      body: JSON.stringify({ ...payload, pluginId, persist: false }),
    },
  );
}
