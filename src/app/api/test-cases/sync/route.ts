import type { NextRequest } from "next/server";
import {
  handleTestCasesSyncGET,
  handleTestCasesSyncPOST,
} from "@/lib/api-handlers/test-cases-sync";

/** Legacy external-table → DB sync. Requires `pluginId` (query / JSON body). */
export async function GET(request: NextRequest) {
  return handleTestCasesSyncGET(request);
}

export async function POST(request: NextRequest) {
  return handleTestCasesSyncPOST(request);
}
