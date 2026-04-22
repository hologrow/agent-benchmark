import "server-only";
/**
 * server instance
   singleton
 */

import { Client, Domain } from "@larksuiteoapi/node-sdk";
import {
  BasePlugin,
  Capability,
  type CapabilityInterfaces,
  type ImportButtonUI,
  type ImportSchemaField,
  type ImportSchemaSource,
  type TestCaseData,
} from "../../";
import type { IPlugin } from "../../types";

interface LarkConfig {
  appId: string;
  appSecret: string;
  appType: "lark" | "feishu";
}

export class LarkPlugin extends BasePlugin {
  private client: Client | null = null;

  // Methods implementing IMPORT_TEST_CASES capability
  getImportButtonUI!: CapabilityInterfaces[Capability.IMPORT_TEST_CASES]["getImportButtonUI"];
  getImportDialog!: CapabilityInterfaces[Capability.IMPORT_TEST_CASES]["getImportDialog"];
  openImportDialog!: CapabilityInterfaces[Capability.IMPORT_TEST_CASES]["openImportDialog"];
  importItems!: CapabilityInterfaces[Capability.IMPORT_TEST_CASES]["importItems"];
  listImportSources!: CapabilityInterfaces[Capability.IMPORT_TEST_CASES]["listImportSources"];
  listImportTables!: CapabilityInterfaces[Capability.IMPORT_TEST_CASES]["listImportTables"];
  listImportFields!: CapabilityInterfaces[Capability.IMPORT_TEST_CASES]["listImportFields"];

  constructor() {
    super({
      id: "lark",
      name: "Lark/Feishu",
      description: "Import test cases from Lark/Feishu Bitable",
      version: "1.0.0",
      author: "Benchmark Platform",
      icon: "/lark.png",
      configFields: [
        {
          name: "appType",
          label: "App Type",
          type: "select",
          required: true,
          defaultValue: "feishu",
          description: "Choose Lark (International) or Feishu (China)",
          options: [
            { label: "Feishu (China)", value: "feishu" },
            { label: "Lark (International)", value: "lark" },
          ],
        },
        {
          name: "appId",
          label: "App ID",
          type: "text",
          required: true,
          description: "Get App ID from Lark/Feishu Developer Console",
        },
        {
          name: "appSecret",
          label: "App Secret",
          type: "password",
          required: true,
          description: "Get App Secret from Lark/Feishu Developer Console",
        },
      ],
      capabilities: [Capability.IMPORT_TEST_CASES],
    });

    // Bind capability methods
    this.getImportButtonUI = this._getImportButtonUI.bind(this);
    this.getImportDialog = this._getImportDialog.bind(this);
    this.openImportDialog = this._openImportDialog.bind(this);
    this.importItems = this._importItems.bind(this);
    this.listImportSources = this._listImportSources.bind(this);
    this.listImportTables = this._listImportTables.bind(this);
    this.listImportFields = this._listImportFields.bind(this);
  }

  /**
   * 服务端路由专用：带集成凭据的 Lark SDK Client；无集成配置时回退 LARK_* / FEISHU_*。
   */
  createBitableSyncClient(): Client {
    const cfg = this.getLarkConfig();
    if (cfg.appId && cfg.appSecret) {
      return this.getClient();
    }
    throw new Error("lark require appSecret  & appid");
  }

  private async _listImportSources(): Promise<ImportSchemaSource[]> {
    return this.listBases();
  }

  private async _listImportTables(
    sourceId: string,
  ): Promise<ImportSchemaSource[]> {
    return this.listTables(sourceId);
  }

  private async _listImportFields(
    sourceId: string,
    tableId: string,
  ): Promise<ImportSchemaField[]> {
    return this.listTableFields(sourceId, tableId);
  }

  private getLarkConfig(): LarkConfig {
    return {
      appType: (this.config.appType as "lark" | "feishu") || "feishu",
      appId: (this.config.appId as string) || "",
      appSecret: (this.config.appSecret as string) || "",
    };
  }

  private getClient(): Client {
    if (!this.client) {
      const config = this.getLarkConfig();
      const domain = config.appType === "lark" ? Domain.Lark : Domain.Feishu;

      this.client = new Client({
        appId: config.appId,
        appSecret: config.appSecret,
        domain,
      });
    }
    return this.client;
  }

  private getBaseUrl(): string {
    const config = this.getLarkConfig();
    return config.appType === "lark"
      ? "https://open.larksuite.com"
      : "https://open.feishu.cn";
  }

  setConfig(config: Record<string, unknown>): void {
    super.setConfig(config);
    // Reset client when config changes
    this.client = null;
  }

  async testConnection(): Promise<{ success: boolean; message?: string }> {
    try {
      const client = this.getClient();
      const response = await client.request({
        method: "POST",
        url: "/open-apis/auth/v3/tenant_access_token/internal",
        data: {
          app_id: this.getLarkConfig().appId,
          app_secret: this.getLarkConfig().appSecret,
        },
      });

      if (response.code === 0) {
        return { success: true, message: "Connection successful" };
      } else {
        return {
          success: false,
          message: `Connection failed: ${response.msg}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ========== IMPORT_TEST_CASES Capability Implementation ==========

  /**
   * Get import button UI definition
   */
  private _getImportButtonUI(): ImportButtonUI {
    const config = this.getLarkConfig();
    const isFeishu = config.appType === "feishu";

    return {
      label: `Import from ${isFeishu ? "Feishu" : "Lark"}`,
      icon: "CloudDownload",
      variant: "outline",
      color: "#3370FF",
    };
  }

  /**
   * Get import dialog definition
   */
  private _getImportDialog() {
    const config = this.getLarkConfig();
    const isFeishu = config.appType === "feishu";

    return {
      title: `Import from ${isFeishu ? "Feishu" : "Lark"}`,
      description: "Select Bitable Base and table to import test cases",
      componentId: "lark-import",
    };
  }

  /**
   * Open import dialog
   */
  private async _openImportDialog(options: {
    onSuccess?: (testCases: TestCaseData[]) => void;
    onError?: (error: string) => void;
    onCancel?: () => void;
  }): Promise<TestCaseData[] | null> {
    void options;
    return null;
  }

  /**
   * Batch import test cases（仅拉取并解析，不落库）。
   * 浏览器 Bitable 向导应走 `/api/plugins/lark` 拉数 + `host.bridge.persistAfterFetch`，或 POST `/api/test-cases/sync` 一站式同步。
   * @param items Format: ["baseId/tableId"]
   */
  private async _importItems(
    items: string[],
    fieldMapping?: Record<string, string>,
  ): Promise<{
    success: boolean;
    importedCount: number;
    testCases: TestCaseData[];
    error?: string;
  }> {
    try {
      const client = this.getClient();
      const allTestCases: TestCaseData[] = [];

      for (const itemId of items) {
        const [baseId, tableId] = itemId.split("/");
        if (!baseId || !tableId) {
          continue;
        }

        const testCases = await this.fetchTableRecords(
          client,
          baseId,
          tableId,
          fieldMapping,
        );
        allTestCases.push(...testCases);
      }

      return {
        success: true,
        importedCount: allTestCases.length,
        testCases: allTestCases,
      };
    } catch (error) {
      return {
        success: false,
        importedCount: 0,
        testCases: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get table records using Lark SDK
   */
  private async fetchTableRecords(
    client: Client,
    baseId: string,
    tableId: string,
    fieldMapping?: Record<string, string>,
  ): Promise<TestCaseData[]> {
    const records: Record<string, unknown>[] = [];
    let hasMore = true;
    let pageToken: string | undefined;

    while (hasMore) {
      const response = await client.bitable.appTableRecord.list({
        path: {
          app_token: baseId,
          table_id: tableId,
        },
        params: {
          page_size: 500,
          page_token: pageToken,
        },
      });

      if (response.code !== 0) {
        throw new Error(
          `Failed to fetch table data: ${response.msg || response.code}`,
        );
      }

      const items = response.data?.items || [];
      records.push(...items);

      hasMore = response.data?.has_more || false;
      pageToken = response.data?.page_token;
    }

    return this.parseRecords(records, fieldMapping);
  }

  /**
   * Parse Lark records to test cases
   */
  private parseRecords(
    records: unknown[],
    fieldMapping?: Record<string, string>,
  ): TestCaseData[] {
    // Default field mapping if not provided
    const mapping = fieldMapping || {
      input: "input",
      expected_output: "expected_output",
      key_points: "key_points",
      forbidden_points: "forbidden_points",
      how: "how",
    };

    return records.map((record: unknown, index: number) => {
      const fields =
        (record as { fields?: Record<string, unknown> }).fields || {};

      // Auto-generate test_id in format TC_001
      const test_id = `TC_${String(index + 1).padStart(3, "0")}`;

      // Get value from fields using mapping
      const getValue = (systemField: string): string => {
        const tableField = mapping[systemField];
        if (tableField && fields[tableField] !== undefined) {
          return String(fields[tableField]);
        }
        // Heuristic: match common EN/CN Bitable column titles
        const fallbacks: Record<string, string[]> = {
          input: ["input", "Input", "问题", "输入", "内容", "Content"],
          expected_output: [
            "expected_output",
            "Expected Output",
            "期望输出",
            "答案",
            "Answer",
          ],
          key_points: ["key_points", "Key Points", "关键点", "要点", "得分点"],
          forbidden_points: [
            "forbidden_points",
            "Forbidden Points",
            "禁止点",
            "扣分点",
          ],
          how: ["how", "How", "方式", "类型", "Category"],
        };
        for (const key of fallbacks[systemField] || []) {
          if (fields[key] !== undefined) {
            return String(fields[key]);
          }
        }
        return "";
      };

      const input = getValue("input");
      const name = input.slice(0, 50);

      return {
        test_id,
        name,
        input,
        expected_output: getValue("expected_output"),
        key_points: getValue("key_points"),
        forbidden_points: getValue("forbidden_points"),
        how: getValue("how"),
      };
    });
  }

  /**
   * Get available Base list using raw API (SDK doesn't support this)
   */
  async listBases(): Promise<Array<{ id: string; name: string }>> {
    const token = await this.getTenantAccessToken();
    const url = `${this.getBaseUrl()}/open-apis/bitable/v1/apps`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Base list: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`Failed to fetch Base list: ${data.msg}`);
    }

    return (data.data?.items || []).map((item: unknown) => ({
      id: (item as { app_token?: string }).app_token || "",
      name: (item as { name?: string }).name || "",
    }));
  }

  /**
   * Get table list in specified Base using Lark SDK
   */
  async listTables(
    baseId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const client = this.getClient();

    const response = await client.bitable.appTable.list({
      path: {
        app_token: baseId,
      },
    });

    if (response.code !== 0) {
      throw new Error(
        `Failed to fetch table list: ${response.msg || response.code}`,
      );
    }

    return (response.data?.items || []).map((item: unknown) => ({
      id: (item as { table_id?: string }).table_id || "",
      name: (item as { name?: string }).name || "",
    }));
  }

  /**
   * Get table fields using Lark SDK
   */
  async listTableFields(
    baseId: string,
    tableId: string,
  ): Promise<Array<{ id: string; name: string; type: string }>> {
    const client = this.getClient();

    const response = await client.bitable.appTableField.list({
      path: {
        app_token: baseId,
        table_id: tableId,
      },
    });

    if (response.code !== 0) {
      throw new Error(
        `Failed to fetch table fields: ${response.msg || response.code}`,
      );
    }

    return (response.data?.items || []).map((item: unknown) => ({
      id: (item as { field_id?: string }).field_id || "",
      name: (item as { field_name?: string }).field_name || "",
      type: (item as { type?: string }).type || "",
    }));
  }

  /**
   * Get tenant access token using raw API
   */
  private async getTenantAccessToken(): Promise<string> {
    const config = this.getLarkConfig();
    const url = `${this.getBaseUrl()}/open-apis/auth/v3/tenant_access_token/internal`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: config.appId,
        app_secret: config.appSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get token: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`Failed to get token: ${data.msg}`);
    }

    return data.tenant_access_token;
  }
}

export const builtInPluginEntry: { id: string; create: () => IPlugin } = {
  id: "lark",
  create: () => new LarkPlugin(),
};

export type * from "./api-types";
