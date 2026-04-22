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
import { api } from "@/lib/api";
import type { Agent, Evaluator, Benchmark as ApiBenchmark } from "@/types/api";

interface TestSet {
  id: number;
  name: string;
  description: string;
  test_case_count?: number;
}

interface ExecutionStats {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
  avgScore: number | null;
}

// Extended benchmark type with UI-specific fields
interface Benchmark extends ApiBenchmark {
  latestStats?: ExecutionStats | null;
}

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  agent_ids: z.array(z.number()).min(1, "Select at least one Agent"),
  test_set_id: z.number().min(1, "Please select a test set"),
  evaluator_id: z.number().min(1, "Please select an evaluator"),
  run_config: z.string().optional(), // Stored as string for display
});

// Run config object type
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
    format_requirement: "Please provide clear, structured responses",
    language: "English",
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
      const [benchmarksData, agentsData, testSetsData, evaluatorsData] =
        await Promise.all([
          api.benchmarks.list(),
          api.agents.list(),
          api.testSets.list(),
          api.evaluators.list(),
        ]);

      // Calculate test case count for test sets
      const testSetsWithCount = await Promise.all(
        (testSetsData.testSets || []).map(async (ts: TestSet) => {
          const detailData = await api.testSets.get(ts.id);
          return {
            ...ts,
            test_case_count: detailData.testSet?.test_cases?.length || 0,
          };
        }),
      );

      setBenchmarks((benchmarksData.benchmarks || []) as Benchmark[]);
      setAgents(agentsData.agents || []);
      setTestSets(testSetsWithCount);
      setEvaluators(evaluatorsData.evaluators || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (values: FormData) => {
    try {
      // Parse run configuration
      let runConfigObj: RunConfig = {};
      if (values.run_config) {
        const result = parseFlexibleJson(values.run_config);
        if (!result.success) {
          toast.error("Invalid run config format: " + result.error);
          return;
        }
        runConfigObj = (result.value as RunConfig) || {};
      }

      const isEditing = editingBenchmark !== null;
      const payload = {
        ...values,
        run_config: runConfigObj,
      };

      if (isEditing) {
        await api.benchmarks.update(editingBenchmark.id, payload);
      } else {
        await api.benchmarks.create(payload);
      }

      toast.success(isEditing ? "Benchmark updated" : "Benchmark created");
      setDialogOpen(false);
      setEditingBenchmark(null);
      form.reset();
      setSelectedAgents([]);
      fetchData();
    } catch (error) {
      console.error("Error saving benchmark:", error);
      const message = error instanceof Error ? error.message : (editingBenchmark ? "Update failed" : "Create failed");
      toast.error(message);
    }
  };

  const startBenchmark = async (benchmarkId: number) => {
    try {
      await api.benchmarks.startExecution(benchmarkId);
      toast.success("Benchmark execution started");
      router.push(`/benchmarks/${benchmarkId}`);
      router.refresh();
    } catch (error) {
      console.error("Error starting benchmark:", error);
      const message = error instanceof Error ? error.message : "Failed to start";
      toast.error(message);
    }
  };

  const getStatusBadge = (stats: ExecutionStats | null | undefined) => {
    if (!stats) return <Badge variant="secondary">Not Executed</Badge>;
    if (stats.running > 0) return <Badge variant="default">Running</Badge>;
    if (stats.failed > 0) return <Badge variant="destructive">Has Failures</Badge>;
    if (stats.completed === stats.total)
      return <Badge variant="default">Completed</Badge>;
    return <Badge variant="secondary">In Progress</Badge>;
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
      await api.benchmarks.delete(benchmarkToDelete.id);
      toast.success("Benchmark deleted");
      setDeleteDialogOpen(false);
      setBenchmarkToDelete(null);
      fetchData();
    } catch (error) {
      console.error("Error deleting benchmark:", error);
      const message = error instanceof Error ? error.message : "Delete failed";
      toast.error(message);
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
    return testSet?.name || `Test Set #${testSetId}`;
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
          <h1 className="text-3xl font-bold">Benchmark Management</h1>
          <p className="text-muted-foreground mt-2">
            Create and manage Benchmark test plans, select test sets and Agents
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          New Benchmark
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Benchmark List</CardTitle>
          <CardDescription>
            {benchmarks.length} Benchmark test plans
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
              <p>No Benchmarks</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={openCreateDialog}
              >
                Create your first Benchmark
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Test Set</TableHead>
                  <TableHead>Agents</TableHead>
                  <TableHead>Latest Execution</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                            {getTestSetCount(benchmark.test_set_id)} cases
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
                              (avg: {benchmark.latestStats.avgScore.toFixed(1)}
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
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            router.push(`/benchmarks/${benchmark.id}`)
                          }
                        >
                          <History className="h-4 w-4 mr-1" />
                          History
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => startBenchmark(benchmark.id)}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Run
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
              {editingBenchmark ? "Edit Benchmark" : "New Benchmark"}
            </DialogTitle>
            <DialogDescription>
              {editingBenchmark
                ? "View and modify Benchmark configuration"
                : "Configure Benchmark test plan, select test sets and Agents"}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Benchmark name" {...field} />
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
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Benchmark description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <FormLabel>Select Agents</FormLabel>
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
                        <FormLabel>Select Test Set</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            if (value) field.onChange(parseInt(value));
                          }}
                          value={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select test set">
                                {field.value
                                  ? testSets.find((ts) => ts.id === field.value)
                                      ?.name || "Select test set"
                                  : "Select test set"}
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
                                    {testSet.test_case_count || 0} cases
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
                    <FormLabel>Evaluator</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        if (value) field.onChange(parseInt(value));
                      }}
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select evaluator">
                            {field.value
                              ? evaluators.find((e) => e.id === field.value)
                                  ?.name || "Select evaluator"
                              : "Select evaluator"}
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
                    <FormLabel>Run Configuration (JSON)</FormLabel>
                    <div className="text-sm text-muted-foreground space-y-1 mb-2">
                      <p>Configuration variables:</p>
                      <ul className="list-disc list-inside space-y-0.5 ml-2">
                        <li>
                          <code className="bg-muted px-1 rounded">
                            prompt_template
                          </code>{" "}
                          - Prompt template, use {"{{input}}"} to insert test case input
                        </li>
                        <li>
                          <code className="bg-muted px-1 rounded">
                            use_session
                          </code>{" "}
                          - Whether to maintain session state (true/false)
                        </li>
                        <li>
                          <code className="bg-muted px-1 rounded">
                            max_workers
                          </code>{" "}
                          - Maximum number of parallel workers
                        </li>
                        <li>
                          <code className="bg-muted px-1 rounded">
                            variables
                          </code>{" "}
                          - Custom variables, can be referenced in prompt template as{" "}
                          {"{{variable_name}}"}
                        </li>
                      </ul>
                    </div>
                    <FormControl>
                      <JsonEditor
                        value={field.value || ""}
                        onChange={(value) => {
                          field.onChange(value);
                        }}
                        placeholder="Run configuration JSON"
                        minHeight="300px"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="submit">
                  {editingBenchmark ? "Save" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete Benchmark &quot;{benchmarkToDelete?.name}&quot;?
              <br />
This action will also delete all execution records and results for this Benchmark and cannot be undone.
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
