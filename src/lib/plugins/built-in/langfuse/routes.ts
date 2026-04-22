/**
 * Langfuse 插件：`POST /api/plugins/langfuse`，body `{ route, payload }`。
 * 与 Lark 的 `routes.ts` 一致，供 {@link loadBuiltInPluginHttpRoutesFromLayout} 注册。
 */

import { NextResponse } from "next/server";
import type { PluginHttpContext } from "../../registerRoutes";
import { LangfusePlugin } from "./index";
import { getPlugin } from "../../route-utils";

export const LANGFUSE_ROUTE_TRACE_SEARCH = "trace.searchTraces";
export const LANGFUSE_ROUTE_TRACE_GET = "trace.getTrace";
export const LANGFUSE_ROUTE_TRACE_URL = "trace.getTraceUrl";

function parseIsoDate(v: unknown): Date | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function langfusePluginHttp(
  ctx: PluginHttpContext,
): Promise<NextResponse | null> {
  if (ctx.method !== "POST" || ctx.jsonBody === null) {
    return null;
  }

  const body = ctx.jsonBody as { route?: string; payload?: unknown };
  const route = body.route;
  const isTraceRoute =
    route === LANGFUSE_ROUTE_TRACE_SEARCH ||
    route === LANGFUSE_ROUTE_TRACE_GET ||
    route === LANGFUSE_ROUTE_TRACE_URL;
  if (!isTraceRoute) {
    return null;
  }

  const prepared = getPlugin("langfuse");
  if (!prepared.ok) {
    return prepared.response;
  }
  if (!(prepared.plugin instanceof LangfusePlugin)) {
    return NextResponse.json(
      { error: "Trace routes are only supported for the Langfuse plugin" },
      { status: 501 },
    );
  }

  const plugin = prepared.plugin;
  const payload =
    body.payload !== undefined &&
    typeof body.payload === "object" &&
    body.payload !== null &&
    !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {};

  try {
    switch (route) {
      case LANGFUSE_ROUTE_TRACE_SEARCH: {
        const magicCode =
          typeof payload.magicCode === "string" ? payload.magicCode : undefined;
        const executionId =
          typeof payload.executionId === "number"
            ? payload.executionId
            : undefined;
        const fromTime = parseIsoDate(payload.fromTime);
        const toTime = parseIsoDate(payload.toTime);
        const traces = await plugin.searchTraces({
          magicCode,
          executionId,
          fromTime,
          toTime,
        });
        return NextResponse.json({ traces });
      }
      case LANGFUSE_ROUTE_TRACE_GET: {
        const traceId =
          typeof payload.traceId === "string" ? payload.traceId : "";
        if (!traceId) {
          return NextResponse.json(
            { error: "payload.traceId is required" },
            { status: 400 },
          );
        }
        const trace = await plugin.getTrace(traceId);
        return NextResponse.json({ trace });
      }
      case LANGFUSE_ROUTE_TRACE_URL: {
        const traceId =
          typeof payload.traceId === "string" ? payload.traceId : "";
        if (!traceId) {
          return NextResponse.json(
            { error: "payload.traceId is required" },
            { status: 400 },
          );
        }
        const url = plugin.getTraceUrl(traceId);
        return NextResponse.json({ url });
      }
      default:
        return null;
    }
  } catch (error) {
    console.error(`[langfuse plugin-http] ${route}`, error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Langfuse trace request failed",
      },
      { status: 500 },
    );
  }
}
