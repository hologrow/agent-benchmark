import { NextRequest, NextResponse } from 'next/server';
import {
  getModelById,
  updateModel,
  deleteModel,
} from '@/lib/db';

// GET /api/models/:id - one model
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const model = getModelById(parseInt(id));

    if (!model) {
      return NextResponse.json(
        { error: 'Model not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ model });
  } catch (error) {
    console.error('Error fetching model:', error);
    return NextResponse.json(
      { error: 'Failed to fetch model' },
      { status: 500 }
    );
  }
}

// PUT /api/models/:id - update model
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, model_id, provider, api_key, base_url, config, is_default } = body;

    const existingModel = getModelById(parseInt(id));
    if (!existingModel) {
      return NextResponse.json(
        { error: 'Model not found' },
        { status: 404 }
      );
    }

    const updateData: Parameters<typeof updateModel>[1] = {};
    if (name !== undefined) updateData.name = name;
    if (model_id !== undefined) updateData.model_id = model_id;
    if (provider !== undefined) updateData.provider = provider;
    if (api_key !== undefined) updateData.api_key = api_key;
    if (base_url !== undefined) updateData.base_url = base_url;
    if (config !== undefined) updateData.config = config;
    if (is_default !== undefined) updateData.is_default = is_default ? 1 : 0;

    const model = updateModel(parseInt(id), updateData);
    return NextResponse.json({ model });
  } catch (error) {
    console.error('Error updating model:', error);
    return NextResponse.json(
      { error: 'Failed to update model' },
      { status: 500 }
    );
  }
}

// DELETE /api/models/:id - delete model
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existingModel = getModelById(parseInt(id));

    if (!existingModel) {
      return NextResponse.json(
        { error: 'Model not found' },
        { status: 404 }
      );
    }

    deleteModel(parseInt(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting model:', error);
    return NextResponse.json(
      { error: 'Failed to delete model' },
      { status: 500 }
    );
  }
}
