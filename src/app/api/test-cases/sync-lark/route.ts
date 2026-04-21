import { NextRequest, NextResponse } from "next/server";
import { Client, Domain } from "@larksuiteoapi/node-sdk";
import { createTestCase, updateTestCase, getAllTestCases, createTestSet } from "@/lib/db";

// Env-based Lark / Feishu client (legacy sync path)
function getLarkClient() {
  const appId = process.env.LARK_APP_ID || process.env.FEISHU_APP_ID;
  const appSecret =
    process.env.LARK_APP_SECRET || process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      "LARK_APP_ID and LARK_APP_SECRET (or FEISHU_APP_ID and FEISHU_APP_SECRET) must be set in environment variables",
    );
  }

  const domain =
    process.env.LARK_APP_TYPE === "lark" ? Domain.Lark : Domain.Feishu;

  return new Client({
    appId,
    appSecret,
    domain,
  });
}

const SYSTEM_FIELDS = [
  { key: "input", label: "Input", required: true },
  { key: "expected_output", label: "Expected output", required: false },
  { key: "key_points", label: "Key points", required: false },
  { key: "forbidden_points", label: "Forbidden points", required: false },
  { key: "category", label: "Category", required: false },
  { key: "how", label: "How", required: false },
];

/** Map Bitable row to test case using columnMapping (system field -> column name). */
function parseRecordToTestCase(
  record: Record<string, unknown>,
  columnMapping: Record<string, string>,
  index: number,
): {
  test_id: string;
  name: string;
  description: string;
  input: string;
  expected_output: string;
  key_points: string;
  forbidden_points: string;
  category: string;
  how: string;
} | null {
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

  const test_id = `TC_${String(index + 1).padStart(3, "0")}`;
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      appToken,
      tableId,
      viewId,
      syncMode = "upsert",
      columnMapping,
      createTestSet: shouldCreateTestSet = true,
      testSetName,
      testSetDescription,
    } = body;

    if (!appToken || !tableId) {
      return NextResponse.json(
        { error: "appToken and tableId are required" },
        { status: 400 },
      );
    }

    const mapping = columnMapping || {
      input: "Input",
      expected_output: "Expected output",
      key_points: "Key points",
      forbidden_points: "Forbidden points",
      category: "Category",
      how: "How",
    };

    const client = getLarkClient();

    const records: Record<string, unknown>[] = [];
    let hasMore = true;
    let pageToken: string | undefined;

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
        return NextResponse.json(
          { error: `Lark API error: ${response.msg || response.code}` },
          { status: 400 },
        );
      }

      const items = response.data?.items || [];
      records.push(...items);

      hasMore = response.data?.has_more || false;
      pageToken = response.data?.page_token;
    }

    const existingTestCases = getAllTestCases();
    const existingTestIdMap = new Map(
      existingTestCases.map((tc) => [tc.test_id, tc]),
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const createdTestCaseIds: number[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      try {
        const testCase = parseRecordToTestCase(record, mapping, i);
        if (!testCase) {
          skipped++;
          continue;
        }

        const existing = existingTestIdMap.get(testCase.test_id);

        if (existing && syncMode !== "create_only") {
          updateTestCase(existing.id, testCase);
          updated++;
          createdTestCaseIds.push(existing.id);
        } else if (!existing && syncMode !== "update_only") {
          const newTestCase = createTestCase(testCase);
          created++;
          createdTestCaseIds.push(newTestCase.id);
        } else if (existing) {
          createdTestCaseIds.push(existing.id);
          skipped++;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Record ${record.record_id}: ${errorMsg}`);
      }
    }

    let testSet = null;
    if (shouldCreateTestSet && createdTestCaseIds.length > 0) {
      try {
        let defaultTestSetName = testSetName;
        const dateStr = new Date().toLocaleDateString('en-US');
        if (!defaultTestSetName) {
          try {
            const appInfo = await client.bitable.app.get({
              path: { app_token: appToken },
            });
            defaultTestSetName = appInfo.data?.app?.name
              ? `${appInfo.data.app.name} - ${dateStr}`
              : `Lark sync - ${dateStr}`;
          } catch {
            defaultTestSetName = `Lark sync - ${dateStr}`;
          }
        }

        testSet = createTestSet(
          {
            name: defaultTestSetName,
            description: testSetDescription || `Synced from Lark Bitable — ${createdTestCaseIds.length} test case(s)`,
            source: 'lark',
            source_url: `https://base.larkoffice.com/app/${appToken}/table/${tableId}`,
          },
          createdTestCaseIds
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to create test set: ${errorMsg}`);
      }
    }

    return NextResponse.json({
      success: true,
      stats: {
        total: records.length,
        created,
        updated,
        skipped,
        errors: errors.length,
      },
      testSet: testSet ? {
        id: testSet.id,
        name: testSet.name,
        testCaseCount: createdTestCaseIds.length,
      } : null,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    console.error("Error syncing from Lark:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to sync from Lark";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const appToken = searchParams.get("appToken");
    const tableId = searchParams.get("tableId");

    if (!appToken) {
      return NextResponse.json(
        { error: "appToken is required" },
        { status: 400 },
      );
    }

    const client = getLarkClient();

    if (tableId) {
      const response = await client.bitable.appTableField.list({
        path: {
          app_token: appToken,
          table_id: tableId,
        },
      });

      if (response.code !== 0) {
        const isPermissionError =
          response.code === 99991672 ||
          (response.msg && response.msg.toLowerCase().includes("scope"));

        return NextResponse.json(
          {
            error: `Lark API error: ${response.msg || response.code}`,
            code: response.code,
            isPermissionError,
            permissionHint: isPermissionError
              ? "Grant the app bitable:app:readonly, bitable:app, or base:table:read in Feishu / Lark developer console."
              : undefined,
          },
          { status: 400 },
        );
      }

      const fields = (response.data?.items || []).map(
        (field: Record<string, unknown>) => ({
          fieldId: field.field_id,
          fieldName: field.field_name,
          type: field.type,
        }),
      );

      return NextResponse.json({ fields, systemFields: SYSTEM_FIELDS });
    }

    const response = await client.bitable.appTable.list({
      path: {
        app_token: appToken,
      },
    });

    if (response.code !== 0) {
      const isPermissionError =
        response.code === 99991672 ||
        (response.msg && response.msg.toLowerCase().includes("scope"));

      return NextResponse.json(
        {
          error: `Lark API error: ${response.msg || response.code}`,
          code: response.code,
          isPermissionError,
          permissionHint: isPermissionError
            ? "Grant the app bitable:app:readonly, bitable:app, or base:table:read in Feishu / Lark developer console."
            : undefined,
        },
        { status: 400 },
      );
    }

    const tables = (response.data?.items || []).map(
      (table: Record<string, unknown>) => ({
        tableId: table.table_id,
        name: table.name,
      }),
    );

    return NextResponse.json({ tables });
  } catch (error: any) {
    const errorData = error.response?.data as {
      code: string | number;
      error: unknown;
    };
    console.error("Error fetching Lark tables:", errorData);
    let errorMessage =
      error instanceof Error ? error.message : "Failed to fetch tables";
    let isPermissionError = false;
    let permissionHint: string | undefined;

    if (
      String(errorData?.code) === "99991672" ||
      errorMessage.includes("99991672") ||
      errorMessage.toLowerCase().includes("scope") ||
      errorMessage.toLowerCase().includes("permission")
    ) {
      isPermissionError = true;
      permissionHint = JSON.stringify(errorData?.error);
    }

    return NextResponse.json(
      {
        error: errorMessage,
        isPermissionError,
        permissionHint,
      },
      { status: 500 },
    );
  }
}
