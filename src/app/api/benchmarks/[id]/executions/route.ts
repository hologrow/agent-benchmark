import { NextRequest, NextResponse } from 'next/server';
import {
  getBenchmarkById,
  getExecutionsByBenchmarkId,
  createExecution,
  getExecutionDetails
} from '@/lib/db';

// GET /api/benchmarks/:id/executions - 获取 benchmark 的所有执行记录
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const benchmarkId = parseInt(id);

    const benchmark = getBenchmarkById(benchmarkId);
    if (!benchmark) {
      return NextResponse.json(
        { error: 'Benchmark not found' },
        { status: 404 }
      );
    }

    const executions = getExecutionsByBenchmarkId(benchmarkId);

    // 获取每个 execution 的平均分
    const executionsWithScore = executions.map(exec => {
      const details = getExecutionDetails(exec.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = (details?.results || []) as any[];
      const scores: number[] = [];
      for (const r of results) {
        if (r.score !== null && r.score !== undefined) {
          scores.push(Number(r.score));
        }
      }
      const avgScore = scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : null;

      return {
        ...exec,
        avgScore
      };
    });

    return NextResponse.json({ executions: executionsWithScore });
  } catch (error) {
    console.error('Error fetching executions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch executions' },
      { status: 500 }
    );
  }
}

// POST /api/benchmarks/:id/executions - 创建新的执行记录
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const benchmarkId = parseInt(id);

    const benchmark = getBenchmarkById(benchmarkId);
    if (!benchmark) {
      return NextResponse.json(
        { error: 'Benchmark not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name } = body;

    const execution = createExecution({
      benchmark_id: benchmarkId,
      name: name || null,
      status: 'pending',
      started_at: null,
      completed_at: null
    });

    return NextResponse.json({ execution }, { status: 201 });
  } catch (error) {
    console.error('Error creating execution:', error);
    return NextResponse.json(
      { error: 'Failed to create execution' },
      { status: 500 }
    );
  }
}
