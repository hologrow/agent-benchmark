"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Loader2,
  Play,
  FileText,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

interface Benchmark {
  id: number;
  name: string;
  description: string;
  agent_ids: string;
  test_case_ids: string;
  evaluator_id: number | null;
  run_config: string;
  created_at: string;
  updated_at: string;
}

interface BenchmarkExecution {
  id: number;
  benchmark_id: number;
  name: string | null;
  status: "pending" | "running" | "completed" | "failed";
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface BenchmarkResult {
  id: number;
  execution_id: number;
  agent_id: number;
  test_case_id: number;
  status: "pending" | "running" | "completed" | "failed" | "timeout";
  actual_output: string | null;
  output_file: string | null;
  execution_time_ms: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  agent_name: string;
  test_id: string;
  test_case_name: string;
  test_input: string;
  expected_output: string;
  key_points: string;
  forbidden_points: string;
  score: number | null;
  evaluation_report: string | null;
  key_points_met: string | null;
  forbidden_points_violated: string | null;
}

interface ExecutionWithDetails extends BenchmarkExecution {
  results: BenchmarkResult[];
}

interface BenchmarkWithExecutions extends Benchmark {
  executions: BenchmarkExecution[];
}

export default function BenchmarkDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const benchmarkId = parseInt(params.id as string);

  const [loading, setLoading] = useState(true);
  const [benchmark, setBenchmark] = useState<BenchmarkWithExecutions | null>(
    null,
  );
  const [selectedExecution, setSelectedExecution] =
    useState<ExecutionWithDetails | null>(null);
  const [activeTab, setActiveTab] = useState<string>("");

  useEffect(() => {
    fetchBenchmark();
  }, [benchmarkId]);

  const fetchBenchmark = async () => {
    try {
      const response = await fetch(`/api/benchmarks/${benchmarkId}`);
      if (response.ok) {
        const data = await response.json();
        setBenchmark(data.benchmark);

        // 默认选择最后一次执行
        if (data.benchmark.executions && data.benchmark.executions.length > 0) {
          const latestExecution = data.benchmark.executions[0];
          setActiveTab(latestExecution.id.toString());
          fetchExecutionDetails(latestExecution.id);
        }
      } else {
        toast.error("获取详情失败");
      }
    } catch (error) {
      console.error("Error fetching benchmark:", error);
      toast.error("获取详情失败");
    } finally {
      setLoading(false);
    }
  };

  const fetchExecutionDetails = async (executionId: number) => {
    try {
      const response = await fetch(`/api/executions/${executionId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedExecution(data.details);
      } else {
        toast.error("获取执行详情失败");
      }
    } catch (error) {
      console.error("Error fetching execution details:", error);
      toast.error("获取执行详情失败");
    }
  };

  const startNewExecution = async () => {
    try {
      const response = await fetch(`/api/benchmarks/${benchmarkId}/start`, {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        toast.success("已开始新执行");
        router.push(`/executions/${data.executionId}`);
      } else {
        const error = await response.json();
        toast.error(error.error || "启动失败");
      }
    } catch (error) {
      console.error("Error starting execution:", error);
      toast.error("启动失败");
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const executionId = parseInt(value);
    fetchExecutionDetails(executionId);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      "default" | "secondary" | "destructive" | "outline"
    > = {
      pending: "secondary",
      running: "default",
      completed: "default",
      failed: "destructive",
      timeout: "destructive",
      error: "destructive",
    };
    const labels: Record<string, string> = {
      pending: "待执行",
      running: "运行中",
      completed: "成功",
      failed: "失败",
      timeout: "超时",
      error: "错误",
    };
    return (
      <Badge variant={variants[status] || "default"}>
        {labels[status] || status}
      </Badge>
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "failed":
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "timeout":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case "running":
        return <Loader2 className="h-5 w-5 animate-spin" />;
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatJson = (str: string | null) => {
    if (!str) return [];
    try {
      return JSON.parse(str);
    } catch {
      return str
        .split(/[\n,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!benchmark) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12 text-muted-foreground">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>未找到 Benchmark</p>
          <Button className="mt-4" onClick={() => router.push("/benchmarks")}>
            返回列表
          </Button>
        </div>
      </div>
    );
  }

  const agentCount = JSON.parse(benchmark.agent_ids).length;
  const testCaseCount = JSON.parse(benchmark.test_case_ids).length;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push("/benchmarks")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回列表
        </Button>
        <Button onClick={startNewExecution}>
          <RotateCcw className="h-4 w-4 mr-2" />
          再次执行
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">{benchmark.name}</h1>
        <p className="text-muted-foreground mt-2">
          {benchmark.description || "无描述"}
        </p>
        <div className="flex gap-4 mt-4 text-sm text-muted-foreground">
          <span>Agents: {agentCount}</span>
          <span>测试用例: {testCaseCount}</span>
          <span>执行次数: {benchmark.executions?.length || 0}</span>
        </div>
      </div>

      {!benchmark.executions || benchmark.executions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Play className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">暂无执行记录</p>
            <Button className="mt-4" onClick={startNewExecution}>
              <Play className="h-4 w-4 mr-2" />
              开始第一次执行
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>执行记录</CardTitle>
                  <CardDescription>选择执行批次查看详情</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <TabsList className="mb-6 flex flex-wrap h-auto gap-2">
                {benchmark.executions?.map((execution) => (
                  <TabsTrigger
                    key={execution.id}
                    value={execution.id.toString()}
                    className="px-4 py-2"
                  >
                    <div className="flex items-center gap-2">
                      {execution.name || `执行 #${execution.id}`}
                      {getStatusBadge(execution.status)}
                    </div>
                  </TabsTrigger>
                ))}
              </TabsList>

              {benchmark.executions?.map((execution) => (
                <TabsContent
                  key={execution.id}
                  value={execution.id.toString()}
                  className="mt-0"
                >
                  {selectedExecution?.id === execution.id ? (
                    <ExecutionDetails execution={selectedExecution} />
                  ) : (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  )}
                </TabsContent>
              ))}
            </CardContent>
          </Card>
        </Tabs>
      )}
    </div>
  );
}

function ExecutionDetails({ execution }: { execution: ExecutionWithDetails }) {
  const completedCount = execution.results.filter(
    (r) => r.status === "completed",
  ).length;
  const failedCount = execution.results.filter((r) =>
    ["failed", "error", "timeout"].includes(r.status),
  ).length;

  const formatDuration = (ms: number | null) => {
    if (!ms) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      "default" | "secondary" | "destructive" | "outline"
    > = {
      pending: "secondary",
      running: "default",
      completed: "default",
      failed: "destructive",
      timeout: "destructive",
      error: "destructive",
    };
    const labels: Record<string, string> = {
      pending: "待执行",
      running: "运行中",
      completed: "成功",
      failed: "失败",
      timeout: "超时",
      error: "错误",
    };
    return (
      <Badge variant={variants[status] || "default"}>
        {labels[status] || status}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">总任务数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{execution.results.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">
              成功
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {completedCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">
              失败
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{failedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">平均评分</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(() => {
                const scores = execution.results
                  .filter((r) => r.score !== null)
                  .map((r) => r.score!);
                if (scores.length === 0) return "-";
                const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
                return avg.toFixed(1) || "--";
              })()}
            </div>
          </CardContent>
        </Card>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agent</TableHead>
            <TableHead>测试用例</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>执行时间</TableHead>
            <TableHead>评分</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {execution.results.map((result) => (
            <TableRow key={result.id}>
              <TableCell className="font-medium">{result.agent_name}</TableCell>
              <TableCell>
                <div className="font-medium">{result.test_id}</div>
                <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {result.test_case_name}
                </div>
              </TableCell>
              <TableCell>{getStatusBadge(result.status)}</TableCell>
              <TableCell>{formatDuration(result.execution_time_ms)}</TableCell>
              <TableCell>
                {result.score !== null ? (
                  <span
                    className={`font-bold ${
                      result.score >= 80
                        ? "text-green-600"
                        : result.score >= 60
                          ? "text-yellow-600"
                          : "text-red-600"
                    }`}
                  >
                    {result.score?.toFixed(1) || "--"}
                  </span>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" disabled>
                  <FileText className="h-4 w-4 mr-1" />
                  查看
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
