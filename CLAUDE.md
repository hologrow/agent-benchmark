# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Agent Benchmark Platform for executing, evaluating, and managing AI Agent test cases. Supports multiple agent types (OpenClaw, Hermes, custom), Lark/Feishu integration for test case sync, and LLM-based evaluation.

## Tech Stack

- **Frontend**: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui
- **Backend**: Next.js API Routes + SQLite (better-sqlite3)
- **Execution Engine**: Python 3.12+ with `uv` package manager
- **Agent Protocol**: ACPX

## Commands

```bash
# Development
npm run dev              # Start Next.js dev server (port 3000)

# Build & Deploy
npm run build            # Build for production (outputs to .next/)
npm run start            # Start production server

# Code Quality
npm run lint             # Run ESLint (Next.js core-web-vitals + typescript)

# Python Tests
cd tests && uv run run_tests.py           # Run all Python tests
python -m unittest tests.test_output_parser  # Run specific module
pytest tests/ --cov=scripts --cov-report=html # Run with coverage
```

## Architecture

### Next.js App Router Structure

- `src/app/page.tsx` - Dashboard
- `src/app/agents/page.tsx` - Agent management (OpenClaw/Hermes/Other)
- `src/app/test-sets/page.tsx` - Test case management with Lark sync
- `src/app/benchmarks/page.tsx` - Benchmark configuration
- `src/app/benchmarks/[id]/page.tsx` - Execution results & evaluation
- `src/app/api/**/route.ts` - API routes following Next.js convention

### Agent Adapter Pattern

Located in `src/lib/adapters/`. Three agent types supported:

1. **openclaw** - Uses `openclaw` CLI with URL + token
2. **hermes** - Command-line agent via shell template
3. **other** - Generic command-line agent

```typescript
// Factory returns appropriate adapter by type
const adapter = AgentAdapterFactory.getAdapter('openclaw');
const result = await adapter.execute({ agent, prompt, executionId });
```

Agent configuration is stored as JSON in `agents.config_json`:
- OpenClaw: `{ url: string, token: string }`
- Command agents: `{ command: string }` (uses `{{prompt}}`, `{{execution_id}}` variables)

### Database Layer

SQLite with migrations in `src/lib/db/migrations/`. Key tables:

- `agents` - Agent configs with `agent_type` + `config_json`
- `test_cases` - Individual test cases with key/forbidden points
- `test_sets` / `test_set_items` - Grouped test cases
- `benchmarks` - Benchmark configuration (agent_ids, test_set_id, evaluator_id)
- `benchmark_executions` - Individual run instances
- `benchmark_results` - Per-agent-per-test-case results
- `evaluations` - LLM-generated scores and reports
- `evaluators` - Evaluation configuration referencing model + script
- `models` - LLM model configs for evaluation

Migrations run automatically on startup via `src/lib/db/migrator.ts`.

### Benchmark Execution Flow

1. User creates Benchmark → stored in `benchmarks` table
2. User clicks "Run" → creates `benchmark_execution` record
3. Next.js API spawns Python: `scripts/run_benchmark.py <execution_id>`
4. Python script:
   - Reads execution config from SQLite
   - For each (agent, test_case) pair:
     - Updates `benchmark_results` status to 'running'
     - Executes agent command (shell subprocess)
     - Streams output to `results/execution_log_*.md`
     - Parses output via `output_parser.py` → `execution_steps` + `execution_answer`
     - Updates result with status, timing, output
   - On completion, if evaluator configured → spawns `run_evaluator.py`

### Evaluation System

`scripts/run_evaluator.py` uses LLM (via `ai` SDK or OpenAI) to score outputs:

- Loads evaluator config → builds prompt template
- Substitutes variables: `{{actual_output}}`, `{{expected_output}}`, `{{key_points}}`, etc.
- Calls LLM → parses JSON response → stores in `evaluations` table

### Python Scripts

Located in `scripts/`:

- `run_benchmark.py` - Main benchmark execution (multiprocess support via `max_workers`)
- `run_evaluator.py` - LLM-based evaluation
- `output_parser.py` - Parses agent output into steps/answer

Python environment managed via `uv` (see `pyproject.toml`).

### Testing

Python tests in `tests/` using unittest:

- `test_output_parser.py` - Output parsing logic
- `test_run_benchmark.py` - Benchmark execution
- `test_run_evaluator.py` - Evaluation logic
- `test_integration.py` - End-to-end workflow
- `fixtures/` - Test database helpers and sample data

Tests use in-memory SQLite; no external dependencies required.

## Important Notes

- **Next.js Version**: This is Next.js 16 with React 19. Check `node_modules/next/dist/docs/` for current APIs. Some conventions may differ from standard Next.js documentation.
- **SQLite**: Uses `better-sqlite3` (synchronous). Database path configurable via `DATABASE_PATH` env var (default: `data/benchmark.db`).
- **Python Execution**: Benchmarks run via shell subprocess spawning Python, not embedded. Requires `uv` and Python 3.12+ on host.
- **Agent Types**: New agent types require: (1) add to `AgentType` in `src/lib/db/index.ts`, (2) create adapter in `src/lib/adapters/`, (3) register in `agent-adapter.ts` factory.

## Environment Variables

```bash
DATABASE_PATH=data/benchmark.db     # SQLite path
LARK_APP_ID=xxx                     # Feishu/Lark app credentials
LARK_APP_SECRET=xxx
LARK_APP_TYPE=feishu                # or 'lark' for international
```
