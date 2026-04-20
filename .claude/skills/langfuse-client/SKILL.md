---
name: langfuse-client
description: Langfuse API Client - 用于与 Langfuse LLM 可观测性平台交互，获取 traces、observations、scores 等数据
tools: Read, Write, Edit, Bash
---

# Langfuse Client Skill

此 Skill 用于与 Langfuse LLM 可观测性平台 API 交互。

## 配置

在使用前需要配置以下环境变量：

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...        # Langfuse Public Key
LANGFUSE_SECRET_KEY=sk-lf-...        # Langfuse Secret Key
LANGFUSE_BASE_URL=https://cloud.langfuse.com  # 可选，默认为 cloud.langfuse.com
```

## 安装

```bash
npm install @langfuse/client
```

## 使用方法

### 基础用法

```typescript
import { LangfuseClient } from "@langfuse/client";

const langfuse = new LangfuseClient({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL,
});
```

### API 调用示例

#### Traces

```typescript
// 获取 traces 列表
const traces = await langfuse.api.trace.list();

// 获取单个 trace
const trace = await langfuse.api.trace.get("traceId");
```

#### Observations

```typescript
// 获取 observations 列表（高性能 V2 接口）
const observations = await langfuse.api.observations.getMany({
  traceId: "abcdef1234",
  type: "GENERATION",
  limit: 100,
  fields: "core,basic,usage"
});

// 获取单个 observation（通过列表筛选）
const allObservations = await langfuse.api.observations.getMany({ limit: 1 });
```

#### Sessions

```typescript
// 获取 sessions 列表
const sessions = await langfuse.api.sessions.list();

// 获取单个 session
const session = await langfuse.api.sessions.get("sessionId");
```

#### Scores

```typescript
// 获取 scores 列表（高性能 V2 接口）
const scores = await langfuse.api.scores.getMany();

// 获取单个 score
const score = await langfuse.api.scores.getById("scoreId");
```

#### Metrics

```typescript
// 获取 metrics（高性能 V2 接口）
const metrics = await langfuse.api.metrics.get({
  query: JSON.stringify({
    view: "observations",
    metrics: [{ measure: "totalCost", aggregation: "sum" }],
    dimensions: [{ field: "providedModelName" }],
    filters: [],
    fromTimestamp: "2025-05-01T00:00:00Z",
    toTimestamp: "2025-05-13T00:00:00Z"
  })
});
```

### 遗留 V1 接口

如需使用旧版 API：

```typescript
// V1 Observations
const legacyObservations = await langfuse.api.legacy.observationsV1.getMany();
const legacyObservation = await langfuse.api.legacy.observationsV1.get("observationId");

// V1 Scores
const legacyScores = await langfuse.api.legacy.scoreV1.get();

// V1 Metrics
const legacyMetrics = await langfuse.api.legacy.metricsV1.get(...);
```

## 项目集成示例

### 获取 Benchmark 执行的 Traces

```typescript
import { LangfuseClient } from "@langfuse/client";

async function getBenchmarkTraces(executionId: string) {
  const langfuse = new LangfuseClient();
  
  // 获取最近的 traces
  const traces = await langfuse.api.trace.list({ limit: 100 });
  
  // 根据 magic number 筛选
  const benchmarkTraces = traces.data.filter(trace => {
    const input = JSON.stringify(trace.input || '');
    return input.includes(executionId);
  });
  
  return benchmarkTraces;
}
```

### 获取成本统计

```typescript
const costMetrics = await langfuse.api.metrics.get({
  query: JSON.stringify({
    view: "observations",
    metrics: [{ measure: "totalCost", aggregation: "sum" }],
    dimensions: [{ field: "providedModelName" }],
    fromTimestamp: startDate.toISOString(),
    toTimestamp: endDate.toISOString()
  })
});
```

## 常用字段说明

### Observation Fields
- `core`: id, type, name, startTime, endTime
- `basic`: model, modelParameters
- `usage`: inputTokens, outputTokens, totalTokens, cost
- `meta`: metadata, tags, version
- `input_output`: input, output

### Score 类型
- `Numeric`: 数值评分
- `Categorical`: 分类评分
- `Boolean`: 布尔评分

## 注意事项

1. **API 版本**: 优先使用 V2 接口（observations.getMany, scores.getMany, metrics.get），性能更好
2. **分页**: 使用 `limit` 和游标进行分页，不支持 `offset`
3. **错误处理**: API 调用可能抛出异常，建议添加 try-catch
4. **认证**: 确保 publicKey 和 secretKey 正确配置

## 参考链接

- [Langfuse 文档](https://langfuse.com/docs)
- [API 参考](https://api.reference.langfuse.com)
