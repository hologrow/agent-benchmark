import { NextRequest, NextResponse } from 'next/server';
import {
  getEvaluatorById,
  updateEvaluator,
  deleteEvaluator
} from '@/lib/db';

// GET /api/evaluators/:id - one evaluator
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const evaluator = getEvaluatorById(parseInt(id));

    if (!evaluator) {
      return NextResponse.json(
        { error: 'Evaluator not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ evaluator });
  } catch (error) {
    console.error('Error fetching evaluator:', error);
    return NextResponse.json(
      { error: 'Failed to fetch evaluator' },
      { status: 500 }
    );
  }
}

// PUT /api/evaluators/:id - update evaluator
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, script_path, model_id, config } = body;

    const evaluator = getEvaluatorById(parseInt(id));
    if (!evaluator) {
      return NextResponse.json(
        { error: 'Evaluator not found' },
        { status: 404 }
      );
    }

    const updateData: Parameters<typeof updateEvaluator>[1] = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (script_path !== undefined) updateData.script_path = script_path;
    if (model_id !== undefined) updateData.model_id = model_id;
    if (config !== undefined) {
      updateData.config = typeof config === 'string' ? config : JSON.stringify(config);
    }

    const updatedEvaluator = updateEvaluator(parseInt(id), updateData);
    return NextResponse.json({ evaluator: updatedEvaluator });
  } catch (error) {
    console.error('Error updating evaluator:', error);
    return NextResponse.json(
      { error: 'Failed to update evaluator' },
      { status: 500 }
    );
  }
}

// DELETE /api/evaluators/:id - delete evaluator
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const evaluator = getEvaluatorById(parseInt(id));

    if (!evaluator) {
      return NextResponse.json(
        { error: 'Evaluator not found' },
        { status: 404 }
      );
    }

    deleteEvaluator(parseInt(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting evaluator:', error);
    return NextResponse.json(
      { error: 'Failed to delete evaluator' },
      { status: 500 }
    );
  }
}
