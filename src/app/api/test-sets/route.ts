import { NextRequest, NextResponse } from 'next/server';
import {
  getAllTestSets,
  getTestSetById,
  createTestSet,
  updateTestSet,
  deleteTestSet
} from '@/lib/db';

// GET /api/test-sets - 获取所有测试集
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      // 获取单个测试集详情
      const testSet = getTestSetById(parseInt(id));
      if (!testSet) {
        return NextResponse.json(
          { error: 'Test set not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ testSet });
    }

    // 获取所有测试集
    const testSets = getAllTestSets();
    return NextResponse.json({ testSets });
  } catch (error) {
    console.error('Error fetching test sets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch test sets' },
      { status: 500 }
    );
  }
}

// POST /api/test-sets - 创建新测试集
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      source,
      source_url,
      test_case_ids
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    if (!test_case_ids || !Array.isArray(test_case_ids) || test_case_ids.length === 0) {
      return NextResponse.json(
        { error: 'At least one test case is required' },
        { status: 400 }
      );
    }

    const testSet = createTestSet(
      {
        name,
        description: description || '',
        source: source || 'manual',
        source_url: source_url || null
      },
      test_case_ids
    );

    return NextResponse.json({ testSet }, { status: 201 });
  } catch (error) {
    console.error('Error creating test set:', error);
    return NextResponse.json(
      { error: 'Failed to create test set' },
      { status: 500 }
    );
  }
}

// PUT /api/test-sets - 更新测试集
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      name,
      description,
      source,
      source_url,
      test_case_ids
    } = body;

    const testSet = updateTestSet(
      parseInt(id),
      {
        name,
        description,
        source,
        source_url
      },
      test_case_ids
    );

    return NextResponse.json({ testSet });
  } catch (error) {
    console.error('Error updating test set:', error);
    return NextResponse.json(
      { error: 'Failed to update test set' },
      { status: 500 }
    );
  }
}

// DELETE /api/test-sets - 删除测试集
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      );
    }

    deleteTestSet(parseInt(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting test set:', error);
    return NextResponse.json(
      { error: 'Failed to delete test set' },
      { status: 500 }
    );
  }
}
