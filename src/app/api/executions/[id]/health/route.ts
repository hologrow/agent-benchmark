import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getExecutionById, updateExecution } from '@/lib/db';

const execAsync = promisify(exec);

/**
 * Whether a process id is still alive (cross-platform).
 */
async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      // Windows: tasklist
      const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /NH`);
      return stdout.includes(pid.toString());
    } else {
      // Unix: kill -0 probes existence
      process.kill(pid, 0);
      return true;
    }
  } catch {
    return false;
  }
}

// GET /api/executions/:id/health - worker process health
export async function GET(
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

    // No recorded PID
    if (!execution.pid) {
      return NextResponse.json({
        executionId,
        status: execution.status,
        pid: null,
        processRunning: null,
        healthy: execution.status !== 'running', // running without pid is suspicious
        message: 'No PID recorded for this execution'
      });
    }

    const processRunning = await isProcessRunning(execution.pid);

    if (execution.status === 'running' && !processRunning) {
      updateExecution(executionId, {
        status: 'failed',
        completed_at: new Date().toISOString()
      });

      return NextResponse.json({
        executionId,
        status: 'failed',
        pid: execution.pid,
        processRunning: false,
        healthy: false,
        message: 'Process died unexpectedly',
        autoUpdated: true
      });
    }

    // Consistency: running <=> process alive
    const healthy =
      (execution.status === 'running' && processRunning) ||
      (execution.status !== 'running' && !processRunning);

    return NextResponse.json({
      executionId,
      status: execution.status,
      pid: execution.pid,
      processRunning,
      healthy,
      message: healthy ? 'Status consistent' : 'Status mismatch detected'
    });
  } catch (error) {
    console.error('Error checking execution health:', error);
    return NextResponse.json(
      { error: 'Failed to check execution health' },
      { status: 500 }
    );
  }
}
