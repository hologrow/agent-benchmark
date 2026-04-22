import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { getExecutionById, updateExecution, getPendingTraceSyncResults, getIntegrationByType } from '@/lib/db';
import { syncExecutionTraces } from '@/lib/execution-trace/orchestrator';
import { join } from 'path';

/**
 * Sync traces with retries; returns whether all pending rows were cleared.
 */
async function forceSyncTraces(executionId: number, maxRetries = 3): Promise<{
  success: boolean;
  syncResult: { success: number; failed: number };
  pendingCount: number;
}> {
  let lastSyncResult = { success: 0, failed: 0 };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[Evaluate] Execution ${executionId}: trace sync attempt ${attempt}/${maxRetries}...`);

    lastSyncResult = await syncExecutionTraces(executionId);

    const pending = getPendingTraceSyncResults(executionId);

    if (pending.length === 0) {
      console.log(`[Evaluate] Execution ${executionId}: all traces synced`);
      return { success: true, syncResult: lastSyncResult, pendingCount: 0 };
    }

    console.log(`[Evaluate] Execution ${executionId}: ${pending.length} still pending, retrying...`);

    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }

  const finalPending = getPendingTraceSyncResults(executionId);
  return {
    success: false,
    syncResult: lastSyncResult,
    pendingCount: finalPending.length
  };
}

// POST /api/executions/:id/evaluate - start evaluator subprocess
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

    const langfuseIntegration = getIntegrationByType('langfuse');
    const isLangfuseEnabled = langfuseIntegration && langfuseIntegration.enabled === 1;

    let syncResult = { success: 0, failed: 0 };

    if (isLangfuseEnabled) {
      console.log(`[Evaluate] Execution ${executionId}: Langfuse enabled; forcing trace sync before evaluation...`);
      const syncStatus = await forceSyncTraces(executionId, 3);
      syncResult = syncStatus.syncResult;

      if (!syncStatus.success) {
        console.error(`[Evaluate] Execution ${executionId}: trace sync incomplete; blocking evaluation`);
        return NextResponse.json(
          {
            error: 'Trace sync failed or incomplete. Check Langfuse integration and retry.',
            trace_sync: syncResult,
            pending_count: syncStatus.pendingCount,
            message: 'All traces must sync before evaluation. Ensure the trace provider is reachable.'
          },
          { status: 400 }
        );
      }

      console.log(`[Evaluate] Execution ${executionId}: trace sync OK; starting evaluation`);
    } else {
      console.log(`[Evaluate] Execution ${executionId}: Langfuse not enabled; skipping trace sync`);
    }

    updateExecution(executionId, { evaluation_status: 'running' });

    const scriptPath = join(process.cwd(), 'scripts', 'run_evaluator.py');
    const logFile = join(process.cwd(), 'data', `eval_${executionId}.log`);

    const fs = await import('fs');
    const logStream = fs.createWriteStream(logFile, { flags: 'w' });

    const evaluatorProcess = spawn('uv', ['run', 'python3', '-u', scriptPath, executionId.toString()], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

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
      log_file: logFile,
      trace_sync: syncResult
    });
  } catch (error) {
    console.error('Error starting evaluation:', error);
    return NextResponse.json(
      { error: 'Failed to start evaluation' },
      { status: 500 }
    );
  }
}
