/**
 * Shared API Types for Benchmark Runner
 *
 * These types are shared between frontend and backend
 * to ensure type safety across the full stack.
 */

// ==================== Base Types ====================

/** 持久化实体上由服务端生成、请求体不包含的字段 */
export type ApiEntityMeta = "id" | "created_at" | "updated_at";

export interface TestSet {
  id: number;
  name: string;
  description: string;
  /**
     eg: lark, manual
   */
  source: string;
  source_url: string | null;
  created_at: string;
  test_cases?: TestCase[];
}

export interface TestCase {
  id: number;
  test_id: string;
  name: string;
  description: string;
  input: string;
  expected_output: string;
  key_points: string;
  forbidden_points: string;
  category: string;
  how: string;
  /** 创建人；历史数据可能为空字符串 */
  created_by: string;
  /**
   * JSON 数组字符串，元素为图片 data URL（`data:image/...;base64,...`）；无图时为 null 或 `[]`
   */
  images_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface Benchmark {
  id: number;
  name: string;
  description: string;
  agent_ids: string;
  test_case_ids: string;
  test_set_id: number | null;
  evaluator_id: number | null;
  run_config: string;
  created_at: string;
  updated_at: string;
}

export interface BenchmarkExecution {
  id: number;
  benchmark_id: number;
  status: "pending" | "running" | "completed" | "failed" | "stopped";
  progress: number;
  current_agent: string | null;
  current_test_case: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: number;
  name: string;
  description: string;
  agent_type: "openclaw" | "hermes" | "other";
  config_json: string;
  created_at: string;
  updated_at: string;
}

export interface Model {
  id: number;
  name: string;
  provider: string;
  model_id: string;
  api_key?: string;
  base_url?: string;
  temperature?: number;
  max_tokens?: number;
  config_json?: string;
  created_at: string;
  updated_at: string;
}

export interface Evaluator {
  id: number;
  name: string;
  description: string;
  model_id: number;
  prompt_template: string;
  script_path?: string;
  config_json?: string;
  created_at: string;
  updated_at: string;
}

export interface Integration {
  id: number;
  type: string;
  name: string;
  enabled: boolean;
  config: string;
  created_at: string;
  updated_at: string;
}

export interface EvaluationResult {
  id: number;
  result_id: number;
  score: number;
  report: string;
  evaluator_version: string;
  created_at: string;
}

// ==================== API Request Types ====================

/** 创建测试集：名称 + 用例 id；`source` 比实体上更窄 */
export type CreateTestSetRequest = Pick<TestSet, "name" | "source"> &
  Partial<Pick<TestSet, "description" | "source_url">> & {
    test_case_ids: number[];
  };

export type UpdateTestSetRequest = Partial<CreateTestSetRequest>;

/**
 * 创建用例：与 {@link TestCase} 可写字段对齐，部分在创建时可选；
 * `key_points` / `forbidden_points` 支持表单多选（数组）。
 */
export type CreateTestCaseRequest = Partial<
  Pick<
    TestCase,
    | "test_id"
    | "name"
    | "description"
    | "expected_output"
    | "category"
    | "how"
    | "created_by"
    | "images_json"
  >
> &
  Pick<TestCase, "input"> & {
    key_points?: string | string[];
    forbidden_points?: string | string[];
  };

export type UpdateTestCaseRequest = Partial<CreateTestCaseRequest>;

/**
 * 创建 Benchmark：与 {@link Benchmark} 对齐，但 `agent_ids` / `test_case_ids` 为数组、
 * `run_config` 为对象；`description` / `test_set_id` 在创建时可选。
 */
export type CreateBenchmarkRequest = Omit<
  Benchmark,
  | ApiEntityMeta
  | "agent_ids"
  | "test_case_ids"
  | "run_config"
  | "description"
  | "test_set_id"
> & {
  description?: string;
  test_set_id?: number;
  agent_ids: number[];
  test_case_ids?: number[];
  run_config?: Record<string, unknown>;
};

export type UpdateBenchmarkRequest = Partial<CreateBenchmarkRequest>;

/** Agent 写入体使用结构化 `config`，与实体 `config_json` 分离 */
export type AgentConfigPayload = {
  url?: string;
  token?: string;
  command?: string;
};

export type CreateAgentRequest = Pick<Agent, "name" | "agent_type"> &
  Partial<Pick<Agent, "description">> & {
    config: AgentConfigPayload;
  };

export type UpdateAgentRequest = Partial<CreateAgentRequest>;

/** Model 创建：JSON `config` 替代实体 `config_json`；`is_default` 与 API 路由一致 */
export type CreateModelRequest = Omit<Model, ApiEntityMeta | "config_json"> & {
  config?: Record<string, unknown>;
  is_default?: boolean;
};

export type UpdateModelRequest = Partial<CreateModelRequest>;

/** Evaluator 创建：`config` 替代 `config_json`，`description` 可选 */
export type CreateEvaluatorRequest = Omit<
  Evaluator,
  ApiEntityMeta | "config_json" | "description"
> & {
  description?: string;
  config?: Record<string, unknown>;
};

export type UpdateEvaluatorRequest = Partial<CreateEvaluatorRequest>;

export interface IntegrationConfig {
  appType?: "lark" | "feishu";
  appId?: string;
  appSecret?: string;
  publicKey?: string;
  secretKey?: string;
  host?: string;
}

export interface UpdateIntegrationRequest {
  enabled: boolean;
  config: IntegrationConfig;
  /** 与 `POST /api/integrations?type=` 搭配时可传，新建时用作展示名 */
  name?: string;
}

// ==================== API Response Types ====================

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// Specific responses
export interface ListTestSetsResponse {
  testSets: TestSet[];
}

export interface GetTestSetResponse {
  testSet: TestSet;
}

export interface CreateTestSetResponse {
  testSet: TestSet;
}

export interface ListTestCasesResponse {
  testCases: TestCase[];
}

export interface CreateTestCaseResponse {
  testCase: TestCase;
}

export interface ListBenchmarksResponse {
  benchmarks: Benchmark[];
}

export interface CreateBenchmarkResponse {
  benchmark: Benchmark;
}

export interface ListAgentsResponse {
  agents: Agent[];
}

export interface CreateAgentResponse {
  agent: Agent;
}

export interface ListModelsResponse {
  models: Model[];
}

export interface CreateModelResponse {
  model: Model;
}

export interface ListEvaluatorsResponse {
  evaluators: Evaluator[];
}

export interface CreateEvaluatorResponse {
  evaluator: Evaluator;
}

export interface ListIntegrationsResponse {
  integrations: Integration[];
}

// Plugin types
export interface PluginCapability {
  importTestCases?: ImportButtonUI[];
}

export interface ImportButtonUI {
  pluginId: string;
  pluginName: string;
  label: string;
  icon: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  color?: string;
  dialog?: {
    title: string;
    description?: string;
    componentId: string;
  };
}

export interface DiscoverPluginsResponse {
  capabilities: PluginCapability;
}

/** Import wizard: top-level sources (e.g. Bitable app). */
export interface ImportSourceRow {
  id: string;
  name: string;
}

export interface ListImportSourcesResponse {
  sources: ImportSourceRow[];
}

export interface ImportTestCasesRequest {
  items: string[]; // e.g. "sourceId/tableId"
  fieldMapping?: Record<string, string>;
}

export interface ImportTestCasesResponse {
  success: boolean;
  importedCount: number;
  testCases: Array<{
    test_id: string;
    name: string;
    input: string;
    expected_output: string;
    key_points?: string;
    forbidden_points?: string;
    how?: string;
  }>;
  error?: string;
}

/**
 * Single endpoint: POST /api/plugins/:pluginId
 * Body: { route: string, payload? } — 与插件自定义 HTTP（如 `bitable.*`）同一套字段。
 */
export const PLUGIN_IMPORT_ROUTES = [
  "listImportSources",
  "listImportTables",
  "listImportFields",
  "importTestCases",
] as const;

export type PluginImportRoute = (typeof PLUGIN_IMPORT_ROUTES)[number];

export interface PluginPayload<T = Record<string, unknown>> {
  route: string;
  payload?: T;
}

// RL Training types
export interface RLTrainingConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  agentId?: number;
  maxIterations?: number;
  learningRate?: number;
}

export interface RLTrainingStatus {
  status: "idle" | "training" | "completed" | "error";
  progress?: number;
  currentStep?: string;
  message?: string;
}

// Execution types
export interface StartExecutionResponse {
  execution: BenchmarkExecution;
}

export interface StopExecutionResponse {
  success: boolean;
}

export interface ExecutionHealthResponse {
  status: "healthy" | "unhealthy" | "unknown";
  details?: string;
}

// Simple success response
export interface SuccessResponse {
  success: boolean;
}

// Empty response (for void returns)
export type EmptyResponse = Record<string, never>;
