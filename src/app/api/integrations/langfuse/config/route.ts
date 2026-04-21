import { NextResponse } from "next/server";
import { getIntegrationByType } from "@/lib/db";

// GET /api/integrations/langfuse/config - public Langfuse UI URL hints
export async function GET() {
  try {
    const integration = getIntegrationByType("langfuse");

    if (!integration || integration.enabled !== 1) {
      return NextResponse.json(
        { error: "Langfuse integration not configured" },
        { status: 404 }
      );
    }

    const config = JSON.parse(integration.config);
    const baseUrl = config.baseUrl || config.base_url || "https://cloud.langfuse.com";

    return NextResponse.json({
      enabled: true,
      baseUrl: baseUrl.replace(/\/$/, ""), // trim trailing slash
    });
  } catch (error) {
    console.error("Error fetching Langfuse config:", error);
    return NextResponse.json(
      { error: "Failed to fetch config" },
      { status: 500 }
    );
  }
}
