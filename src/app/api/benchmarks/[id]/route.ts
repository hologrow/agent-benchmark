import { NextRequest, NextResponse } from 'next/server';
import {
  getBenchmarkById,
  updateBenchmark,
  deleteBenchmark,
  getBenchmarkDetails
} from '@/lib/db';

// GET /api/benchmarks/:id - 获取 benchmark 配置详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const benchmark = getBenchmarkDetails(parseInt(id));

    if (!benchmark) {
      return NextResponse.json(
        { error: 'Benchmark not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ benchmark });
  } catch (error) {
    console.error('Error fetching benchmark:', error);
    return NextResponse.json(
      { error: 'Failed to fetch benchmark' },
      { status: 500 }
    );
  }
}

// PUT /api/benchmarks/:id - 更新 benchmark 配置
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      name,
      description,
      agent_ids,
      test_case_ids,
      test_set_id,
      evaluator_id,
      run_config
    } = body;

    const benchmark = getBenchmarkById(parseInt(id));
    if (!benchmark) {
      return NextResponse.json(
        { error: 'Benchmark not found' },
        { status: 404 }
      );
    }

    const updateData: Parameters<typeof updateBenchmark>[1] = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (agent_ids !== undefined) updateData.agent_ids = JSON.stringify(agent_ids);
    if (test_case_ids !== undefined) updateData.test_case_ids = JSON.stringify(test_case_ids);
    if (test_set_id !== undefined) updateData.test_set_id = test_set_id;
    if (evaluator_id !== undefined) updateData.evaluator_id = evaluator_id;
    if (run_config !== undefined) updateData.run_config = JSON.stringify(run_config);

    const updatedBenchmark = updateBenchmark(parseInt(id), updateData);
    return NextResponse.json({ benchmark: updatedBenchmark });
  } catch (error) {
    console.error('Error updating benchmark:', error);
    return NextResponse.json(
      { error: 'Failed to update benchmark' },
      { status: 500 }
    );
  }
}

// DELETE /api/benchmarks/:id - 删除 benchmark 配置
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const benchmark = getBenchmarkById(parseInt(id));

    if (!benchmark) {
      return NextResponse.json(
        { error: 'Benchmark not found' },
        { status: 404 }
      );
    }

    deleteBenchmark(parseInt(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting benchmark:', error);
    return NextResponse.json(
      { error: 'Failed to delete benchmark' },
      { status: 500 }
    );
  }
}
