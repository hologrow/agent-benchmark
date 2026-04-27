"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Play,
  FlaskConical,
  ExternalLink,
  ClipboardPenLine,
} from "lucide-react";
import { toast } from "sonner";
import type { Agent as ApiAgent } from "@/types/api";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";

interface SimulationRunResponse {
  run: Record<string, unknown>;
  trace: {
    traceId: string;
    traceContent: string;
    traceUrl?: string;
  } | null;
  traceSummary: string | null;
}

export default function SimulationRunPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [agents, setAgents] = useState<ApiAgent[]>([]);
  const [agentId, setAgentId] = useState(
    () => searchParams.get("agentId")?.trim() ?? "",
  );
  const [question, setQuestion] = useState("");
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulationRunResponse | null>(null);
  const [langfuseBaseUrl, setLangfuseBaseUrl] = useState(
    "https://cloud.langfuse.com",
  );

  const [caseImportMode, setCaseImportMode] = useState(false);
  const [draftInput, setDraftInput] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftAnswer, setDraftAnswer] = useState("");
  const [draftTraceSummary, setDraftTraceSummary] = useState("");
  const [draftKeyPoints, setDraftKeyPoints] = useState("");
  const [draftForbiddenPoints, setDraftForbiddenPoints] = useState("");
  const [savingCase, setSavingCase] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/integrations/langfuse/config");
        if (!response.ok) return;
        const data = (await response.json()) as { baseUrl?: string };
        if (!cancelled && data.baseUrl) {
          setLangfuseBaseUrl(String(data.baseUrl).replace(/\/$/, ""));
        }
      } catch {
        // 未配置 Langfuse 时忽略
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agents");
        if (!res.ok) throw new Error("加载 Agent 失败");
        const data = (await res.json()) as { agents: ApiAgent[] };
        if (!cancelled) {
          setAgents(data.agents || []);
        }
      } catch {
        if (!cancelled) toast.error("无法加载 Agent 列表");
      } finally {
        if (!cancelled) setLoadingAgents(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedAgent = useMemo(
    () => agents.find((a) => String(a.id) === agentId),
    [agents, agentId],
  );

  /** URL ?agentId= 与选择器同步 */
  useEffect(() => {
    if (loadingAgents) return;
    if (!agentId) return;
    if (agents.length === 0) return;
    if (agents.some((a) => String(a.id) === agentId)) return;
    setAgentId("");
    const p = new URLSearchParams(searchParams.toString());
    p.delete("agentId");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [loadingAgents, agents, agentId, pathname, router, searchParams]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (agentId) {
      nextParams.set("agentId", agentId);
    } else {
      nextParams.delete("agentId");
    }
    const next = nextParams.toString();
    const cur = searchParams.toString();
    if (next === cur) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [agentId, pathname, router, searchParams]);

  async function handleRun() {
    if (!agentId) {
      toast.error("请选择 Agent");
      return;
    }
    if (!question.trim()) {
      toast.error("请输入问题");
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/simulation-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: Number(agentId),
          question,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "执行失败");
        return;
      }
      setResult(data as SimulationRunResponse);
      toast.success("执行完成");
    } catch {
      toast.error("请求失败");
    } finally {
      setRunning(false);
    }
  }

  function openCaseImport() {
    if (!result?.run) {
      toast.error("请先完成一次模拟跑");
      return;
    }
    const ans =
      typeof result.run.execution_answer === "string"
        ? result.run.execution_answer
        : "";
    setDraftInput(question);
    setDraftDescription("");
    setDraftAnswer(ans);
    setDraftTraceSummary(result.traceSummary ?? "");
    setDraftKeyPoints("");
    setDraftForbiddenPoints("");
    setCaseImportMode(true);
  }

  function cancelCaseImport() {
    setCaseImportMode(false);
  }

  async function saveTestCaseFromSimulation() {
    if (!draftInput.trim()) {
      toast.error("请填写「输入」");
      return;
    }
    setSavingCase(true);
    try {
      const keyPoints = draftKeyPoints
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const forbiddenPoints = draftForbiddenPoints
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const testId = `sim_${Date.now()}`;
      const inputTrim = draftInput.trim();
      const descTrim = draftDescription.trim();
      const name =
        inputTrim.slice(0, 100) ||
        descTrim.slice(0, 100) ||
        `模拟跑 ${new Date().toLocaleString("zh-CN")}`;

      const res = await fetch("/api/test-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test_id: testId,
          name,
          description: descTrim,
          input: inputTrim,
          expected_output: draftAnswer.trim(),
          key_points: JSON.stringify(keyPoints),
          forbidden_points: JSON.stringify(forbiddenPoints),
          category: "simulation-run",
          how: draftTraceSummary.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(
          typeof data.error === "string" ? data.error : "保存测试用例失败",
        );
        return;
      }
      toast.success("已保存到测试用例");
      setCaseImportMode(false);
    } catch {
      toast.error("保存失败");
    } finally {
      setSavingCase(false);
    }
  }

  const run = result?.run;
  const status =
    typeof run?.status === "string" ? run.status : run ? "unknown" : null;

  const trace = result?.trace;
  const traceHref = trace
    ? trace.traceUrl ||
      `${langfuseBaseUrl.replace(/\/$/, "")}/trace/${trace.traceId}`
    : null;

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex items-center gap-3">
        <FlaskConical className="h-8 w-8 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">模拟跑</h1>
          <p className="text-muted-foreground text-sm">
            选择 Agent、输入问题，按与 Benchmark
            相同的方式拉起子进程执行，并尝试拉取 Langfuse 追踪与简短摘要。
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>运行配置</CardTitle>
          <CardDescription>
            命令行 Agent 会使用配置中的 {"{{prompt}}"} 与 {"{{execution_id}}"}
            （模拟跑固定为 simulation）。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Agent</Label>
            <Select
              value={agentId || undefined}
              onValueChange={(v) => setAgentId(v ?? "")}
              disabled={loadingAgents || running}
            >
              <SelectTrigger className="w-full">
                <span
                  className={cn(
                    "line-clamp-1 min-w-0 flex-1 text-left",
                    !selectedAgent && "text-muted-foreground",
                  )}
                >
                  {loadingAgents
                    ? "加载中…"
                    : selectedAgent
                      ? selectedAgent.name
                      : "选择 Agent"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name || `Agent #${a.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>问题</Label>
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="输入要发给 Agent 的完整问题或指令…"
              rows={8}
              disabled={running}
              className="font-mono text-sm"
            />
          </div>
          <Button onClick={handleRun} disabled={running || loadingAgents}>
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                执行中…
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                开始模拟跑
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && run && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg">答案</CardTitle>
              {status && (
                <Badge
                  variant={status === "completed" ? "default" : "secondary"}
                >
                  {status}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {typeof run.magic_code === "string" && (
                <p>
                  <span className="text-muted-foreground">Magic code: </span>
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    {run.magic_code}
                  </code>
                </p>
              )}
              {typeof run.execution_time_ms === "number" && (
                <p className="text-muted-foreground">
                  耗时 {run.execution_time_ms} ms
                </p>
              )}
              {typeof run.error === "string" && run.error && (
                <p className="text-destructive">{run.error}</p>
              )}
              {typeof run.execution_answer === "string" &&
              run.execution_answer.trim() ? (
                <div className="bg-muted max-h-96 overflow-auto rounded-md p-3 text-sm whitespace-pre-wrap">
                  {run.execution_answer}
                </div>
              ) : (
                <p className="text-muted-foreground">暂无解析答案。</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">执行追踪</CardTitle>
              <CardDescription>
                需在集成中启用 Langfuse 等 TRACE
                插件；摘要依赖已配置的默认评测模型。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {result.traceSummary && (
                <div>
                  <p className="text-muted-foreground mb-1 font-medium">
                    追踪摘要
                  </p>
                  <Markdown
                    content={result.traceSummary}
                    className="border-l-2 pl-3"
                  />
                </div>
              )}
              {trace && traceHref && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3">
                  <span className="text-sm font-medium text-green-800">
                    Langfuse Trace:
                  </span>
                  <a
                    href={traceHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-1 text-sm text-green-700 hover:text-green-900"
                  >
                    <code className="max-w-[min(100%,18rem)] truncate text-xs">
                      {trace.traceId}
                    </code>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
              )}
              {!result.trace && (
                <p className="text-muted-foreground">
                  未匹配到外部追踪（可能尚未入库或插件未启用）。
                </p>
              )}
              {result.trace?.traceContent && (
                <details className="rounded-md border">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
                    查看原始 trace 文本
                  </summary>
                  <pre className="max-h-80 overflow-auto border-t p-3 text-xs whitespace-pre-wrap">
                    {result.trace.traceContent}
                  </pre>
                </details>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="border-border mt-8 border-t pt-8">
        {!caseImportMode ? (
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={openCaseImport}
            disabled={!result?.run}
          >
            <ClipboardPenLine className="mr-2 h-4 w-4" />
            编辑&录入测试用例
          </Button>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">编辑&录入测试用例</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="draft-input">输入</Label>
                <Textarea
                  id="draft-input"
                  value={draftInput}
                  onChange={(e) => setDraftInput(e.target.value)}
                  rows={8}
                  className="font-mono text-sm"
                  placeholder="测试用例输入（对应 test_cases.input）"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="draft-description">描述</Label>
                <Textarea
                  id="draft-description"
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  rows={4}
                  className="text-sm"
                  placeholder="测试用例描述（对应 test_cases.description）"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="draft-answer">答案</Label>
                <Textarea
                  id="draft-answer"
                  value={draftAnswer}
                  onChange={(e) => setDraftAnswer(e.target.value)}
                  rows={10}
                  className="font-mono text-sm"
                  placeholder="解析答案…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="draft-trace-summary">追踪摘要（How）</Label>
                <Textarea
                  id="draft-trace-summary"
                  value={draftTraceSummary}
                  onChange={(e) => setDraftTraceSummary(e.target.value)}
                  rows={6}
                  className="text-sm"
                  placeholder="写入 test_cases.how，可与 Langfuse 追踪摘要一致"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="draft-key-points">关键测试点</Label>
                <Textarea
                  id="draft-key-points"
                  value={draftKeyPoints}
                  onChange={(e) => setDraftKeyPoints(e.target.value)}
                  rows={5}
                  className="text-sm"
                  placeholder="每行一条"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="draft-forbidden">关键禁止点</Label>
                <Textarea
                  id="draft-forbidden"
                  value={draftForbiddenPoints}
                  onChange={(e) => setDraftForbiddenPoints(e.target.value)}
                  rows={5}
                  className="text-sm"
                  placeholder="每行一条"
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  onClick={saveTestCaseFromSimulation}
                  disabled={savingCase || !draftInput.trim()}
                >
                  {savingCase ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      保存中…
                    </>
                  ) : (
                    "保存"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelCaseImport}
                  disabled={savingCase}
                >
                  取消
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
