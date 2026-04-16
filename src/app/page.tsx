'use client';

import { useEffect, useState, useRef } from 'react';
import * as echarts from 'echarts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Eye, Loader2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface Benchmark {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

interface Execution {
  id: number;
  benchmark_id: number;
  name: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
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
}

interface ExecutionHistory {
  id: number;
  execution_number: number;
  avg_score: number | null;
  created_at: string;
}

// ECharts 组件
function ScoreChart({ data }: { data: ExecutionHistory[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // 初始化图表
    chartInstance.current = echarts.init(chartRef.current);

    const option: echarts.EChartsOption = {
      grid: {
        top: 30,
        right: 20,
        bottom: 40,
        left: 50,
      },
      xAxis: {
        type: 'category',
        data: data.map(d => `第${d.execution_number}次`),
        name: '执行次数',
        nameLocation: 'middle',
        nameGap: 25,
        axisLabel: {
          fontSize: 11,
        },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        name: '平均分',
        nameLocation: 'middle',
        nameGap: 35,
        axisLabel: {
          fontSize: 11,
        },
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const p = params[0];
          const value = p.value !== null && p.value !== undefined ? Number(p.value).toFixed(1) : '无数据';
          return `${p.name}<br/>平均分: ${value}`;
        },
      },
      series: [
        {
          type: 'line',
          data: data.map(d => d.avg_score),
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: {
            color: '#3b82f6',
            width: 2,
          },
          itemStyle: {
            color: '#3b82f6',
          },
          connectNulls: true,
        },
      ],
    };

    chartInstance.current.setOption(option);

    // 响应式处理
    const handleResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.current?.dispose();
    };
  }, [data]);

  return <div ref={chartRef} className="h-[200px] w-full" />;
}

export default function BenchmarkPage() {
  const router = useRouter();
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null);
  const [runDetails, setRunDetails] = useState<BenchmarkResult[] | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [executionToDelete, setExecutionToDelete] = useState<Execution | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [executionHistory, setExecutionHistory] = useState<Map<number, ExecutionHistory[]>>(new Map());
  const [chartLoading, setChartLoading] = useState(true);

  useEffect(() => {
    fetchExecutions();
    fetchBenchmarksWithHistory();
  }, []);

  const fetchBenchmarksWithHistory = async () => {
    try {
      const benchmarksRes = await fetch('/api/benchmarks');
      const benchmarksData = await benchmarksRes.json();
      const benchmarksList: Benchmark[] = benchmarksData.benchmarks || [];

      // 按创建时间排序（最新的在前）
      benchmarksList.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setBenchmarks(benchmarksList);

      // 获取每个 benchmark 的执行历史
      const historyMap = new Map<number, ExecutionHistory[]>();
      await Promise.all(
        benchmarksList.map(async (bm) => {
          const history = await fetchExecutionHistory(bm.id);
          if (history.length > 0) {
            historyMap.set(bm.id, history);
          }
        })
      );
      setExecutionHistory(historyMap);
    } catch (error) {
      console.error('Error fetching benchmarks:', error);
    } finally {
      setChartLoading(false);
    }
  };

  const fetchExecutionHistory = async (benchmarkId: number): Promise<ExecutionHistory[]> => {
    try {
      const response = await fetch(`/api/benchmarks/${benchmarkId}/executions`);
      if (response.ok) {
        const data = await response.json();
        // 按创建时间排序（最早的在前，用于计算执行序号）
        const sorted = (data.executions || []).sort(
          (a: { created_at: string }, b: { created_at: string }) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        // 添加执行序号并计算平均分
        return sorted.map((exec: { id: number; created_at: string; avgScore?: number | null }, index: number) => ({
          id: exec.id,
          execution_number: index + 1,
          avg_score: exec.avgScore ?? null,
          created_at: exec.created_at,
        }));
      }
    } catch (error) {
      console.error(`Error fetching history for benchmark ${benchmarkId}:`, error);
    }
    return [];
  };

  const fetchExecutions = async () => {
    try {
      // 获取所有 benchmarks，然后获取它们的 executions
      const benchmarksRes = await fetch('/api/benchmarks');
      const benchmarksData = await benchmarksRes.json();
      const benchmarks: Benchmark[] = benchmarksData.benchmarks || [];

      // 收集所有 executions
      const allExecutions: Execution[] = [];
      for (const benchmark of benchmarks) {
        const execRes = await fetch(`/api/benchmarks/${benchmark.id}/executions`);
        const execData = await execRes.json();
        if (execData.executions) {
          for (const exec of execData.executions) {
            allExecutions.push({
              ...exec,
              benchmark_name: benchmark.name,
            });
          }
        }
      }

      // 按创建时间排序
      allExecutions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setExecutions(allExecutions);
    } catch (error) {
      console.error('Error fetching executions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchExecutionDetails = async (execution: Execution) => {
    setSelectedExecution(execution);
    setDetailsLoading(true);
    setDialogOpen(true);

    try {
      const response = await fetch(`/api/executions/${execution.id}`);
      const data = await response.json();
      setRunDetails(data.details?.results || []);
    } catch (error) {
      console.error('Error fetching execution details:', error);
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
      const response = await fetch(`/api/executions/${executionToDelete.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('执行记录已删除');
        setDeleteDialogOpen(false);
        setExecutionToDelete(null);
        fetchExecutions();
      } else {
        const error = await response.json();
        toast.error(error.error || '删除失败');
      }
    } catch (error) {
      console.error('Error deleting execution:', error);
      toast.error('删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { className: string; label: string }> = {
      pending: { className: 'bg-gray-400 hover:bg-gray-500', label: '待执行' },
      running: { className: 'bg-blue-500 hover:bg-blue-600', label: '运行中' },
      completed: { className: 'bg-green-500 hover:bg-green-600', label: '已完成' },
      failed: { className: 'bg-red-500 hover:bg-red-600', label: '失败' },
      timeout: { className: 'bg-orange-500 hover:bg-orange-600', label: '超时' },
    };
    const config = statusConfig[status] || { className: 'bg-gray-500', label: status };
    return (
      <Badge className={config.className}>
        {config.label}
      </Badge>
    );
  };

  const getScoreBadge = (score: number | null) => {
    if (score === null) return <Badge variant="secondary">未评分</Badge>;
    if (score >= 80) return <Badge className="bg-green-500">{score}分</Badge>;
    if (score >= 60) return <Badge className="bg-yellow-500">{score}分</Badge>;
    return <Badge variant="destructive">{score}分</Badge>;
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
        <h1 className="text-3xl font-bold">Benchmark 展示</h1>
        <p className="text-muted-foreground mt-2">
          查看所有 Benchmark 执行结果和详细评分
        </p>
      </div>

      {/* 分数趋势图表 - 仅显示有执行记录的 benchmark */}
      {!chartLoading && benchmarks.length > 0 && executionHistory.size > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">分数趋势</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {benchmarks
              .filter((bm) => executionHistory.has(bm.id))
              .map((benchmark) => {
                const history = executionHistory.get(benchmark.id) || [];
                const hasScores = history.some((h) => h.avg_score !== null);

                return (
                  <Card key={`chart-${benchmark.id}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        {benchmark.name}
                      </CardTitle>
                      <CardDescription>
                        共 {history.length} 次执行
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {hasScores ? (
                        <ScoreChart data={history} />
                      ) : (
                        <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                          暂无评分数据
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
          <CardTitle>执行历史</CardTitle>
          <CardDescription>所有 Benchmark 运行的概览</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : executions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              暂无执行记录，请先
              <Link href="/benchmarks" className="text-primary hover:underline ml-1">
                创建并执行 Benchmark
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Benchmark</TableHead>
                  <TableHead>执行批次</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>开始时间</TableHead>
                  <TableHead>完成时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executions.map((execution) => (
                  <TableRow
                    key={execution.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/benchmarks/${execution.benchmark_id}`)}
                  >
                    <TableCell className="font-medium">{execution.benchmark_name}</TableCell>
                    <TableCell>{execution.name || `执行 #${execution.id}`}</TableCell>
                    <TableCell>{getStatusBadge(execution.status)}</TableCell>
                    <TableCell>
                      {execution.started_at
                        ? new Date(execution.started_at).toLocaleString('zh-CN')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {execution.completed_at
                        ? new Date(execution.completed_at).toLocaleString('zh-CN')
                        : '-'}
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
                        查看详情
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
              {selectedExecution?.benchmark_name} - {selectedExecution?.name || `执行 #${selectedExecution?.id}`} - 详细结果
            </DialogTitle>
            <DialogDescription>
              查看每个测试用例的输入、输出和评分详情
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
                        <CardDescription>{result.test_case_name}</CardDescription>
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
                        <h4 className="font-semibold mb-2">输入</h4>
                        <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap">
                          {result.test_input}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2">期望输出</h4>
                        <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap">
                          {result.expected_output || '无'}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2">实际输出</h4>
                      <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {result.actual_output || '无输出'}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-semibold mb-2">关键测试点</h4>
                        <ul className="space-y-1">
                          {parseJson(result.key_points).map((point: string, idx: number) => {
                            const metPoints = parseJson(result.key_points_met);
                            const isMet = metPoints.includes(point);
                            return (
                              <li
                                key={idx}
                                className={`text-sm flex items-center gap-2 ${
                                  isMet ? 'text-green-600' : 'text-red-600'
                                }`}
                              >
                                <span>{isMet ? '✓' : '✗'}</span>
                                {point}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2">禁止点</h4>
                        <ul className="space-y-1">
                          {parseJson(result.forbidden_points).map((point: string, idx: number) => {
                            const violatedPoints = parseJson(result.forbidden_points_violated);
                            const isViolated = violatedPoints.includes(point);
                            return (
                              <li
                                key={idx}
                                className={`text-sm flex items-center gap-2 ${
                                  isViolated ? 'text-red-600' : 'text-green-600'
                                }`}
                              >
                                <span>{isViolated ? '✗' : '✓'}</span>
                                {point}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>

                    {result.evaluation_report && (
                      <div>
                        <h4 className="font-semibold mb-2">评估报告</h4>
                        <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap">
                          {result.evaluation_report}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>执行时间: {result.execution_time_ms}ms</span>
                      {result.output_file && (
                        <span>输出文件: {result.output_file}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              暂无详细结果
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除执行记录 &quot;{executionToDelete?.name || `执行 #${executionToDelete?.id}`}&quot; 吗？
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
    </div>
  );
}
