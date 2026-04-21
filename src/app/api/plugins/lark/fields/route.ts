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

// GET /api/plugins/lark/fields?baseId=xxx&tableId=yyy - Get field list in specified table
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
    const tableId = searchParams.get('tableId');

    if (!baseId || !tableId) {
      return NextResponse.json(
        { error: 'Missing baseId or tableId parameter' },
        { status: 400 }
      );
    }

    const fields = await plugin.listTableFields(baseId, tableId);
    return NextResponse.json({ fields });
  } catch (error) {
    console.error('[LarkAPI] Failed to get field list:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get field list' },
      { status: 500 }
    );
  }
}
