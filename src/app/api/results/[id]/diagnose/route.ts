import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
  getDatabase,
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

function getResultDetails(resultId: number): ResultDetails | null {
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

function buildDiagnosisPrompt(result: ResultDetails): string {
  return `Diagnose this benchmark run in depth. Walk through each step and pinpoint where things went wrong.

## Case
- Agent: ${result.agent_name}
- Status: ${result.status}

## Input
${result.test_input}

## Expected output
${result.expected_output}

## Key points
${result.key_points || "(none)"}

## Forbidden points
${result.forbidden_points || "(none)"}

## Actual output
${result.actual_output || "(none)"}

## Parsed answer
${result.execution_answer || "(none)"}

## Execution steps
${result.execution_steps || "(none)"}

## Error message
${result.error_message || "(none)"}

## External trace (e.g. Langfuse)
${result.trace_content || "(no trace)"}

---

Produce a Markdown report with:

### 1. Where it failed
- Failure category (understanding, logic, tool error, timeout, …)
- Which phase broke

### 2. Root cause
- Evidence from the trace
- Suspicious agent behavior patterns
- Config or environment suspects

### 3. Fix recommendations
- Concrete remediation
- Suggestions for the agent or the test case

Use Markdown headings and bullet lists.`;
}

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

// POST /api/results/:id/diagnose — run LLM diagnosis
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const resultId = parseInt(id);

    const body = await request.json().catch(() => ({}));
    const modelId = body.model_id;

    const result = getResultDetails(resultId);
    if (!result) {
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }

    console.log(
      `[Diagnosis] start result_id=${resultId} test=${result.test_id}`,
    );

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

    console.log(`[Diagnosis] model ${model.name} (${model.model_id})`);

    const prompt = buildDiagnosisPrompt(result);

    const modelProvider = createModelProvider(model);

    console.log(`[Diagnosis] calling LLM...`);
    const { text } = await generateText({
      model: modelProvider,
      messages: [
        {
          role: "system",
          content:
            "You are an expert in AI agent benchmarking. Explain why the run diverged from expectations, compare expected vs actual output, and return a structured diagnosis in Markdown.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
    });

    console.log(`[Diagnosis] done, report length ${text.length}`);

    deleteDiagnosisResultByResultId(resultId);

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
    console.error("[Diagnosis] failed:", error);
    return NextResponse.json(
      { error: "Diagnosis failed", details: String(error) },
      { status: 500 },
    );
  }
}

// GET /api/results/:id/diagnose — fetch saved diagnosis
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
