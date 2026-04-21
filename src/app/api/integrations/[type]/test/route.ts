import { NextRequest, NextResponse } from 'next/server';
import { pluginRegistry } from '@/lib/plugins';
import { ensureBuiltInPluginsRegistered } from '@/lib/plugins/loader';

// POST /api/integrations/:type/test - 测试集成连接
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
        { success: false, message: `未找到插件: ${type}` },
        { status: 404 }
      );
    }

    // 设置临时配置用于测试
    plugin.setConfig(config);

    // 测试连接
    const result = await pluginRegistry.testConnection(type);

    return NextResponse.json(result);
  } catch (error) {
    console.error(`[TestConnection] 测试连接失败:`, error);
    return NextResponse.json(
      { success: false, message: `测试失败: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
