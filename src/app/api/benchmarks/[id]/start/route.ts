import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { join } from 'path';
import { mkdirSync, createWriteStream } from 'fs';
import {
  getBenchmarkById,
  createExecution,
  createResult,
  getTestSetCaseIds,
  updateExecution
} from '@/lib/db';

// POST /api/benchmarks/:id/start - 启动 benchmark 执行
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

    // 创建新的执行记录
    const execution = createExecution({
      benchmark_id: benchmarkId,
      name: null,
      status: 'running',
      started_at: new Date().toISOString(),
      completed_at: null
    });

    // 解析 agent_ids 和 test_case_ids
    const agentIds = JSON.parse(benchmark.agent_ids) as number[];
    let testCaseIds: number[] = [];

    // 优先从 test_set_id 获取用例
    if (benchmark.test_set_id) {
      testCaseIds = getTestSetCaseIds(benchmark.test_set_id);
    } else if (benchmark.test_case_ids) {
      // 向后兼容
      testCaseIds = JSON.parse(benchmark.test_case_ids) as number[];
    }

    // 为每个 agent × test_case 组合创建结果记录
    for (const agentId of agentIds) {
      for (const testCaseId of testCaseIds) {
        createResult({
          execution_id: execution.id,
          agent_id: agentId,
          test_case_id: testCaseId,
          status: 'pending',
          actual_output: null,
          execution_steps: null,
          execution_answer: null,
          output_file: null,
          execution_time_ms: null,
          error_message: null,
          evaluation_error: null,
          started_at: null,
          completed_at: null
        });
      }
    }

    // 创建日志目录
    const logsDir = join(process.cwd(), 'data', 'logs');
    try {
      mkdirSync(logsDir, { recursive: true });
    } catch {
      // 目录已存在
    }

    // 创建日志文件
    const logFileName = `benchmark_execution_${execution.id}_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    const logFilePath = join(logsDir, logFileName);
    const logStream = createWriteStream(logFilePath, { flags: 'a' });

    console.log(`[Benchmark ${execution.id}] 启动执行，日志文件: ${logFilePath}`);

    // 在后台启动 Python 脚本
    const scriptPath = join(process.cwd(), 'scripts', 'run_benchmark.py');
    const pythonProcess = spawn('python3', [scriptPath, execution.id.toString()], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // 保存进程 ID 到数据库
    if (pythonProcess.pid) {
      updateExecution(execution.id, { pid: pythonProcess.pid });
      console.log(`[Benchmark ${execution.id}] 进程 PID: ${pythonProcess.pid}`);
    }

    // 将 stdout 同时输出到控制台和日志文件
    pythonProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      console.log(`[Benchmark ${execution.id}] ${output}`);
      logStream.write(output);
    });

    // 将 stderr 同时输出到控制台和日志文件
    pythonProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      console.error(`[Benchmark ${execution.id}] ${output}`);
      logStream.write(output);
    });

    // 进程结束时关闭日志流
    pythonProcess.on('close', (code) => {
      const message = `\n[Benchmark ${execution.id}] 进程退出，退出码: ${code}\n`;
      console.log(message);
      logStream.write(message);
      logStream.end();
    });

    pythonProcess.unref();

    return NextResponse.json({
      success: true,
      message: 'Benchmark execution started',
      executionId: execution.id
    });
  } catch (error) {
    console.error('Error starting benchmark execution:', error);
    return NextResponse.json(
      { error: 'Failed to start benchmark execution' },
      { status: 500 }
    );
  }
}
