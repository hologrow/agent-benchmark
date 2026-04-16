import Database from 'better-sqlite3';
import { join } from 'path';
import { migrate } from './migrator';

const DB_PATH = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'benchmark.db');

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initializeDatabase();
  }
  return db;
}

function initializeDatabase() {
  if (!db) return;

  // 运行迁移（使用新的迁移系统）
  const migrationsDir = join(process.cwd(), 'src', 'lib', 'db', 'migrations');
  const result = migrate(db, migrationsDir);

  if (!result.success) {
    console.error('[Database] Migration failed:', result.error);
  } else if (result.executed.length > 0) {
    console.log('[Database] Migrations executed:', result.executed);
  }
}

// Agent 相关操作
export interface Agent {
  id: number;
  name: string;
  description: string;
  command: string;
  created_at: string;
  updated_at: string;
}

export function getAllAgents(): Agent[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all() as Agent[];
}

export function getAgentById(id: number): Agent | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Agent | undefined;
}

export function createAgent(agent: Omit<Agent, 'id' | 'created_at' | 'updated_at'>): Agent {
  const db = getDatabase();
  const result = db.prepare(
    'INSERT INTO agents (name, description, command) VALUES (?, ?, ?)'
  ).run(agent.name, agent.description, agent.command);

  return getAgentById(result.lastInsertRowid as number)!;
}

export function updateAgent(id: number, agent: Partial<Omit<Agent, 'id' | 'created_at' | 'updated_at'>>): Agent {
  const db = getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (agent.name !== undefined) { sets.push('name = ?'); values.push(agent.name); }
  if (agent.description !== undefined) { sets.push('description = ?'); values.push(agent.description); }
  if (agent.command !== undefined) { sets.push('command = ?'); values.push(agent.command); }
  sets.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  db.prepare(`UPDATE agents SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getAgentById(id)!;
}

export function deleteAgent(id: number): void {
  const db = getDatabase();
  db.prepare('DELETE FROM agents WHERE id = ?').run(id);
}

// Test Case 相关操作
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
  updated_at: string;
}

export function getAllTestCases(): TestCase[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM test_cases ORDER BY created_at DESC').all() as TestCase[];
}

export function getTestCaseById(id: number): TestCase | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM test_cases WHERE id = ?').get(id) as TestCase | undefined;
}

export function createTestCase(testCase: Omit<TestCase, 'id' | 'created_at' | 'updated_at'>): TestCase {
  const db = getDatabase();
  const result = db.prepare(
    'INSERT INTO test_cases (test_id, name, description, input, expected_output, key_points, forbidden_points, category, how) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    testCase.test_id,
    testCase.name,
    testCase.description,
    testCase.input,
    testCase.expected_output,
    testCase.key_points,
    testCase.forbidden_points,
    testCase.category,
    testCase.how
  );

  return getTestCaseById(result.lastInsertRowid as number)!;
}

export function updateTestCase(id: number, testCase: Partial<Omit<TestCase, 'id' | 'created_at' | 'updated_at'>>): TestCase {
  const db = getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (testCase.test_id !== undefined) { sets.push('test_id = ?'); values.push(testCase.test_id); }
  if (testCase.name !== undefined) { sets.push('name = ?'); values.push(testCase.name); }
  if (testCase.description !== undefined) { sets.push('description = ?'); values.push(testCase.description); }
  if (testCase.input !== undefined) { sets.push('input = ?'); values.push(testCase.input); }
  if (testCase.expected_output !== undefined) { sets.push('expected_output = ?'); values.push(testCase.expected_output); }
  if (testCase.key_points !== undefined) { sets.push('key_points = ?'); values.push(testCase.key_points); }
  if (testCase.forbidden_points !== undefined) { sets.push('forbidden_points = ?'); values.push(testCase.forbidden_points); }
  if (testCase.category !== undefined) { sets.push('category = ?'); values.push(testCase.category); }
  if (testCase.how !== undefined) { sets.push('how = ?'); values.push(testCase.how); }
  sets.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  db.prepare(`UPDATE test_cases SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getTestCaseById(id)!;
}

export function deleteTestCase(id: number): void {
  const db = getDatabase();
  db.prepare('DELETE FROM test_cases WHERE id = ?').run(id);
}

// Evaluator 相关操作
export interface Evaluator {
  id: number;
  name: string;
  description: string;
  script_path: string;
  config: string;
  model_id: number | null;
  created_at: string;
  updated_at: string;
}

// TestSet 相关操作
export interface TestSet {
  id: number;
  name: string;
  description: string;
  source: 'lark' | 'manual' | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TestSetItem {
  id: number;
  test_set_id: number;
  test_case_id: number;
  order_index: number;
  created_at: string;
}

export function getAllEvaluators(): Evaluator[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM evaluators ORDER BY created_at DESC').all() as Evaluator[];
}

export function getEvaluatorById(id: number): Evaluator | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM evaluators WHERE id = ?').get(id) as Evaluator | undefined;
}

export function createEvaluator(evaluator: Omit<Evaluator, 'id' | 'created_at' | 'updated_at'>): Evaluator {
  const db = getDatabase();
  const result = db.prepare(
    'INSERT INTO evaluators (name, description, script_path, config, model_id) VALUES (?, ?, ?, ?, ?)'
  ).run(evaluator.name, evaluator.description, evaluator.script_path, evaluator.config, evaluator.model_id ?? null);

  return getEvaluatorById(result.lastInsertRowid as number)!;
}

export function updateEvaluator(id: number, evaluator: Partial<Omit<Evaluator, 'id' | 'created_at' | 'updated_at'>>): Evaluator {
  const db = getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (evaluator.name !== undefined) { sets.push('name = ?'); values.push(evaluator.name); }
  if (evaluator.description !== undefined) { sets.push('description = ?'); values.push(evaluator.description); }
  if (evaluator.script_path !== undefined) { sets.push('script_path = ?'); values.push(evaluator.script_path); }
  if (evaluator.config !== undefined) { sets.push('config = ?'); values.push(evaluator.config); }
  if (evaluator.model_id !== undefined) { sets.push('model_id = ?'); values.push(evaluator.model_id); }
  sets.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);

  db.prepare(`UPDATE evaluators SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getEvaluatorById(id)!;
}

export function deleteEvaluator(id: number): void {
  const db = getDatabase();
  db.prepare('DELETE FROM evaluators WHERE id = ?').run(id);
}

// Benchmark Run 相关操作
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

export function getAllBenchmarks(): Benchmark[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM benchmarks ORDER BY created_at DESC').all() as Benchmark[];
}

export function getBenchmarkById(id: number): Benchmark | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM benchmarks WHERE id = ?').get(id) as Benchmark | undefined;
}

export function createBenchmark(benchmark: Omit<Benchmark, 'id' | 'created_at' | 'updated_at'>): Benchmark {
  const db = getDatabase();
  const now = new Date().toISOString();
  const result = db.prepare(
    'INSERT INTO benchmarks (name, description, agent_ids, test_case_ids, test_set_id, evaluator_id, run_config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(benchmark.name, benchmark.description, benchmark.agent_ids, benchmark.test_case_ids, benchmark.test_set_id ?? null, benchmark.evaluator_id, benchmark.run_config, now, now);

  return getBenchmarkById(result.lastInsertRowid as number)!;
}

export function updateBenchmark(id: number, benchmark: Partial<Omit<Benchmark, 'id' | 'created_at' | 'updated_at'>>): Benchmark {
  const db = getDatabase();
  const now = new Date().toISOString();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (benchmark.name !== undefined) { sets.push('name = ?'); values.push(benchmark.name); }
  if (benchmark.description !== undefined) { sets.push('description = ?'); values.push(benchmark.description); }
  if (benchmark.agent_ids !== undefined) { sets.push('agent_ids = ?'); values.push(benchmark.agent_ids); }
  if (benchmark.test_case_ids !== undefined) { sets.push('test_case_ids = ?'); values.push(benchmark.test_case_ids); }
  if (benchmark.test_set_id !== undefined) { sets.push('test_set_id = ?'); values.push(benchmark.test_set_id); }
  if (benchmark.evaluator_id !== undefined) { sets.push('evaluator_id = ?'); values.push(benchmark.evaluator_id); }
  if (benchmark.run_config !== undefined) { sets.push('run_config = ?'); values.push(benchmark.run_config); }
  sets.push('updated_at = ?');
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE benchmarks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getBenchmarkById(id)!;
}

export function deleteBenchmark(id: number): void {
  const db = getDatabase();
  db.prepare('DELETE FROM benchmarks WHERE id = ?').run(id);
}

// Benchmark Result 相关操作（已弃用，保留别名以兼容旧代码）
export interface BenchmarkResult {
  id: number;
  execution_id: number;
  agent_id: number;
  test_case_id: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  actual_output: string | null;
  output_file: string | null;
  execution_time_ms: number | null;
  error_message: string | null;
  evaluation_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export function getBenchmarkResultsByRunId(runId: number): BenchmarkResult[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM benchmark_results WHERE execution_id = ? ORDER BY id').all(runId) as BenchmarkResult[];
}

export function getBenchmarkResultById(id: number): BenchmarkResult | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM benchmark_results WHERE id = ?').get(id) as BenchmarkResult | undefined;
}

export function createBenchmarkResult(result: Omit<BenchmarkResult, 'id' | 'created_at'>): BenchmarkResult {
  const db = getDatabase();
  const stmt = db.prepare(
    'INSERT INTO benchmark_results (execution_id, agent_id, test_case_id, status, actual_output, output_file, execution_time_ms, error_message, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const res = stmt.run(
    result.execution_id,
    result.agent_id,
    result.test_case_id,
    result.status,
    result.actual_output,
    result.output_file,
    result.execution_time_ms,
    result.error_message,
    result.started_at,
    result.completed_at
  );

  return getBenchmarkResultById(res.lastInsertRowid as number)!;
}

export function updateBenchmarkResult(id: number, result: Partial<Omit<BenchmarkResult, 'id' | 'created_at'>>): BenchmarkResult {
  const db = getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (result.execution_id !== undefined) { sets.push('execution_id = ?'); values.push(result.execution_id); }
  if (result.agent_id !== undefined) { sets.push('agent_id = ?'); values.push(result.agent_id); }
  if (result.test_case_id !== undefined) { sets.push('test_case_id = ?'); values.push(result.test_case_id); }
  if (result.status !== undefined) { sets.push('status = ?'); values.push(result.status); }
  if (result.actual_output !== undefined) { sets.push('actual_output = ?'); values.push(result.actual_output); }
  if (result.output_file !== undefined) { sets.push('output_file = ?'); values.push(result.output_file); }
  if (result.execution_time_ms !== undefined) { sets.push('execution_time_ms = ?'); values.push(result.execution_time_ms); }
  if (result.error_message !== undefined) { sets.push('error_message = ?'); values.push(result.error_message); }
  if (result.evaluation_error !== undefined) { sets.push('evaluation_error = ?'); values.push(result.evaluation_error); }
  if (result.started_at !== undefined) { sets.push('started_at = ?'); values.push(result.started_at); }
  if (result.completed_at !== undefined) { sets.push('completed_at = ?'); values.push(result.completed_at); }
  values.push(id);

  db.prepare(`UPDATE benchmark_results SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getBenchmarkResultById(id)!;
}

// Evaluation 相关操作
export interface Evaluation {
  id: number;
  execution_id: number;
  result_id: number;
  score: number | null;
  report: string | null;
  key_points_met: string | null;
  forbidden_points_violated: string | null;
  evaluated_at: string;
}

export function getEvaluationsByRunId(runId: number): Evaluation[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM evaluations WHERE execution_id = ? ORDER BY id').all(runId) as Evaluation[];
}

export function getEvaluationByResultId(resultId: number): Evaluation | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM evaluations WHERE result_id = ?').get(resultId) as Evaluation | undefined;
}

export function createEvaluation(evaluation: Omit<Evaluation, 'id' | 'evaluated_at'>): Evaluation {
  const db = getDatabase();
  const result = db.prepare(
    'INSERT INTO evaluations (execution_id, result_id, score, report, key_points_met, forbidden_points_violated) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    evaluation.execution_id,
    evaluation.result_id,
    evaluation.score,
    evaluation.report,
    evaluation.key_points_met,
    evaluation.forbidden_points_violated
  );

  return db.prepare('SELECT * FROM evaluations WHERE id = ?').get(result.lastInsertRowid) as Evaluation;
}

// Execution 相关操作（对应 benchmark_executions 表）
export interface Execution {
  id: number;
  benchmark_id: number;
  name: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  evaluation_status: 'pending' | 'running' | 'completed' | 'failed' | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  pid: number | null;
}

export function getExecutionsByBenchmarkId(benchmarkId: number): Execution[] {
  const db = getDatabase();
  return db.prepare(
    `SELECT
      id,
      benchmark_id,
      name,
      status,
      evaluation_status,
      started_at,
      completed_at,
      created_at,
      pid
    FROM benchmark_executions
    WHERE benchmark_id = ?
    ORDER BY created_at DESC`
  ).all(benchmarkId) as Execution[];
}

export function getExecutionById(id: number): Execution | undefined {
  const db = getDatabase();
  return db.prepare(
    `SELECT
      id,
      benchmark_id,
      name,
      status,
      evaluation_status,
      started_at,
      completed_at,
      created_at,
      pid
    FROM benchmark_executions
    WHERE id = ?`
  ).get(id) as Execution | undefined;
}

export function createExecution(execution: {
  benchmark_id: number;
  name: string | null;
  status: string;
  started_at: string | null;
  completed_at: null;
  pid?: number | null;
}): Execution {
  const db = getDatabase();
  const result = db.prepare(
    `INSERT INTO benchmark_executions (benchmark_id, name, status, started_at, completed_at, pid)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    execution.benchmark_id,
    execution.name,
    execution.status,
    execution.started_at,
    execution.completed_at,
    execution.pid ?? null
  );

  return getExecutionById(result.lastInsertRowid as number)!;
}

export function updateExecution(id: number, execution: Partial<Pick<Execution, 'status' | 'started_at' | 'completed_at' | 'evaluation_status' | 'pid'>>): Execution {
  const db = getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (execution.status !== undefined) { sets.push('status = ?'); values.push(execution.status); }
  if (execution.started_at !== undefined) { sets.push('started_at = ?'); values.push(execution.started_at); }
  if (execution.completed_at !== undefined) { sets.push('completed_at = ?'); values.push(execution.completed_at); }
  if (execution.evaluation_status !== undefined) { sets.push('evaluation_status = ?'); values.push(execution.evaluation_status); }
  if (execution.pid !== undefined) { sets.push('pid = ?'); values.push(execution.pid); }
  values.push(id);

  db.prepare(`UPDATE benchmark_executions SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getExecutionById(id)!;
}

export function deleteExecution(id: number): void {
  const db = getDatabase();
  db.prepare('DELETE FROM benchmark_executions WHERE id = ?').run(id);
}

// Result 相关操作（对应 benchmark_results 表）
export interface Result {
  id: number;
  execution_id: number;
  agent_id: number;
  test_case_id: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  actual_output: string | null;
  execution_steps: string | null;
  execution_answer: string | null;
  output_file: string | null;
  execution_time_ms: number | null;
  error_message: string | null;
  evaluation_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export function createResult(result: Omit<Result, 'id' | 'created_at'>): Result {
  const db = getDatabase();
  const stmt = db.prepare(
    'INSERT INTO benchmark_results (execution_id, agent_id, test_case_id, status, actual_output, output_file, execution_time_ms, error_message, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const res = stmt.run(
    result.execution_id,
    result.agent_id,
    result.test_case_id,
    result.status,
    result.actual_output,
    result.output_file,
    result.execution_time_ms,
    result.error_message,
    result.started_at,
    result.completed_at
  );

  return db.prepare('SELECT * FROM benchmark_results WHERE id = ?').get(res.lastInsertRowid) as Result;
}

export function getExecutionDetails(executionId: number) {
  const db = getDatabase();
  const execution = getExecutionById(executionId);
  if (!execution) return null;

  const results = db.prepare(`
    SELECT
      br.id,
      br.execution_id,
      br.agent_id,
      br.test_case_id,
      br.status,
      br.actual_output,
      br.execution_steps,
      br.execution_answer,
      br.output_file,
      br.execution_time_ms,
      br.error_message,
      br.evaluation_error,
      br.started_at,
      br.completed_at,
      br.created_at,
      a.name as agent_name,
      tc.test_id,
      tc.name as test_case_name,
      tc.input as test_input,
      tc.expected_output,
      tc.key_points,
      tc.forbidden_points,
      e.score,
      e.report as evaluation_report,
      e.key_points_met,
      e.forbidden_points_violated
    FROM benchmark_results br
    JOIN agents a ON br.agent_id = a.id
    JOIN test_cases tc ON br.test_case_id = tc.id
    LEFT JOIN evaluations e ON e.result_id = br.id
    WHERE br.execution_id = ?
    ORDER BY br.id
  `).all(executionId);

  return {
    ...execution,
    results
  };
}

// 获取完整的 Benchmark 详情（包含 executions）
export function getBenchmarkDetails(benchmarkId: number) {
  const db = getDatabase();
  const benchmark = getBenchmarkById(benchmarkId);
  if (!benchmark) return null;

  // Get executions for this benchmark
  const executions = db.prepare(`
    SELECT
      be.*
    FROM benchmark_executions be
    WHERE be.benchmark_id = ?
    ORDER BY be.created_at DESC
  `).all(benchmarkId);

  return {
    ...benchmark,
    executions: executions || []
  };
}


export interface Model {
  id: number;
  name: string;
  model_id: string;
  provider: string;
  api_key: string | null;
  base_url: string | null;
  config: string | null;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export function getAllModels(): Model[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM models ORDER BY created_at DESC').all() as Model[];
}

export function getModelById(id: number): Model | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM models WHERE id = ?').get(id) as Model | undefined;
}

export function getDefaultModel(): Model | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM models WHERE is_default = 1 LIMIT 1').get() as Model | undefined;
}

export function createModel(model: Omit<Model, 'id' | 'created_at' | 'updated_at'>): Model {
  const db = getDatabase();
  const now = new Date().toISOString();

  const result = db.prepare(
    'INSERT INTO models (name, model_id, provider, api_key, base_url, config, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    model.name,
    model.model_id,
    model.provider,
    model.api_key,
    model.base_url,
    model.config,
    model.is_default,
    now,
    now
  );

  if (model.is_default) {
    db.prepare('UPDATE models SET is_default = 0 WHERE id != ?').run(result.lastInsertRowid);
  }

  return getModelById(result.lastInsertRowid as number)!;
}

export function updateModel(id: number, model: Partial<Omit<Model, 'id' | 'created_at' | 'updated_at'>>): Model {
  const db = getDatabase();
  const now = new Date().toISOString();

  const sets: string[] = [];
  const values: unknown[] = [];

  if (model.name !== undefined) { sets.push('name = ?'); values.push(model.name); }
  if (model.model_id !== undefined) { sets.push('model_id = ?'); values.push(model.model_id); }
  if (model.provider !== undefined) { sets.push('provider = ?'); values.push(model.provider); }
  if (model.api_key !== undefined) { sets.push('api_key = ?'); values.push(model.api_key); }
  if (model.base_url !== undefined) { sets.push('base_url = ?'); values.push(model.base_url); }
  if (model.config !== undefined) { sets.push('config = ?'); values.push(model.config); }
  if (model.is_default !== undefined) { sets.push('is_default = ?'); values.push(model.is_default); }

  sets.push('updated_at = ?');
  values.push(now);
  values.push(id);

  db.prepare('UPDATE models SET ' + sets.join(', ') + ' WHERE id = ?').run(...values);

  if (model.is_default) {
    db.prepare('UPDATE models SET is_default = 0 WHERE id != ?').run(id);
  }

  return getModelById(id)!;
}

export function deleteModel(id: number): void {
  const db = getDatabase();
  db.prepare('DELETE FROM models WHERE id = ?').run(id);
}

// ==================== TestSet 相关操作 ====================
export * from './testset';

// ==================== Benchmark V2 接口 ====================

// 新的 Benchmark 接口（向后兼容）
export interface BenchmarkV2 {
  id: number;
  name: string;
  description: string;
  agent_ids: string;
  test_set_id: number | null;
  evaluator_id: number | null;
  run_config: string;
  created_at: string;
  updated_at: string;
  // 扩展字段
  test_cases?: TestCase[];
  test_set?: TestSet;
}

// 获取 Benchmark 详情（包含测试集信息）
export function getBenchmarkWithTestSet(id: number): BenchmarkV2 | undefined {
  const db = getDatabase();
  const benchmark = db.prepare('SELECT * FROM benchmarks WHERE id = ?').get(id) as Benchmark | undefined;

  if (!benchmark) return undefined;

  let testSet: TestSet | undefined;
  let testCases: TestCase[] = [];

  if (benchmark.test_set_id) {
    testSet = db.prepare('SELECT * FROM test_sets WHERE id = ?').get(benchmark.test_set_id) as TestSet | undefined;
    testCases = db.prepare(`
      SELECT tc.* FROM test_cases tc
      JOIN test_set_items tsi ON tc.id = tsi.test_case_id
      WHERE tsi.test_set_id = ?
      ORDER BY tsi.order_index ASC
    `).all(benchmark.test_set_id) as TestCase[];
  } else if (benchmark.test_case_ids) {
    // 向后兼容：从 test_case_ids 获取
    try {
      const ids = JSON.parse(benchmark.test_case_ids) as number[];
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        testCases = db.prepare(`SELECT * FROM test_cases WHERE id IN (${placeholders})`).all(...ids) as TestCase[];
      }
    } catch {
      // 解析失败，忽略
    }
  }

  return {
    ...benchmark,
    test_set_id: benchmark.test_set_id || null,
    test_set: testSet,
    test_cases: testCases,
  };
}

// 创建 Benchmark（使用 test_set_id）
export function createBenchmarkV2(
  benchmark: Omit<BenchmarkV2, 'id' | 'created_at' | 'updated_at' | 'test_cases' | 'test_set'>
): BenchmarkV2 {
  const db = getDatabase();
  const now = new Date().toISOString();

  // 保持向后兼容：同时设置 test_case_ids
  let testCaseIds = '[]';
  if (benchmark.test_set_id) {
    const { getTestSetCaseIds } = require('./testset');
    const ids = getTestSetCaseIds(benchmark.test_set_id);
    testCaseIds = JSON.stringify(ids);
  }

  const result = db.prepare(
    'INSERT INTO benchmarks (name, description, agent_ids, test_set_id, test_case_ids, evaluator_id, run_config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    benchmark.name,
    benchmark.description,
    benchmark.agent_ids,
    benchmark.test_set_id,
    testCaseIds,
    benchmark.evaluator_id,
    benchmark.run_config,
    now,
    now
  );

  return getBenchmarkWithTestSet(result.lastInsertRowid as number)!;
}

// 更新 Benchmark
export function updateBenchmarkV2(
  id: number,
  benchmark: Partial<Omit<BenchmarkV2, 'id' | 'created_at' | 'updated_at' | 'test_cases' | 'test_set'>>
): BenchmarkV2 {
  const db = getDatabase();
  const now = new Date().toISOString();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (benchmark.name !== undefined) { sets.push('name = ?'); values.push(benchmark.name); }
  if (benchmark.description !== undefined) { sets.push('description = ?'); values.push(benchmark.description); }
  if (benchmark.agent_ids !== undefined) { sets.push('agent_ids = ?'); values.push(benchmark.agent_ids); }
  if (benchmark.evaluator_id !== undefined) { sets.push('evaluator_id = ?'); values.push(benchmark.evaluator_id); }
  if (benchmark.run_config !== undefined) { sets.push('run_config = ?'); values.push(benchmark.run_config); }

  if (benchmark.test_set_id !== undefined) {
    sets.push('test_set_id = ?');
    values.push(benchmark.test_set_id);

    // 同时更新 test_case_ids 以保持向后兼容
    if (benchmark.test_set_id) {
      const { getTestSetCaseIds } = require('./testset');
      const ids = getTestSetCaseIds(benchmark.test_set_id);
      sets.push('test_case_ids = ?');
      values.push(JSON.stringify(ids));
    } else {
      sets.push('test_case_ids = ?');
      values.push('[]');
    }
  }

  sets.push('updated_at = ?');
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE benchmarks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getBenchmarkWithTestSet(id)!;
}

// 获取所有 Benchmark（包含测试集信息）
export function getAllBenchmarksV2(): BenchmarkV2[] {
  const db = getDatabase();
  const benchmarks = db.prepare('SELECT * FROM benchmarks ORDER BY created_at DESC').all() as Benchmark[];

  return benchmarks.map(b => getBenchmarkWithTestSet(b.id)!).filter(Boolean);
}
