import { NextRequest, NextResponse } from "next/server";
import { getPlugin } from "@/lib/plugins/route-utils";
import { invokePluginHttpHandler } from "@/lib/plugins/registerRoutes";
import {
  hasImportSchemaMethods,
  type ImportTestCasesPlugin,
} from "@/lib/plugins/types";

const IMPORT_ROUTES = [
  "listImportSources",
  "listImportTables",
  "listImportFields",
  "importTestCases",
] as const;

type ImportRoute = (typeof IMPORT_ROUTES)[number];

function isImportRoute(s: string): s is ImportRoute {
  return (IMPORT_ROUTES as readonly string[]).includes(s);
}

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

    const payload = bodyObj.payload ?? {};

    if (!isImportRoute(route)) {
      return NextResponse.json(
        { error: `Unknown route: ${route}`, pluginId },
        { status: 404 },
      );
    }

    return await handleImportRoute(prepared.plugin, route, payload);
  } catch (error) {
    console.error(`[plugins/${pluginId}]`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 },
    );
  }
}

async function handleImportRoute(
  plugin: ImportTestCasesPlugin,
  route: ImportRoute,
  payload: Record<string, unknown>,
): Promise<NextResponse> {
  switch (route) {
    case "listImportSources": {
      if (!hasImportSchemaMethods(plugin)) {
        return NextResponse.json(
          { error: "Plugin does not support listImportSources" },
          { status: 501 },
        );
      }
      const sources = await plugin.listImportSources();
      return NextResponse.json({ sources });
    }

    case "listImportTables": {
      if (!hasImportSchemaMethods(plugin)) {
        return NextResponse.json(
          { error: "Plugin does not support listImportTables" },
          { status: 501 },
        );
      }
      const sourceId =
        typeof payload.sourceId === "string" ? payload.sourceId : "";
      if (!sourceId) {
        return NextResponse.json(
          { error: "payload.sourceId is required" },
          { status: 400 },
        );
      }
      const tables = await plugin.listImportTables(sourceId);
      return NextResponse.json({ tables });
    }

    case "listImportFields": {
      if (!hasImportSchemaMethods(plugin)) {
        return NextResponse.json(
          { error: "Plugin does not support listImportFields" },
          { status: 501 },
        );
      }
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
      const fields = await plugin.listImportFields(sourceId, tableId);
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
      const result = await plugin.importItems(items.map(String), fieldMapping);
      return NextResponse.json(result);
    }

    default:
      return NextResponse.json({ error: "Unreachable" }, { status: 500 });
  }
}
