"use client";

import { useEffect, useState, useRef } from "react";
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
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Eye, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDateTimeLocal } from "@/lib/format-datetime";
import { api } from "@/lib/api";
import type { Benchmark } from "@/types/api";

// Extended execution type with UI-specific fields
interface Execution {
  id: number;
  benchmark_id: number;
  name?: string | null;
  status: "pending" | "running" | "completed" | "failed" | "stopped";
  progress: number;
  current_agent: string | null;
  current_test_case: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  benchmark_name?: string;
}

interface BenchmarkResult {
  id: number;
  execution_id: number;
  agent_id: number;
  test_case_id: number;
  status: string;
  actual_output: string | null;
  output_file: string | null;
  execution_time_ms: number | null;
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
  diagnosis_report: string | null;
}

interface ExecutionHistory {
  id: number;
  execution_number: number;
  avg_score: number | null;
  created_at: string;
}

// ECharts component
function ScoreChart({ data }: { data: ExecutionHistory[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<unknown>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    let isMounted = true;

    // Dynamic import echarts
    const initChart = async () => {
      const [
        { init, use },
        { LineChart },
        { GridComponent, TooltipComponent, TitleComponent },
        { CanvasRenderer },
      ] = await Promise.all([
        import("echarts/core"),
        import("echarts/charts"),
        import("echarts/components"),
        import("echarts/renderers"),
      ]);

      if (!isMounted || !chartRef.current) return;

      // Register modules
      use([
        LineChart,
        GridComponent,
        TooltipComponent,
        TitleComponent,
        CanvasRenderer,
      ]);

      // Initialize chart
      chartInstance.current = init(chartRef.current);

      const option = {
        grid: {
          top: 30,
          right: 20,
          bottom: 40,
          left: 50,
        },
        xAxis: {
          type: "category" as const,
          data: data.map((d) => `${d.execution_number}`),
          nameGap: 25,
          axisLabel: {
            fontSize: 11,
          },
        },
        yAxis: {
          type: "value" as const,
          min: 0,
          max: 100,
          nameGap: 35,
          axisLabel: {
            fontSize: 11,
          },
        },
        tooltip: {
          trigger: "axis" as const,
          formatter: (params: unknown) => {
            const p = (params as { name: string; value: number | null }[])[0];
            const value =
              p.value !== null && p.value !== undefined
                ? Number(p.value).toFixed(1)
                : "No data";
            return `${p.name}<br/>Avg Score: ${value}`;
          },
        },
        series: [
          {
            type: "line" as const,
            data: data.map((d) => d.avg_score),
            smooth: true,
            symbol: "circle",
            symbolSize: 8,
            lineStyle: {
              color: "#2C3947",
              width: 2,
            },
            itemStyle: {
              color: "#C2A56D",
            },
            connectNulls: true,
          },
        ],
      };

      (
        chartInstance.current as { setOption: (opt: unknown) => void }
      ).setOption(option);

      // Responsive handling
      const handleResize = () => {
        (chartInstance.current as { resize?: () => void } | null)?.resize?.();
      };
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
      };
    };

    initChart();

    return () => {
      isMounted = false;
      if (chartInstance.current) {
        (chartInstance.current as { dispose?: () => void }).dispose?.();
        chartInstance.current = null;
      }
    };
  }, [data]);

  return <div ref={chartRef} className="h-[200px] w-full" />;
}

export default function BenchmarkPage() {
  const router = useRouter();
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(
    null,
  );
  const [runDetails, setRunDetails] = useState<BenchmarkResult[] | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [executionToDelete, setExecutionToDelete] = useState<Execution | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [executionHistory, setExecutionHistory] = useState<
    Map<number, ExecutionHistory[]>
  >(new Map());
  const [chartLoading, setChartLoading] = useState(true);

  useEffect(() => {
    fetchExecutions();
    fetchBenchmarksWithHistory();
  }, []);

  const fetchBenchmarksWithHistory = async () => {
    try {
      const data = await api.benchmarks.list();
      const benchmarksList = data.benchmarks || [];

      // Sort by creation time (newest first)
      benchmarksList.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      setBenchmarks(benchmarksList);

      // Get execution history for each benchmark
      const historyMap = new Map<number, ExecutionHistory[]>();
      await Promise.all(
        benchmarksList.map(async (bm) => {
          const history = await fetchExecutionHistory(bm.id);
          if (history.length > 0) {
            historyMap.set(bm.id, history);
          }
        }),
      );
      setExecutionHistory(historyMap);
    } catch (error) {
      console.error("Error fetching benchmarks:", error);
    } finally {
      setChartLoading(false);
    }
  };

  const fetchExecutionHistory = async (
    benchmarkId: number,
  ): Promise<ExecutionHistory[]> => {
    try {
      const data = await api.benchmarks.getExecutions(benchmarkId);
      // Sort by creation time (earliest first, for calculating execution sequence)
      const sorted = (data.executions || []).sort(
        (a: { created_at: string }, b: { created_at: string }) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      // Add execution sequence and calculate average score
      return sorted.map(
        (
          exec: { id: number; created_at: string; avgScore?: number | null },
          index: number,
        ) => ({
          id: exec.id,
          execution_number: index + 1,
          avg_score: exec.avgScore ?? null,
          created_at: exec.created_at,
        }),
      );
    } catch (error) {
      console.error(
        `Error fetching history for benchmark ${benchmarkId}:`,
        error,
      );
    }
    return [];
  };

  const fetchExecutions = async () => {
    try {
      // Get all benchmarks
      const data = await api.benchmarks.list();
      const benchmarks = data.benchmarks || [];

      // Collect all executions
      const allExecutions: Execution[] = [];
      for (const benchmark of benchmarks) {
        try {
          const execData = await api.benchmarks.getExecutions(benchmark.id);
          if (execData.executions) {
            for (const exec of execData.executions) {
              allExecutions.push({
                ...exec,
                benchmark_name: benchmark.name,
              });
            }
          }
        } catch (err) {
          console.error(`Error fetching executions for benchmark ${benchmark.id}:`, err);
        }
      }

      // Sort by creation time
      allExecutions.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setExecutions(allExecutions);
    } catch (error) {
      console.error("Error fetching executions:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchExecutionDetails = async (execution: Execution) => {
    setSelectedExecution(execution);
    setDetailsLoading(true);
    setDialogOpen(true);

    try {
      const data = await api.executions.get(execution.id);
      setRunDetails((data.details?.results as BenchmarkResult[]) || []);
    } catch (error) {
      console.error("Error fetching execution details:", error);
    } finally {
      setDetailsLoading(false);
    }
  };

  const openDeleteDialog = (execution: Execution, e: React.MouseEvent) => {
    e.stopPropagation();
    setExecutionToDelete(execution);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!executionToDelete) return;

    setDeleting(true);
    try {
      await api.executions.delete(executionToDelete.id);
      toast.success("Execution record deleted");
      setDeleteDialogOpen(false);
      setExecutionToDelete(null);
      fetchExecutions();
    } catch (error) {
      console.error("Error deleting execution:", error);
      const message = error instanceof Error ? error.message : "Delete failed";
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { className: string; label: string }> = {
      pending: { className: "bg-gray-400 hover:bg-gray-500", label: "Pending" },
      running: { className: "bg-[#547A95]", label: "Running" },
      completed: {
        className: "bg-[#E8EDF2] text-[#2C3947]",
        label: "Completed",
      },
      failed: { className: "bg-red-500 hover:bg-red-600", label: "Failed" },
      timeout: {
        className: "bg-orange-500 hover:bg-orange-600",
        label: "Timeout",
      },
    };
    const config = statusConfig[status] || {
      className: "bg-gray-500",
      label: status,
    };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getScoreBadge = (score: number | null) => {
    if (score === null) return <Badge variant="secondary">Not Scored</Badge>;
    if (score >= 80) return <Badge className="bg-green-500">{score}</Badge>;
    if (score >= 60) return <Badge className="bg-yellow-500">{score}</Badge>;
    return <Badge variant="destructive">{score}</Badge>;
  };

  const parseJson = (str: string | null) => {
    if (!str) return [];
    try {
      return JSON.parse(str);
    } catch {
      return [];
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Benchmark Scores</h1>
        <p className="text-muted-foreground mt-2">
          View all Benchmark execution results and detailed scores
        </p>
      </div>

      {/* Score trend chart - only show benchmarks with execution records */}
      {!chartLoading && benchmarks.length > 0 && executionHistory.size > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Score Trends</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {benchmarks
              .filter((bm) => executionHistory.has(bm.id))
              .map((benchmark) => {
                const history = executionHistory.get(benchmark.id) || [];
                const hasScores = history.some((h) => h.avg_score !== null);

                return (
                  <Card
                    key={`chart-${benchmark.id}`}
                    className="hover:bg-[#333]/5 cursor-pointer"
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        {benchmark.name}
                      </CardTitle>
                      <CardDescription>
                        {history.length} executions total
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {hasScores ? (
                        <ScoreChart data={history} />
                      ) : (
                        <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                          No score data available
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Execution History</CardTitle>
          <CardDescription>Overview of all Benchmark runs</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : executions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No execution records yet, please
              <Link
                href="/benchmarks"
                className="text-primary hover:underline ml-1"
              >
                create and run a Benchmark
              </Link>
            </div>
          ) : (
            <Table>
              <TableBody>
                {executions.map((execution) => (
                  <TableRow
                    key={execution.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() =>
                      router.push(`/benchmarks/${execution.benchmark_id}`)
                    }
                  >
                    <TableCell className="font-medium">
                      {execution.benchmark_name}
                    </TableCell>
                    <TableCell>
                      {execution.name || `Execution #${execution.id}`}
                    </TableCell>
                    <TableCell>{getStatusBadge(execution.status)}</TableCell>
                    <TableCell>
                      {execution.started_at
                        ? formatDateTimeLocal(execution.started_at)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {execution.completed_at
                        ? formatDateTimeLocal(execution.completed_at)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          fetchExecutionDetails(execution);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={(e) => openDeleteDialog(execution, e)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedExecution?.benchmark_name} -{" "}
              {selectedExecution?.name || `Execution #${selectedExecution?.id}`}{" "}
              - Detailed Results
            </DialogTitle>
            <DialogDescription>
              View input, output and scoring details for each test case
            </DialogDescription>
          </DialogHeader>

          {detailsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : runDetails && runDetails.length > 0 ? (
            <div className="space-y-6">
              {runDetails.map((result) => (
                <Card key={result.id} className="overflow-hidden">
                  <CardHeader className="bg-muted/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          {result.agent_name} - {result.test_id}
                        </CardTitle>
                        <CardDescription>
                          {result.test_case_name}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(result.status)}
                        {getScoreBadge(result.score)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-semibold mb-2">Input</h4>
                        <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap">
                          {result.test_input}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2">Expected Output</h4>
                        <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap">
                          {result.expected_output || "None"}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2">Actual Output</h4>
                      <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {result.actual_output || "No output"}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-semibold mb-2">Key Points</h4>
                        <ul className="space-y-1">
                          {parseJson(result.key_points).map(
                            (point: string, idx: number) => (
                              <li
                                key={idx}
                                className="text-sm text-muted-foreground"
                              >
                                • {point}
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2">Forbidden Points</h4>
                        <ul className="space-y-1">
                          {parseJson(result.forbidden_points).map(
                            (point: string, idx: number) => (
                              <li
                                key={idx}
                                className="text-sm text-muted-foreground"
                              >
                                • {point}
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    </div>

                    {result.evaluation_report && (
                      <div>
                        <h4 className="font-semibold mb-2">
                          Evaluation Report
                        </h4>
                        <div className="bg-muted p-3 rounded-md">
                          <Markdown content={result.evaluation_report} />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Execution Time: {result.execution_time_ms}ms</span>
                      {result.output_file && (
                        <span>Output File: {result.output_file}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No detailed results available
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the execution record &quot;
              {executionToDelete?.name || `Execution #${executionToDelete?.id}`}
              &quot;?
              <br />
              This action will also delete all results and evaluation data for
              this execution and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
