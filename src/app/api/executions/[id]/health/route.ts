import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getExecutionById, updateExecution } from '@/lib/db';

const execAsync = promisify(exec);

/**
 * 检查进程是否存在（跨平台）
 * @param pid 进程ID
 * @returns 进程是否存在
 */
async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      // Windows: 使用 tasklist
      const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /NH`);
      return stdout.includes(pid.toString());
    } else {
      // Unix/Linux/Mac: 使用 kill -0 (不发送信号，只检查进程是否存在)
      process.kill(pid, 0);
      return true;
    }
  } catch {
    return false;
  }
}

// GET /api/executions/:id/health - 检查执行进程健康状态
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

    // 如果没有 PID，返回未知状态
    if (!execution.pid) {
      return NextResponse.json({
        executionId,
        status: execution.status,
        pid: null,
        processRunning: null,
        healthy: execution.status !== 'running', // 没有PID但状态是running，可能有问题
        message: 'No PID recorded for this execution'
      });
    }

    // 检查进程是否在运行
    const processRunning = await isProcessRunning(execution.pid);

    // 如果数据库状态是 running 但进程已不存在，说明进程异常退出
    if (execution.status === 'running' && !processRunning) {
      // 自动更新状态为 failed
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

    // 状态一致性检查
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
