import { NextRequest, NextResponse } from 'next/server';
import {
  getAllTestCases,
  createTestCase
} from '@/lib/db';

// GET /api/test-cases - list test cases
export async function GET() {
  try {
    const testCases = getAllTestCases();
    return NextResponse.json({ testCases });
  } catch (error) {
    console.error('Error fetching test cases:', error);
    return NextResponse.json(
      { error: 'Failed to fetch test cases' },
      { status: 500 }
    );
  }
}

// POST /api/test-cases - create test case
export async function POST(request: NextRequest) {
  try {
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
      how,
      created_by,
    } = body;

    if (!input) {
      return NextResponse.json(
        { error: 'input is required' },
        { status: 400 }
      );
    }

    const allTestCases = getAllTestCases();
    // Defaults when test_id / name / description are omitted
    const generatedTestId = test_id || `TC_${String(allTestCases.length + 1).padStart(3, '0')}`;
    const generatedName = name || input.slice(0, 50);
    const generatedDescription = description || input.slice(0, 200);

    const categoryStr = typeof category === 'string' ? category : '';
    const createdByStr =
      typeof created_by === 'string' ? created_by.trim() : '';

    if (categoryStr === 'simulation-run' && !createdByStr) {
      return NextResponse.json(
        { error: 'created_by is required for simulation-run test cases' },
        { status: 400 }
      );
    }

    const testCase = createTestCase({
      test_id: generatedTestId,
      name: generatedName,
      description: generatedDescription,
      input,
      expected_output: expected_output || '',
      key_points: typeof key_points === 'string' ? key_points : JSON.stringify(key_points || []),
      forbidden_points: typeof forbidden_points === 'string' ? forbidden_points : JSON.stringify(forbidden_points || []),
      category: categoryStr,
      how: how || '',
      created_by: createdByStr,
    });

    return NextResponse.json({ testCase }, { status: 201 });
  } catch (error) {
    console.error('Error creating test case:', error);
    return NextResponse.json(
      { error: 'Failed to create test case' },
      { status: 500 }
    );
  }
}
