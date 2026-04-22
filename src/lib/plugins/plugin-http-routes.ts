/**
 * 插件自定义 HTTP：在 `POST /api/plugins/[pluginId]` 上按 `body.route` 分发。
 * 各内置插件在各自的 `plugin-http-routes.ts` 中 `registerPluginHttpHandler` 注册。
 */

import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";

export type PluginHttpContext = {
  pluginId: string;
  request: NextRequest;
  method: string;
  /** POST 已解析的 JSON；GET 等为 null */
  jsonBody: unknown | null;
};

/**
 * 返回非 null 表示由插件处理并作为 HTTP 响应；null 表示交给默认 import `action` 协议。
 */
export type PluginHttpHandler = (
  ctx: PluginHttpContext,
) => Promise<NextResponse | null>;

const handlers = new Map<string, PluginHttpHandler>();

export function registerPluginHttpHandler(
  pluginId: string,
  handler: PluginHttpHandler,
): void {
  if (handlers.has(pluginId)) {
    console.warn(
      `[PluginHttpRoutes] Overwriting HTTP handler for plugin "${pluginId}"`,
    );
  }
  handlers.set(pluginId, handler);
}

export async function invokePluginHttpHandler(
  pluginId: string,
  ctx: PluginHttpContext,
): Promise<NextResponse | null> {
  const h = handlers.get(pluginId);
  if (!h) {
    return null;
  }
  return h(ctx);
}
