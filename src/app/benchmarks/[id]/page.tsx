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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const [selectedResult, setSelectedResult] = useState<BenchmarkResult | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);

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

  const parseJson = (str: string | null) => {
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

  // 解析实际输出，分离主输出和执行过程
  const parseActualOutput = (actualOutput: string | null) => {
    if (!actualOutput) return { mainOutput: '', executionProcess: '' };

    try {
      // 尝试解析为 JSON（Agent 执行结果格式）
      const parsed = JSON.parse(actualOutput);
      if (parsed.output !== undefined) {
        const mainOutput = typeof parsed.output === 'string' ? parsed.output : JSON.stringify(parsed.output, null, 2);
        const executionProcess = [
          parsed.tool_calls_made !== undefined && `工具调用次数: ${parsed.tool_calls_made}`,
          parsed.duration_seconds !== undefined && `执行时长: ${parsed.duration_seconds}s`,
          parsed.error && `错误: ${parsed.error}`,
          parsed.status && `状态: ${parsed.status}`,
        ].filter(Boolean).join('\n');
        return { mainOutput, executionProcess };
      }
    } catch {
      // 不是 JSON 格式，继续处理
    }

    // 使用 [done] end_turn 作为分隔符：前面的内容是执行结果，后面是执行过程
    const doneMarker = '[done] end_turn';
    const doneIndex = actualOutput.indexOf(doneMarker);

    if (doneIndex !== -1) {
      // 找到分隔符，前面是执行结果，后面（包含分隔符）是执行过程
      const mainOutput = actualOutput.substring(0, doneIndex).trim();
      const executionProcess = actualOutput.substring(doneIndex).trim();
      return { mainOutput, executionProcess };
    }

    // 如果没有找到 [done] end_turn，尝试使用其他标记分隔
    const processMarkers = ['[tool]', '[thinking]', '--- stderr ---', 'Traceback (most recent call last):'];
    let splitIndex = actualOutput.length;

    for (const marker of processMarkers) {
      const idx = actualOutput.indexOf(marker);
      if (idx !== -1 && idx < splitIndex) {
        splitIndex = idx;
      }
    }

    if (splitIndex < actualOutput.length) {
      return {
        mainOutput: actualOutput.substring(0, splitIndex).trim(),
        executionProcess: actualOutput.substring(splitIndex).trim(),
      };
    }

    return { mainOutput: actualOutput, executionProcess: '' };
  };

  const openResultDialog = (result: BenchmarkResult) => {
    setSelectedResult(result);
    setDialogOpen(true);
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openResultDialog(result)}
                >
                  <FileText className="h-4 w-4 mr-1" />
                  查看
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* 结果详情对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedResult?.agent_name} - {selectedResult?.test_id}
            </DialogTitle>
            <DialogDescription>
              {selectedResult?.test_case_name}
            </DialogDescription>
          </DialogHeader>

          {selectedResult && (
            <div className="space-y-4 mt-4">
              {/* 基本信息 */}
              <div className="flex items-center gap-4 text-sm">
                <span>状态: {getStatusBadge(selectedResult.status)}</span>
                <span>
                  执行时间: {formatDuration(selectedResult.execution_time_ms)}
                </span>
                {selectedResult.score !== null && (
                  <span
                    className={`font-bold ${
                      selectedResult.score >= 80
                        ? "text-green-600"
                        : selectedResult.score >= 60
                          ? "text-yellow-600"
                          : "text-red-600"
                    }`}
                  >
                    评分: {selectedResult.score?.toFixed(1)}
                  </span>
                )}
              </div>

              {/* 输入（单行） */}
              <div>
                <h4 className="font-semibold mb-1 text-sm">输入</h4>
                <div className="bg-muted px-3 py-2 rounded-md text-sm truncate" title={selectedResult.test_input}>
                  {selectedResult.test_input || "无"}
                </div>
              </div>

              {/* 期望输出和实际输出（左右对比） */}
              {(() => {
                const { mainOutput, executionProcess } = parseActualOutput(selectedResult.actual_output);
                return (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-semibold mb-1 text-sm">期望输出</h4>
                        <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap max-h-[400px] overflow-y-auto border border-dashed border-gray-300">
                          {selectedResult.expected_output || "无"}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-1 text-sm">实际输出</h4>
                        <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap max-h-[400px] overflow-y-auto border border-green-200">
                          {mainOutput || "无输出"}
                        </div>
                      </div>
                    </div>

                    {/* 执行过程（放在最下方单独展示） */}
                    {executionProcess && (
                      <div>
                        <h4 className="font-semibold mb-1 text-sm text-gray-500">执行过程</h4>
                        <div className="bg-gray-50 p-3 rounded-md text-xs whitespace-pre-wrap max-h-[300px] overflow-y-auto text-gray-600 font-mono">
                          {executionProcess}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* 错误信息 */}
              {selectedResult.error_message && (
                <div>
                  <h4 className="font-semibold mb-2 text-red-600">执行错误</h4>
                  <div className="bg-red-50 border border-red-200 p-3 rounded-md text-sm text-red-700 whitespace-pre-wrap">
                    {selectedResult.error_message}
                  </div>
                </div>
              )}

              {/* 评估错误信息 */}
              {selectedResult.evaluation_error && (
                <div>
                  <h4 className="font-semibold mb-2 text-orange-600">
                    评估错误
                  </h4>
                  <div className="bg-orange-50 border border-orange-200 p-3 rounded-md text-sm text-orange-700 whitespace-pre-wrap">
                    {selectedResult.evaluation_error}
                  </div>
                </div>
              )}

              {/* 关键测试点和禁止点 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">关键测试点</h4>
                  <ul className="space-y-1">
                    {parseJson(selectedResult.key_points).map(
                      (point: string, idx: number) => {
                        const metPoints = parseJson(
                          selectedResult.key_points_met,
                        );
                        const isMet = metPoints.includes(point);
                        return (
                          <li
                            key={idx}
                            className={`text-sm flex items-center gap-2 ${
                              isMet ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            <span>{isMet ? "✓" : "✗"}</span>
                            {point}
                          </li>
                        );
                      },
                    )}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">禁止点</h4>
                  <ul className="space-y-1">
                    {parseJson(selectedResult.forbidden_points).map(
                      (point: string, idx: number) => {
                        const violatedPoints = parseJson(
                          selectedResult.forbidden_points_violated,
                        );
                        const isViolated = violatedPoints.includes(point);
                        return (
                          <li
                            key={idx}
                            className={`text-sm flex items-center gap-2 ${
                              isViolated ? "text-red-600" : "text-green-600"
                            }`}
                          >
                            <span>{isViolated ? "✗" : "✓"}</span>
                            {point}
                          </li>
                        );
                      },
                    )}
                  </ul>
                </div>
              </div>

              {/* 评估报告 */}
              {selectedResult.evaluation_report && (
                <div>
                  <h4 className="font-semibold mb-2">评估报告</h4>
                  <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap">
                    {selectedResult.evaluation_report}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
