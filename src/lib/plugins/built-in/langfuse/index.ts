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

type LangfuseAgentCredentialEntry = {
  publicKey?: string;
  secretKey?: string;
  baseUrl?: string;
};

export class LangfusePlugin extends BasePlugin {
  /** Key: baseUrl + publicKey + secretKey fingerprint */
  private readonly langfuseClientCache = new Map<string, LangfuseClient>();

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
      capabilities: [Capability.TRACE_EXECUTION],
    });

    // Bind capability methods
    this.searchTraces = this._searchTraces.bind(this);
    this.getTrace = this._getTrace.bind(this);
    this.getTraceUrl = this._getTraceUrl.bind(this);
  }

  private getDefaultLangfuseConfig(): LangfuseConfig {
    return {
      baseUrl: (this.config.baseUrl as string) || "https://cloud.langfuse.com",
      publicKey: (this.config.publicKey as string) || "",
      secretKey: (this.config.secretKey as string) || "",
    };
  }

  private parseAgentCredentialsMap():
    | Record<string, LangfuseAgentCredentialEntry>
    | undefined {
    const rowsRaw = this.config.agentCredentialRows;
    if (Array.isArray(rowsRaw) && rowsRaw.length > 0) {
      const map: Record<string, LangfuseAgentCredentialEntry> = {};
      for (const r of rowsRaw) {
        if (!r || typeof r !== "object") continue;
        const row = r as Record<string, unknown>;
        const idRaw = row.agentId;
        const key =
          typeof idRaw === "number" && Number.isFinite(idRaw)
            ? String(Math.trunc(idRaw))
            : typeof idRaw === "string" && idRaw.trim()
              ? idRaw.trim()
              : "";
        if (!key) continue;
        map[key] = {
          publicKey:
            typeof row.publicKey === "string" ? row.publicKey : undefined,
          secretKey:
            typeof row.secretKey === "string" ? row.secretKey : undefined,
          baseUrl:
            typeof row.baseUrl === "string" ? row.baseUrl : undefined,
        };
      }
      if (Object.keys(map).length > 0) {
        return map;
      }
    }

    /** Legacy: object or JSON string in `agentCredentials` */
    const raw = this.config.agentCredentials;
    if (raw == null || raw === "") return undefined;
    if (typeof raw === "string") {
      const t = raw.trim();
      if (!t) return undefined;
      try {
        const o = JSON.parse(t) as unknown;
        if (o && typeof o === "object" && !Array.isArray(o)) {
          return o as Record<string, LangfuseAgentCredentialEntry>;
        }
      } catch {
        return undefined;
      }
      return undefined;
    }
    if (typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, LangfuseAgentCredentialEntry>;
    }
    return undefined;
  }

  /**
   * Default project keys when agentId omitted; otherwise merge integration
   * `agentCredentials[agentId]` over defaults (per-field fallback).
   */
  private resolveLangfuseConfig(agentId?: number): LangfuseConfig {
    const defaults = this.getDefaultLangfuseConfig();
    if (agentId == null || !Number.isFinite(agentId)) {
      return defaults;
    }
    const map = this.parseAgentCredentialsMap();
    if (!map) return defaults;
    const entry = map[String(agentId)];
    if (!entry || typeof entry !== "object") return defaults;
    return {
      baseUrl:
        typeof entry.baseUrl === "string" && entry.baseUrl.trim()
          ? entry.baseUrl.trim().replace(/\/$/, "")
          : defaults.baseUrl,
      publicKey:
        typeof entry.publicKey === "string" && entry.publicKey
          ? entry.publicKey
          : defaults.publicKey,
      secretKey:
        typeof entry.secretKey === "string" && entry.secretKey
          ? entry.secretKey
          : defaults.secretKey,
    };
  }

  private getClientForResolvedConfig(config: LangfuseConfig): LangfuseClient {
    const key = `${config.baseUrl}\n${config.publicKey}\n${config.secretKey}`;
    let c = this.langfuseClientCache.get(key);
    if (!c) {
      c = new LangfuseClient({
        publicKey: config.publicKey,
        secretKey: config.secretKey,
        baseUrl: config.baseUrl,
      });
      if (this.langfuseClientCache.size > 48) {
        this.langfuseClientCache.clear();
      }
      this.langfuseClientCache.set(key, c);
    }
    return c;
  }

  private getClient(): LangfuseClient {
    return this.getClientForResolvedConfig(
      this.resolveLangfuseConfig(undefined),
    );
  }

  async initialize(): Promise<void> {
    this.getClientForResolvedConfig(this.resolveLangfuseConfig(undefined));
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
    agentId?: number;
    traceContentFormat?: "full" | "tools-only";
  }): Promise<
    Array<{
      traceId: string;
      traceContent: string;
      timestamp?: string;
    }>
  > {
    console.log("search trace by magic code");
    const lfConfig = this.resolveLangfuseConfig(query.agentId);
    const client = this.getClientForResolvedConfig(lfConfig);
    const { magicCode, fromTime, toTime } = query;
    const traceContentFormat = query.traceContentFormat ?? "full";

    if (!magicCode) {
      return [];
    }

    const fromTimeStr = fromTime?.toISOString();
    const toTimeStr = toTime?.toISOString();

    const results: Array<{
      traceId: string;
      traceContent: string;
      timestamp?: string;
    }> = [];

    // 分页拉取：单页 limit=100 时繁忙项目容易漏掉刚写入的 trace（与 benchmark 侧多次 sync 同理）
    const maxPages = 20;
    for (let page = 1; page <= maxPages; page++) {
      const traces = await client.api.trace.list({
        fromTimestamp: fromTimeStr,
        toTimestamp: toTimeStr,
        limit: 100,
        page,
        orderBy: "timestamp.desc",
      });

      const rows = traces.data ?? [];
      if (rows.length === 0) {
        break;
      }

      for (const trace of rows) {
        const inputStr = JSON.stringify(trace.input || "");
        const outputStr = JSON.stringify(trace.output || "");

        if (inputStr.includes(magicCode) || outputStr.includes(magicCode)) {
          const traceContent = await this.fetchTraceContent(
            trace.id,
            traceContentFormat,
            client,
          );
          results.push({
            traceId: trace.id,
            traceContent,
            timestamp: trace.timestamp,
          });
        }
      }

      if (results.length > 0) {
        break;
      }
    }

    return results;
  }

  private async _getTrace(
    traceId: string,
    agentId?: number,
  ): Promise<{ traceId: string; traceContent: string; url?: string } | null> {
    try {
      const lfConfig = this.resolveLangfuseConfig(agentId);
      const client = this.getClientForResolvedConfig(lfConfig);
      const traceContent = await this.fetchTraceContent(traceId, "full", client);
      return {
        traceId,
        traceContent,
        url: this.getTraceUrl(traceId, agentId),
      };
    } catch (error) {
      console.error(`[LangfusePlugin] Failed to get trace ${traceId}:`, error);
      return null;
    }
  }

  private _getTraceUrl(traceId: string, agentId?: number): string {
    const config = this.resolveLangfuseConfig(agentId);
    const base = config.baseUrl.replace(/\/$/, "");
    return `${base}/trace/${traceId}`;
  }

  private async fetchTraceContent(
    traceId: string,
    format: "full" | "tools-only" = "full",
    client: LangfuseClient,
  ): Promise<string> {
    const trace = await client.api.trace.get(traceId);

    const content: string[] = [];

    if (format === "full" && trace.output) {
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
