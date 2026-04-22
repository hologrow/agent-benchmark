/**
 * Centralized API Client
 *
 * All API calls should go through this client to ensure
 * type safety and consistent error handling.
 */

import type {
  BenchmarkExecution,
  Integration,

  // Requests
  CreateTestSetRequest,
  UpdateTestSetRequest,
  CreateTestCaseRequest,
  UpdateTestCaseRequest,
  CreateBenchmarkRequest,
  UpdateBenchmarkRequest,
  CreateAgentRequest,
  UpdateAgentRequest,
  CreateModelRequest,
  UpdateModelRequest,
  CreateEvaluatorRequest,
  UpdateEvaluatorRequest,
  UpdateIntegrationRequest,

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
  StartExecutionResponse,
  SuccessResponse,
} from '@/types/api';
import { apiRequest } from './api-request';

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
  update: (id: number, data: UpdateTestCaseRequest): Promise<CreateTestCaseResponse> =>
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
  update: (id: number, data: UpdateBenchmarkRequest): Promise<CreateBenchmarkResponse> =>
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
};

// ==================== Models API ====================

export const modelsApi = {
  /**
   * Get all models
   */
  list: (): Promise<ListModelsResponse> =>
    apiRequest<ListModelsResponse>('/api/models'),

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
  update: (id: number, data: UpdateModelRequest): Promise<CreateModelResponse> =>
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
  update: (id: number, data: UpdateEvaluatorRequest): Promise<CreateEvaluatorResponse> =>
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
};

// ==================== RL Training API ====================

export const rlTrainingApi = {
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
};

export default api;
