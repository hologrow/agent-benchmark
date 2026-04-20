import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { getExecutionById, updateExecution, getPendingTraceSyncResults, getIntegrationByType } from '@/lib/db';
import { syncExecutionTraces } from '@/lib/langfuse-sync';
import { join } from 'path';

/**
 * 强制同步 traces，带重试机制
 * 返回是否所有 traces 都同步成功
 */
async function forceSyncTraces(executionId: number, maxRetries = 3): Promise<{
  success: boolean;
  syncResult: { success: number; failed: number };
  pendingCount: number;
}> {
  let lastSyncResult = { success: 0, failed: 0 };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[Evaluate] Execution ${executionId}: Trace 同步尝试 ${attempt}/${maxRetries}...`);

    // 执行同步
    lastSyncResult = await syncExecutionTraces(executionId);

    // 检查是否还有未同步的
    const pending = getPendingTraceSyncResults(executionId);

    if (pending.length === 0) {
      console.log(`[Evaluate] Execution ${executionId}: 所有 traces 同步成功`);
      return { success: true, syncResult: lastSyncResult, pendingCount: 0 };
    }

    console.log(`[Evaluate] Execution ${executionId}: 仍有 ${pending.length} 个未同步，准备重试...`);

    // 等待一段时间再重试
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }

  // 重试耗尽，返回失败状态
  const finalPending = getPendingTraceSyncResults(executionId);
  return {
    success: false,
    syncResult: lastSyncResult,
    pendingCount: finalPending.length
  };
}

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

    // 检查是否配置了 Langfuse
    const langfuseIntegration = getIntegrationByType('langfuse');
    const isLangfuseEnabled = langfuseIntegration && langfuseIntegration.enabled === 1;

    let syncResult = { success: 0, failed: 0 };

    // 如果配置了 Langfuse，强制同步 traces（必须在评估前完成）
    if (isLangfuseEnabled) {
      console.log(`[Evaluate] Execution ${executionId}: Langfuse 已启用，开始强制同步 traces...`);
      const syncStatus = await forceSyncTraces(executionId, 3);
      syncResult = syncStatus.syncResult;

      if (!syncStatus.success) {
        console.error(`[Evaluate] Execution ${executionId}: Trace 同步失败，阻止评估执行`);
        return NextResponse.json(
          {
            error: 'Trace 同步失败，请检查 Langfuse 配置或稍后重试',
            trace_sync: syncResult,
            pending_count: syncStatus.pendingCount,
            message: '执行评估前必须完成 Trace 同步，请确保 Langfuse 服务可用后重试'
          },
          { status: 400 }
        );
      }

      console.log(`[Evaluate] Execution ${executionId}: Trace 同步成功，继续执行评估`);
    } else {
      console.log(`[Evaluate] Execution ${executionId}: Langfuse 未启用，跳过 trace 同步`);
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
