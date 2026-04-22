/**
 * Lark 插件：在 `/api/plugins/lark` 上注册的自定义路由（仍走服务端 Lark SDK）。
 */

import { getPlugin } from "@/lib/plugins/route-utils";
import { NextResponse } from "next/server";

import { LarkPlugin } from "@/lib/plugins/built-in/lark";
import { fetchBitableRecords } from "@/lib/plugins/built-in/lark/bitable";
import type { SyncTestCasesInput } from "./api-types";

import { PluginHttpContext } from "../../registerRoutes";

/** POST body：`{ route: 'bitable.fetchRecords', payload: SyncTestCasesToDatabaseInput }` */
export const LARK_ROUTE_BITABLE_FETCH_RECORDS = "bitable.fetchRecords";

/** POST body：`{ route: 'bitable.syncToTestCases', payload: SyncTestCasesToDatabaseInput }` — 拉取、解析并落库 */
export const LARK_ROUTE_BITABLE_SYNC_TO_TEST_CASES = "bitable.syncToTestCases";

function parseSyncInput(payload: unknown): SyncTestCasesInput | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const p = payload as Record<string, unknown>;
  const appToken =
    typeof p.appToken === "string" ? p.appToken : String(p.appToken ?? "");
  const tableId =
    typeof p.tableId === "string" ? p.tableId : String(p.tableId ?? "");
  if (!appToken || !tableId) {
    return null;
  }

  return {
    appToken,
    tableId,
    viewId: p.viewId != null ? String(p.viewId) : undefined,
    syncMode: p.syncMode as SyncTestCasesInput["syncMode"],
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

export default async (ctx: PluginHttpContext) => {
  if (ctx.method !== "POST" || ctx.jsonBody === null) {
    return null;
  }
  const body = ctx.jsonBody as { route?: string; payload?: unknown };
  const route = body.route;

  const isBitableRoute =
    route === LARK_ROUTE_BITABLE_FETCH_RECORDS ||
    route === LARK_ROUTE_BITABLE_SYNC_TO_TEST_CASES;
  if (!isBitableRoute) {
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
    switch (route) {
      case LARK_ROUTE_BITABLE_FETCH_RECORDS: {
        const client = prepared.plugin.createBitableSyncClient();
        const fetchResult = await fetchBitableRecords(client, input);
        return NextResponse.json(fetchResult);
      }
      case LARK_ROUTE_BITABLE_SYNC_TO_TEST_CASES: {
        const syncResult = await prepared.plugin.syncBitableToTestCases(input);
        return NextResponse.json(syncResult);
      }
      default:
        return null;
    }
  } catch (error) {
    console.error(`[lark plugin-http] ${route}`);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Bitable request failed",
      },
      { status: 500 },
    );
  }
};
