import { NextRequest, NextResponse } from "next/server";
import { Client, Domain } from "@larksuiteoapi/node-sdk";
import { createTestCase, updateTestCase, getAllTestCases } from "@/lib/db";

// 初始化 Lark 客户端
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

// 系统字段定义（可从多维表格映射的字段）
const SYSTEM_FIELDS = [
  { key: "input", label: "输入", required: true },
  { key: "expected_output", label: "期望输出", required: false },
  { key: "key_points", label: "关键点", required: false },
  { key: "forbidden_points", label: "禁止点", required: false },
  { key: "category", label: "分类", required: false },
  { key: "how", label: "如何实现", required: false },
];

// 解析多维表格记录为测试用例（支持列映射）
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

  // input 为必填字段
  if (!input) {
    return null;
  }

  // 自动生成 test_id（格式：TC_001）
  const test_id = `TC_${String(index + 1).padStart(3, "0")}`;
  // 使用 input 的前 50 个字符作为 name
  const name = input.slice(0, 50);
  // 使用 input 的前 200 个字符作为 description
  const description = input.slice(0, 200);
  // 获取 how 字段（如何实现）
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
    } = body;

    if (!appToken || !tableId) {
      return NextResponse.json(
        { error: "appToken and tableId are required" },
        { status: 400 },
      );
    }

    const mapping = columnMapping || {
      input: "输入",
      expected_output: "期望输出",
      key_points: "关键点",
      forbidden_points: "禁止点",
      category: "分类",
      how: "如何实现",
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
        } else if (!existing && syncMode !== "update_only") {
          createTestCase(testCase);
          created++;
        } else {
          skipped++;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Record ${record.record_id}: ${errorMsg}`);
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
              ? "请在飞书开放平台为应用申请以下权限：bitable:app:readonly 或 bitable:app 或 base:table:read"
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
            ? "请在飞书开放平台为应用申请以下权限：bitable:app:readonly 或 bitable:app 或 base:table:read"
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
