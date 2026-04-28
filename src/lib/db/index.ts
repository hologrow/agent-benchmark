import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "path";

function resolveDbPath(): string {
  const raw =
    process.env.DATABASE_PATH || join(process.cwd(), "data", "benchmark.db");
  return resolve(raw);
}

const DB_PATH = resolveDbPath();

let db: Database.Database | null = null;

/**
 * DB was created before Alembic (schema.sql / old migrator): tables exist but
 * `alembic_version` is missing → `upgrade head` would try CREATE TABLE again.
 * Stamp current head once so Alembic skips already-present schema.
 */
function maybeStampLegacyDatabase(dbPath: string) {
  if (!existsSync(dbPath)) return;
  const probe = new Database(dbPath, { readonly: true });
  try {
    const hasAgents = probe
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'agents'",
      )
      .get();
    if (!hasAgents) return;

    const hasVersionTable = probe
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'alembic_version'",
      )
      .get();
    let hasRevision = false;
    if (hasVersionTable) {
      const row = probe
        .prepare("SELECT version_num FROM alembic_version LIMIT 1")
        .get() as { version_num?: string } | undefined;
      hasRevision = Boolean(row?.version_num);
    }
    if (hasRevision) return;

    console.log(
      "[Database] Existing tables found without alembic_version; stamping head (one-time legacy bridge)",
    );
    execFileSync("uv", ["run", "alembic", "stamp", "head"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, DATABASE_PATH: dbPath },
    });
  } finally {
    probe.close();
  }
}

function runAlembicUpgrade(dbPath: string) {
  try {
    execFileSync("uv", ["run", "alembic", "upgrade", "head"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env, DATABASE_PATH: dbPath },
    });
  } catch (error) {
    console.error(
      "[Database] alembic upgrade head failed:",
      error instanceof Error ? error.message : error,
    );
    throw error;
  }
}

export function getDatabase(): Database.Database {
  if (!db) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    maybeStampLegacyDatabase(DB_PATH);
    runAlembicUpgrade(DB_PATH);
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
  }
  return db;
}

// Agent Types
export type AgentType = "openclaw" | "hermes" | "other";

// Agent related operations
export interface Agent {
  id: number;
  name: string;
  description: string;
  command: string; // Keep for backward compatibility, new code uses config_json
  agent_type: AgentType;
  config_json: string; // JSON format, stores type-specific configuration
  created_at: string;
  updated_at: string;
}

export function getAllAgents(): Agent[] {
  const db = getDatabase();
  return db
    .prepare("SELECT * FROM agents ORDER BY created_at DESC")
    .all() as Agent[];
}

export function getAgentById(id: number): Agent | undefined {
  const db = getDatabase();
  return db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as
    | Agent
    | undefined;
}

export function createAgent(
  agent: Omit<Agent, "id" | "created_at" | "updated_at">,
): Agent {
  const db = getDatabase();

  // Set default values
  const agentType = agent.agent_type || "other";
  const configJson = agent.config_json || "{}";
  const command = agent.command || "";

  const result = db
    .prepare(
      "INSERT INTO agents (name, description, command, agent_type, config_json) VALUES (?, ?, ?, ?, ?)",
    )
    .run(agent.name, agent.description, command, agentType, configJson);

  return getAgentById(result.lastInsertRowid as number)!;
}

export function updateAgent(
  id: number,
  agent: Partial<Omit<Agent, "id" | "created_at" | "updated_at">>,
): Agent {
  const db = getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (agent.name !== undefined) {
    sets.push("name = ?");
    values.push(agent.name);
  }
  if (agent.description !== undefined) {
    sets.push("description = ?");
    values.push(agent.description);
  }
  if (agent.command !== undefined) {
    sets.push("command = ?");
    values.push(agent.command);
  }
  if (agent.agent_type !== undefined) {
    sets.push("agent_type = ?");
    values.push(agent.agent_type);
  }
  if (agent.config_json !== undefined) {
    sets.push("config_json = ?");
    values.push(agent.config_json);
  }
  sets.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  db.prepare(`UPDATE agents SET ${sets.join(", ")} WHERE id = ?`).run(
    ...values,
  );
  return getAgentById(id)!;
}

export function deleteAgent(id: number): void {
  const db = getDatabase();
  db.prepare("DELETE FROM agents WHERE id = ?").run(id);
}

// Test Case related operations
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
  /** 创建人（展示名）；历史数据可能为空字符串 */
  created_by: string;
  /** JSON 数组字符串，每项为图片 data URL；无图为 null */
  images_json: string | null;
  created_at: string;
  updated_at: string;
}

export function getAllTestCases(): TestCase[] {
  const db = getDatabase();
  return db
    .prepare("SELECT * FROM test_cases ORDER BY created_at DESC")
    .all() as TestCase[];
}

export function getTestCaseById(id: number): TestCase | undefined {
  const db = getDatabase();
  return db.prepare("SELECT * FROM test_cases WHERE id = ?").get(id) as
    | TestCase
    | undefined;
}

export function createTestCase(
  testCase: Omit<
    TestCase,
    "id" | "created_at" | "updated_at" | "created_by" | "images_json"
  > & {
    created_by?: string;
    images_json?: string | null;
  },
): TestCase {
  const db = getDatabase();
  const imagesJson =
    testCase.images_json === undefined || testCase.images_json === ""
      ? null
      : testCase.images_json;
  const result = db
    .prepare(
      "INSERT INTO test_cases (test_id, name, description, input, expected_output, key_points, forbidden_points, category, how, created_by, images_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      testCase.test_id,
      testCase.name,
      testCase.description,
      testCase.input,
      testCase.expected_output,
      testCase.key_points,
      testCase.forbidden_points,
      testCase.category,
      testCase.how,
      testCase.created_by ?? "",
      imagesJson,
    );

  return getTestCaseById(result.lastInsertRowid as number)!;
}

export function updateTestCase(
  id: number,
  testCase: Partial<Omit<TestCase, "id" | "created_at" | "updated_at">>,
): TestCase {
  const db = getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (testCase.test_id !== undefined) {
    sets.push("test_id = ?");
    values.push(testCase.test_id);
  }
  if (testCase.name !== undefined) {
    sets.push("name = ?");
    values.push(testCase.name);
  }
  if (testCase.description !== undefined) {
    sets.push("description = ?");
    values.push(testCase.description);
  }
  if (testCase.input !== undefined) {
    sets.push("input = ?");
    values.push(testCase.input);
  }
  if (testCase.expected_output !== undefined) {
    sets.push("expected_output = ?");
    values.push(testCase.expected_output);
  }
  if (testCase.key_points !== undefined) {
    sets.push("key_points = ?");
    values.push(testCase.key_points);
  }
  if (testCase.forbidden_points !== undefined) {
    sets.push("forbidden_points = ?");
    values.push(testCase.forbidden_points);
  }
  if (testCase.category !== undefined) {
    sets.push("category = ?");
    values.push(testCase.category);
  }
  if (testCase.how !== undefined) {
    sets.push("how = ?");
    values.push(testCase.how);
  }
  if (testCase.created_by !== undefined) {
    sets.push("created_by = ?");
    values.push(testCase.created_by);
  }
  if (testCase.images_json !== undefined) {
    sets.push("images_json = ?");
    values.push(
      testCase.images_json === "" ? null : testCase.images_json,
    );
  }
  sets.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  db.prepare(`UPDATE test_cases SET ${sets.join(", ")} WHERE id = ?`).run(
    ...values,
  );
  return getTestCaseById(id)!;
}

export function deleteTestCase(id: number): void {
  const db = getDatabase();
  db.prepare("DELETE FROM test_cases WHERE id = ?").run(id);
}

// Evaluator related operations
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

// TestSet related operations
export interface TestSet {
  id: number;
  name: string;
  description: string;
  source: string;
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
  return db
    .prepare("SELECT * FROM evaluators ORDER BY created_at DESC")
    .all() as Evaluator[];
}

export function getEvaluatorById(id: number): Evaluator | undefined {
  const db = getDatabase();
  return db.prepare("SELECT * FROM evaluators WHERE id = ?").get(id) as
    | Evaluator
    | undefined;
}

export function createEvaluator(
  evaluator: Omit<Evaluator, "id" | "created_at" | "updated_at">,
): Evaluator {
  const db = getDatabase();
  const result = db
    .prepare(
      "INSERT INTO evaluators (name, description, script_path, config, model_id) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      evaluator.name,
      evaluator.description,
      evaluator.script_path,
      evaluator.config,
      evaluator.model_id ?? null,
    );

  return getEvaluatorById(result.lastInsertRowid as number)!;
}

export function updateEvaluator(
  id: number,
  evaluator: Partial<Omit<Evaluator, "id" | "created_at" | "updated_at">>,
): Evaluator {
  const db = getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (evaluator.name !== undefined) {
    sets.push("name = ?");
    values.push(evaluator.name);
  }
  if (evaluator.description !== undefined) {
    sets.push("description = ?");
    values.push(evaluator.description);
  }
  if (evaluator.script_path !== undefined) {
    sets.push("script_path = ?");
    values.push(evaluator.script_path);
  }
  if (evaluator.config !== undefined) {
    sets.push("config = ?");
    values.push(evaluator.config);
  }
  if (evaluator.model_id !== undefined) {
    sets.push("model_id = ?");
    values.push(evaluator.model_id);
  }
  sets.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  db.prepare(`UPDATE evaluators SET ${sets.join(", ")} WHERE id = ?`).run(
    ...values,
  );
  return getEvaluatorById(id)!;
}

export function deleteEvaluator(id: number): void {
  const db = getDatabase();
  db.prepare("DELETE FROM evaluators WHERE id = ?").run(id);
}

// Benchmark Run related operations
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
  return db
    .prepare("SELECT * FROM benchmarks ORDER BY created_at DESC")
    .all() as Benchmark[];
}

export function getBenchmarkById(id: number): Benchmark | undefined {
  const db = getDatabase();
  return db.prepare("SELECT * FROM benchmarks WHERE id = ?").get(id) as
    | Benchmark
    | undefined;
}

export function createBenchmark(
  benchmark: Omit<Benchmark, "id" | "created_at" | "updated_at">,
): Benchmark {
  const db = getDatabase();
  const now = new Date().toISOString();
  const result = db
    .prepare(
      "INSERT INTO benchmarks (name, description, agent_ids, test_case_ids, test_set_id, evaluator_id, run_config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      benchmark.name,
      benchmark.description,
      benchmark.agent_ids,
      benchmark.test_case_ids,
      benchmark.test_set_id ?? null,
      benchmark.evaluator_id,
      benchmark.run_config,
      now,
      now,
    );

  return getBenchmarkById(result.lastInsertRowid as number)!;
}

export function updateBenchmark(
  id: number,
  benchmark: Partial<Omit<Benchmark, "id" | "created_at" | "updated_at">>,
): Benchmark {
  const db = getDatabase();
  const now = new Date().toISOString();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (benchmark.name !== undefined) {
    sets.push("name = ?");
    values.push(benchmark.name);
  }
  if (benchmark.description !== undefined) {
    sets.push("description = ?");
    values.push(benchmark.description);
  }
  if (benchmark.agent_ids !== undefined) {
    sets.push("agent_ids = ?");
    values.push(benchmark.agent_ids);
  }
  if (benchmark.test_case_ids !== undefined) {
    sets.push("test_case_ids = ?");
    values.push(benchmark.test_case_ids);
  }
  if (benchmark.test_set_id !== undefined) {
    sets.push("test_set_id = ?");
    values.push(benchmark.test_set_id);
  }
  if (benchmark.evaluator_id !== undefined) {
    sets.push("evaluator_id = ?");
    values.push(benchmark.evaluator_id);
  }
  if (benchmark.run_config !== undefined) {
    sets.push("run_config = ?");
    values.push(benchmark.run_config);
  }
  sets.push("updated_at = ?");
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE benchmarks SET ${sets.join(", ")} WHERE id = ?`).run(
    ...values,
  );
  return getBenchmarkById(id)!;
}

export function deleteBenchmark(id: number): void {
  const db = getDatabase();
  db.prepare("DELETE FROM benchmarks WHERE id = ?").run(id);
}

// Benchmark Result related operations (deprecated, keeping aliases for backward compatibility)
export interface BenchmarkResult {
  id: number;
  execution_id: number;
  agent_id: number;
  test_case_id: number;
  status: "pending" | "running" | "completed" | "failed" | "timeout";
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
  return db
    .prepare(
      "SELECT * FROM benchmark_results WHERE execution_id = ? ORDER BY id",
    )
    .all(runId) as BenchmarkResult[];
}

export function getBenchmarkResultById(
  id: number,
): BenchmarkResult | undefined {
  const db = getDatabase();
  return db.prepare("SELECT * FROM benchmark_results WHERE id = ?").get(id) as
    | BenchmarkResult
    | undefined;
}

export function createBenchmarkResult(
  result: Omit<BenchmarkResult, "id" | "created_at">,
): BenchmarkResult {
  const db = getDatabase();
  const stmt = db.prepare(
    "INSERT INTO benchmark_results (execution_id, agent_id, test_case_id, status, actual_output, output_file, execution_time_ms, error_message, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
    result.completed_at,
  );

  return getBenchmarkResultById(res.lastInsertRowid as number)!;
}

export function updateBenchmarkResult(
  id: number,
  result: Partial<Omit<BenchmarkResult, "id" | "created_at">>,
): BenchmarkResult {
  const db = getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (result.execution_id !== undefined) {
    sets.push("execution_id = ?");
    values.push(result.execution_id);
  }
  if (result.agent_id !== undefined) {
    sets.push("agent_id = ?");
    values.push(result.agent_id);
  }
  if (result.test_case_id !== undefined) {
    sets.push("test_case_id = ?");
    values.push(result.test_case_id);
  }
  if (result.status !== undefined) {
    sets.push("status = ?");
    values.push(result.status);
  }
  if (result.actual_output !== undefined) {
    sets.push("actual_output = ?");
    values.push(result.actual_output);
  }
  if (result.output_file !== undefined) {
    sets.push("output_file = ?");
    values.push(result.output_file);
  }
  if (result.execution_time_ms !== undefined) {
    sets.push("execution_time_ms = ?");
    values.push(result.execution_time_ms);
  }
  if (result.error_message !== undefined) {
    sets.push("error_message = ?");
    values.push(result.error_message);
  }
  if (result.evaluation_error !== undefined) {
    sets.push("evaluation_error = ?");
    values.push(result.evaluation_error);
  }
  if (result.started_at !== undefined) {
    sets.push("started_at = ?");
    values.push(result.started_at);
  }
  if (result.completed_at !== undefined) {
    sets.push("completed_at = ?");
    values.push(result.completed_at);
  }
  values.push(id);

  db.prepare(
    `UPDATE benchmark_results SET ${sets.join(", ")} WHERE id = ?`,
  ).run(...values);
  return getBenchmarkResultById(id)!;
}

// Evaluation related operations
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
  return db
    .prepare("SELECT * FROM evaluations WHERE execution_id = ? ORDER BY id")
    .all(runId) as Evaluation[];
}

export function getEvaluationByResultId(
  resultId: number,
): Evaluation | undefined {
  const db = getDatabase();
  return db
    .prepare("SELECT * FROM evaluations WHERE result_id = ?")
    .get(resultId) as Evaluation | undefined;
}

export function createEvaluation(
  evaluation: Omit<Evaluation, "id" | "evaluated_at">,
): Evaluation {
  const db = getDatabase();
  const result = db
    .prepare(
      "INSERT INTO evaluations (execution_id, result_id, score, report, key_points_met, forbidden_points_violated) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      evaluation.execution_id,
      evaluation.result_id,
      evaluation.score,
      evaluation.report,
      evaluation.key_points_met,
      evaluation.forbidden_points_violated,
    );

  return db
    .prepare("SELECT * FROM evaluations WHERE id = ?")
    .get(result.lastInsertRowid) as Evaluation;
}

// Execution related operations (corresponds to benchmark_executions table)
export interface Execution {
  id: number;
  benchmark_id: number;
  name: string | null;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  evaluation_status: "pending" | "running" | "completed" | "failed" | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  pid: number | null;
}

export function getExecutionsByBenchmarkId(benchmarkId: number): Execution[] {
  const db = getDatabase();
  return db
    .prepare(
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
    ORDER BY created_at DESC`,
    )
    .all(benchmarkId) as Execution[];
}

export function getExecutionById(id: number): Execution | undefined {
  const db = getDatabase();
  return db
    .prepare(
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
    WHERE id = ?`,
    )
    .get(id) as Execution | undefined;
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
  const result = db
    .prepare(
      `INSERT INTO benchmark_executions (benchmark_id, name, status, started_at, completed_at, pid)
     VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      execution.benchmark_id,
      execution.name,
      execution.status,
      execution.started_at,
      execution.completed_at,
      execution.pid ?? null,
    );

  return getExecutionById(result.lastInsertRowid as number)!;
}

export function updateExecution(
  id: number,
  execution: Partial<
    Pick<
      Execution,
      "status" | "started_at" | "completed_at" | "evaluation_status" | "pid"
    >
  >,
): Execution {
  const db = getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (execution.status !== undefined) {
    sets.push("status = ?");
    values.push(execution.status);
  }
  if (execution.started_at !== undefined) {
    sets.push("started_at = ?");
    values.push(execution.started_at);
  }
  if (execution.completed_at !== undefined) {
    sets.push("completed_at = ?");
    values.push(execution.completed_at);
  }
  if (execution.evaluation_status !== undefined) {
    sets.push("evaluation_status = ?");
    values.push(execution.evaluation_status);
  }
  if (execution.pid !== undefined) {
    sets.push("pid = ?");
    values.push(execution.pid);
  }
  values.push(id);

  db.prepare(
    `UPDATE benchmark_executions SET ${sets.join(", ")} WHERE id = ?`,
  ).run(...values);
  return getExecutionById(id)!;
}

export function deleteExecution(id: number): void {
  const db = getDatabase();
  db.prepare("DELETE FROM benchmark_executions WHERE id = ?").run(id);
}

// Result related operations (corresponds to benchmark_results table)
export interface Result {
  id: number;
  execution_id: number;
  agent_id: number;
  test_case_id: number;
  status:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "timeout"
    | "cancelled";
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
  magic_code: string | null;
}

export function createResult(
  result: Omit<Result, "id" | "created_at">,
): Result {
  const db = getDatabase();
  const stmt = db.prepare(
    "INSERT INTO benchmark_results (execution_id, agent_id, test_case_id, status, actual_output, output_file, execution_time_ms, error_message, started_at, completed_at, magic_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
    result.completed_at,
    result.magic_code ?? null,
  );

  return db
    .prepare("SELECT * FROM benchmark_results WHERE id = ?")
    .get(res.lastInsertRowid) as Result;
}

export function getExecutionDetails(executionId: number) {
  const db = getDatabase();
  const execution = getExecutionById(executionId);
  if (!execution) return null;

  const results = db
    .prepare(
      `
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
      br.magic_code,
      a.name as agent_name,
      tc.test_id,
      tc.name as test_case_name,
      tc.created_by as test_case_created_by,
      tc.input as test_input,
      tc.expected_output,
      tc.key_points,
      tc.forbidden_points,
      e.score,
      e.report as evaluation_report,
      e.key_points_met,
      e.forbidden_points_violated,
      et.trace_id,
      et.synced_at as trace_synced_at,
      et.trace_content,
      dr.diagnosis_report
    FROM benchmark_results br
    JOIN agents a ON br.agent_id = a.id
    JOIN test_cases tc ON br.test_case_id = tc.id
    LEFT JOIN evaluations e ON e.result_id = br.id
    LEFT JOIN execution_traces et ON et.result_id = br.id
    LEFT JOIN diagnosis_results dr ON dr.result_id = br.id
    WHERE br.execution_id = ?
    ORDER BY br.id
  `,
    )
    .all(executionId);

  return {
    ...execution,
    results,
  };
}

// Get complete Benchmark details (including executions)
export function getBenchmarkDetails(benchmarkId: number) {
  const db = getDatabase();
  const benchmark = getBenchmarkById(benchmarkId);
  if (!benchmark) return null;

  // Get executions for this benchmark
  const executions = db
    .prepare(
      `
    SELECT
      be.*
    FROM benchmark_executions be
    WHERE be.benchmark_id = ?
    ORDER BY be.created_at DESC
  `,
    )
    .all(benchmarkId);

  return {
    ...benchmark,
    executions: executions || [],
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
  return db
    .prepare("SELECT * FROM models ORDER BY created_at DESC")
    .all() as Model[];
}

export function getModelById(id: number): Model | undefined {
  const db = getDatabase();
  return db.prepare("SELECT * FROM models WHERE id = ?").get(id) as
    | Model
    | undefined;
}

export function getDefaultModel(): Model | undefined {
  const db = getDatabase();
  return db
    .prepare("SELECT * FROM models WHERE is_default = 1 LIMIT 1")
    .get() as Model | undefined;
}

export function createModel(
  model: Omit<Model, "id" | "created_at" | "updated_at">,
): Model {
  const db = getDatabase();
  const now = new Date().toISOString();

  const result = db
    .prepare(
      "INSERT INTO models (name, model_id, provider, api_key, base_url, config, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      model.name,
      model.model_id,
      model.provider,
      model.api_key,
      model.base_url,
      model.config,
      model.is_default,
      now,
      now,
    );

  if (model.is_default) {
    db.prepare("UPDATE models SET is_default = 0 WHERE id != ?").run(
      result.lastInsertRowid,
    );
  }

  return getModelById(result.lastInsertRowid as number)!;
}

export function updateModel(
  id: number,
  model: Partial<Omit<Model, "id" | "created_at" | "updated_at">>,
): Model {
  const db = getDatabase();
  const now = new Date().toISOString();

  const sets: string[] = [];
  const values: unknown[] = [];

  if (model.name !== undefined) {
    sets.push("name = ?");
    values.push(model.name);
  }
  if (model.model_id !== undefined) {
    sets.push("model_id = ?");
    values.push(model.model_id);
  }
  if (model.provider !== undefined) {
    sets.push("provider = ?");
    values.push(model.provider);
  }
  if (model.api_key !== undefined) {
    sets.push("api_key = ?");
    values.push(model.api_key);
  }
  if (model.base_url !== undefined) {
    sets.push("base_url = ?");
    values.push(model.base_url);
  }
  if (model.config !== undefined) {
    sets.push("config = ?");
    const c = model.config;
    values.push(
      c === null
        ? null
        : typeof c === "string"
          ? c
          : JSON.stringify(c),
    );
  }
  if (model.is_default !== undefined) {
    sets.push("is_default = ?");
    values.push(model.is_default);
  }

  sets.push("updated_at = ?");
  values.push(now);
  values.push(id);

  db.prepare("UPDATE models SET " + sets.join(", ") + " WHERE id = ?").run(
    ...values,
  );

  if (model.is_default) {
    db.prepare("UPDATE models SET is_default = 0 WHERE id != ?").run(id);
  }

  return getModelById(id)!;
}

export function deleteModel(id: number): void {
  const db = getDatabase();
  db.prepare("DELETE FROM models WHERE id = ?").run(id);
}

// ==================== TestSet related operations ====================
export * from "./testset";

// ==================== Benchmark V2 Interfaces ====================

// New Benchmark interface (backward compatible)
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
  // Extended fields
  test_cases?: TestCase[];
  test_set?: TestSet;
}

// Get Benchmark details (including test set information)
export function getBenchmarkWithTestSet(id: number): BenchmarkV2 | undefined {
  const db = getDatabase();
  const benchmark = db
    .prepare("SELECT * FROM benchmarks WHERE id = ?")
    .get(id) as Benchmark | undefined;

  if (!benchmark) return undefined;

  let testSet: TestSet | undefined;
  let testCases: TestCase[] = [];

  if (benchmark.test_set_id) {
    testSet = db
      .prepare("SELECT * FROM test_sets WHERE id = ?")
      .get(benchmark.test_set_id) as TestSet | undefined;
    testCases = db
      .prepare(
        `
      SELECT tc.* FROM test_cases tc
      JOIN test_set_items tsi ON tc.id = tsi.test_case_id
      WHERE tsi.test_set_id = ?
      ORDER BY tsi.order_index ASC
    `,
      )
      .all(benchmark.test_set_id) as TestCase[];
  } else if (benchmark.test_case_ids) {
    // Backward compatible: get from test_case_ids
    try {
      const ids = JSON.parse(benchmark.test_case_ids) as number[];
      if (ids.length > 0) {
        const placeholders = ids.map(() => "?").join(",");
        testCases = db
          .prepare(`SELECT * FROM test_cases WHERE id IN (${placeholders})`)
          .all(...ids) as TestCase[];
      }
    } catch {
      // Parse failed, ignore
    }
  }

  return {
    ...benchmark,
    test_set_id: benchmark.test_set_id || null,
    test_set: testSet,
    test_cases: testCases,
  };
}

// Create Benchmark (using test_set_id)
export function createBenchmarkV2(
  benchmark: Omit<
    BenchmarkV2,
    "id" | "created_at" | "updated_at" | "test_cases" | "test_set"
  >,
): BenchmarkV2 {
  const db = getDatabase();
  const now = new Date().toISOString();

  // Keep backward compatible: also set test_case_ids
  let testCaseIds = "[]";
  if (benchmark.test_set_id) {
    const { getTestSetCaseIds } = require("./testset");
    const ids = getTestSetCaseIds(benchmark.test_set_id);
    testCaseIds = JSON.stringify(ids);
  }

  const result = db
    .prepare(
      "INSERT INTO benchmarks (name, description, agent_ids, test_set_id, test_case_ids, evaluator_id, run_config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      benchmark.name,
      benchmark.description,
      benchmark.agent_ids,
      benchmark.test_set_id,
      testCaseIds,
      benchmark.evaluator_id,
      benchmark.run_config,
      now,
      now,
    );

  return getBenchmarkWithTestSet(result.lastInsertRowid as number)!;
}

// Update Benchmark
export function updateBenchmarkV2(
  id: number,
  benchmark: Partial<
    Omit<
      BenchmarkV2,
      "id" | "created_at" | "updated_at" | "test_cases" | "test_set"
    >
  >,
): BenchmarkV2 {
  const db = getDatabase();
  const now = new Date().toISOString();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (benchmark.name !== undefined) {
    sets.push("name = ?");
    values.push(benchmark.name);
  }
  if (benchmark.description !== undefined) {
    sets.push("description = ?");
    values.push(benchmark.description);
  }
  if (benchmark.agent_ids !== undefined) {
    sets.push("agent_ids = ?");
    values.push(benchmark.agent_ids);
  }
  if (benchmark.evaluator_id !== undefined) {
    sets.push("evaluator_id = ?");
    values.push(benchmark.evaluator_id);
  }
  if (benchmark.run_config !== undefined) {
    sets.push("run_config = ?");
    values.push(benchmark.run_config);
  }

  if (benchmark.test_set_id !== undefined) {
    sets.push("test_set_id = ?");
    values.push(benchmark.test_set_id);

    // Also update test_case_ids to maintain backward compatibility
    if (benchmark.test_set_id) {
      const { getTestSetCaseIds } = require("./testset");
      const ids = getTestSetCaseIds(benchmark.test_set_id);
      sets.push("test_case_ids = ?");
      values.push(JSON.stringify(ids));
    } else {
      sets.push("test_case_ids = ?");
      values.push("[]");
    }
  }

  sets.push("updated_at = ?");
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE benchmarks SET ${sets.join(", ")} WHERE id = ?`).run(
    ...values,
  );
  return getBenchmarkWithTestSet(id)!;
}

// Get all Benchmarks (including test set information)
export function getAllBenchmarksV2(): BenchmarkV2[] {
  const db = getDatabase();
  const benchmarks = db
    .prepare("SELECT * FROM benchmarks ORDER BY created_at DESC")
    .all() as Benchmark[];

  return benchmarks.map((b) => getBenchmarkWithTestSet(b.id)!).filter(Boolean);
}

// ==================== Integration related operations ====================

export interface Integration {
  id: number;
  name: string;
  type: string;
  enabled: number;
  config: string;
  created_at: string;
  updated_at: string;
}

export function getAllIntegrations(): Integration[] {
  const db = getDatabase();
  return db
    .prepare("SELECT * FROM integrations ORDER BY created_at DESC")
    .all() as Integration[];
}

export function getIntegrationByType(type: string): Integration | undefined {
  const db = getDatabase();
  return db.prepare("SELECT * FROM integrations WHERE type = ?").get(type) as
    | Integration
    | undefined;
}

export function createIntegration(
  integration: Omit<Integration, "id" | "created_at" | "updated_at">,
): Integration {
  const db = getDatabase();
  const result = db
    .prepare(
      "INSERT INTO integrations (name, type, enabled, config) VALUES (?, ?, ?, ?)",
    )
    .run(
      integration.name,
      integration.type,
      integration.enabled,
      integration.config,
    );

  return db
    .prepare("SELECT * FROM integrations WHERE id = ?")
    .get(result.lastInsertRowid) as Integration;
}

export function updateIntegration(
  id: number,
  integration: Partial<Omit<Integration, "id" | "created_at" | "updated_at">>,
): Integration {
  const db = getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (integration.name !== undefined) {
    sets.push("name = ?");
    values.push(integration.name);
  }
  if (integration.type !== undefined) {
    sets.push("type = ?");
    values.push(integration.type);
  }
  if (integration.enabled !== undefined) {
    sets.push("enabled = ?");
    values.push(integration.enabled);
  }
  if (integration.config !== undefined) {
    sets.push("config = ?");
    values.push(integration.config);
  }
  sets.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  db.prepare(`UPDATE integrations SET ${sets.join(", ")} WHERE id = ?`).run(
    ...values,
  );
  return db
    .prepare("SELECT * FROM integrations WHERE id = ?")
    .get(id) as Integration;
}

export function upsertIntegrationByType(
  type: string,
  integration: Omit<Integration, "id" | "created_at" | "updated_at" | "type">,
): Integration {
  const existing = getIntegrationByType(type);

  if (existing) {
    return updateIntegration(existing.id, { ...integration, type });
  } else {
    return createIntegration({ ...integration, type });
  }
}

export function deleteIntegration(id: number): void {
  const db = getDatabase();
  db.prepare("DELETE FROM integrations WHERE id = ?").run(id);
}

// ==================== Execution Traces related operations ====================

export interface ExecutionTrace {
  id: number;
  result_id: number;
  trace_id: string;
  magic_code: string;
  trace_content: string | null;
  synced_at: string;
  created_at: string;
}

export function createExecutionTrace(
  trace: Omit<ExecutionTrace, "id" | "synced_at" | "created_at">,
): ExecutionTrace {
  const db = getDatabase();
  const result = db
    .prepare(
      "INSERT INTO execution_traces (result_id, trace_id, magic_code, trace_content) VALUES (?, ?, ?, ?)",
    )
    .run(
      trace.result_id,
      trace.trace_id,
      trace.magic_code,
      trace.trace_content ?? null,
    );

  return db
    .prepare("SELECT * FROM execution_traces WHERE id = ?")
    .get(result.lastInsertRowid) as ExecutionTrace;
}

export function getExecutionTraceByResultId(
  result_id: number,
): ExecutionTrace | undefined {
  const db = getDatabase();
  return db
    .prepare("SELECT * FROM execution_traces WHERE result_id = ?")
    .get(result_id) as ExecutionTrace | undefined;
}

export function getExecutionTraceByMagicCode(
  magic_code: string,
): ExecutionTrace | undefined {
  const db = getDatabase();
  return db
    .prepare("SELECT * FROM execution_traces WHERE magic_code = ?")
    .get(magic_code) as ExecutionTrace | undefined;
}

export function getPendingTraceSyncResults(execution_id: number): Result[] {
  const db = getDatabase();
  return db
    .prepare(
      `
    SELECT br.* FROM benchmark_results br
    LEFT JOIN execution_traces et ON br.id = et.result_id
    WHERE br.execution_id = ?
      AND br.magic_code IS NOT NULL
      AND br.status = 'completed'
      AND et.id IS NULL
    ORDER BY br.id
  `,
    )
    .all(execution_id) as Result[];
}

export function updateExecutionTraceSyncTime(result_id: number): void {
  const db = getDatabase();
  db.prepare(
    "UPDATE execution_traces SET synced_at = CURRENT_TIMESTAMP WHERE result_id = ?",
  ).run(result_id);
}

// ==================== Result update operations ====================

export function updateResult(
  id: number,
  result: Partial<
    Pick<
      Result,
      | "status"
      | "actual_output"
      | "execution_steps"
      | "execution_answer"
      | "output_file"
      | "execution_time_ms"
      | "error_message"
      | "evaluation_error"
      | "started_at"
      | "completed_at"
    >
  >,
): Result {
  const db = getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (result.status !== undefined) {
    sets.push("status = ?");
    values.push(result.status);
  }
  if (result.actual_output !== undefined) {
    sets.push("actual_output = ?");
    values.push(result.actual_output);
  }
  if (result.execution_steps !== undefined) {
    sets.push("execution_steps = ?");
    values.push(result.execution_steps);
  }
  if (result.execution_answer !== undefined) {
    sets.push("execution_answer = ?");
    values.push(result.execution_answer);
  }
  if (result.output_file !== undefined) {
    sets.push("output_file = ?");
    values.push(result.output_file);
  }
  if (result.execution_time_ms !== undefined) {
    sets.push("execution_time_ms = ?");
    values.push(result.execution_time_ms);
  }
  if (result.error_message !== undefined) {
    sets.push("error_message = ?");
    values.push(result.error_message);
  }
  if (result.evaluation_error !== undefined) {
    sets.push("evaluation_error = ?");
    values.push(result.evaluation_error);
  }
  if (result.started_at !== undefined) {
    sets.push("started_at = ?");
    values.push(result.started_at);
  }
  if (result.completed_at !== undefined) {
    sets.push("completed_at = ?");
    values.push(result.completed_at);
  }
  values.push(id);

  db.prepare(
    `UPDATE benchmark_results SET ${sets.join(", ")} WHERE id = ?`,
  ).run(...values);
  return db
    .prepare("SELECT * FROM benchmark_results WHERE id = ?")
    .get(id) as Result;
}

// ==================== Diagnosis Results related operations ====================

export interface DiagnosisResult {
  id: number;
  result_id: number;
  diagnosis_report: string;
  model_id: number | null;
  created_at: string;
}

export function getDiagnosisResultByResultId(
  result_id: number,
): DiagnosisResult | undefined {
  const db = getDatabase();
  return db
    .prepare("SELECT * FROM diagnosis_results WHERE result_id = ?")
    .get(result_id) as DiagnosisResult | undefined;
}

export function createDiagnosisResult(
  diagnosis: Omit<DiagnosisResult, "id" | "created_at">,
): DiagnosisResult {
  const db = getDatabase();
  const result = db
    .prepare(
      "INSERT INTO diagnosis_results (result_id, diagnosis_report, model_id) VALUES (?, ?, ?)",
    )
    .run(
      diagnosis.result_id,
      diagnosis.diagnosis_report,
      diagnosis.model_id ?? null,
    );

  return db
    .prepare("SELECT * FROM diagnosis_results WHERE id = ?")
    .get(result.lastInsertRowid) as DiagnosisResult;
}

export function deleteDiagnosisResultByResultId(result_id: number): void {
  const db = getDatabase();
  db.prepare("DELETE FROM diagnosis_results WHERE result_id = ?").run(
    result_id,
  );
}
