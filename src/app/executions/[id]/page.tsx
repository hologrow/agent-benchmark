"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  RotateCcw,
  Trash2,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

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
  evaluation_error: string | null;
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

interface Execution {
  id: number;
  benchmark_id: number;
  name: string | null;
  status: "pending" | "running" | "completed" | "failed";
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  benchmark_name: string;
  evaluation_status: "pending" | "running" | "completed" | "failed" | null;
  results: BenchmarkResult[];
}

export default function ExecutionDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const executionId = parseInt(params.id as string);

  const [loading, setLoading] = useState(true);
  const [execution, setExecution] = useState<Execution | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedResult, setSelectedResult] = useState<BenchmarkResult | null>(
    null,
  );
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [reevaluating, setReevaluating] = useState(false);

  useEffect(() => {
    fetchExecution();
  }, [executionId]);

  const fetchExecution = async () => {
    try {
      const response = await fetch(`/api/executions/${executionId}`);
      if (response.ok) {
        const data = await response.json();
        setExecution(data.details);
      } else {
        toast.error("获取执行详情失败");
      }
    } catch (error) {
      console.error("Error fetching execution:", error);
      toast.error("获取执行详情失败");
    } finally {
      setLoading(false);
    }
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

  const formatDuration = (ms: number | null) => {
    if (!ms) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const parseJson = (str: string | null) => {
    if (!str) return [];
    try {
      return JSON.parse(str);
    } catch {
      return [];
    }
  };

  const openResultDialog = (result: BenchmarkResult) => {
    setSelectedResult(result);
    setResultDialogOpen(true);
  };

  const handleReevaluate = async () => {
    if (!execution) return;

    setReevaluating(true);
    try {
      const response = await fetch(`/api/executions/${execution.id}/evaluate`, {
        method: "POST",
      });

      if (response.ok) {
        toast.success("评估任务已启动");
        // Refresh execution data to show new evaluation status
        fetchExecution();
      } else {
        const error = await response.json();
        toast.error(error.error || "启动评估失败");
      }
    } catch (error) {
      console.error("Error starting evaluation:", error);
      toast.error("启动评估失败");
    } finally {
      setReevaluating(false);
    }
  };

  const handleDelete = async () => {
    if (!execution) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/executions/${execution.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("执行记录已删除");
        router.push(`/benchmarks/${execution.benchmark_id}`);
      } else {
        const error = await response.json();
        toast.error(error.error || "删除失败");
      }
    } catch (error) {
      console.error("Error deleting execution:", error);
      toast.error("删除失败");
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
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

  if (!execution) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12 text-muted-foreground">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>未找到执行记录</p>
          <Button className="mt-4" onClick={() => router.push("/benchmarks")}>
            返回列表
          </Button>
        </div>
      </div>
    );
  }

  const completedCount = execution.results.filter(
    (r) => r.status === "completed",
  ).length;
  const failedCount = execution.results.filter((r) =>
    ["failed", "error", "timeout"].includes(r.status),
  ).length;
  const evalFailedCount = execution.results.filter(
    (r) => r.evaluation_error !== null,
  ).length;

  const avgScore = (() => {
    const scores = execution.results
      .filter((r) => r.score !== null)
      .map((r) => r.score!);
    if (scores.length === 0) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  })();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => router.push(`/benchmarks/${execution.benchmark_id}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回 Benchmark
        </Button>
        <div className="flex gap-2">
          {execution.status === "completed" &&
            (execution.evaluation_status === "failed" ||
              !execution.evaluation_status) && (
              <Button
                variant="outline"
                onClick={handleReevaluate}
                disabled={reevaluating}
              >
                {reevaluating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    评估中...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    重新评估
                  </>
                )}
              </Button>
            )}
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            删除
          </Button>
          <Button
            onClick={() => router.push(`/benchmarks/${execution.benchmark_id}`)}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            再次执行
          </Button>
        </div>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          {execution.name || `执行 #${execution.id}`}
        </h1>
        <p className="text-muted-foreground mt-2">
          Benchmark: {execution.benchmark_name}
        </p>
        <div className="flex gap-4 mt-4 text-sm text-muted-foreground">
          <span>状态: {getStatusBadge(execution.status)}</span>
          <span>评估状态:{" "}
            {execution.evaluation_status
              ? getStatusBadge(execution.evaluation_status)
              : "-"}
          </span>
          <span>总任务数: {execution.results.length}</span>
          <span>成功: {completedCount}</span>
          <span>失败: {failedCount}</span>
          {evalFailedCount > 0 && (
            <span className="text-orange-600">评估失败: {evalFailedCount}</span>
          )}
          {avgScore !== null && <span>平均评分: {avgScore?.toFixed(1)}</span>}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
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
              {avgScore !== null ? avgScore.toFixed(1) : "-"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>执行结果</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>测试用例</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>执行时间</TableHead>
                <TableHead>评分</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {execution.results.map((result) => (
                <TableRow
                  key={result.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => openResultDialog(result)}
                >
                  <TableCell className="font-medium">
                    {result.agent_name}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{result.test_id}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {result.test_case_name}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(result.status)}</TableCell>
                  <TableCell>
                    {formatDuration(result.execution_time_ms)}
                  </TableCell>
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
                        {result.score?.toFixed(1)}
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除执行记录 &quot;
              {execution?.name || `执行 #${execution?.id}`}&quot; 吗？
              <br />
              此操作将同时删除该执行的所有结果和评估数据，且无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  删除中...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  删除
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 结果详情对话框 */}
      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
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
            <div className="space-y-6 mt-4">
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

              {/* 输入和期望输出 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">输入</h4>
                  <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {selectedResult.test_input || "无"}
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">期望输出</h4>
                  <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {selectedResult.expected_output || "无"}
                  </div>
                </div>
              </div>

              {/* 实际输出 */}
              <div>
                <h4 className="font-semibold mb-2">实际输出</h4>
                <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap max-h-96 overflow-y-auto">
                  {selectedResult.actual_output || "无输出"}
                </div>
              </div>

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
                  <h4 className="font-semibold mb-2 text-orange-600">评估错误</h4>
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

              {/* 输出文件 */}
              {selectedResult.output_file && (
                <div className="text-sm text-muted-foreground">
                  输出文件: {selectedResult.output_file}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
