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

// POST /api/executions/:id/stop - 强制停止执行
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

    // 只有运行中的执行才能停止
    if (execution.status !== 'running') {
      return NextResponse.json(
        { error: 'Execution is not running', currentStatus: execution.status },
        { status: 400 }
      );
    }

    // 获取进程 ID
    const pid = execution.pid;
    if (!pid) {
      return NextResponse.json(
        { error: 'No process ID found for this execution' },
        { status: 400 }
      );
    }

    // 尝试 kill 进程
    let killed = false;
    try {
      // 先尝试优雅地终止 (SIGTERM)
      process.kill(pid, 'SIGTERM');
      killed = true;

      // 等待 2 秒后检查进程是否还在
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 检查进程是否还在运行
      try {
        process.kill(pid, 0); // 信号 0 用于检查进程是否存在
        // 进程还在，强制 kill (SIGKILL)
        process.kill(pid, 'SIGKILL');
        console.log(`[StopExecution] PID ${pid} force killed`);
      } catch (e) {
        // 进程已经终止
        console.log(`[StopExecution] PID ${pid} terminated gracefully`);
      }
    } catch (error) {
      // 如果进程已经不存在，也算成功
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        console.log(`[StopExecution] PID ${pid} already terminated`);
        killed = true;
      } else {
        console.error(`[StopExecution] Failed to kill PID ${pid}:`, error);
        // 尝试使用 shell 命令 kill
        try {
          await execAsync(`kill -9 ${pid}`);
          killed = true;
          console.log(`[StopExecution] PID ${pid} killed via shell`);
        } catch (shellError) {
          console.error(`[StopExecution] Shell kill failed:`, shellError);
        }
      }
    }

    // 更新执行状态为 cancelled
    updateExecution(executionId, {
      status: 'cancelled',
      completed_at: new Date().toISOString()
    });

    // 更新所有 running 状态的结果为 cancelled
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
