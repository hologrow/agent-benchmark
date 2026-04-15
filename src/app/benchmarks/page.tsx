"use client";

import { useEffect, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Play, Loader2, PlayCircle, CheckSquare, History, Trash2, Pencil } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface Agent {
  id: number;
  name: string;
}

interface TestCase {
  id: number;
  test_id: string;
  name: string;
}

interface Evaluator {
  id: number;
  name: string;
}

interface ExecutionStats {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
  avgScore: number | null;
}

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
  latestStats: ExecutionStats | null;
}

const formSchema = z.object({
  name: z.string().min(1, "名称不能为空"),
  description: z.string().optional(),
  agent_ids: z.array(z.number()).min(1, "至少选择一个 Agent"),
  test_case_ids: z.array(z.number()).min(1, "至少选择一个测试用例"),
  evaluator_id: z.number().min(1, "请选择评估器"),
  run_config: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

const defaultRunConfig = {
  prompt_template: "{{input}}",
  use_session: false,
  max_workers: 1,
  variables: {
    format_requirement: "请提供清晰、结构化的回答",
    language: "中文",
  },
};

export default function BenchmarksPage() {
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [benchmarkToDelete, setBenchmarkToDelete] = useState<Benchmark | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingBenchmark, setEditingBenchmark] = useState<Benchmark | null>(null);
  const router = useRouter();
  const [selectedAgents, setSelectedAgents] = useState<number[]>([]);
  const [selectedTestCases, setSelectedTestCases] = useState<number[]>([]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      agent_ids: [],
      test_case_ids: [],
      evaluator_id: undefined,
      run_config: JSON.stringify(defaultRunConfig, null, 2),
    },
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [benchmarksRes, agentsRes, testCasesRes, evaluatorsRes] =
        await Promise.all([
          fetch("/api/benchmarks"),
          fetch("/api/agents"),
          fetch("/api/test-cases"),
          fetch("/api/evaluators"),
        ]);

      const benchmarksData = await benchmarksRes.json();
      const agentsData = await agentsRes.json();
      const testCasesData = await testCasesRes.json();
      const evaluatorsData = await evaluatorsRes.json();

      setBenchmarks(benchmarksData.benchmarks || []);
      setAgents(agentsData.agents || []);
      setTestCases(testCasesData.testCases || []);
      setEvaluators(evaluatorsData.evaluators || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("获取数据失败");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (values: FormData) => {
    try {
      if (values.run_config) {
        try {
          JSON.parse(values.run_config);
        } catch {
          toast.error("运行配置必须是有效的 JSON 格式");
          return;
        }
      }

      const isEditing = editingBenchmark !== null;
      const url = isEditing
        ? `/api/benchmarks/${editingBenchmark.id}`
        : "/api/benchmarks";
      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          run_config: values.run_config || "{}",
        }),
      });

      if (response.ok) {
        toast.success(isEditing ? "Benchmark 已更新" : "Benchmark 已创建");
        setDialogOpen(false);
        setEditingBenchmark(null);
        form.reset();
        setSelectedAgents([]);
        setSelectedTestCases([]);
        fetchData();
      } else {
        const error = await response.json();
        toast.error(error.error || (isEditing ? "更新失败" : "创建失败"));
      }
    } catch (error) {
      console.error("Error saving benchmark:", error);
      toast.error(editingBenchmark ? "更新失败" : "创建失败");
    }
  };

  const startBenchmark = async (benchmarkId: number) => {
    try {
      const response = await fetch(`/api/benchmarks/${benchmarkId}/start`, {
        method: "POST",
      });

      if (response.ok) {
        toast.success("Benchmark 已开始执行");
        const data = await response.json();
        // 跳转到执行详情页
        router.push(`/executions/${data.executionId}`);
      } else {
        const error = await response.json();
        toast.error(error.error || "启动失败");
      }
    } catch (error) {
      console.error("Error starting benchmark:", error);
      toast.error("启动失败");
    }
  };

  const getStatusBadge = (stats: ExecutionStats | null) => {
    if (!stats) return <Badge variant="secondary">未执行</Badge>;
    if (stats.running > 0) return <Badge variant="default">运行中</Badge>;
    if (stats.failed > 0) return <Badge variant="destructive">有失败</Badge>;
    if (stats.completed === stats.total) return <Badge variant="default">已完成</Badge>;
    return <Badge variant="secondary">执行中</Badge>;
  };

  const toggleAgent = (agentId: number) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
    );
  };

  const toggleTestCase = (testCaseId: number) => {
    setSelectedTestCases((prev) =>
      prev.includes(testCaseId)
        ? prev.filter((id) => id !== testCaseId)
        : [...prev, testCaseId]
    );
  };

  const openDeleteDialog = (benchmark: Benchmark) => {
    setBenchmarkToDelete(benchmark);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!benchmarkToDelete) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/benchmarks/${benchmarkToDelete.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Benchmark 已删除");
        setDeleteDialogOpen(false);
        setBenchmarkToDelete(null);
        fetchData();
      } else {
        const error = await response.json();
        toast.error(error.error || "删除失败");
      }
    } catch (error) {
      console.error("Error deleting benchmark:", error);
      toast.error("删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const openCreateDialog = () => {
    setEditingBenchmark(null);
    setSelectedAgents([]);
    setSelectedTestCases([]);
    form.reset({
      name: "",
      description: "",
      agent_ids: [],
      test_case_ids: [],
      evaluator_id: undefined,
      run_config: JSON.stringify(defaultRunConfig, null, 2),
    });
    setDialogOpen(true);
  };

  const openEditDialog = (benchmark: Benchmark) => {
    setEditingBenchmark(benchmark);
    const agentIds = JSON.parse(benchmark.agent_ids) as number[];
    const testCaseIds = JSON.parse(benchmark.test_case_ids) as number[];
    setSelectedAgents(agentIds);
    setSelectedTestCases(testCaseIds);

    // Parse run_config if exists
    let runConfigStr = JSON.stringify(defaultRunConfig, null, 2);
    if (benchmark.run_config) {
      try {
        const runConfig = JSON.parse(benchmark.run_config);
        runConfigStr = JSON.stringify(runConfig, null, 2);
      } catch {
        // Use default if parsing fails
      }
    }

    form.reset({
      name: benchmark.name,
      description: benchmark.description || "",
      agent_ids: agentIds,
      test_case_ids: testCaseIds,
      evaluator_id: benchmark.evaluator_id || undefined,
      run_config: runConfigStr,
    });
    setDialogOpen(true);
  };

  useEffect(() => {
    form.setValue("agent_ids", selectedAgents);
    form.setValue("test_case_ids", selectedTestCases);
  }, [selectedAgents, selectedTestCases, form]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Benchmark 管理</h1>
          <p className="text-muted-foreground mt-2">
            创建和管理 Benchmark 测试计划，支持多次执行
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          新建 Benchmark
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Benchmark 列表</CardTitle>
          <CardDescription>共 {benchmarks.length} 个 Benchmark 测试计划</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : benchmarks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <PlayCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>暂无 Benchmark</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={openCreateDialog}
              >
                创建第一个 Benchmark
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>Agent 数</TableHead>
                  <TableHead>测试用例数</TableHead>
                  <TableHead>最新执行</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {benchmarks.map((benchmark) => (
                  <TableRow key={benchmark.id}>
                    <TableCell className="font-medium">{benchmark.name}</TableCell>
                    <TableCell>{getStatusBadge(benchmark.latestStats)}</TableCell>
                    <TableCell>{JSON.parse(benchmark.agent_ids).length}</TableCell>
                    <TableCell>
                      {JSON.parse(benchmark.test_case_ids).length}
                    </TableCell>
                    <TableCell>
                      {benchmark.latestStats ? (
                        <div className="text-sm">
                          <span className="text-green-600">{benchmark.latestStats.completed}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span>{benchmark.latestStats.total}</span>
                          {benchmark.latestStats.avgScore !== null && (
                            <span className="ml-2 text-muted-foreground">
                              (均分: {benchmark.latestStats.avgScore.toFixed(1)})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(benchmark)}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => router.push(`/benchmarks/${benchmark.id}`)}
                        >
                          <History className="h-4 w-4 mr-1" />
                          执行记录
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => startBenchmark(benchmark.id)}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          执行
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => openDeleteDialog(benchmark)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) setEditingBenchmark(null);
      }}>
        <DialogContent className="!max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBenchmark ? "编辑 Benchmark" : "新建 Benchmark"}
            </DialogTitle>
            <DialogDescription>
              {editingBenchmark
                ? "查看和修改 Benchmark 配置"
                : "配置 Benchmark 测试计划，选择 Agents 和测试用例"}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>名称</FormLabel>
                    <FormControl>
                      <Input placeholder="Benchmark 名称" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>描述</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Benchmark 描述" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <FormLabel>选择 Agents</FormLabel>
                  <div className="mt-2 border rounded-md p-4 space-y-2 max-h-[200px] overflow-y-auto">
                    {agents.map((agent) => (
                      <div
                        key={agent.id}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                          selectedAgents.includes(agent.id)
                            ? "bg-primary/10"
                            : "hover:bg-muted"
                        }`}
                        onClick={() => toggleAgent(agent.id)}
                      >
                        <CheckSquare
                          className={`h-4 w-4 ${
                            selectedAgents.includes(agent.id)
                              ? "text-primary"
                              : "text-muted-foreground"
                          }`}
                        />
                        <span>{agent.name}</span>
                      </div>
                    ))}
                  </div>
                  {form.formState.errors.agent_ids && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.agent_ids.message}
                    </p>
                  )}
                </div>

                <div>
                  <FormLabel>选择测试用例</FormLabel>
                  <div className="mt-2 border rounded-md p-4 space-y-2 max-h-[200px] overflow-y-auto">
                    {testCases.map((testCase) => (
                      <div
                        key={testCase.id}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                          selectedTestCases.includes(testCase.id)
                            ? "bg-primary/10"
                            : "hover:bg-muted"
                        }`}
                        onClick={() => toggleTestCase(testCase.id)}
                      >
                        <CheckSquare
                          className={`h-4 w-4 ${
                            selectedTestCases.includes(testCase.id)
                              ? "text-primary"
                              : "text-muted-foreground"
                          }`}
                        />
                        <div>
                          <div className="font-medium">{testCase.test_id}</div>
                          <div className="text-xs text-muted-foreground">
                            {testCase.name}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {form.formState.errors.test_case_ids && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.test_case_ids.message}
                    </p>
                  )}
                </div>
              </div>

              <FormField
                control={form.control}
                name="evaluator_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>评估器</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        if (value) field.onChange(parseInt(value));
                      }}
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="选择评估器">
                            {field.value
                              ? evaluators.find((e) => e.id === field.value)?.name || "选择评估器"
                              : "选择评估器"}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {evaluators.map((evaluator) => (
                          <SelectItem
                            key={evaluator.id}
                            value={evaluator.id.toString()}
                          >
                            {evaluator.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="run_config"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>运行配置 (JSON)</FormLabel>
                    <div className="text-sm text-muted-foreground space-y-1 mb-2">
                      <p>配置变量说明：</p>
                      <ul className="list-disc list-inside space-y-0.5 ml-2">
                        <li><code className="bg-muted px-1 rounded">prompt_template</code> - 提示词模板，使用 {'{{input}}'} 插入测试用例输入</li>
                        <li><code className="bg-muted px-1 rounded">use_session</code> - 是否保持会话状态（true/false）</li>
                        <li><code className="bg-muted px-1 rounded">max_workers</code> - 并行执行的最大 worker 数量</li>
                        <li><code className="bg-muted px-1 rounded">variables</code> - 自定义变量，可在提示词模板中使用 {'{{variable_name}}'} 引用</li>
                      </ul>
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder="运行配置 JSON"
                        className="min-h-[300px] font-mono text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="submit">
                  {editingBenchmark ? "保存" : "创建"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除 Benchmark &quot;{benchmarkToDelete?.name}&quot; 吗？
              <br />
              此操作将同时删除该 Benchmark 的所有执行记录和结果，且无法撤销。
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
