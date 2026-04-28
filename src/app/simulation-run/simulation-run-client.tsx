"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
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
import { TestCaseImagesField } from "@/components/test-case-images-field";

const SIMULATION_TEST_CASE_CREATOR_STORAGE_KEY =
  "benchmark-runner:simulation-test-case-creator";

/** 同标签页内切换路由后恢复；关闭标签页即失效 */
const SIMULATION_PAGE_SESSION_KEY =
  "benchmark-runner:simulation-run-session:v1";

interface SimulationRunResponse {
  run: Record<string, unknown>;
  trace: {
    traceId: string;
    traceContent: string;
    traceUrl?: string;
  } | null;
  traceSummary: string | null;
}

type RunPhase = "idle" | "running" | "done";

type PersistedSimulationSnapshot = {
  v: 2;
  /** 任务阶段：用于恢复「执行中」与结果区状态 */
  runPhase: RunPhase;
  /** `runPhase === "running"` 时记录开始时间（ms），用于超时后不再假定为执行中 */
  runStartedAt: number | null;
  agentId: string;
  question: string;
  result: SimulationRunResponse | null;
  caseImportMode: boolean;
  draftInput: string;
  draftDescription: string;
  draftAnswer: string;
  draftTraceSummary: string;
  draftKeyPoints: string;
  draftForbiddenPoints: string;
  draftCreatedBy: string;
};

type LegacyPersistedV1 = Omit<
  PersistedSimulationSnapshot,
  "v" | "runPhase" | "runStartedAt"
> & {
  v: 1;
};

function stripTraceContentForStorage(
  data: SimulationRunResponse | null,
): SimulationRunResponse | null {
  if (!data?.trace) return data;
  return {
    ...data,
    trace: { ...data.trace, traceContent: "" },
  };
}

function migrateSnapshot(raw: unknown): PersistedSimulationSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v === 2) {
    const s = o as unknown as PersistedSimulationSnapshot;
    if (
      s.runPhase !== "running" &&
      s.runPhase !== "done" &&
      s.runPhase !== "idle"
    )
      return null;
    return s;
  }
  if (o.v === 1) {
    const old = o as unknown as LegacyPersistedV1;
    const hasResult = Boolean(old.result?.run);
    return {
      v: 2,
      runPhase: hasResult ? "done" : "idle",
      runStartedAt: null,
      agentId: String(old.agentId ?? ""),
      question: String(old.question ?? ""),
      result: old.result ?? null,
      caseImportMode: Boolean(old.caseImportMode),
      draftInput: String(old.draftInput ?? ""),
      draftDescription: String(old.draftDescription ?? ""),
      draftAnswer: String(old.draftAnswer ?? ""),
      draftTraceSummary: String(old.draftTraceSummary ?? ""),
      draftKeyPoints: String(old.draftKeyPoints ?? ""),
      draftForbiddenPoints: String(old.draftForbiddenPoints ?? ""),
      draftCreatedBy: String(old.draftCreatedBy ?? ""),
    };
  }
  return null;
}

function readSessionSnapshot(): PersistedSimulationSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SIMULATION_PAGE_SESSION_KEY);
    if (!raw) return null;
    return migrateSnapshot(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeSessionSnapshot(s: PersistedSimulationSnapshot) {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedSimulationSnapshot = {
      ...s,
      result: stripTraceContentForStorage(s.result),
    };
    window.sessionStorage.setItem(
      SIMULATION_PAGE_SESSION_KEY,
      JSON.stringify(payload),
    );
  } catch (e) {
    console.warn("[simulation-run] sessionStorage save failed:", e);
  }
}

const SIMULATION_PENDING_MAX_MS = 340_000;

export default function SimulationRunPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sessionHydratedRef = useRef(false);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSnapshotRef = useRef<PersistedSimulationSnapshot | null>(null);
  const runStartedAtRef = useRef<number | null>(null);

  const [agents, setAgents] = useState<ApiAgent[]>([]);
  const [agentId, setAgentId] = useState("");
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
  const [draftCreatedBy, setDraftCreatedBy] = useState("");
  const [draftImageUrls, setDraftImageUrls] = useState<string[]>([]);
  const [savingCase, setSavingCase] = useState(false);

  /** 从 sessionStorage 恢复整页状态（优先 URL 上的 agentId） */
  useLayoutEffect(() => {
    if (sessionHydratedRef.current) return;
    sessionHydratedRef.current = true;

    const urlAgent = searchParams.get("agentId")?.trim() ?? "";
    const snap = readSessionSnapshot();

    if (snap) {
      setQuestion(typeof snap.question === "string" ? snap.question : "");
      let phase: RunPhase = snap.runPhase;
      if (snap.result?.run && phase === "running") {
        phase = "done";
      }
      let restoreRunning = phase === "running";
      if (restoreRunning) {
        const t0 = snap.runStartedAt;
        if (typeof t0 !== "number" || Number.isNaN(t0)) {
          restoreRunning = false;
        } else if (Date.now() - t0 > SIMULATION_PENDING_MAX_MS) {
          restoreRunning = false;
        }
      }
      if (snap.runPhase === "running" && !snap.result && !restoreRunning) {
        toast.info("上次模拟跑可能未完成或已超时，请重新执行");
      }
      setRunning(restoreRunning);
      if (restoreRunning) {
        runStartedAtRef.current = snap.runStartedAt ?? Date.now();
      } else {
        runStartedAtRef.current = null;
      }
      setResult(snap.result ?? null);
      setCaseImportMode(Boolean(snap.caseImportMode));
      setDraftInput(snap.draftInput ?? "");
      setDraftDescription(snap.draftDescription ?? "");
      setDraftAnswer(snap.draftAnswer ?? "");
      setDraftTraceSummary(snap.draftTraceSummary ?? "");
      setDraftKeyPoints(snap.draftKeyPoints ?? "");
      setDraftForbiddenPoints(snap.draftForbiddenPoints ?? "");
      let creator = snap.draftCreatedBy ?? "";
      if (!creator.trim()) {
        try {
          creator =
            window.localStorage.getItem(
              SIMULATION_TEST_CASE_CREATOR_STORAGE_KEY,
            ) ?? "";
        } catch {
          /* ignore */
        }
      }
      setDraftCreatedBy(creator);
      setAgentId(urlAgent || snap.agentId || "");
    } else {
      if (urlAgent) setAgentId(urlAgent);
      try {
        const saved = window.localStorage.getItem(
          SIMULATION_TEST_CASE_CREATOR_STORAGE_KEY,
        );
        if (saved) setDraftCreatedBy(saved);
      } catch {
        /* ignore */
      }
    }
    // 仅首次挂载时从 session 恢复，避免与后续 URL 更新循环冲突
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional once per mount
  }, [searchParams]);

  /** 同步内存快照 + debounce 落盘；卸载时立刻 flush，避免任务结果未写入 */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const runPhase: RunPhase = running ? "running" : result ? "done" : "idle";
    const snap: PersistedSimulationSnapshot = {
      v: 2,
      runPhase,
      runStartedAt: running ? runStartedAtRef.current : null,
      agentId,
      question,
      result,
      caseImportMode,
      draftInput,
      draftDescription,
      draftAnswer,
      draftTraceSummary,
      draftKeyPoints,
      draftForbiddenPoints,
      draftCreatedBy,
    };
    latestSnapshotRef.current = snap;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      writeSessionSnapshot(snap);
    }, 400);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [
    running,
    result,
    agentId,
    question,
    caseImportMode,
    draftInput,
    draftDescription,
    draftAnswer,
    draftTraceSummary,
    draftKeyPoints,
    draftForbiddenPoints,
    draftCreatedBy,
  ]);

  useEffect(() => {
    return () => {
      const s = latestSnapshotRef.current;
      if (s) writeSessionSnapshot(s);
    };
  }, []);

  function clearPageSession() {
    try {
      window.sessionStorage.removeItem(SIMULATION_PAGE_SESSION_KEY);
    } catch {
      /* ignore */
    }
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    latestSnapshotRef.current = null;
    setResult(null);
    setQuestion("");
    setRunning(false);
    runStartedAtRef.current = null;
    setCaseImportMode(false);
    setDraftInput("");
    setDraftDescription("");
    setDraftAnswer("");
    setDraftTraceSummary("");
    setDraftKeyPoints("");
    setDraftForbiddenPoints("");
    toast.success("已清除本页会话缓存");
  }

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
    const t0 = Date.now();
    runStartedAtRef.current = t0;
    setRunning(true);
    setResult(null);

    const baseForRun = latestSnapshotRef.current ??
      readSessionSnapshot() ?? {
        v: 2 as const,
        runPhase: "idle" as const,
        runStartedAt: null,
        agentId,
        question,
        result: null,
        caseImportMode,
        draftInput,
        draftDescription,
        draftAnswer,
        draftTraceSummary,
        draftKeyPoints,
        draftForbiddenPoints,
        draftCreatedBy,
      };
    const snapRunning: PersistedSimulationSnapshot = {
      ...baseForRun,
      v: 2,
      runPhase: "running",
      runStartedAt: t0,
      agentId,
      question,
      result: null,
      caseImportMode,
    };
    latestSnapshotRef.current = snapRunning;
    writeSessionSnapshot(snapRunning);

    try {
      const res = await fetch("/api/simulation-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: Number(agentId),
          question,
        }),
      });
      const data = (await res.json()) as SimulationRunResponse & {
        error?: string;
      };
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "执行失败");
        const partial =
          data && typeof data === "object" && "run" in data
            ? (data as SimulationRunResponse)
            : null;
        const cur = latestSnapshotRef.current ?? snapRunning;
        const snapErr: PersistedSimulationSnapshot = {
          ...cur,
          v: 2,
          runPhase: partial ? "done" : "idle",
          runStartedAt: null,
          result: partial,
        };
        latestSnapshotRef.current = snapErr;
        writeSessionSnapshot(snapErr);
        if (snapErr.result) setResult(snapErr.result);
        return;
      }
      const curDone = latestSnapshotRef.current ?? snapRunning;
      const snapDone: PersistedSimulationSnapshot = {
        ...curDone,
        v: 2,
        runPhase: "done",
        runStartedAt: null,
        result: data as SimulationRunResponse,
      };
      latestSnapshotRef.current = snapDone;
      writeSessionSnapshot(snapDone);
      setResult(data as SimulationRunResponse);
      toast.success("执行完成");
    } catch {
      toast.error("请求失败");
      const curFail = latestSnapshotRef.current ?? snapRunning;
      const snapFail: PersistedSimulationSnapshot = {
        ...curFail,
        v: 2,
        runPhase: "idle",
        runStartedAt: null,
        result: null,
      };
      latestSnapshotRef.current = snapFail;
      writeSessionSnapshot(snapFail);
    } finally {
      runStartedAtRef.current = null;
      setRunning(false);
      const prev = latestSnapshotRef.current;
      if (prev) {
        const r = prev.result;
        const next: PersistedSimulationSnapshot = {
          ...prev,
          runPhase: r ? "done" : "idle",
          runStartedAt: null,
        };
        latestSnapshotRef.current = next;
        writeSessionSnapshot(next);
      }
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
    setDraftImageUrls([]);
    try {
      const saved = window.localStorage.getItem(
        SIMULATION_TEST_CASE_CREATOR_STORAGE_KEY,
      );
      if (saved) setDraftCreatedBy(saved);
    } catch {
      /* ignore */
    }
    setCaseImportMode(true);
  }

  function cancelCaseImport() {
    setCaseImportMode(false);
    setDraftImageUrls([]);
  }

  async function saveTestCaseFromSimulation() {
    if (!draftInput.trim()) {
      toast.error("请填写「输入」");
      return;
    }
    const creator = draftCreatedBy.trim();
    if (!creator) {
      toast.error("请填写「创建人」");
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

      try {
        window.localStorage.setItem(
          SIMULATION_TEST_CASE_CREATOR_STORAGE_KEY,
          creator,
        );
      } catch {
        /* ignore */
      }

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
          created_by: creator,
          images_json:
            draftImageUrls.length > 0
              ? JSON.stringify(draftImageUrls)
              : null,
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
      setDraftImageUrls([]);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <FlaskConical className="h-8 w-8 shrink-0 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">模拟跑</h1>
            <p className="text-muted-foreground text-sm">
              选择 Agent、输入问题，按与 Benchmark
              相同的方式拉起子进程执行，并尝试拉取 Langfuse 追踪与简短摘要。
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              本页状态会保存在当前浏览器标签会话中，切换到其他页面再返回不会丢失；关闭标签页后清除。
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 self-start text-muted-foreground"
          onClick={clearPageSession}
        >
          清除本页会话
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>运行配置</CardTitle>
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
                <Label htmlFor="draft-created-by">
                  创建人 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="draft-created-by"
                  value={draftCreatedBy}
                  onChange={(e) => setDraftCreatedBy(e.target.value)}
                  placeholder="创建人"
                  className="max-w-md"
                  autoComplete="name"
                />
                <p className="text-xs text-muted-foreground">
                  同一浏览器只需填写一次，下次打开会自动带出。
                </p>
              </div>
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
              <TestCaseImagesField
                label="附图（可选）"
                value={draftImageUrls}
                onChange={setDraftImageUrls}
                disabled={savingCase}
              />
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  onClick={saveTestCaseFromSimulation}
                  disabled={
                    savingCase || !draftInput.trim() || !draftCreatedBy.trim()
                  }
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
