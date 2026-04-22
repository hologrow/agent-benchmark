import { NextRequest, NextResponse } from 'next/server';
import { pluginRegistry } from '@/lib/plugins';
import { ensureBuiltInPluginsRegistered } from '@/lib/plugins/loader';

// POST /api/integrations/:type/test - test connection with temporary config body
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params;
    const config = await request.json();

    ensureBuiltInPluginsRegistered();

    const plugin = pluginRegistry.getPlugin(type);
    if (!plugin) {
      return NextResponse.json(
        { success: false, message: `Plugin not found: ${type}` },
        { status: 404 }
      );
    }

    plugin.setConfig(config);

    const result = await pluginRegistry.testConnection(type);

    return NextResponse.json(result);
  } catch (error) {
    console.error(`[TestConnection] failed:`, error);
    return NextResponse.json(
      { success: false, message: `Test failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
