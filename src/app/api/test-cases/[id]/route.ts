import { NextRequest, NextResponse } from 'next/server';
import {
  getTestCaseById,
  updateTestCase,
  deleteTestCase
} from '@/lib/db';

// GET /api/test-cases/:id - one test case
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const testCase = getTestCaseById(parseInt(id));

    if (!testCase) {
      return NextResponse.json(
        { error: 'Test case not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ testCase });
  } catch (error) {
    console.error('Error fetching test case:', error);
    return NextResponse.json(
      { error: 'Failed to fetch test case' },
      { status: 500 }
    );
  }
}

// PUT /api/test-cases/:id - update test case
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      test_id,
      name,
      description,
      input,
      expected_output,
      key_points,
      forbidden_points,
      category,
      how
    } = body;

    const testCase = getTestCaseById(parseInt(id));
    if (!testCase) {
      return NextResponse.json(
        { error: 'Test case not found' },
        { status: 404 }
      );
    }

    const updateData: Parameters<typeof updateTestCase>[1] = {};
    if (test_id !== undefined) updateData.test_id = test_id;
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (input !== undefined) updateData.input = input;
    if (expected_output !== undefined) updateData.expected_output = expected_output;
    if (key_points !== undefined) {
      updateData.key_points = typeof key_points === 'string' ? key_points : JSON.stringify(key_points);
    }
    if (forbidden_points !== undefined) {
      updateData.forbidden_points = typeof forbidden_points === 'string' ? forbidden_points : JSON.stringify(forbidden_points);
    }
    if (category !== undefined) updateData.category = category;
    if (how !== undefined) updateData.how = how;

    const updatedTestCase = updateTestCase(parseInt(id), updateData);
    return NextResponse.json({ testCase: updatedTestCase });
  } catch (error) {
    console.error('Error updating test case:', error);
    return NextResponse.json(
      { error: 'Failed to update test case' },
      { status: 500 }
    );
  }
}

// DELETE /api/test-cases/:id - delete test case
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const testCase = getTestCaseById(parseInt(id));

    if (!testCase) {
      return NextResponse.json(
        { error: 'Test case not found' },
        { status: 404 }
      );
    }

    deleteTestCase(parseInt(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting test case:', error);
    return NextResponse.json(
      { error: 'Failed to delete test case' },
      { status: 500 }
    );
  }
}
