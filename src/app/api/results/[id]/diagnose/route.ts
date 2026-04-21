import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
  getModelById,
  getDefaultModel,
  getDiagnosisResultByResultId,
  createDiagnosisResult,
  deleteDiagnosisResultByResultId,
  type Result,
  type Model,
} from "@/lib/db";

interface ResultDetails extends Result {
  agent_name: string;
  test_id: string;
  test_case_name: string;
  test_input: string;
  expected_output: string;
  key_points: string;
  forbidden_points: string;
  trace_content: string | null;
}

/**
 * 获取测试结果详情（包含关联信息）
 */
function getResultDetails(resultId: number): ResultDetails | null {
  const { getDatabase } = require("@/lib/db");
  const db = getDatabase();

  const result = db
    .prepare(
      `
    SELECT
      br.*,
      a.name as agent_name,
      tc.test_id,
      tc.name as test_case_name,
      tc.input as test_input,
      tc.expected_output,
      tc.key_points,
      tc.forbidden_points,
      et.trace_content
    FROM benchmark_results br
    JOIN agents a ON br.agent_id = a.id
    JOIN test_cases tc ON br.test_case_id = tc.id
    LEFT JOIN execution_traces et ON et.result_id = br.id
    WHERE br.id = ?
  `,
    )
    .get(resultId);

  if (!result) return null;
  return result as ResultDetails;
}

/**
 * 构建诊断提示词
 */
function buildDiagnosisPrompt(result: ResultDetails): string {
  return `请对以下测试用例执行情况进行深入诊断分析，仔细核对每一个执行步骤，发现异常出现在哪里。

## 测试用例信息
- Agent: ${result.agent_name}
- 执行状态: ${result.status}

## 输入
${result.test_input}

## 期望输出
${result.expected_output}

## 关键测试点
${result.key_points || "无"}

## 禁止点
${result.forbidden_points || "无"}

## 实际输出
${result.actual_output || "无输出"}

## 执行答案（解析后）
${result.execution_answer || "无"}

## 执行步骤
${result.execution_steps || "无"}

## 错误信息
${result.error_message || "无"}

## Langfuse Trace
${result.trace_content || "无 Trace 数据"}

---

请提供详细的诊断报告，包含以下内容：

### 1. 问题定位
- 失败类型（如：理解错误、逻辑错误、工具调用失败、超时等）
- 具体在哪个环节出现问题

### 2. 根因分析
- 从 Trace 中发现的异常或问题
- Agent 行为的异常模式
- 可能的配置或环境问题

### 3. 修复建议
- 如何修复此问题
- 对 Agent 或测试用例的改进建议

请使用 Markdown 格式输出诊断报告。`;
}

/**
 * 根据模型配置创建 AI SDK provider
 */
function createModelProvider(model: Model) {
  const provider = model.provider;
  const modelId = model.model_id;

  if (provider === "anthropic") {
    const anthropic = createAnthropic({
      apiKey: model.api_key || undefined,
    });
    return anthropic(modelId);
  }

  // OpenAI 和 OpenRouter 使用 openai provider
  const openai = createOpenAI({
    apiKey: model.api_key || undefined,
    baseURL: model.base_url || undefined,
  });
  return openai(modelId);
}

// POST /api/results/:id/diagnose - 执行诊断
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const resultId = parseInt(id);

    // 获取请求体中的可选 model_id
    const body = await request.json().catch(() => ({}));
    const modelId = body.model_id;

    // 获取测试结果详情
    const result = getResultDetails(resultId);
    if (!result) {
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }

    console.log(
      `[Diagnosis] 开始诊断 result_id=${resultId}, test=${result.test_id}`,
    );

    // 获取模型配置
    let model: Model | undefined;
    if (modelId) {
      model = getModelById(modelId);
    }
    if (!model) {
      model = getDefaultModel();
    }

    if (!model) {
      return NextResponse.json(
        { error: "No model available. Please configure a model first." },
        { status: 400 },
      );
    }

    if (!model.api_key) {
      return NextResponse.json(
        { error: "Model API key not configured" },
        { status: 400 },
      );
    }

    console.log(`[Diagnosis] 使用模型: ${model.name} (${model.model_id})`);

    // 构建诊断提示词
    const prompt = buildDiagnosisPrompt(result);

    // 调用 AI SDK 进行诊断
    const modelProvider = createModelProvider(model);

    console.log(`[Diagnosis] 调用 LLM 分析中...`);
    const { text } = await generateText({
      model: modelProvider,
      messages: [
        {
          role: "system",
          content:
            "你是一位专业的 AI Agent 测试分析专家。你的任务是分析测试用例执行失败的原因，找出期望输出和实际输出之间的差异，并提供详细的诊断报告。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
    });

    console.log(`[Diagnosis] 诊断完成，报告长度: ${text.length} 字符`);

    // 删除旧的诊断结果
    deleteDiagnosisResultByResultId(resultId);

    // 保存新的诊断结果
    const diagnosisResult = createDiagnosisResult({
      result_id: resultId,
      diagnosis_report: text,
      model_id: model.id,
    });

    return NextResponse.json({
      success: true,
      diagnosis_report: text,
      model_id: model.id,
      model_name: model.name,
      created_at: diagnosisResult.created_at,
    });
  } catch (error) {
    console.error("[Diagnosis] 诊断失败:", error);
    return NextResponse.json(
      { error: "Diagnosis failed", details: String(error) },
      { status: 500 },
    );
  }
}

// GET /api/results/:id/diagnose - 获取诊断结果
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const resultId = parseInt(id);

    const diagnosis = getDiagnosisResultByResultId(resultId);

    if (!diagnosis) {
      return NextResponse.json(
        { error: "Diagnosis not found" },
        { status: 404 },
      );
    }

    // 获取模型信息
    const model = diagnosis.model_id ? getModelById(diagnosis.model_id) : null;

    return NextResponse.json({
      diagnosis_report: diagnosis.diagnosis_report,
      model_id: diagnosis.model_id,
      model_name: model?.name || "Unknown",
      created_at: diagnosis.created_at,
    });
  } catch (error) {
    console.error("Error fetching diagnosis:", error);
    return NextResponse.json(
      { error: "Failed to fetch diagnosis" },
      { status: 500 },
    );
  }
}
