import { NextRequest, NextResponse } from 'next/server';
import {
  getAllTestCases,
  createTestCase
} from '@/lib/db';

// GET /api/test-cases - 获取所有测试用例
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

// POST /api/test-cases - 创建新测试用例
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
      how
    } = body;

    if (!input) {
      return NextResponse.json(
        { error: 'input is required' },
        { status: 400 }
      );
    }

    // 自动生成 test_id（如果未提供）
    const allTestCases = getAllTestCases();
    const generatedTestId = test_id || `TC_${String(allTestCases.length + 1).padStart(3, '0')}`;
    // 自动生成 name（如果未提供）
    const generatedName = name || input.slice(0, 50);
    // 自动生成 description（如果未提供）
    const generatedDescription = description || input.slice(0, 200);

    const testCase = createTestCase({
      test_id: generatedTestId,
      name: generatedName,
      description: generatedDescription,
      input,
      expected_output: expected_output || '',
      key_points: typeof key_points === 'string' ? key_points : JSON.stringify(key_points || []),
      forbidden_points: typeof forbidden_points === 'string' ? forbidden_points : JSON.stringify(forbidden_points || []),
      category: category || '',
      how: how || ''
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
