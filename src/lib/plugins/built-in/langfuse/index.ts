/**
 * Langfuse Plugin
 *
 * Provides Trace tracking capability
 */

import { LangfuseClient } from "@langfuse/client";
import { BasePlugin, Capability, type CapabilityInterfaces } from "../../";
import type { IPlugin } from "../../types";

interface LangfuseConfig {
  baseUrl: string;
  publicKey: string;
  secretKey: string;
}

export class LangfusePlugin extends BasePlugin {
  private client: LangfuseClient | null = null;

  // Methods implementing TRACE_EXECUTION capability
  searchTraces!: CapabilityInterfaces[Capability.TRACE_EXECUTION]["searchTraces"];
  getTrace!: CapabilityInterfaces[Capability.TRACE_EXECUTION]["getTrace"];
  getTraceUrl!: CapabilityInterfaces[Capability.TRACE_EXECUTION]["getTraceUrl"];

  constructor() {
    super({
      id: "langfuse",
      name: "Langfuse",
      description:
        "Langfuse Trace tracking service for monitoring and analyzing AI Agent execution",
      version: "1.0.0",
      author: "Benchmark Platform",
      icon: "/langfuse.png",
      configFields: [
        {
          name: "baseUrl",
          label: "Base URL",
          type: "url",
          required: true,
          defaultValue: "https://cloud.langfuse.com",
          description:
            "Langfuse service URL, keep default for cloud version, use custom domain for self-hosted",
        },
        {
          name: "publicKey",
          label: "Public Key",
          type: "text",
          required: true,
          placeholder: "pk-lf-...",
          description: "Get Public Key from Langfuse project settings",
        },
        {
          name: "secretKey",
          label: "Secret Key",
          type: "password",
          required: true,
          placeholder: "sk-lf-...",
          description: "Get Secret Key from Langfuse project settings",
        },
      ],
      capabilities: [Capability.TRACE_EXECUTION],
    });

    // Bind capability methods
    this.searchTraces = this._searchTraces.bind(this);
    this.getTrace = this._getTrace.bind(this);
    this.getTraceUrl = this._getTraceUrl.bind(this);
  }

  private getLangfuseConfig(): LangfuseConfig {
    return {
      baseUrl: (this.config.baseUrl as string) || "https://cloud.langfuse.com",
      publicKey: (this.config.publicKey as string) || "",
      secretKey: (this.config.secretKey as string) || "",
    };
  }

  private getClient(): LangfuseClient {
    if (!this.client) {
      const config = this.getLangfuseConfig();
      this.client = new LangfuseClient({
        publicKey: config.publicKey,
        secretKey: config.secretKey,
        baseUrl: config.baseUrl,
      });
    }
    return this.client;
  }

  async initialize(): Promise<void> {
    const config = this.getLangfuseConfig();
    this.client = new LangfuseClient({
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      baseUrl: config.baseUrl,
    });
  }

  async testConnection(): Promise<{ success: boolean; message?: string }> {
    try {
      const client = this.getClient();
      const health = await client.api.health.health();
      return {
        success: true,
        message: `Connection successful, Langfuse version: ${health.version}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ========== TRACE_EXECUTION Capability Implementation ==========

  private async _searchTraces(query: {
    magicCode?: string;
    executionId?: number;
    fromTime?: Date;
    toTime?: Date;
  }): Promise<
    Array<{
      traceId: string;
      traceContent: string;
      timestamp?: string;
    }>
  > {
    const client = this.getClient();
    const { magicCode, fromTime, toTime } = query;

    if (!magicCode) {
      return [];
    }

    const fromTimeStr = fromTime?.toISOString();
    const toTimeStr = toTime?.toISOString();

    // Get traces list
    const traces = await client.api.trace.list({
      fromTimestamp: fromTimeStr,
      toTimestamp: toTimeStr,
      limit: 100,
    });

    const results: Array<{
      traceId: string;
      traceContent: string;
      timestamp?: string;
    }> = [];

    // Iterate traces to find those containing magic_code
    for (const trace of traces.data) {
      const inputStr = JSON.stringify(trace.input || "");
      const outputStr = JSON.stringify(trace.output || "");

      if (inputStr.includes(magicCode) || outputStr.includes(magicCode)) {
        const traceContent = await this.fetchTraceContent(trace.id);
        results.push({
          traceId: trace.id,
          traceContent,
          timestamp: trace.timestamp,
        });
      }
    }

    return results;
  }

  private async _getTrace(
    traceId: string,
  ): Promise<{ traceId: string; traceContent: string; url?: string } | null> {
    try {
      const traceContent = await this.fetchTraceContent(traceId);
      return {
        traceId,
        traceContent,
        url: this.getTraceUrl(traceId),
      };
    } catch (error) {
      console.error(`[LangfusePlugin] Failed to get trace ${traceId}:`, error);
      return null;
    }
  }

  private _getTraceUrl(traceId: string): string {
    const config = this.getLangfuseConfig();
    return `${config.baseUrl}/trace/${traceId}`;
  }

  private async fetchTraceContent(traceId: string): Promise<string> {
    const client = this.getClient();
    const trace = await client.api.trace.get(traceId);

    const content: string[] = [];

    if (trace.output) {
      content.push("--- Real Output ---");
      content.push(
        typeof trace.output === "object"
          ? JSON.stringify(trace.output, null, 2)
          : String(trace.output),
      );
      content.push("");
    }

    // Add observations
    const rawObservations = ((trace as { observations?: unknown[] })
      .observations || []) as {
      id?: string;
      name?: string;
      type?: string;
      input?: unknown;
      output?: unknown;
      startTime?: string;
      endTime?: string;
    }[];

    // only trace tool call
    // type: "GENERATION", "SPAN", "EVENT", "AGENT", "TOOL", "CHAIN", "RETRIEVER", "EVALUATOR", "EMBEDDING", "GUARDRAIL"
    const observations = rawObservations.filter((item) => {
      return item.type === "TOOL";
    });

    if (observations.length > 0) {
      for (let i = 0; i < observations.length; i++) {
        const obs = observations[i];
        content.push(
          `\nStep ${i + 1} [${obs.type || "N/A"}]: ${obs.name || "N/A"}`,
        );
        if (obs.startTime) content.push(`  Start: ${obs.startTime}`);
        if (obs.endTime) content.push(`  End: ${obs.endTime}`);
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
  }
}

export const builtInPluginEntry: { id: string; create: () => IPlugin } = {
  id: "langfuse",
  create: () => new LangfusePlugin(),
};
