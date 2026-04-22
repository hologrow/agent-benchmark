import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  getExecutionById,
  updateExecution,
  getExecutionDetails,
  updateResult
} from '@/lib/db';

const execAsync = promisify(exec);

// POST /api/executions/:id/stop - force-stop running execution
export async function POST(
  request: NextRequest,
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

    // Only a running execution can be stopped
    if (execution.status !== 'running') {
      return NextResponse.json(
        { error: 'Execution is not running', currentStatus: execution.status },
        { status: 400 }
      );
    }

    // Read OS process id
    const pid = execution.pid;
    if (!pid) {
      return NextResponse.json(
        { error: 'No process ID found for this execution' },
        { status: 400 }
      );
    }

    // Terminate child process
    let killed = false;
    try {
      // Graceful stop (SIGTERM)
      process.kill(pid, 'SIGTERM');
      killed = true;

      // Wait then re-check
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        process.kill(pid, 0); // signal 0: probe if process exists
        // Still running — SIGKILL
        process.kill(pid, 'SIGKILL');
        console.log(`[StopExecution] PID ${pid} force killed`);
      } catch {
        // Already gone
        console.log(`[StopExecution] PID ${pid} terminated gracefully`);
      }
    } catch (error) {
      // ESRCH: already dead — treat as success
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        console.log(`[StopExecution] PID ${pid} already terminated`);
        killed = true;
      } else {
        console.error(`[StopExecution] Failed to kill PID ${pid}:`, error);
        // Fallback: shell kill
        try {
          await execAsync(`kill -9 ${pid}`);
          killed = true;
          console.log(`[StopExecution] PID ${pid} killed via shell`);
        } catch (shellError) {
          console.error(`[StopExecution] Shell kill failed:`, shellError);
        }
      }
    }

    // Mark execution cancelled
    updateExecution(executionId, {
      status: 'cancelled',
      completed_at: new Date().toISOString()
    });

    // Cancel any result rows still marked running
    const details = getExecutionDetails(executionId);
    let cancelledResultsCount = 0;
    if (details && details.results) {
      for (const result of details.results as Array<{ id: number; status: string; error_message: string | null }>) {
        if (result.status === 'running') {
          updateResult(result.id, {
            status: 'cancelled',
            completed_at: new Date().toISOString(),
            error_message: result.error_message || 'Execution was manually stopped'
          });
          cancelledResultsCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Execution stopped',
      pid: pid,
      processKilled: killed,
      executionId: executionId,
      cancelledResultsCount: cancelledResultsCount
    });
  } catch (error) {
    console.error('Error stopping execution:', error);
    return NextResponse.json(
      { error: 'Failed to stop execution', details: String(error) },
      { status: 500 }
    );
  }
}
