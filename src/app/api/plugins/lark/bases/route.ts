import { NextResponse } from 'next/server';
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

// GET /api/plugins/lark/bases - Get all available Base list
export async function GET() {
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

    const bases = await plugin.listBases();
    return NextResponse.json({ bases });
  } catch (error) {
    console.error('[LarkAPI] Failed to get Base list:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get Base list' },
      { status: 500 }
    );
  }
}
