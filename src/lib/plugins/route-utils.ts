import { NextResponse } from 'next/server';
import { pluginRegistry } from '@/lib/plugins/registry';
import { ensureBuiltInPluginsRegistered } from '@/lib/plugins/loader';
import { getIntegrationByType } from '@/lib/db';
import {
  type ImportTestCasesPlugin,
  isImportTestCasesPlugin,
} from '@/lib/plugins/types';

export type PreparePluginError =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      plugin: ImportTestCasesPlugin;
    };

/**
 * Load integration config into the registry and resolve an import-capable plugin by id.
 */
export function prepareImportPlugin(pluginId: string): PreparePluginError {
  ensureBuiltInPluginsRegistered();

  const integration = getIntegrationByType(pluginId);
  if (integration) {
    try {
      const config = JSON.parse(integration.config || '{}');
      pluginRegistry.loadConfig(pluginId, integration.enabled === 1, config);
    } catch {
      // invalid JSON — still try registry defaults
    }
  }

  const raw = pluginRegistry.getPlugin(pluginId);
  if (!raw || !isImportTestCasesPlugin(raw)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Plugin not found or does not support import' },
        { status: 404 },
      ),
    };
  }

  if (!pluginRegistry.isEnabled(pluginId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Plugin is not enabled — configure it in Integrations' },
        { status: 400 },
      ),
    };
  }

  return { ok: true, plugin: raw };
}
