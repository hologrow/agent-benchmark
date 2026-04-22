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
