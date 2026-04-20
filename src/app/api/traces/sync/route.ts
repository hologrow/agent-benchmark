import { NextRequest, NextResponse } from "next/server";
import { syncExecutionTraces, syncAllPendingTraces } from "@/lib/langfuse-sync";

// POST /api/traces/sync - 同步 Langfuse Traces
export async function POST(request: NextRequest) {
  try {
    const { executionId } = await request.json();

    let result;
    if (executionId) {
      // 同步指定 execution 的 traces
      result = await syncExecutionTraces(executionId);
    } else {
      // 同步所有待处理的 traces
      result = await syncAllPendingTraces();
    }

    return NextResponse.json({
      synced: true,
      ...result,
      executionId,
    });
  } catch (error) {
    console.error("Error syncing traces:", error);
    return NextResponse.json(
      { error: "Failed to sync traces", details: String(error) },
      { status: 500 }
    );
  }
}
