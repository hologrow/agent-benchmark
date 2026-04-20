import { NextRequest, NextResponse } from 'next/server';
import { getAllIntegrations, upsertIntegrationByType } from '@/lib/db';

// GET /api/integrations - 获取所有集成配置
export async function GET() {
  try {
    const integrations = getAllIntegrations();
    return NextResponse.json({ integrations });
  } catch (error) {
    console.error('Error fetching integrations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch integrations' },
      { status: 500 }
    );
  }
}

// POST /api/integrations - 创建或更新集成配置
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, name, enabled, config } = body;

    if (!type || !name) {
      return NextResponse.json(
        { error: 'Type and name are required' },
        { status: 400 }
      );
    }

    const integration = upsertIntegrationByType(type, {
      name,
      enabled: enabled ? 1 : 0,
      config: typeof config === 'string' ? config : JSON.stringify(config),
    });

    return NextResponse.json({ integration });
  } catch (error) {
    console.error('Error saving integration:', error);
    return NextResponse.json(
      { error: 'Failed to save integration' },
      { status: 500 }
    );
  }
}
