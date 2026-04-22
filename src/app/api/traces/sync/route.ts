import { NextRequest, NextResponse } from "next/server";
import { syncExecutionTraces, syncAllPendingTraces } from "@/lib/execution-trace/orchestrator";

// POST /api/traces/sync - pull traces from enabled trace plugin into DB
export async function POST(request: NextRequest) {
  try {
    const { executionId } = await request.json();

    let result;
    if (executionId) {
      // Sync one execution
      result = await syncExecutionTraces(executionId);
    } else {
      // Sync all pending (batch not implemented)
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
