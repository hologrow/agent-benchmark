# Benchmark Runner

AI Agent Benchmark 平台，用于执行、评估和管理 AI Agent 的测试用例。

## 功能特性

1. **Benchmark 展示** - 查看用例输入、期望输出、实际输出、关键测试点、禁止点和评分
2. **测试集管理** - 管理测试用例，支持从 Lark（飞书）多维表格同步
3. **Agent 管理** - 配置 Agent 名称和 ACPX 参数
4. **评估器管理** - 配置评估器，支持变量引用上下文
5. **Benchmark 跑测试管理** - 启动测试执行，支持变量注入格式要求

## 技术栈

- **前端**: Next.js 15 + React + TypeScript + Tailwind CSS + shadcn/ui
- **后端**: Next.js API Routes + SQLite (better-sqlite3)
- **执行引擎**: Python 3 + ACPX 协议

## 快速开始

### 1. 安装依赖

```bash
cd benchmark-runner
npm install
```

### 2. 配置环境

确保系统中已安装：
- Node.js 18+
- Python 3.8+
- ACPX CLI (用于执行 Agent)

创建 `.env.local` 文件并配置环境变量：

```bash
# 数据库路径（可选，默认 data/benchmark.db）
DATABASE_PATH=data/benchmark.db

# Lark (飞书) 应用凭证（用于同步多维表格）
# 支持飞书国内版 (feishu) 和 Lark 国际版 (lark)
LARK_APP_ID=cli_xxxxxxxxxxxxxxxx
LARK_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# LARK_APP_TYPE=feishu  # 可选：feishu (默认) 或 lark
```

#### 配置 Lark 多维表格同步

1. **国内用户（飞书）**:
   - 在 [飞书开放平台](https://open.feishu.cn/) 创建企业自建应用
   - 使用 `LARK_APP_TYPE=feishu` (或不设置，默认为国内版)

2. **海外用户（Lark）**:
   - 在 [Lark Developer Portal](https://open.larkoffice.com/) 创建应用
   - 设置 `LARK_APP_TYPE=lark`

3. 启用 `bitable:record:read` 权限（读取多维表格记录）
4. 发布应用并获取 App ID 和 App Secret
5. 将多维表格分享给应用（在表格中添加应用为协作者）

### 3. 运行开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

## 使用流程

1. **创建 Agent** - 在 Agent 管理页面添加 Agent 名称和 ACPX 配置
2. **创建测试用例** - 在测试集管理页面添加测试用例
3. **创建评估器** - 在评估器管理页面配置评估规则（可选）
4. **创建 Benchmark** - 在跑测试管理页面选择 Agents、测试用例和评估器
5. **执行 Benchmark** - 点击执行按钮启动测试
6. **查看结果** - 在 Benchmark 展示页面查看详细结果和评分

## Lark 多维表格同步

测试集管理页面支持从飞书多维表格同步测试用例数据。

### 支持的字段映射

| 字段 | 说明 | 必填 |
|------|------|------|
| 测试ID / test_id / ID | 测试用例唯一标识 | ✅ |
| 输入 / input / 问题 / 提问 | 用户输入/问题内容 | ✅ |
| 名称 / name / 用例名称 | 测试用例名称 | ❌ |
| 描述 / description / 用例描述 | 测试用例描述 | ❌ |
| 期望输出 / expected_output / 期望回答 | 期望的回复内容 | ❌ |
| 关键点 / key_points / 测试要点 | 关键测试点（支持多行/逗号分隔） | ❌ |
| 禁止点 / forbidden_points / 禁止内容 | 禁止出现的内容（支持多行/逗号分隔） | ❌ |
| 分类 / category / 类别 | 测试用例分类 | ❌ |

### 同步模式

- **更新或创建（默认）**: 存在则更新，不存在则创建
- **仅创建新记录**: 只导入新测试用例，跳过已存在的
- **仅更新现有记录**: 只更新已有测试用例，不创建新记录

## License

MIT
