import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { getExecutionById, updateExecution } from '@/lib/db';
import { join } from 'path';

// POST /api/executions/:id/evaluate - 启动评估任务
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const executionId = parseInt(id);

    const execution = getExecutionById(executionId);
    if (!execution) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      );
    }

    if (execution.status !== 'completed') {
      return NextResponse.json(
        { error: 'Execution must be completed before evaluation' },
        { status: 400 }
      );
    }

    // Update evaluation status to running
    updateExecution(executionId, { evaluation_status: 'running' });

    // Spawn the evaluator script and capture output
    const scriptPath = join(process.cwd(), 'scripts', 'run_evaluator.py');
    const logFile = join(process.cwd(), 'data', `eval_${executionId}.log`);

    // 使用日志文件记录输出
    const fs = await import('fs');
    const logStream = fs.createWriteStream(logFile, { flags: 'w' });

    const evaluatorProcess = spawn('uv', ['run', 'python3', '-u', scriptPath, executionId.toString()], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // 实时记录输出到日志文件和控制台
    evaluatorProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      logStream.write(`[STDOUT] ${output}`);
      console.log(`[Evaluator ${executionId}] ${output.trim()}`);
    });

    evaluatorProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      logStream.write(`[STDERR] ${output}`);
      console.error(`[Evaluator ${executionId}] ${output.trim()}`);
    });

    evaluatorProcess.on('close', (code) => {
      logStream.write(`\n[EXIT] Process exited with code ${code}\n`);
      logStream.end();
      console.log(`[Evaluator ${executionId}] Process exited with code ${code}`);
    });

    evaluatorProcess.unref();

    return NextResponse.json({
      success: true,
      message: 'Evaluation started',
      execution_id: executionId,
      log_file: logFile
    });
  } catch (error) {
    console.error('Error starting evaluation:', error);
    return NextResponse.json(
      { error: 'Failed to start evaluation' },
      { status: 500 }
    );
  }
}
