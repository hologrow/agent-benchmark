/**
 * Plugin System Type Definitions - Capability Mode
 *
 * Design Principles:
 * 1. Plugins are generic, not categorized by type
 * 2. Each plugin can implement one or more capabilities
 * 3. Core system discovers and uses plugin features through capability queries
 * 4. Plugins and core are fully decoupled, core only depends on capability interfaces
 */

/**
 * Capability Type Enum - Defines all capabilities supported by the system
 */
export enum Capability {
  // Data import capability - Provides test case import button and processing logic
  IMPORT_TEST_CASES = "import:test-cases",
  /**
   * Execution trace provider: must be able to find traces by magic code and time range
   * (see {@link CapabilityInterfaces}[TRACE_EXECUTION].searchTraces).
   */
  TRACE_EXECUTION = "trace:execution",
  // Data export capability
  EXPORT_RESULTS = "export:results",
  // Notification capability
  NOTIFY = "notify",
  // Custom evaluation capability
  CUSTOM_EVALUATION = "evaluation:custom",
}

/**
 * Capability Interface Definitions Map
 * Each capability corresponds to an interface, plugins implement the corresponding interface to provide that capability
 */
/**
 * Import Button UI Definition
 */
export interface ImportButtonUI {
  /** Button text */
  label: string;
  /** Button icon (Lucide icon name) */
  icon: string;
  /** Button style variant */
  variant?: "default" | "outline" | "secondary" | "ghost";
  /** Button color */
  color?: string;
}

/**
 * Import Dialog Definition
 * Plugins provide a component identifier that the frontend uses to render the dialog
 */
export interface ImportDialogDefinition {
  /** Dialog title */
  title: string;
  /** Dialog description */
  description?: string;
  /** Component identifier - frontend maps this to actual component */
  componentId: string;
}

/**
 * Test Case Data Structure
 */
export interface TestCaseData {
  test_id: string;
  name: string;
  input: string;
  expected_output: string;
  key_points?: string;
  forbidden_points?: string;
  how?: string;
}

/** Generic row for import wizard (e.g. Bitable base, table). */
export interface ImportSchemaSource {
  id: string;
  name: string;
}

/** Field descriptor for column mapping in import wizard. */
export interface ImportSchemaField {
  id: string;
  name: string;
  type: string;
}

/** Legacy Bitable → DB sync (optional capability for import plugins). */
export interface LegacySyncSystemField {
  key: string;
  label: string;
  required: boolean;
}

export interface LegacySyncCatalogQuery {
  appToken: string;
  tableId?: string;
}

export interface LegacySyncCatalogResult {
  tables?: Array<{ tableId: string; name: string }>;
  fields?: Array<{ fieldId: string; fieldName: string; type: unknown }>;
  systemFields?: LegacySyncSystemField[];
  error?: string;
  code?: number;
  isPermissionError?: boolean;
  permissionHint?: string;
}

export interface SyncTestCasesToDatabaseResult {
  success: boolean;
  stats: {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  testSet: {
    id: number;
    name: string;
    testCaseCount: number;
  } | null;
  errors: string[];
}

/** 解析后的单行用例载荷，供 HostBridge CRUD 与落库桥接使用。 */
export interface LegacySyncParsedTestCasePayload {
  test_id: string;
  name: string;
  description: string;
  input: string;
  expected_output: string;
  key_points: string;
  forbidden_points: string;
  category: string;
  how: string;
}

/** Bitable 拉取并解析后的结果（不落库）。 */
export interface LegacySyncFetchResult {
  success: boolean;
  /** Total raw rows from the external source (before skipping invalid). */
  rawRecordCount: number;
  /** Valid rows in stable order. */
  rows: LegacySyncParsedTestCasePayload[];
  /** Hint for default test set title when the plugin can resolve one. */
  suggestedTestSetName?: string;
  nonFatalErrors: string[];
  /** Set when the external list API fails entirely. */
  apiError?: string;
}

/** `getBitTableData` / 插件拉数接口返回的 JSON 本体（与 {@link LegacySyncFetchResult} 同形，顶层字段）。 */
export type BitableFetchJson = LegacySyncFetchResult;

export interface CapabilityInterfaces {
  [Capability.IMPORT_TEST_CASES]: {
    /** Get import button UI definition */
    getImportButtonUI(): ImportButtonUI;

    /** Get import dialog definition - tells frontend which component to render */
    getImportDialog(): ImportDialogDefinition;

    /**
     * Open import dialog/process
     * @param options Options
     * @param options.onSuccess Import success callback
     * @param options.onError Import failure callback
     * @returns Returns imported test case data (if direct import) or null (if async processing needed)
     */
    openImportDialog(options: {
      onSuccess?: (testCases: TestCaseData[]) => void;
      onError?: (error: string) => void;
      onCancel?: () => void;
    }): Promise<TestCaseData[] | null>;

    /**
     * Batch import test cases
     * @param items List of item identifiers to import
     * @param fieldMapping Optional field mapping from table fields to system fields
     */
    importItems(
      items: string[],
      fieldMapping?: Record<string, string>,
    ): Promise<{
      success: boolean;
      importedCount: number;
      testCases: TestCaseData[];
      error?: string;
    }>;

    /** Get list of available data for import (optional, for selection mode) */
    listItems?(options?: unknown): Promise<{
      items: Array<{
        id: string;
        name: string;
        description?: string;
        updatedAt?: string;
      }>;
      total?: number;
    }>;

    /**
     * Enumerate top-level import sources (e.g. Bitable apps/bases). Optional; omit if not needed.
     */
    listImportSources?(): Promise<ImportSchemaSource[]>;

    /**
     * List tables (or sheets) within a source.
     */
    listImportTables?(sourceId: string): Promise<ImportSchemaSource[]>;

    /**
     * List fields/columns for mapping within a table.
     */
    listImportFields?(
      sourceId: string,
      tableId: string,
    ): Promise<ImportSchemaField[]>;
  };

  [Capability.TRACE_EXECUTION]: {
    /**
     * Core API for trace plugins: locate execution traces using magic code and a time window.
     * Implementations must honor magicCode + fromTime/toTime when resolving hits.
     */
    searchTraces(query: {
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
    >;
    /** Get trace details */
    getTrace(traceId: string): Promise<{
      traceId: string;
      traceContent: string;
      url?: string;
    } | null>;
    /** Generate trace URL */
    getTraceUrl(traceId: string): string;
  };

  [Capability.EXPORT_RESULTS]: {
    /** Export data */
    export(data: unknown): Promise<{
      success: boolean;
      url?: string;
      error?: string;
    }>;
  };

  [Capability.NOTIFY]: {
    /** Send notification */
    send(message: {
      title: string;
      content: string;
      level?: "info" | "warning" | "error";
    }): Promise<{ success: boolean; error?: string }>;
  };

  [Capability.CUSTOM_EVALUATION]: {
    /** Execute custom evaluation */
    evaluate(input: unknown): Promise<{
      success: boolean;
      score?: number;
      report?: string;
      error?: string;
    }>;
  };
}

/**
 * Get capability type
 */
export type CapabilityType<T extends Capability> = CapabilityInterfaces[T];

/**
 * Plugin metadata
 */
export interface PluginMetadata {
  /** Plugin unique identifier */
  id: string;
  /** Plugin name */
  name: string;
  /** Plugin description */
  description: string;
  /** Version number */
  version: string;
  /** Author */
  author?: string;
  /** Icon */
  icon?: string;
  /** List of provided capabilities */
  capabilities: Capability[];
}

/**
 * Plugin config
 */
export interface PluginConfig {
  /** Plugin ID */
  pluginId: string;
  /** Whether enabled */
  enabled: boolean;
  /** Config items */
  config: Record<string, unknown>;
}

/**
 * Plugin base class interface
 */
export interface IPlugin {
  /** Get plugin metadata */
  getMetadata(): PluginMetadata;

  /** Get current plugin config */
  getConfig(): Record<string, unknown>;

  /** Set plugin config */
  setConfig(config: Record<string, unknown>): void;

  /** Validate if config is valid */
  validateConfig(config: Record<string, unknown>): {
    valid: boolean;
    errors?: string[];
  };

  /** Initialize plugin (called after config is set) */
  initialize?(): Promise<void>;

  /** Destroy plugin */
  destroy?(): Promise<void>;

  /** Test connection */
  testConnection?(): Promise<{ success: boolean; message?: string }>;

  /** Check if supports a capability */
  hasCapability(capability: Capability): boolean;
}

/**
 * Plugin that implements the import:test-cases capability surface (used by discover API).
 */
export type ImportTestCasesPlugin = IPlugin &
  CapabilityType<Capability.IMPORT_TEST_CASES>;

/**
 * Runtime guard: metadata claims IMPORT_TEST_CASES and required methods exist.
 */
export function isImportTestCasesPlugin(
  plugin: IPlugin,
): plugin is ImportTestCasesPlugin {
  if (!plugin.hasCapability(Capability.IMPORT_TEST_CASES)) {
    return false;
  }
  const candidate = plugin as IPlugin &
    Partial<CapabilityType<Capability.IMPORT_TEST_CASES>>;
  return (
    typeof candidate.getImportButtonUI === "function" &&
    typeof candidate.getImportDialog === "function"
  );
}

/** Plugin exposes import wizard schema APIs (bases/tables/fields). */
export function hasImportSchemaMethods(
  plugin: IPlugin,
): plugin is ImportTestCasesPlugin &
  Required<
    Pick<
      CapabilityType<Capability.IMPORT_TEST_CASES>,
      "listImportSources" | "listImportTables" | "listImportFields"
    >
  > {
  if (!isImportTestCasesPlugin(plugin)) return false;
  const c = plugin as ImportTestCasesPlugin;
  return (
    typeof c.listImportSources === "function" &&
    typeof c.listImportTables === "function" &&
    typeof c.listImportFields === "function"
  );
}

/**
 * Plugin that implements trace:execution (search by magic code + time range, etc.).
 */
export type TraceExecutionPlugin = IPlugin &
  CapabilityType<Capability.TRACE_EXECUTION>;

export function isTraceExecutionPlugin(
  plugin: IPlugin,
): plugin is TraceExecutionPlugin {
  if (!plugin.hasCapability(Capability.TRACE_EXECUTION)) {
    return false;
  }
  const candidate = plugin as IPlugin &
    Partial<CapabilityType<Capability.TRACE_EXECUTION>>;
  return (
    typeof candidate.searchTraces === "function" &&
    typeof candidate.getTrace === "function" &&
    typeof candidate.getTraceUrl === "function"
  );
}

/**
 * Plugin constructor type
 */
export type PluginConstructor = new () => IPlugin;
