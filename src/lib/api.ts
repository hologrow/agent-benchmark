/**
 * Centralized API Client
 *
 * All API calls should go through this client to ensure
 * type safety and consistent error handling.
 */

import type {
  // Entities
  Benchmark,
  BenchmarkExecution,
  Agent,
  Model,
  Evaluator,
  Integration,

  // Requests
  CreateTestSetRequest,
  UpdateTestSetRequest,
  CreateTestCaseRequest,
  CreateBenchmarkRequest,
  CreateAgentRequest,
  UpdateAgentRequest,
  CreateModelRequest,
  CreateEvaluatorRequest,
  UpdateIntegrationRequest,
  LarkImportRequest,
  RLTrainingConfig,

  // Responses
  ListTestSetsResponse,
  GetTestSetResponse,
  CreateTestSetResponse,
  ListTestCasesResponse,
  CreateTestCaseResponse,
  ListBenchmarksResponse,
  CreateBenchmarkResponse,
  ListAgentsResponse,
  CreateAgentResponse,
  ListModelsResponse,
  CreateModelResponse,
  ListEvaluatorsResponse,
  CreateEvaluatorResponse,
  ListIntegrationsResponse,
  DiscoverPluginsResponse,
  ListLarkBasesResponse,
  ListLarkTablesResponse,
  ListLarkFieldsResponse,
  LarkImportResponse,
  StartExecutionResponse,
  StopExecutionResponse,
  ExecutionHealthResponse,
  SuccessResponse,
} from '@/types/api';

// API Error class for typed error handling
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Base request handler with type safety
async function apiRequest<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(
      errorData.error || `HTTP ${response.status}`,
      response.status,
      errorData
    );
  }

  // Handle empty responses
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

// ==================== Test Sets API ====================

export const testSetsApi = {
  /**
   * Get all test sets or a single test set by ID
   */
  list: (): Promise<ListTestSetsResponse> =>
    apiRequest<ListTestSetsResponse>('/api/test-sets'),

  /**
   * Get a single test set by ID with details
   */
  get: (id: number): Promise<GetTestSetResponse> =>
    apiRequest<GetTestSetResponse>(`/api/test-sets?id=${id}`),

  /**
   * Create a new test set
   */
  create: (data: CreateTestSetRequest): Promise<CreateTestSetResponse> =>
    apiRequest<CreateTestSetResponse>('/api/test-sets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * Update a test set
   */
  update: (id: number, data: UpdateTestSetRequest): Promise<CreateTestSetResponse> =>
    apiRequest<CreateTestSetResponse>(`/api/test-sets?id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /**
   * Delete a test set
   */
  delete: (id: number): Promise<SuccessResponse> =>
    apiRequest<SuccessResponse>(`/api/test-sets?id=${id}`, {
      method: 'DELETE',
    }),
};

// ==================== Test Cases API ====================

export const testCasesApi = {
  /**
   * Get all test cases
   */
  list: (): Promise<ListTestCasesResponse> =>
    apiRequest<ListTestCasesResponse>('/api/test-cases'),

  /**
   * Create a new test case
   */
  create: (data: CreateTestCaseRequest): Promise<CreateTestCaseResponse> =>
    apiRequest<CreateTestCaseResponse>('/api/test-cases', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * Update a test case
   */
  update: (id: number, data: Partial<CreateTestCaseRequest>): Promise<CreateTestCaseResponse> =>
    apiRequest<CreateTestCaseResponse>(`/api/test-cases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /**
   * Delete a test case
   */
  delete: (id: number): Promise<SuccessResponse> =>
    apiRequest<SuccessResponse>(`/api/test-cases/${id}`, {
      method: 'DELETE',
    }),
};

// ==================== Benchmarks API ====================

export const benchmarksApi = {
  /**
   * Get all benchmarks
   */
  list: (): Promise<ListBenchmarksResponse> =>
    apiRequest<ListBenchmarksResponse>('/api/benchmarks'),

  /**
   * Get a single benchmark by ID
   */
  get: (id: number): Promise<{ benchmark: Benchmark }> =>
    apiRequest<{ benchmark: Benchmark }>(`/api/benchmarks/${id}`),

  /**
   * Create a new benchmark
   */
  create: (data: CreateBenchmarkRequest): Promise<CreateBenchmarkResponse> =>
    apiRequest<CreateBenchmarkResponse>('/api/benchmarks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * Update a benchmark
   */
  update: (id: number, data: Partial<CreateBenchmarkRequest>): Promise<CreateBenchmarkResponse> =>
    apiRequest<CreateBenchmarkResponse>(`/api/benchmarks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /**
   * Delete a benchmark
   */
  delete: (id: number): Promise<SuccessResponse> =>
    apiRequest<SuccessResponse>(`/api/benchmarks/${id}`, {
      method: 'DELETE',
    }),

  /**
   * Start benchmark execution
   */
  startExecution: (id: number): Promise<StartExecutionResponse> =>
    apiRequest<StartExecutionResponse>(`/api/benchmarks/${id}/start`, {
      method: 'POST',
    }),

  /**
   * Get executions for a benchmark
   */
  getExecutions: (id: number): Promise<{ executions: BenchmarkExecution[] }> =>
    apiRequest<{ executions: BenchmarkExecution[] }>(`/api/benchmarks/${id}/executions`),
};

// ==================== Executions API ====================

export const executionsApi = {
  /**
   * Get execution by ID
   */
  get: (id: number): Promise<{ details: { results: unknown[] } }> =>
    apiRequest<{ details: { results: unknown[] } }>(`/api/executions/${id}`),

  /**
   * Stop a running execution
   */
  stop: (id: number): Promise<StopExecutionResponse> =>
    apiRequest<StopExecutionResponse>(`/api/executions/${id}/stop`, {
      method: 'POST',
    }),

  /**
   * Check execution health
   */
  checkHealth: (id: number): Promise<ExecutionHealthResponse> =>
    apiRequest<ExecutionHealthResponse>(`/api/executions/${id}/health`),

  /**
   * Trigger evaluation for an execution
   */
  evaluate: (id: number): Promise<SuccessResponse> =>
    apiRequest<SuccessResponse>(`/api/executions/${id}/evaluate`, {
      method: 'POST',
    }),

  /**
   * Delete an execution
   */
  delete: (id: number): Promise<SuccessResponse> =>
    apiRequest<SuccessResponse>(`/api/executions/${id}`, {
      method: 'DELETE',
    }),
};

// ==================== Agents API ====================

export const agentsApi = {
  /**
   * Get all agents
   */
  list: (): Promise<ListAgentsResponse> =>
    apiRequest<ListAgentsResponse>('/api/agents'),

  /**
   * Get a single agent by ID
   */
  get: (id: number): Promise<{ agent: Agent }> =>
    apiRequest<{ agent: Agent }>(`/api/agents/${id}`),

  /**
   * Create a new agent
   */
  create: (data: CreateAgentRequest): Promise<CreateAgentResponse> =>
    apiRequest<CreateAgentResponse>('/api/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * Update an agent
   */
  update: (id: number, data: UpdateAgentRequest): Promise<CreateAgentResponse> =>
    apiRequest<CreateAgentResponse>(`/api/agents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /**
   * Delete an agent
   */
  delete: (id: number): Promise<SuccessResponse> =>
    apiRequest<SuccessResponse>(`/api/agents/${id}`, {
      method: 'DELETE',
    }),

  /**
   * Test agent connection
   */
  testConnection: (id: number): Promise<{ success: boolean; message?: string }> =>
    apiRequest<{ success: boolean; message?: string }>(`/api/agents/${id}/test`, {
      method: 'POST',
    }),
};

// ==================== Models API ====================

export const modelsApi = {
  /**
   * Get all models
   */
  list: (): Promise<ListModelsResponse> =>
    apiRequest<ListModelsResponse>('/api/models'),

  /**
   * Get a single model by ID
   */
  get: (id: number): Promise<{ model: Model }> =>
    apiRequest<{ model: Model }>(`/api/models/${id}`),

  /**
   * Create a new model
   */
  create: (data: CreateModelRequest): Promise<CreateModelResponse> =>
    apiRequest<CreateModelResponse>('/api/models', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * Update a model
   */
  update: (id: number, data: Partial<CreateModelRequest>): Promise<CreateModelResponse> =>
    apiRequest<CreateModelResponse>(`/api/models/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /**
   * Delete a model
   */
  delete: (id: number): Promise<SuccessResponse> =>
    apiRequest<SuccessResponse>(`/api/models/${id}`, {
      method: 'DELETE',
    }),
};

// ==================== Evaluators API ====================

export const evaluatorsApi = {
  /**
   * Get all evaluators
   */
  list: (): Promise<ListEvaluatorsResponse> =>
    apiRequest<ListEvaluatorsResponse>('/api/evaluators'),

  /**
   * Get a single evaluator by ID
   */
  get: (id: number): Promise<{ evaluator: Evaluator }> =>
    apiRequest<{ evaluator: Evaluator }>(`/api/evaluators/${id}`),

  /**
   * Create a new evaluator
   */
  create: (data: CreateEvaluatorRequest): Promise<CreateEvaluatorResponse> =>
    apiRequest<CreateEvaluatorResponse>('/api/evaluators', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * Update an evaluator
   */
  update: (id: number, data: Partial<CreateEvaluatorRequest>): Promise<CreateEvaluatorResponse> =>
    apiRequest<CreateEvaluatorResponse>(`/api/evaluators/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /**
   * Delete an evaluator
   */
  delete: (id: number): Promise<SuccessResponse> =>
    apiRequest<SuccessResponse>(`/api/evaluators/${id}`, {
      method: 'DELETE',
    }),
};

// ==================== Integrations API ====================

export const integrationsApi = {
  /**
   * Get all integrations
   */
  list: (): Promise<ListIntegrationsResponse> =>
    apiRequest<ListIntegrationsResponse>('/api/integrations'),

  /**
   * Get a single integration by type
   */
  getByType: (type: string): Promise<{ integration: Integration | null }> =>
    apiRequest<{ integration: Integration | null }>(`/api/integrations?type=${type}`),

  /**
   * Update an integration
   */
  update: (type: string, data: UpdateIntegrationRequest): Promise<{ integration: Integration }> =>
    apiRequest<{ integration: Integration }>(`/api/integrations?type=${type}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * Test integration connection
   */
  testConnection: (type: string): Promise<{ success: boolean; message?: string }> =>
    apiRequest<{ success: boolean; message?: string }>(`/api/integrations/${type}/test`, {
      method: 'POST',
    }),
};

// ==================== Plugins API ====================

export const pluginsApi = {
  /**
   * Discover all available plugin capabilities
   */
  discover: (): Promise<DiscoverPluginsResponse> =>
    apiRequest<DiscoverPluginsResponse>('/api/plugins/discover'),

  /**
   * Get Lark bases
   */
  larkBases: (): Promise<ListLarkBasesResponse> =>
    apiRequest<ListLarkBasesResponse>('/api/plugins/lark/bases'),

  /**
   * Get Lark tables in a base
   */
  larkTables: (baseId: string): Promise<ListLarkTablesResponse> =>
    apiRequest<ListLarkTablesResponse>(`/api/plugins/lark/tables?baseId=${encodeURIComponent(baseId)}`),

  /**
   * Get Lark fields in a table
   */
  larkFields: (baseId: string, tableId: string): Promise<ListLarkFieldsResponse> =>
    apiRequest<ListLarkFieldsResponse>(
      `/api/plugins/lark/fields?baseId=${encodeURIComponent(baseId)}&tableId=${encodeURIComponent(tableId)}`
    ),

  /**
   * Import from Lark
   */
  larkImport: (data: LarkImportRequest): Promise<LarkImportResponse> =>
    apiRequest<LarkImportResponse>('/api/plugins/lark/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ==================== RL Training API ====================

export const rlTrainingApi = {
  /**
   * Get RL training status
   */
  getStatus: (): Promise<{ status: string; config?: RLTrainingConfig; message?: string }> =>
    apiRequest<{ status: string; config?: RLTrainingConfig; message?: string }>('/api/rl-training'),

  /**
   * Start RL training
   */
  start: (config: RLTrainingConfig): Promise<{ success: boolean; message?: string }> =>
    apiRequest<{ success: boolean; message?: string }>('/api/rl-training', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  /**
   * Stop RL training
   */
  stop: (): Promise<{ success: boolean; message?: string }> =>
    apiRequest<{ success: boolean; message?: string }>('/api/rl-training', {
      method: 'DELETE',
    }),

  /**
   * Get available RL agents
   */
  getAgents: (): Promise<{ agents: Array<{ id: string; name: string; description: string }> }> =>
    apiRequest<{ agents: Array<{ id: string; name: string; description: string }> }>('/api/rl-training/agent'),

  /**
   * Generate teacher response using LLM
   */
  generate: (params: { modelId: number; messages: Array<{ role: string; content: string }>; round: number }): Promise<{ content: string; round: number; usage?: unknown }> =>
    apiRequest<{ content: string; round: number; usage?: unknown }>('/api/rl-training', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  /**
   * Execute agent with prompt
   */
  executeAgent: (params: { agentId: number; prompt: string; round: number }): Promise<{ output?: string; executionTime?: number; error?: string }> =>
    apiRequest<{ output?: string; executionTime?: number; error?: string }>('/api/rl-training/agent', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
};

// ==================== Results API ====================

export const resultsApi = {
  /**
   * Diagnose a result
   */
  diagnose: (id: number): Promise<{ diagnosis: string }> =>
    apiRequest<{ diagnosis: string }>(`/api/results/${id}/diagnose`, {
      method: 'POST',
    }),
};

// ==================== Export default API object ====================

export const api = {
  testSets: testSetsApi,
  testCases: testCasesApi,
  benchmarks: benchmarksApi,
  executions: executionsApi,
  agents: agentsApi,
  models: modelsApi,
  evaluators: evaluatorsApi,
  integrations: integrationsApi,
  plugins: pluginsApi,
  rlTraining: rlTrainingApi,
  results: resultsApi,
};

export default api;
