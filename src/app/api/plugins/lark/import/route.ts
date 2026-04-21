import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
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

// POST /api/plugins/lark/import - Import test cases
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { items, fieldMapping } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Missing items parameter' },
        { status: 400 }
      );
    }

    // items format: ["baseId/tableId"]
    const result = await plugin.importItems(items, fieldMapping);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[LarkAPI] Import failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    );
  }
}
