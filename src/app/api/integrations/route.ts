import { NextRequest, NextResponse } from 'next/server';
import {
  getAllIntegrations,
  getIntegrationByType,
  upsertIntegrationByType,
} from '@/lib/db';

// GET /api/integrations - list integrations
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

// POST /api/integrations - create or update integration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { enabled, config } = body;

    const url = new URL(request.url);
    const type =
      (typeof body.type === 'string' && body.type.trim()) ||
      url.searchParams.get('type')?.trim() ||
      '';

    if (!type) {
      return NextResponse.json(
        { error: 'Type is required (body.type or query ?type=)' },
        { status: 400 }
      );
    }

    const existing = getIntegrationByType(type);
    const nameFromBody =
      typeof body.name === 'string' ? body.name.trim() : '';
    const name = nameFromBody || existing?.name?.trim() || type;

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
