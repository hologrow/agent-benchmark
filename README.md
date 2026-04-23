<div align="center">
  <img src="./public/logo.png" width="100" />
</div>

A Real-World Agent Benchmark System


## Features

1. **Benchmark Dashboard** - View test case expected output, expected path, key test points, forbidden points
2. **Test Set Management** - Manage Golden Dataset with support for syncing from Lark/Feishu Bitable (by plugin)
3. **Agent Support** - Supports the openclaw/hermes agent, as well as other agents—provided they are ACP-compatible or support script execution..
4. **Evaluator Management** - Configure evaluators with variable reference support for context
5. **Benchmark Execution** - Launch test execution with support for variable injection and format requirements
6. **AI Diagnostics** Automatically diagnoses link anomalies based on execution traces, optimizes the tool call pipeline, and improves response time and accuracy.

# AgentBenchmark

![workflow](./workflow.png)

AI Agent Benchmark Platform for executing, evaluating, and managing AI Agent test cases.

## Golden Dataset

A **golden dataset** entry is not only a question–answer pair. Each item is defined by:

| Element | Role |
|--------|------|
| **Question** | The user-facing task or instruction the agent must solve |
| **Expected answer** | The reference outcome (what “right” looks like at the output level) |
| **Key points** | Non-negotiable criteria that must be met for the solution to count as correct |
| **Prohibited behaviors** | Patterns, shortcuts, or outputs that must **not** occur |
| **How to implement** | The intended approach: ordering of steps, APIs or tools to use, and other constraints on *how* the problem should be solved |

**What we grade on.** Evaluations in this project treat the following as the primary signals:

1. **Key points** — Are all required criteria satisfied?
2. **Prohibited behaviors** — Does the run stay clear of every forbidden pattern?
3. **Implementation path** — Does the agent follow the prescribed way to implement the solution, not only land on a plausible final answer?

Surface-level agreement with the expected answer is insufficient if key points are missed, forbidden behavior appears, or the prescribed path is ignored.

## Testing Philosophy

For each benchmark item, we aim for **a single canonical path** from problem statement to correct solution—the one that reflects the intended reasoning, tool use, and constraints. If several unrelated approaches could all produce a similar-looking answer, the case should be tightened until **only one path** is fully defensible.

Under this philosophy, **even when the final answer matches the reference, scores stay low if the agent took a different valid-looking route** or skipped steps that the golden path encodes. Correctness is judged on **process fidelity and constraint adherence**, not on output alone.


## Screenshots


<table>
  <tr>
    <td align="center" width="50%">
      <img width="1090" alt="Snipaste_2026-04-22_13-20-53" src="https://github.com/user-attachments/assets/26c0feaa-c317-4cf9-a408-b3d9d732ef69" />
    </td>
    <td align="center" width="50%">
      <img width="1090" alt="Snipaste_2026-04-22_13-28-08" src="https://github.com/user-attachments/assets/fdbe0027-29c1-4e16-8a76-53d18ba07dbb" />
    </td>
  </tr>
  <tr>
     <td align="center" width="50%">
          <img width="1090" height="699" alt="Snipaste_2026-04-22_13-21-39" src="https://github.com/user-attachments/assets/44c138d6-3706-4406-8607-8ab175021829" />
    </td>
    <td align="center" width="50%">
            <img width="1090" height="699" alt="Snipaste_2026-04-22_13-21-54" src="https://github.com/user-attachments/assets/7393d196-165d-4a71-86de-e1dfb17c172a" />
    </td>
  </tr>
</table>



## Tech Stack

- **Frontend**: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui
- **Backend**: Next.js API Routes + SQLite (better-sqlite3)
- **Execution Engine**: Python 3.12+ with ACPX protocol

## Quick Start

### 1. Install Dependencies

```bash
git clone https://github.com/hologrow/agent-benchmark.git
cd agent-benchmark
pnpm i
uv sync
```

### 2. Configure Environment

Ensure the following are installed on your system:
- Node.js 18+
- Python 3.12+

Create `.env.local` file and configure environment variables:

```bash
# Database path (optional, defaults to data/benchmark.db)
DATABASE_PATH=data/benchmark.db
```

### 3. Run Development Server

```bash
npm run dev
```

Visit http://localhost:3000

## Usage Workflow

1. **Create Agent** - Add Agent name and ACPX configuration in the Agent management page
2. **Create Test Cases** - Add test cases in the Test Set management page
3. **Create Evaluator** - Configure evaluation rules in the Evaluator management page (optional)
4. **Create Benchmark** - Select Agents, test cases, and evaluator in the Benchmark execution page
5. **Execute Benchmark** - Click the execute button to start testing
6. **View Results** - View detailed results and scores on the Benchmark dashboard

## License

MIT
