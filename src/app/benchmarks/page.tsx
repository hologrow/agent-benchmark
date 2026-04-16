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
import {
  Plus,
  Play,
  Loader2,
  PlayCircle,
  History,
  Trash2,
  Pencil,
  FolderOpen,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { JsonEditor, parseFlexibleJson } from "@/components/json-editor";

interface Agent {
  id: number;
  name: string;
}

interface TestSet {
  id: number;
  name: string;
  description: string;
  test_case_count?: number;
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
  test_set_id: number | null;
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
  test_set_id: z.number().min(1, "请选择测试集"),
  evaluator_id: z.number().min(1, "请选择评估器"),
  run_config: z.string().optional(), // 存储为字符串用于显示
});

// 运行配置对象类型
interface RunConfig {
  prompt_template?: string;
  use_session?: boolean;
  max_workers?: number;
  variables?: Record<string, string>;
  [key: string]: unknown;
}

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
  const [testSets, setTestSets] = useState<TestSet[]>([]);
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [benchmarkToDelete, setBenchmarkToDelete] = useState<Benchmark | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [editingBenchmark, setEditingBenchmark] = useState<Benchmark | null>(
    null,
  );
  const router = useRouter();
  const [selectedAgents, setSelectedAgents] = useState<number[]>([]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      agent_ids: [],
      test_set_id: undefined,
      evaluator_id: undefined,
      run_config: JSON.stringify(defaultRunConfig, null, 2),
    },
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [benchmarksRes, agentsRes, testSetsRes, evaluatorsRes] =
        await Promise.all([
          fetch("/api/benchmarks"),
          fetch("/api/agents"),
          fetch("/api/test-sets"),
          fetch("/api/evaluators"),
        ]);

      const benchmarksData = await benchmarksRes.json();
      const agentsData = await agentsRes.json();
      const testSetsData = await testSetsRes.json();
      const evaluatorsData = await evaluatorsRes.json();

      // 为测试集计算用例数量
      const testSetsWithCount = await Promise.all(
        (testSetsData.testSets || []).map(async (ts: TestSet) => {
          const detailRes = await fetch(`/api/test-sets?id=${ts.id}`);
          const detailData = await detailRes.json();
          return {
            ...ts,
            test_case_count: detailData.testSet?.test_cases?.length || 0,
          };
        }),
      );

      setBenchmarks(benchmarksData.benchmarks || []);
      setAgents(agentsData.agents || []);
      setTestSets(testSetsWithCount);
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
      // 解析运行配置
      let runConfigObj: RunConfig = {};
      if (values.run_config) {
        const result = parseFlexibleJson(values.run_config);
        if (!result.success) {
          toast.error("运行配置格式错误: " + result.error);
          return;
        }
        runConfigObj = (result.value as RunConfig) || {};
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
          run_config: runConfigObj, // 发送对象，让后端 JSON.stringify
        }),
      });

      if (response.ok) {
        toast.success(isEditing ? "Benchmark 已更新" : "Benchmark 已创建");
        setDialogOpen(false);
        setEditingBenchmark(null);
        form.reset();
        setSelectedAgents([]);
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
    if (stats.completed === stats.total)
      return <Badge variant="default">已完成</Badge>;
    return <Badge variant="secondary">执行中</Badge>;
  };

  const toggleAgent = (agentId: number) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId],
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
    form.reset({
      name: "",
      description: "",
      agent_ids: [],
      test_set_id: undefined,
      evaluator_id: undefined,
      run_config: JSON.stringify(defaultRunConfig, null, 2),
    });
    setDialogOpen(true);
  };

  const openEditDialog = (benchmark: Benchmark) => {
    setEditingBenchmark(benchmark);
    const agentIds = JSON.parse(benchmark.agent_ids) as number[];
    setSelectedAgents(agentIds);

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
      test_set_id: benchmark.test_set_id || undefined,
      evaluator_id: benchmark.evaluator_id || undefined,
      run_config: runConfigStr,
    });
    setDialogOpen(true);
  };

  useEffect(() => {
    form.setValue("agent_ids", selectedAgents);
  }, [selectedAgents, form]);

  const getTestSetName = (testSetId: number | null) => {
    if (!testSetId) return "-";
    const testSet = testSets.find((ts) => ts.id === testSetId);
    return testSet?.name || `测试集 #${testSetId}`;
  };

  const getTestSetCount = (testSetId: number | null) => {
    if (!testSetId) return 0;
    const testSet = testSets.find((ts) => ts.id === testSetId);
    return testSet?.test_case_count || 0;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Benchmark 管理</h1>
          <p className="text-muted-foreground mt-2">
            创建和管理 Benchmark 测试计划，选择测试集和 Agents
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
          <CardDescription>
            共 {benchmarks.length} 个 Benchmark 测试计划
          </CardDescription>
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
                  <TableHead>测试集</TableHead>
                  <TableHead>Agent 数</TableHead>
                  <TableHead>最新执行</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {benchmarks.map((benchmark) => (
                  <TableRow key={benchmark.id}>
                    <TableCell className="font-medium">
                      {benchmark.name}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(benchmark.latestStats)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">
                            {getTestSetName(benchmark.test_set_id)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {getTestSetCount(benchmark.test_set_id)} 个用例
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {JSON.parse(benchmark.agent_ids).length}
                    </TableCell>
                    <TableCell>
                      {benchmark.latestStats ? (
                        <div className="text-sm">
                          <span className="text-green-600">
                            {benchmark.latestStats.completed}
                          </span>
                          <span className="text-muted-foreground"> / </span>
                          <span>{benchmark.latestStats.total}</span>
                          {benchmark.latestStats.avgScore !== null && (
                            <span className="ml-2 text-muted-foreground">
                              (均分: {benchmark.latestStats.avgScore.toFixed(1)}
                              )
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
                          onClick={() =>
                            router.push(`/benchmarks/${benchmark.id}`)
                          }
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

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingBenchmark(null);
        }}
      >
        <DialogContent className="!max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBenchmark ? "编辑 Benchmark" : "新建 Benchmark"}
            </DialogTitle>
            <DialogDescription>
              {editingBenchmark
                ? "查看和修改 Benchmark 配置"
                : "配置 Benchmark 测试计划，选择测试集和 Agents"}
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
                        <span
                          className={`h-4 w-4 border rounded ${
                            selectedAgents.includes(agent.id)
                              ? "bg-primary border-primary"
                              : "border-muted-foreground"
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
                  <FormField
                    control={form.control}
                    name="test_set_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>选择测试集</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            if (value) field.onChange(parseInt(value));
                          }}
                          value={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="选择测试集">
                                {field.value
                                  ? testSets.find((ts) => ts.id === field.value)
                                      ?.name || "选择测试集"
                                  : "选择测试集"}
                              </SelectValue>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {testSets.map((testSet) => (
                              <SelectItem
                                key={testSet.id}
                                value={testSet.id.toString()}
                              >
                                <div className="flex flex-col">
                                  <span>{testSet.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {testSet.test_case_count || 0} 个用例
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                              ? evaluators.find((e) => e.id === field.value)
                                  ?.name || "选择评估器"
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
                        <li>
                          <code className="bg-muted px-1 rounded">
                            prompt_template
                          </code>{" "}
                          - 提示词模板，使用 {"{{input}}"} 插入测试用例输入
                        </li>
                        <li>
                          <code className="bg-muted px-1 rounded">
                            use_session
                          </code>{" "}
                          - 是否保持会话状态（true/false）
                        </li>
                        <li>
                          <code className="bg-muted px-1 rounded">
                            max_workers
                          </code>{" "}
                          - 并行执行的最大 worker 数量
                        </li>
                        <li>
                          <code className="bg-muted px-1 rounded">
                            variables
                          </code>{" "}
                          - 自定义变量，可在提示词模板中使用{" "}
                          {"{{variable_name}}"} 引用
                        </li>
                      </ul>
                    </div>
                    <FormControl>
                      <JsonEditor
                        value={field.value || ""}
                        onChange={(value) => {
                          field.onChange(value);
                        }}
                        placeholder="运行配置 JSON"
                        minHeight="300px"
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
