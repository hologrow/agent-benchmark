/**
 * Persist execution traces from whichever enabled TRACE_EXECUTION plugin returned hits for
 * magic code + time window. Plugins only implement {@link Capability.TRACE_EXECUTION}; this
 * module handles benchmark DB writes.
 */

import {
  pluginRegistry,
  Capability,
  isTraceExecutionPlugin,
} from "@/lib/plugins";
import { ensureBuiltInPluginsRegistered, loadPluginConfigsFromDatabase } from "@/lib/plugins/loader";
import {
  createExecutionTrace,
  getPendingTraceSyncResults,
  type Result,
} from "@/lib/db";
import type { TraceExecutionPlugin } from "@/lib/plugins/types";

function getLogPrefix(): string {
  return "[ExecutionTrace]";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 单次 list+扫描 Langfuse 的上限，避免单次拉 trace 过久 */
const TRACE_SEARCH_ATTEMPT_TIMEOUT_MS = 25_000;
/** 与评测前 forceSyncTraces 类似：先等 ingest，再带退避重试 */
const TRACE_SYNC_INITIAL_DELAY_MS = 2_000;

/**
 * Refresh registry from DB and return first enabled plugin that exposes TRACE_EXECUTION.
 */
function getEnabledTraceExecutionPlugin(): TraceExecutionPlugin | undefined {
  ensureBuiltInPluginsRegistered();
  loadPluginConfigsFromDatabase();

  const candidates = pluginRegistry.getEnabledPluginsByCapability(
    Capability.TRACE_EXECUTION
  );
  for (const p of candidates) {
    if (isTraceExecutionPlugin(p)) {
      return p;
    }
  }
  return undefined;
}

async function findTraceByMagicAndTime(
  plugin: TraceExecutionPlugin,
  magicCode: string,
  fromTime: Date,
  toTime: Date
): Promise<{ traceId: string; traceContent: string } | null> {
  try {
    console.log(
      `${getLogPrefix()} searchTraces ${fromTime.toISOString()} — ${toTime.toISOString()}`
    );

    const traces = await plugin.searchTraces({
      magicCode,
      fromTime,
      toTime,
    });

    if (traces.length > 0) {
      const trace = traces[0];
      console.log(`${getLogPrefix()} matched trace: ${trace.traceId}`);
      return { traceId: trace.traceId, traceContent: trace.traceContent };
    }

    console.log(
      `${getLogPrefix()} no trace for magic code: ${magicCode}`
    );
    return null;
  } catch (error) {
    console.error(`${getLogPrefix()} searchTraces failed:`, error);
    return null;
  }
}

async function persistTraceForResult(
  result: Result,
  plugin: TraceExecutionPlugin
): Promise<boolean> {
  const magicCode = result.magic_code;
  if (!magicCode) {
    return false;
  }

  const resultId = result.id;

  const startedAt = result.started_at
    ? new Date(result.started_at)
    : new Date(Date.now() - 3600000);
  const completedAt = result.completed_at
    ? new Date(result.completed_at)
    : new Date();

  const fromTime = new Date(startedAt.getTime() - 5 * 60000);
  const toTime = new Date(completedAt.getTime() + 5 * 60000);

  console.log(
    `${getLogPrefix()} [result ${resultId}] magic=${magicCode}`
  );

  const traceResult = await findTraceByMagicAndTime(
    plugin,
    magicCode,
    fromTime,
    toTime
  );

  if (traceResult) {
    try {
      createExecutionTrace({
        result_id: resultId,
        trace_id: traceResult.traceId,
        magic_code: magicCode,
        trace_content: traceResult.traceContent,
      });
      console.log(
        `${getLogPrefix()} [result ${resultId}] stored trace ${traceResult.traceId} (${traceResult.traceContent.length} chars)`
      );
      return true;
    } catch (error) {
      console.error(`${getLogPrefix()} [result ${resultId}] store failed:`, error);
      return false;
    }
  }

  return false;
}

/**
 * For each pending benchmark result under this execution, query the enabled trace plugin
 * (magic code + time window) and store returned trace content locally.
 */
export async function syncExecutionTraces(
  executionId: number
): Promise<{ success: number; failed: number }> {
  console.log(`${getLogPrefix()} sync execution ${executionId}`);

  const plugin = getEnabledTraceExecutionPlugin();
  if (!plugin) {
    console.log(`${getLogPrefix()} no enabled TRACE_EXECUTION plugin`);
    return { success: 0, failed: 0 };
  }

  const pendingResults = getPendingTraceSyncResults(executionId);

  if (pendingResults.length === 0) {
    console.log(`${getLogPrefix()} nothing pending`);
    return { success: 0, failed: 0 };
  }

  console.log(`${getLogPrefix()} pending results: ${pendingResults.length}`);

  let successCount = 0;
  let failedCount = 0;

  for (const result of pendingResults) {
    try {
      const ok = await persistTraceForResult(result, plugin);
      if (ok) successCount++;
      else failedCount++;
    } catch (error) {
      console.error(`${getLogPrefix()} row failed:`, error);
      failedCount++;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(
    `${getLogPrefix()} done: ok ${successCount}, failed ${failedCount}`
  );

  return { success: successCount, failed: failedCount };
}

/**
 * Reserved for global pending sweep; not implemented yet.
 */
export async function syncAllPendingTraces(): Promise<{
  success: number;
  failed: number;
}> {
  console.log(`${getLogPrefix()} syncAllPendingTraces not implemented`);
  return { success: 0, failed: 0 };
}

/**
 * Query the enabled TRACE_EXECUTION plugin for a trace matching magic code
 * and time window (no DB writes). Used by 模拟跑 after a one-off agent run.
 */
export async function fetchTraceByMagicCode(params: {
  magicCode: string;
  startedAt: Date;
  completedAt: Date;
  /** 子进程真实开始时间（如模拟跑 JSON 的 run_started_at），用于收紧 from 边界 */
  traceSpanStart?: Date;
}): Promise<{
  traceId: string;
  traceContent: string;
  traceUrl: string;
} | null> {
  const plugin = getEnabledTraceExecutionPlugin();
  if (!plugin) {
    console.log(`${getLogPrefix()} fetchTraceByMagicCode: no TRACE_EXECUTION plugin`);
    return null;
  }

  const fromBase = params.traceSpanStart ?? params.startedAt;
  const fromTime = new Date(fromBase.getTime() - 5 * 60000);
  const toTime = new Date(params.completedAt.getTime() + 5 * 60000);

  const traces = await plugin.searchTraces({
    magicCode: params.magicCode,
    fromTime,
    toTime,
  });

  if (!traces.length) {
    console.log(
      `${getLogPrefix()} fetchTraceByMagicCode: no trace for ${params.magicCode}`,
    );
    return null;
  }

  const first = traces[0];
  const traceUrl = plugin.getTraceUrl(first.traceId);
  return {
    traceId: first.traceId,
    traceContent: first.traceContent,
    traceUrl,
  };
}

/**
 * 模拟跑 / 即时拉 trace：先短暂等待 Langfuse 索引，再按评测前 forceSyncTraces
 * 的退避节奏多次查询（与 syncExecutionTraces 底层同为 searchTraces，无单独「sync API」）。
 */
export async function fetchTraceByMagicCodeWithBackoff(params: {
  magicCode: string;
  startedAt: Date;
  traceSpanStart?: Date;
  maxRetries?: number;
  initialDelayMs?: number;
}): Promise<{
  traceId: string;
  traceContent: string;
  traceUrl: string;
} | null> {
  const maxRetries = params.maxRetries ?? 5;
  const initialDelayMs = params.initialDelayMs ?? TRACE_SYNC_INITIAL_DELAY_MS;

  await sleep(initialDelayMs);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const hit = await Promise.race([
      fetchTraceByMagicCode({
        magicCode: params.magicCode,
        startedAt: params.startedAt,
        completedAt: new Date(),
        traceSpanStart: params.traceSpanStart,
      }),
      sleep(TRACE_SEARCH_ATTEMPT_TIMEOUT_MS).then(() => null),
    ]);

    if (hit) {
      return hit;
    }

    console.log(
      `${getLogPrefix()} fetchTrace backoff attempt ${attempt}/${maxRetries} miss for ${params.magicCode}`,
    );

    if (attempt < maxRetries) {
      await sleep(1000 * attempt);
    }
  }

  return null;
}
