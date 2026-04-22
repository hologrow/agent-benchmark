/**
 * Lark Bitable API：表/字段/记录拉取与解析（无持久化）。
 */

import { Client } from "@larksuiteoapi/node-sdk";
import type {
  LegacySyncCatalogQuery,
  LegacySyncCatalogResult,
  LegacySyncFetchResult,
  LegacySyncParsedTestCasePayload,
  LegacySyncSystemField,
} from "../../types";
import type { SyncTestCasesInput } from "./api-types";
import { getPlugin } from "../../route-utils";
import { identity, map } from "ramda";

export type {
  LegacySyncFetchResult,
  LegacySyncParsedTestCasePayload,
} from "../../types";

export const LEGACY_SYNC_SYSTEM_FIELDS: LegacySyncSystemField[] = [
  { key: "input", label: "Input", required: true },
  { key: "expected_output", label: "Expected output", required: false },
  { key: "key_points", label: "Key points", required: false },
  { key: "forbidden_points", label: "Forbidden points", required: false },
  { key: "category", label: "Category", required: false },
  { key: "how", label: "How", required: false },
];

function defaultColumnMapping(): Record<string, string> {
  return {
    input: "Input",
    expected_output: "Expected output",
    key_points: "Key points",
    forbidden_points: "Forbidden points",
    category: "Category",
    how: "How",
  };
}

function parseRecordToTestCase(
  record: Record<string, unknown>,
  columnMapping: Record<string, string>,
  index: number,
  tableId: string,
): LegacySyncParsedTestCasePayload | null {
  const fields = record.fields as Record<string, unknown> | undefined;
  if (!fields) return null;

  const getFieldValue = (systemField: string): string => {
    const tableColumn = columnMapping[systemField];
    if (!tableColumn) return "";
    const value = fields[tableColumn];
    return value != null ? String(value) : "";
  };

  const input = getFieldValue("input");
  const expected_output = getFieldValue("expected_output");
  const key_points_raw = fields[columnMapping["key_points"] || ""] || "";
  const forbidden_points_raw =
    fields[columnMapping["forbidden_points"] || ""] || "";
  const category = getFieldValue("category");

  if (!input) {
    return null;
  }

  const test_id = `TC_${tableId}_${String(index + 1).padStart(3, "0")}`;
  const name = input.slice(0, 50);
  const description = input.slice(0, 200);
  const how = getFieldValue("how");

  let key_points: string[] = [];
  if (Array.isArray(key_points_raw)) {
    key_points = key_points_raw.map(String).filter(Boolean);
  } else if (typeof key_points_raw === "string") {
    key_points = key_points_raw
      .split(/[\n,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  let forbidden_points: string[] = [];
  if (Array.isArray(forbidden_points_raw)) {
    forbidden_points = forbidden_points_raw.map(String).filter(Boolean);
  } else if (typeof forbidden_points_raw === "string") {
    forbidden_points = forbidden_points_raw
      .split(/[\n,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return {
    test_id,
    name,
    description,
    input,
    expected_output,
    key_points: JSON.stringify(key_points),
    forbidden_points: JSON.stringify(forbidden_points),
    category,
    how,
  };
}

export async function runLegacySyncCatalog(
  client: Client,
  query: LegacySyncCatalogQuery,
): Promise<LegacySyncCatalogResult> {
  const { appToken, tableId } = query;

  if (tableId) {
    const response = await client.bitable.appTableField.list({
      path: {
        app_token: appToken,
        table_id: tableId,
      },
    });

    if (response.code !== 0) {
      const isPermissionError = Boolean(
        response.code === 99991672 ||
          (typeof response.msg === "string" &&
            response.msg.toLowerCase().includes("scope")),
      );

      return {
        error: `Lark API error: ${response.msg || response.code}`,
        code: response.code,
        isPermissionError,
        permissionHint: isPermissionError
          ? "Grant the app bitable:app:readonly, bitable:app, or base:table:read in Feishu / Lark developer console."
          : undefined,
      };
    }

    const fields = (response.data?.items || []).map(
      (field: Record<string, unknown>) => ({
        fieldId: String(field.field_id ?? ""),
        fieldName: String(field.field_name ?? ""),
        type: field.type,
      }),
    );

    return { fields, systemFields: LEGACY_SYNC_SYSTEM_FIELDS };
  }

  const response = await client.bitable.appTable.list({
    path: {
      app_token: appToken,
    },
  });

  if (response.code !== 0) {
    const isPermissionError = Boolean(
      response.code === 99991672 ||
        (typeof response.msg === "string" &&
          response.msg.toLowerCase().includes("scope")),
    );

    return {
      error: `Lark API error: ${response.msg || response.code}`,
      code: response.code,
      isPermissionError,
      permissionHint: isPermissionError
        ? "Grant the app bitable:app:readonly, bitable:app, or base:table:read in Feishu / Lark developer console."
        : undefined,
    };
  }

  const tables = (response.data?.items || []).map(
    (table: Record<string, unknown>) => ({
      tableId: String(table.table_id ?? ""),
      name: String(table.name ?? ""),
    }),
  );

  return { tables };
}

export async function fetchBitableRecords(
  client: Client,
  input: SyncTestCasesInput,
): Promise<LegacySyncFetchResult> {
  const { appToken, tableId, viewId, columnMapping } = input;

  const mapping = columnMapping || defaultColumnMapping();
  const prepare = getPlugin("lark");
  const records: Record<string, unknown>[] = [];
  let hasMore = true;
  let pageToken: string | undefined;

  if (!prepare.ok) {
    throw new Error("lark plugin not load");
  }

  while (hasMore) {
    const response = await client.bitable.appTableRecord.list({
      path: {
        app_token: appToken,
        table_id: tableId,
      },
      params: {
        page_size: 500,
        page_token: pageToken,
        view_id: viewId,
      },
    });

    if (response.code !== 0) {
      return {
        success: false,
        rawRecordCount: 0,
        rows: [],
        nonFatalErrors: [],
        apiError: `Lark API error: ${response.msg || response.code}`,
      };
    }

    const items = response.data?.items || [];
    records.push(...items);

    hasMore = response.data?.has_more || false;
    pageToken = response.data?.page_token;
  }

  const nonFatalErrors: string[] = [];

  const rows = records
    .map((record, index) =>
      parseRecordToTestCase(record, mapping, index, tableId),
    )
    .filter(identity) as LegacySyncParsedTestCasePayload[];

  let suggestedTestSetName: string | undefined;
  const dateStr = new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
  }).format(new Date());
  try {
    const appInfo = await client.bitable.app.get({
      path: { app_token: appToken },
    });
    suggestedTestSetName = appInfo.data?.app?.name
      ? `${appInfo.data.app.name} - ${dateStr}`
      : `Lark sync - ${dateStr}`;
  } catch {
    suggestedTestSetName = `Lark sync - ${dateStr}`;
  }

  return {
    success: true,
    rawRecordCount: records.length,
    rows,
    suggestedTestSetName,
    nonFatalErrors,
  };
}
