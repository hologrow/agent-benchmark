/**
 * Langfuse Trace 同步服务
 * 用于根据 magic code 从 Langfuse 搜索 trace 并记录到数据库
 */

import { LangfuseClient } from "@langfuse/client";
import {
  getIntegrationByType,
  getPendingTraceSyncResults,
  createExecutionTrace,
  type Result,
} from "./db";

interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
}

/**
 * 获取 Langfuse 配置
 */
function getLangfuseConfig(): LangfuseConfig | null {
  const integration = getIntegrationByType("langfuse");

  if (!integration || integration.enabled !== 1) {
    return null;
  }

  try {
    const config = JSON.parse(integration.config);
    return {
      publicKey: config.publicKey || config.public_key,
      secretKey: config.secretKey || config.secret_key,
      baseUrl:
        config.baseUrl || config.base_url || "https://cloud.langfuse.com",
    };
  } catch {
    return null;
  }
}

/**
 * 搜索包含 magic code 的 trace
 */
async function searchTraceByMagicCode(
  magicCode: string,
  client: LangfuseClient,
  fromTime: Date,
  toTime: Date,
): Promise<{ traceId: string; traceContent: string } | null> {
  try {
    const fromTimeStr = fromTime.toISOString();
    const toTimeStr = toTime.toISOString();

    console.log(`[LangfuseSync] 搜索时间范围: ${fromTimeStr} - ${toTimeStr}`);

    // 获取 traces 列表
    const traces = await client.api.trace.list({
      fromTimestamp: fromTimeStr,
      toTimestamp: toTimeStr,
      limit: 100,
    });

    // 遍历 traces 查找包含 magic_code 的
    for (const trace of traces.data) {
      const inputStr = JSON.stringify(trace.input || "");
      if (inputStr.includes(magicCode)) {
        console.log(`[LangfuseSync] 找到匹配 trace: ${trace.id}`);
        const traceContent = await fetchTraceContent(trace.id, client);
        return { traceId: trace.id, traceContent };
      }

      const outputStr = JSON.stringify(trace.output || "");
      if (outputStr.includes(magicCode)) {
        console.log(`[LangfuseSync] 找到匹配 trace: ${trace.id}`);
        const traceContent = await fetchTraceContent(trace.id, client);
        return { traceId: trace.id, traceContent };
      }
    }

    console.log(`[LangfuseSync] 未找到包含 magic code 的 trace: ${magicCode}`);
    return null;
  } catch (error) {
    console.error("[LangfuseSync] 搜索 trace 失败:", error);
    return null;
  }
}

/**
 * 获取 trace 完整内容
 */
async function fetchTraceContent(
  traceId: string,
  client: LangfuseClient,
): Promise<string> {
  try {
    // 获取 trace 详情（包含 observations）
    const trace = await client.api.trace.get(traceId);

    // 构建 trace 内容
    const content: string[] = [];

    // 添加 observations（执行链路）
    const rawobservations = ((trace as { observations?: unknown[] })
      .observations || []) as {
      id?: string;
      name?: string;
      type?: string;
      input?: unknown;
      output?: unknown;
      startTime?: string;
      endTime?: string;
    }[];

    const observations = rawobservations.filter((item) => {
      //  "GENERATION", "SPAN", "EVENT", "AGENT", "TOOL", "CHAIN", "RETRIEVER", "EVALUATOR", "EMBEDDING", "GUARDRAIL"
      // 只保留tool call
      return item.type === "TOOL";
    });

    if (observations.length > 0) {
      for (let i = 0; i < observations.length; i++) {
        const obs = observations[i];

        content.push(
          `\nStep ${i + 1} [${obs.type || "N/A"}]: ${obs.name || "N/A"}`,
        );
        if (obs.input) {
          const inputStr =
            typeof obs.input === "object"
              ? JSON.stringify(obs.input, null, 2)
              : String(obs.input);
          content.push(
            `  Input:\n${inputStr
              .split("\n")
              .map((l) => "    " + l)
              .join("\n")}`,
          );
        }
        if (obs.output) {
          const outputStr =
            typeof obs.output === "object"
              ? JSON.stringify(obs.output, null, 2)
              : String(obs.output);
          content.push(
            `  Output:\n${outputStr
              .split("\n")
              .map((l) => "    " + l)
              .join("\n")}`,
          );
        }
      }
      content.push("");
    }

    return content.join("\n");
  } catch (error) {
    console.error(`[LangfuseSync] 获取 trace ${traceId} 内容失败:`, error);
    return "";
  }
}

/**
 * 同步单个结果的 trace
 */
async function syncSingleResult(
  result: Result,
  client: LangfuseClient,
): Promise<boolean> {
  const magicCode = result.magic_code;
  if (!magicCode) {
    return false;
  }

  const resultId = result.id;

  // 计算搜索时间范围
  const startedAt = result.started_at
    ? new Date(result.started_at)
    : new Date(Date.now() - 3600000);
  const completedAt = result.completed_at
    ? new Date(result.completed_at)
    : new Date();

  const fromTime = new Date(startedAt.getTime() - 5 * 60000); // 开始前5分钟
  const toTime = new Date(completedAt.getTime() + 5 * 60000); // 结束后5分钟

  console.log(`[LangfuseSync] [${resultId}] 同步中... Magic: ${magicCode}`);

  const traceResult = await searchTraceByMagicCode(
    magicCode,
    client,
    fromTime,
    toTime,
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
        `[LangfuseSync] [${resultId}] 同步成功: ${traceResult.traceId}, 内容长度: ${traceResult.traceContent.length}`,
      );
      return true;
    } catch (error) {
      console.error(`[LangfuseSync] [${resultId}] 保存 trace 失败:`, error);
      return false;
    }
  }

  return false;
}

/**
 * 同步指定 execution 的 traces
 */
export async function syncExecutionTraces(
  executionId: number,
): Promise<{ success: number; failed: number }> {
  console.log(`[LangfuseSync] 开始同步 Execution ${executionId} 的 traces`);

  // 获取 Langfuse 配置
  const config = getLangfuseConfig();
  if (!config) {
    console.log("[LangfuseSync..] 未找到启用的 Langfuse 配置");
    return { success: 0, failed: 0 };
  }

  // 创建 Langfuse 客户端
  const client = new LangfuseClient({
    publicKey: config.publicKey,
    secretKey: config.secretKey,
    baseUrl: config.baseUrl,
  });

  // 获取待同步的结果
  const pendingResults = getPendingTraceSyncResults(executionId);

  if (pendingResults.length === 0) {
    console.log("[LangfuseSync] 没有待同步的结果");
    return { success: 0, failed: 0 };
  }

  console.log(`[LangfuseSync] 找到 ${pendingResults.length} 个待同步的结果`);

  let successCount = 0;
  let failedCount = 0;

  for (const result of pendingResults) {
    try {
      const success = await syncSingleResult(result, client);
      if (success) {
        successCount++;
      } else {
        failedCount++;
      }
    } catch (error) {
      console.error(`[LangfuseSync] 同步失败:`, error);
      failedCount++;
    }

    // 避免请求过快
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(
    `[LangfuseSync] 同步完成: 成功 ${successCount}, 失败 ${failedCount}`,
  );

  return { success: successCount, failed: failedCount };
}

/**
 * 同步所有未关联 trace 的 completed 结果
 */
export async function syncAllPendingTraces(): Promise<{
  success: number;
  failed: number;
}> {
  console.log("[LangfuseSync] 开始同步所有待处理的 traces");

  // 获取 Langfuse 配置
  const config = getLangfuseConfig();
  if (!config) {
    console.log("[LangfuseSync] 未找到启用的 Langfuse 配置");
    return { success: 0, failed: 0 };
  }

  // 这里需要实现获取所有待同步结果的方法
  // 暂时返回空结果
  console.log("[LangfuseSync] 批量同步暂未实现");
  return { success: 0, failed: 0 };
}
