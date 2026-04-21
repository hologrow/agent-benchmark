import { NextRequest, NextResponse } from 'next/server';
import { pluginRegistry } from '@/lib/plugins';
import type { LarkPlugin } from '@/lib/plugins/built-in/lark';
import { ensureBuiltInPluginsRegistered } from '@/lib/plugins/loader';
import { getIntegrationByType } from '@/lib/db';

// Ensure plugins are registered
function ensureLarkPluginRegistered() {
  ensureBuiltInPluginsRegistered();

  // Load config from database
  const integration = getIntegrationByType('lark');
  if (integration) {
    try {
      const config = JSON.parse(integration.config);
      pluginRegistry.loadConfig('lark', integration.enabled === 1, config);
    } catch {
      // ignore invalid config
    }
  }
}

// GET /api/plugins/lark/tables?baseId=xxx - Get table list in specified Base
export async function GET(request: NextRequest) {
  try {
    ensureLarkPluginRegistered();

    const plugin = pluginRegistry.getPlugin('lark') as LarkPlugin | undefined;
    if (!plugin) {
      return NextResponse.json(
        { error: 'Lark plugin not registered' },
        { status: 500 }
      );
    }

    // Check if plugin is enabled
    if (!pluginRegistry.isEnabled('lark')) {
      return NextResponse.json(
        { error: 'Lark plugin not enabled, please configure in integration settings' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const baseId = searchParams.get('baseId');

    if (!baseId) {
      return NextResponse.json(
        { error: 'Missing baseId parameter' },
        { status: 400 }
      );
    }

    const tables = await plugin.listTables(baseId);
    return NextResponse.json({ tables });
  } catch (error) {
    console.error('[LarkAPI] Failed to get table list:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get table list' },
      { status: 500 }
    );
  }
}
