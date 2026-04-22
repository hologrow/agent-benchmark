import { NextRequest, NextResponse } from 'next/server';
import {
  getExecutionById,
  updateExecution,
  deleteExecution,
  getExecutionDetails
} from '@/lib/db';

// GET /api/executions/:id - execution detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const details = getExecutionDetails(parseInt(id));

    if (!details) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ details });
  } catch (error) {
    console.error('Error fetching execution details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch execution details' },
      { status: 500 }
    );
  }
}

// PUT /api/executions/:id - update execution
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, started_at, completed_at } = body;

    const execution = getExecutionById(parseInt(id));
    if (!execution) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      );
    }

    const updateData: Parameters<typeof updateExecution>[1] = {};
    if (status !== undefined) updateData.status = status;
    if (started_at !== undefined) updateData.started_at = started_at;
    if (completed_at !== undefined) updateData.completed_at = completed_at;

    const updatedExecution = updateExecution(parseInt(id), updateData);
    return NextResponse.json({ execution: updatedExecution });
  } catch (error) {
    console.error('Error updating execution:', error);
    return NextResponse.json(
      { error: 'Failed to update execution' },
      { status: 500 }
    );
  }
}

// DELETE /api/executions/:id - delete execution
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const execution = getExecutionById(parseInt(id));

    if (!execution) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      );
    }

    deleteExecution(parseInt(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting execution:', error);
    return NextResponse.json(
      { error: 'Failed to delete execution' },
      { status: 500 }
    );
  }
}
