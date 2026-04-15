import { NextRequest, NextResponse } from 'next/server';
import {
  getAllBenchmarks,
  createBenchmark,
  getTestSetCaseIds
} from '@/lib/db';

// GET /api/benchmarks - 获取所有 benchmark 配置
export async function GET() {
  try {
    const benchmarks = getAllBenchmarks();
    return NextResponse.json({ benchmarks });
  } catch (error) {
    console.error('Error fetching benchmarks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch benchmarks' },
      { status: 500 }
    );
  }
}

// POST /api/benchmarks - 创建新 benchmark 配置
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      agent_ids,
      test_set_id,
      test_case_ids,
      evaluator_id,
      run_config
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    if (!agent_ids || !Array.isArray(agent_ids) || agent_ids.length === 0) {
      return NextResponse.json(
        { error: 'At least one agent is required' },
        { status: 400 }
      );
    }

    if (!test_set_id && (!test_case_ids || !Array.isArray(test_case_ids) || test_case_ids.length === 0)) {
      return NextResponse.json(
        { error: 'Test set is required' },
        { status: 400 }
      );
    }

    if (!evaluator_id) {
      return NextResponse.json(
        { error: 'Evaluator is required' },
        { status: 400 }
      );
    }

    // 如果有 test_set_id，获取其 test_case_ids
    let finalTestCaseIds = test_case_ids;
    if (test_set_id && (!test_case_ids || test_case_ids.length === 0)) {
      finalTestCaseIds = getTestSetCaseIds(test_set_id);
    }

    const benchmark = createBenchmark({
      name,
      description: description || '',
      agent_ids: JSON.stringify(agent_ids),
      test_case_ids: JSON.stringify(finalTestCaseIds || []),
      test_set_id: test_set_id || null,
      evaluator_id: evaluator_id || null,
      run_config: run_config ? JSON.stringify(run_config) : '{}'
    });

    return NextResponse.json({ benchmark }, { status: 201 });
  } catch (error) {
    console.error('Error creating benchmark:', error);
    return NextResponse.json(
      { error: 'Failed to create benchmark' },
      { status: 500 }
    );
  }
}
