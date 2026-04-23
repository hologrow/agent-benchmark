import { NextRequest, NextResponse } from 'next/server';
import {
  getAllModels,
  createModel,
} from '@/lib/db';

// GET /api/models - list models
export async function GET() {
  try {
    const models = getAllModels();
    return NextResponse.json({ models });
  } catch (error) {
    console.error('Error fetching models:', error);
    return NextResponse.json(
      { error: 'Failed to fetch models' },
      { status: 500 }
    );
  }
}

// POST /api/models - create model
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, model_id, provider, api_key, base_url, config, is_default } = body;

    if (!name || !model_id) {
      return NextResponse.json(
        { error: 'Name and model_id are required' },
        { status: 400 }
      );
    }

    const configStr =
      config === undefined || config === null
        ? '{}'
        : typeof config === 'string'
          ? config
          : JSON.stringify(config);

    const model = createModel({
      name,
      model_id,
      provider: provider || 'anthropic',
      api_key: api_key || null,
      base_url: base_url || null,
      config: configStr,
      is_default: is_default ? 1 : 0,
    });

    return NextResponse.json({ model });
  } catch (error) {
    console.error('Error creating model:', error);
    return NextResponse.json(
      { error: 'Failed to create model' },
      { status: 500 }
    );
  }
}
