import "server-only";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";

export type PluginHttpContext = {
  pluginId: string;
  request: NextRequest;
  method: string;
  /** POST 已解析的 JSON；GET 等为 null */
  jsonBody: unknown | null;
};

export type PluginHttpHandler = (
  ctx: PluginHttpContext,
) => Promise<NextResponse | null>;

declare global {
  var handlers: Map<string, PluginHttpHandler>;
}

if (!globalThis.handlers) {
  globalThis.handlers = new Map<string, PluginHttpHandler>();
}

export function registerPluginHttpHandler(
  pluginId: string,
  handler: PluginHttpHandler,
): void {
  if (globalThis.handlers.has(pluginId)) {
    console.warn(
      `[PluginHttpRoutes] Overwriting HTTP handler for plugin "${pluginId}"`,
    );
  }
  globalThis.handlers.set(pluginId, handler);
}

export async function invokePluginHttpHandler(
  pluginId: string,
  ctx: PluginHttpContext,
): Promise<NextResponse | null> {
  const h = globalThis.handlers.get(pluginId);
  if (!h) {
    return null;
  }
  return h(ctx);
}
