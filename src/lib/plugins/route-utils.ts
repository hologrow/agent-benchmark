import { NextResponse } from "next/server";
import { pluginRegistry } from "@/lib/plugins/registry";
import { ensureBuiltInPluginsRegistered } from "@/lib/plugins/loader";
import { getIntegrationByType } from "@/lib/db";
import { type IPlugin } from "@/lib/plugins/types";

export type PreparePluginError =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      plugin: IPlugin;
    };

function preparePlugin(pluginId: string): PreparePluginError {
  ensureBuiltInPluginsRegistered();

  const integration = getIntegrationByType(pluginId);
  if (integration) {
    try {
      const config = JSON.parse(integration.config || "{}");
      pluginRegistry.loadConfig(pluginId, integration.enabled === 1, config);
    } catch {
      // invalid JSON — still try registry defaults
    }
  }

  const raw = pluginRegistry.getPlugin(pluginId);
  if (!raw) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Plugin not found or does not support import" },
        { status: 404 },
      ),
    };
  }

  if (!pluginRegistry.isEnabled(pluginId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Plugin is not enabled — configure it in Integrations" },
        { status: 400 },
      ),
    };
  }

  return { ok: true, plugin: raw };
}

/**
   TODO: REMOVE ME
 */
export function getPlugin(pluginId: string): PreparePluginError {
  return preparePlugin(pluginId);
}
