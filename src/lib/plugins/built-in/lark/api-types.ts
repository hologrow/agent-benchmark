/**
 * Lark / Feishu Bitable 与导入向导相关的请求/响应类型。
 * 仅从本文件或 `lark/index.ts` 的 `export type *` 引用；勿在 `types/api.ts` 中再导出。
 */

import type {
  ImportSourceRow,
  ImportTestCasesRequest,
  ImportTestCasesResponse,
} from '@/types/api';

/** Bitable 表（listImportTables）。 */
export interface LarkTable {
  id: string;
  name: string;
}

/** Bitable 字段（listImportFields）。 */
export interface LarkField {
  id: string;
  name: string;
  type: string;
}

/** @deprecated 使用 {@link ImportSourceRow} */
export type LarkBase = ImportSourceRow;

/** @deprecated 旧响应体 `bases`；请用 {@link ListImportSourcesResponse} `sources`。 */
export interface ListLarkBasesResponse {
  bases: ImportSourceRow[];
}

export interface ListLarkTablesResponse {
  tables: LarkTable[];
}

export interface ListLarkFieldsResponse {
  fields: LarkField[];
}

/** @deprecated 使用 {@link ImportTestCasesRequest} */
export type LarkImportRequest = ImportTestCasesRequest;

/** @deprecated 使用 {@link ImportTestCasesResponse} */
export type LarkImportResponse = ImportTestCasesResponse;

/** Bitable 同步到本地测试用例的请求体（拉数 / 落库）。 */
export interface SyncTestCasesInput {
  /** Bitable / 多维表 App token（Base token） */
  appToken: string;
  tableId: string;
  viewId?: string;
  syncMode?: "upsert" | "create_only" | "update_only";
  columnMapping?: Record<string, string>;
  createTestSet?: boolean;
  testSetName?: string;
  testSetDescription?: string;
}
