# Benchmark Runner

![workflow](./workflow.png)

AI Agent Benchmark Platform for executing, evaluating, and managing AI Agent test cases.

## Features

1. **Benchmark Dashboard** - View test case input, expected output, actual output, key test points, forbidden points, and scores
2. **Test Set Management** - Manage test cases with support for syncing from Lark/Feishu Bitable
3. **Agent Management** - Configure Agent names and ACPX parameters
4. **Evaluator Management** - Configure evaluators with variable reference support for context
5. **Benchmark Execution** - Launch test execution with support for variable injection and format requirements

## Tech Stack

- **Frontend**: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui
- **Backend**: Next.js API Routes + SQLite (better-sqlite3)
- **Execution Engine**: Python 3.12+ with ACPX protocol

## Quick Start

### 1. Install Dependencies

```bash
cd benchmark-runner
npm install
```

### 2. Configure Environment

Ensure the following are installed on your system:
- Node.js 18+
- Python 3.12+
- ACPX CLI (for executing Agents)

Create `.env.local` file and configure environment variables:

```bash
# Database path (optional, defaults to data/benchmark.db)
DATABASE_PATH=data/benchmark.db

# Lark/Feishu app credentials (for syncing Bitable)
# Supports Feishu China (feishu) and Lark International (lark)
LARK_APP_ID=cli_xxxxxxxxxxxxxxxx
LARK_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# LARK_APP_TYPE=feishu  # Optional: feishu (default) or lark
```

#### Configuring Lark Bitable Sync

1. **China Users (Feishu)**:
   - Create an enterprise self-built app on [Feishu Open Platform](https://open.feishu.cn/)
   - Use `LARK_APP_TYPE=feishu` (or leave unset, defaults to China version)

2. **International Users (Lark)**:
   - Create an app on [Lark Developer Portal](https://open.larkoffice.com/)
   - Set `LARK_APP_TYPE=lark`

3. Enable `bitable:record:read` permission (read Bitable records)
4. Publish the app and obtain App ID and App Secret
5. Share the Bitable with the app (add the app as a collaborator in the table)

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

## Lark Bitable Sync

The Test Set management page supports syncing test case data from Feishu/Lark Bitable.

### Supported Field Mappings

| Field | Description | Required |
|-------|-------------|----------|
| test_id / ID | Unique identifier for the test case | ✅ |
| input / question / query | User input/question content | ✅ |
| name / case_name | Test case name | ❌ |
| description / case_description | Test case description | ❌ |
| expected_output / expected_answer | Expected response content | ❌ |
| key_points / test_points | Key test points (supports multi-line/comma-separated) | ❌ |
| forbidden_points / forbidden_content | Content that should not appear (supports multi-line/comma-separated) | ❌ |
| category / type / classification | Test case category | ❌ |

### Sync Modes

- **Update or Create (default)**: Update if exists, create if not
- **Create Only**: Only import new test cases, skip existing ones
- **Update Only**: Only update existing test cases, do not create new records

## License

MIT
