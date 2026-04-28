import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { getAgentById, getDefaultModel, type Model } from "@/lib/db";
import { fetchTraceByMagicCodeWithBackoff } from "@/lib/execution-trace/orchestrator";

const execFileAsync = promisify(execFile) as (
  command: string,
  args: readonly string[] | undefined,
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    maxBuffer?: number;
    encoding: "utf8";
    timeout?: number;
  },
) => Promise<{ stdout: string; stderr: string }>;

function createModelProvider(model: Model) {
  const provider = model.provider;
  const modelId = model.model_id;

  if (provider === "anthropic") {
    const anthropic = createAnthropic({
      apiKey: model.api_key || undefined,
    });
    return anthropic(modelId);
  }

  const openai = createOpenAI({
    apiKey: model.api_key || undefined,
    baseURL: model.base_url || undefined,
  });
  return openai(modelId);
}

const SUMMARY_TIMEOUT_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function summarizeTraceZh(
  traceContent: string,
  model: Model,
): Promise<string> {
  const clipped =
    traceContent.length > 16000
      ? `${traceContent.slice(0, 16000)}\n…(truncated)`
      : traceContent;
  const modelProvider = createModelProvider(model);
  const { text } = await Promise.race([
    generateText({
      model: modelProvider,
      messages: [
        {
          role: "system",
          content:
            "你是分析如何完成完成一件事的AI助手。描述这个trace是如何完成任务的，使用非技术语言, 精炼，非细节，总结工具的使用; 根据工具的使用生成一份精炼的教程，例如'1. 使用某工具获取A，2. 调用某工具获取B, 3. 结合A，B得到C'。这里假设所有工具都会使用，教程里不包含工具的使用教程，仅包含使用哪些工具完成什么样的任务；重要! 仅输出精炼教程",
        },
        {
          role: "user",
          content: clipped,
        },
      ],
      temperature: 0.2,
    }),
    sleep(SUMMARY_TIMEOUT_MS).then(() => {
      throw new Error("trace summary timeout");
    }),
  ]);
  return text.trim();
}

type SimulationPayload = Record<string, unknown>;

function parseSimulationStdout(stdout: string): SimulationPayload {
  return JSON.parse(stdout.trim()) as SimulationPayload;
}

function parseOptionalIso(v: unknown): Date | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function pullTraceAndSummary(
  agentId: number,
  run: SimulationPayload,
  startedAt: Date,
): Promise<{
  trace: { traceId: string; traceContent: string; traceUrl: string } | null;
  traceSummary: string | null;
}> {
  const magicCode = typeof run.magic_code === "string" ? run.magic_code : null;
  let trace: {
    traceId: string;
    traceContent: string;
    traceUrl: string;
  } | null = null;
  if (magicCode) {
    const traceSpanStart = parseOptionalIso(run.run_started_at);
    trace = await fetchTraceByMagicCodeWithBackoff({
      magicCode,
      startedAt,
      traceSpanStart,
      traceContentFormat: "tools-only",
      agentId,
    });
  }

  let traceSummary: string | null = null;
  const model = getDefaultModel();
  if (trace?.traceContent && model?.api_key) {
    try {
      traceSummary = await summarizeTraceZh(trace.traceContent, model);
    } catch {
      traceSummary = null;
    }
  }

  return { trace, traceSummary };
}

// POST /api/simulation-run — run one agent with a free-form question (模拟跑)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const agentId = Number(body.agentId);
    const question = typeof body.question === "string" ? body.question : "";

    if (!Number.isFinite(agentId) || agentId <= 0) {
      return NextResponse.json({ error: "invalid agentId" }, { status: 400 });
    }
    if (!question.trim()) {
      return NextResponse.json(
        { error: "question is required" },
        { status: 400 },
      );
    }
    if (!getAgentById(agentId)) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const scriptPath = join(process.cwd(), "scripts", "run_simulation.py");
    const startedAt = new Date();

    let stdout: string;
    try {
      const out = await execFileAsync(
        "python3",
        [scriptPath, String(agentId), question],
        {
          cwd: process.cwd(),
          env: { ...process.env },
          maxBuffer: 50 * 1024 * 1024,
          encoding: "utf8",
          timeout: 320_000,
        },
      );
      stdout = out.stdout;
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException & {
        stdout?: string;
        stderr?: string;
      };
      if (e.code === "ETIMEDOUT") {
        return NextResponse.json(
          { error: "Simulation timed out" },
          { status: 504 },
        );
      }
      const raw = typeof e.stdout === "string" ? e.stdout.trim() : "";
      if (raw) {
        try {
          const run = parseSimulationStdout(raw);
          const { trace, traceSummary } = await pullTraceAndSummary(
            agentId,
            run,
            startedAt,
          );
          return NextResponse.json({ run, trace, traceSummary });
        } catch {
          // fall through
        }
      }
      console.error("[simulation-run]", err);
      return NextResponse.json(
        { error: "Simulation failed", details: String(err) },
        { status: 500 },
      );
    }

    let run: SimulationPayload;
    try {
      run = parseSimulationStdout(stdout);
    } catch {
      return NextResponse.json(
        { error: "Invalid simulation output" },
        { status: 500 },
      );
    }

    const { trace, traceSummary } = await pullTraceAndSummary(
      agentId,
      run,
      startedAt,
    );
    return NextResponse.json({ run, trace, traceSummary });
  } catch (error) {
    console.error("[simulation-run]", error);
    return NextResponse.json(
      { error: "Simulation failed", details: String(error) },
      { status: 500 },
    );
  }
}
