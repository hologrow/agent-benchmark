/**
 * Lark 插件：在 `/api/plugins/lark` 上注册的自定义路由（仍走服务端 Lark SDK）。
 */

import { NextResponse } from "next/server";
import { getPlugin } from "@/lib/plugins/route-utils";
import { registerPluginHttpHandler } from "@/lib/plugins/plugin-http-routes";
import type { SyncTestCasesToDatabaseInput } from "@/lib/plugins/types";
import { LarkPlugin } from "@/lib/plugins/built-in/lark";
import { fetchLegacyBitableRecordsForSync } from "@/lib/plugins/built-in/lark/bitable";

/** POST body：`{ route: 'bitable.fetchRecords', payload: SyncTestCasesToDatabaseInput }` */
export const LARK_ROUTE_BITABLE_FETCH_RECORDS = "bitable.fetchRecords";

function parseSyncInput(payload: unknown): SyncTestCasesToDatabaseInput | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const p = payload as Record<string, unknown>;
  const tableId =
    typeof p.tableId === "string" ? p.tableId : String(p.tableId ?? "");

  return {
    tableId,
    viewId: p.viewId != null ? String(p.viewId) : undefined,
    syncMode: p.syncMode as SyncTestCasesToDatabaseInput["syncMode"],
    columnMapping:
      p.columnMapping && typeof p.columnMapping === "object"
        ? (p.columnMapping as Record<string, string>)
        : undefined,
    createTestSet:
      typeof p.createTestSet === "boolean" ? p.createTestSet : undefined,
    testSetName: p.testSetName != null ? String(p.testSetName) : undefined,
    testSetDescription:
      p.testSetDescription != null ? String(p.testSetDescription) : undefined,
  };
}

registerPluginHttpHandler("lark", async (ctx) => {
  if (ctx.method !== "POST" || ctx.jsonBody === null) {
    return null;
  }
  const body = ctx.jsonBody as { route?: string; payload?: unknown };
  if (body.route !== LARK_ROUTE_BITABLE_FETCH_RECORDS) {
    return null;
  }

  const prepared = getPlugin("lark");
  if (!prepared.ok) {
    return prepared.response;
  }
  if (!(prepared.plugin instanceof LarkPlugin)) {
    return NextResponse.json(
      { error: "Bitable fetch is only supported for the Lark plugin" },
      { status: 501 },
    );
  }

  const input = parseSyncInput(body.payload);
  if (!input) {
    return NextResponse.json(
      { error: "payload.appToken and payload.tableId are required" },
      { status: 400 },
    );
  }

  try {
    const client = prepared.plugin.createBitableSyncClient();
    const fetchResult = await fetchLegacyBitableRecordsForSync(client, input);
    return NextResponse.json({ fetchResult });
  } catch (error) {
    console.error("[lark plugin-http] bitable.fetchRecords", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch records",
      },
      { status: 500 },
    );
  }
});
