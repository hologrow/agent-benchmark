/**
 * Shared API Types for Benchmark Runner
 *
 * These types are shared between frontend and backend
 * to ensure type safety across the full stack.
 */

// ==================== Base Types ====================

export interface TestSet {
  id: number;
  name: string;
  description: string;
  source: 'lark' | 'manual' | null;
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
  created_at: string;
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
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stopped';
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
  agent_type: 'openclaw' | 'hermes' | 'other';
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

export interface CreateTestSetRequest {
  name: string;
  description?: string;
  source?: 'lark' | 'manual';
  source_url?: string;
  test_case_ids: number[];
}

export interface UpdateTestSetRequest {
  name?: string;
  description?: string;
  source?: 'lark' | 'manual';
  source_url?: string;
  test_case_ids?: number[];
}

export interface CreateTestCaseRequest {
  test_id?: string;
  name?: string;
  description?: string;
  input: string;
  expected_output?: string;
  key_points?: string | string[];
  forbidden_points?: string | string[];
  category?: string;
  how?: string;
}

export interface CreateBenchmarkRequest {
  name: string;
  description?: string;
  agent_ids: number[];
  test_set_id?: number;
  test_case_ids?: number[];
  evaluator_id: number;
  run_config?: Record<string, unknown>;
}

export interface CreateAgentRequest {
  name: string;
  description?: string;
  agent_type: 'openclaw' | 'hermes' | 'other';
  config: {
    url?: string;
    token?: string;
    command?: string;
  };
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  agent_type?: 'openclaw' | 'hermes' | 'other';
  config?: {
    url?: string;
    token?: string;
    command?: string;
  };
}

export interface CreateModelRequest {
  name: string;
  provider: string;
  model_id: string;
  api_key?: string;
  base_url?: string;
  temperature?: number;
  max_tokens?: number;
  config?: Record<string, unknown>;
}

export interface CreateEvaluatorRequest {
  name: string;
  description?: string;
  model_id: number;
  prompt_template: string;
  script_path?: string;
  config?: Record<string, unknown>;
}

export interface IntegrationConfig {
  appType?: 'lark' | 'feishu';
  appId?: string;
  appSecret?: string;
  publicKey?: string;
  secretKey?: string;
  host?: string;
}

export interface UpdateIntegrationRequest {
  enabled: boolean;
  config: IntegrationConfig;
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
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
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
 * Body: { action, payload? }
 */
export const PLUGIN_IMPORT_ACTIONS = [
  'listImportSources',
  'listImportTables',
  'listImportFields',
  'importTestCases',
] as const;

export type PluginImportAction = (typeof PLUGIN_IMPORT_ACTIONS)[number];

export interface PluginImportCommand {
  action: PluginImportAction;
  payload?: Record<string, unknown>;
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
  status: 'idle' | 'training' | 'completed' | 'error';
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
  status: 'healthy' | 'unhealthy' | 'unknown';
  details?: string;
}

// Simple success response
export interface SuccessResponse {
  success: boolean;
}

// Empty response (for void returns)
export interface EmptyResponse {}
