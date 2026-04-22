import { NextRequest, NextResponse } from "next/server";
import {
  prepareImportPlugin,
  type PreparePluginError,
} from "@/lib/plugins/route-utils";
import { hasLegacySyncMethods } from "@/lib/plugins/types";
import type { SyncTestCasesToDatabaseInput } from "@/lib/plugins/types";
import { pluginRegistry } from "@/lib/plugins/registry";
import { ensureBuiltInPluginsRegistered } from "@/lib/plugins/loader";
import { createServerPluginHostContext } from "@/lib/plugins/host";

function preparePluginForLegacySync(pluginId: string): PreparePluginError {
  let prepared = prepareImportPlugin(pluginId);
  if (prepared.ok) {
    return prepared;
  }
  /* Env-only Lark: no integration row — enable built-in lark when env creds exist. */
  if (
    pluginId === "lark" &&
    !(pluginRegistry.getConfig("lark")?.enabled ?? false)
  ) {
    const hasEnv =
      !!(process.env.LARK_APP_ID || process.env.FEISHU_APP_ID) &&
      !!(process.env.LARK_APP_SECRET || process.env.FEISHU_APP_SECRET);
    if (hasEnv) {
      ensureBuiltInPluginsRegistered();
      pluginRegistry.loadConfig("lark", true, {
        appType: process.env.LARK_APP_TYPE === "lark" ? "lark" : "feishu",
        appId: "",
        appSecret: "",
      });
      prepared = prepareImportPlugin(pluginId);
    }
  }
  return prepared;
}

/**
 * GET /api/test-cases/sync?pluginId=&appToken=&tableId=
 */
export async function handleTestCasesSyncGET(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const pluginId = searchParams.get("pluginId");
    if (!pluginId) {
      return NextResponse.json(
        { error: "pluginId query parameter is required" },
        { status: 400 },
      );
    }

    const prepared = preparePluginForLegacySync(pluginId);
    if (!prepared.ok) {
      return prepared.response;
    }
    if (!hasLegacySyncMethods(prepared.plugin)) {
      return NextResponse.json(
        { error: "Plugin does not implement legacy Bitable sync catalog" },
        { status: 501 },
      );
    }

    const appToken = searchParams.get("appToken");
    if (!appToken) {
      return NextResponse.json(
        { error: "appToken is required" },
        { status: 400 },
      );
    }

    const tableId = searchParams.get("tableId") ?? undefined;

    const result = await prepared.plugin.getLegacySyncCatalog({
      appToken,
      tableId,
    });

    if (result.error) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = error as {
      response?: { data?: { code?: string | number; error?: unknown } };
    };
    const errorData = err.response?.data as
      | {
          code: string | number;
          error: unknown;
        }
      | undefined;
    console.error("TestCasesSync GET:", errorData);
    const errorMessage =
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

/**
 * POST /api/test-cases/sync — body includes pluginId and {@link SyncTestCasesToDatabaseInput} fields.
 */
export async function handleTestCasesSyncPOST(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const pluginId = typeof body.pluginId === "string" ? body.pluginId : null;
    if (!pluginId) {
      return NextResponse.json(
        { error: "pluginId is required in JSON body" },
        { status: 400 },
      );
    }

    const prepared = preparePluginForLegacySync(pluginId);
    if (!prepared.ok) {
      return prepared.response;
    }
    if (!hasLegacySyncMethods(prepared.plugin)) {
      return NextResponse.json(
        { error: "Plugin does not implement legacy Bitable sync" },
        { status: 501 },
      );
    }

    const {
      appToken,
      tableId,
      viewId,
      syncMode,
      columnMapping,
      createTestSet,
      testSetName,
      testSetDescription,
      persist,
    } = body;

    if (!appToken || !tableId) {
      return NextResponse.json(
        { error: "appToken and tableId are required" },
        { status: 400 },
      );
    }

    const input: SyncTestCasesToDatabaseInput = {
      appToken: String(appToken),
      tableId: String(tableId),
      viewId: viewId != null ? String(viewId) : undefined,
      syncMode: syncMode as SyncTestCasesToDatabaseInput["syncMode"],
      columnMapping:
        columnMapping && typeof columnMapping === "object"
          ? (columnMapping as Record<string, string>)
          : undefined,
      createTestSet:
        typeof createTestSet === "boolean" ? createTestSet : undefined,
      testSetName:
        testSetName != null ? String(testSetName) : undefined,
      testSetDescription:
        testSetDescription != null ? String(testSetDescription) : undefined,
    };

    const fetchResult = await prepared.plugin.fetchLegacySyncRecords(input);
    const shouldPersist = persist !== false;

    if (!shouldPersist) {
      return NextResponse.json({ fetchResult });
    }

    const host = createServerPluginHostContext();
    const result = await host.externalTableSync.persistAfterFetch(
      input,
      fetchResult,
    );

    return NextResponse.json({
      success: result.success,
      stats: result.stats,
      testSet: result.testSet,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Error syncing test cases:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to sync";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
