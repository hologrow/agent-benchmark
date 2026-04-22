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
import { syncExecutionTraces } from '@/lib/execution-trace/orchestrator';

// POST /api/benchmarks/:id/start - start benchmark run
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

    const execution = createExecution({
      benchmark_id: benchmarkId,
      name: null,
      status: 'running',
      started_at: new Date().toISOString(),
      completed_at: null
    });

    const agentIds = JSON.parse(benchmark.agent_ids) as number[];
    let testCaseIds: number[] = [];

    if (benchmark.test_set_id) {
      testCaseIds = getTestSetCaseIds(benchmark.test_set_id);
    } else if (benchmark.test_case_ids) {
      testCaseIds = JSON.parse(benchmark.test_case_ids) as number[];
    }

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
          completed_at: null,
          magic_code: null
        });
      }
    }

    const logsDir = join(process.cwd(), 'data', 'logs');
    try {
      mkdirSync(logsDir, { recursive: true });
    } catch {
      // directory may already exist
    }

    const logFileName = `benchmark_execution_${execution.id}_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    const logFilePath = join(logsDir, logFileName);
    const logStream = createWriteStream(logFilePath, { flags: 'a' });

    console.log(`[Benchmark ${execution.id}] Started; log file: ${logFilePath}`);

    const scriptPath = join(process.cwd(), 'scripts', 'run_benchmark.py');
    const pythonProcess = spawn('python3', [scriptPath, execution.id.toString()], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    if (pythonProcess.pid) {
      updateExecution(execution.id, { pid: pythonProcess.pid });
      console.log(`[Benchmark ${execution.id}] Python PID: ${pythonProcess.pid}`);
    }

    pythonProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      console.log(`[Benchmark ${execution.id}] ${output}`);
      logStream.write(output);
    });

    pythonProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      console.error(`[Benchmark ${execution.id}] ${output}`);
      logStream.write(output);
    });

    pythonProcess.on('close', async (code) => {
      const message = `\n[Benchmark ${execution.id}] Process exited with code ${code}\n`;
      console.log(message);
      logStream.write(message);
      logStream.end();

      if (code === 0) {
        console.log(`[Benchmark ${execution.id}] Run finished; syncing execution traces...`);
        try {
          const syncResult = await syncExecutionTraces(execution.id);
          console.log(`[Benchmark ${execution.id}] Trace sync done:`, syncResult);
        } catch (syncError) {
          console.error(`[Benchmark ${execution.id}] Trace sync failed:`, syncError);
        }

        if (benchmark.evaluator_id) {
          console.log(`[Benchmark ${execution.id}] Triggering evaluation...`);
          try {
            const evalResponse = await fetch(`http://localhost:3000/api/executions/${execution.id}/evaluate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            if (evalResponse.ok) {
              console.log(`[Benchmark ${execution.id}] Evaluation started`);
            } else {
              const errorData = await evalResponse.json();
              console.error(`[Benchmark ${execution.id}] Evaluation start failed:`, errorData);
            }
          } catch (evalError) {
            console.error(`[Benchmark ${execution.id}] Failed to trigger evaluation:`, evalError);
          }
        }
      }
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
