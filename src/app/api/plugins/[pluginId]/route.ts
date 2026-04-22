import { NextRequest, NextResponse } from "next/server";
import { getPlugin } from "@/lib/plugins/route-utils";
import { pluginRegistry } from "@/lib/plugins";
import { invokePluginHttpHandler } from "@/lib/plugins/registerRoutes";
import { IPlugin } from "@/lib/plugins/types";

async function parseJsonBody(request: NextRequest): Promise<unknown> {
  try {
    const t = await request.text();
    return t ? JSON.parse(t) : {};
  } catch {
    throw new SyntaxError("Invalid JSON");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pluginId: string }> },
) {
  const { pluginId } = await params;
  let parsed: unknown;
  try {
    parsed = await parseJsonBody(request);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const bodyObj = parsed as {
    route?: string;
    payload?: Record<string, unknown>;
  };

  const route = typeof bodyObj.route === "string" ? bodyObj.route.trim() : "";

  if (!route) {
    return NextResponse.json(
      {
        error: 'Missing non-empty "route" in body',
        examples: [
          "testConnection",
          "trace.searchTraces",
          "listImportTables",
          "listImportFields",
          "bitable.syncToTestCases",
        ],
      },
      { status: 400 },
    );
  }

  try {
    const delegated = await invokePluginHttpHandler(pluginId, {
      pluginId,
      request,
      method: "POST",
      jsonBody: parsed,
    });
    if (delegated) {
      return delegated;
    }

    const prepared = getPlugin(pluginId);
    if (!prepared.ok) {
      return prepared.response;
    }

    if (route === "testConnection") {
      const payload =
        bodyObj.payload !== undefined &&
        typeof bodyObj.payload === "object" &&
        bodyObj.payload !== null &&
        !Array.isArray(bodyObj.payload)
          ? (bodyObj.payload as Record<string, unknown>)
          : {};
      prepared.plugin.setConfig(payload);
      try {
        const result = await pluginRegistry.testConnection(pluginId);
        return NextResponse.json(result);
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
          },
          { status: 500 },
        );
      }
    }

    const payload = bodyObj.payload ?? {};

    if (!pluginRegistry.isEnabled(pluginId)) {
      return NextResponse.json(
        {
          error: "Plugin is not enabled — configure it in Integrations",
        },
        { status: 400 },
      );
    }

    return await handleImportRoute(prepared.plugin, route as any, payload);
  } catch (error) {
    console.error(`[plugins/${pluginId}]`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 },
    );
  }
}

async function handleImportRoute(
  plugin: IPlugin,
  route: string,
  payload: Record<string, unknown>,
): Promise<NextResponse> {
  switch (route) {
    case "listImportSources": {
      const sources = await (plugin as any).listImportSources();
      return NextResponse.json({ sources });
    }

    case "listImportTables": {
      const sourceId =
        typeof payload.sourceId === "string" ? payload.sourceId : "";
      if (!sourceId) {
        return NextResponse.json(
          { error: "payload.sourceId is required" },
          { status: 400 },
        );
      }
      // FIXME: plugin
      const tables = await (plugin as any).listImportTables(sourceId);
      return NextResponse.json({ tables });
    }

    case "listImportFields": {
      const sourceId =
        typeof payload.sourceId === "string" ? payload.sourceId : "";
      const tableId =
        typeof payload.tableId === "string" ? payload.tableId : "";
      if (!sourceId || !tableId) {
        return NextResponse.json(
          { error: "payload.sourceId and payload.tableId are required" },
          { status: 400 },
        );
      }
      const fields = await (plugin as any).listImportFields(sourceId, tableId);
      return NextResponse.json({ fields });
    }

    case "importTestCases": {
      const items = payload.items;
      const fieldMapping = payload.fieldMapping as
        | Record<string, string>
        | undefined;
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json(
          { error: "payload.items must be a non-empty array" },
          { status: 400 },
        );
      }
      const result = await (plugin as any).importItems(
        items.map(String),
        fieldMapping,
      );
      return NextResponse.json(result);
    }

    default:
      return NextResponse.json({ error: "Unreachable" }, { status: 500 });
  }
}
