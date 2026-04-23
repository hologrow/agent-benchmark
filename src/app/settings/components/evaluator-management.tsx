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
  FormDescription,
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
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Loader2, Settings } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatDateTimeLocal } from "@/lib/format-datetime";
import type { Model, Evaluator } from "@/types/api";

// Extend Evaluator with local properties
interface LocalEvaluator extends Evaluator {
  script_path: string;
  config: string;
}

/** Same keys as `context` in `scripts/run_evaluator.py`; `config.variables` can add or override keys */
const EVALUATION_PROMPT_VARIABLES: ReadonlyArray<{
  key: string;
  detail: string;
}> = [
  { key: "agent_name", detail: "Agent name for this benchmark result row" },
  { key: "test_id", detail: "Test case test_id" },
  { key: "test_case_name", detail: "Test case display name" },
  { key: "input", detail: "Test case input" },
  {
    key: "expected_output",
    detail: "Expected output from the test case (may be empty)",
  },
  { key: "actual_output", detail: "Raw agent output for this result" },
  {
    key: "execution_answer",
    detail:
      "Parsed final answer; script may fall back to actual_output when empty",
  },
  {
    key: "execution_steps",
    detail: "Execution steps / intermediate trace as text",
  },
  {
    key: "key_points",
    detail: "JSON string of key-point list (from test case key_points)",
  },
  {
    key: "forbidden_points",
    detail:
      "JSON string of forbidden-point list (from test case forbidden_points)",
  },
  { key: "how", detail: "Test case how / implementation hint" },
  {
    key: "execution_time_ms",
    detail: "Execution duration in milliseconds (0 if missing)",
  },
  {
    key: "trace",
    detail:
      "Synced Langfuse / execution trace body as text (empty string if none)",
  },
];

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  model_id: z.number().optional(),
  evaluation_prompt: z
    .string()
    .min(
      1,
      "evaluation_prompt is required — sent to the evaluator script as config.evaluation_prompt",
    ),
});

type FormData = z.infer<typeof formSchema>;

/** 内置评估脚本路径，不在界面配置 */
const DEFAULT_EVALUATOR_SCRIPT_PATH = "scripts/run_evaluator.py";

const defaultConfig = {
  max_workers: 1,
  variables: {
    evaluation_criteria: "accuracy,completeness,clarity",
    scoring_guide:
      "0-100 points, score based on meeting key test points and violating forbidden points",
  },
  evaluation_prompt: `Please evaluate the quality of the AI Agent's response.

## Test Case Information
- Test Name: {{test_case_name}}
- Input: {{input}}
- Expected Output: {{expected_output}}
- Expected How: {{how}}

## Key Test Points
{{key_points}}

## Forbidden Points
{{forbidden_points}}

## Agent Actual Output
{{actual_output}}

## Agent Execution Answer (Parsed Final Answer)
{{execution_answer}}

## Agent Execution Process (Steps and Intermediate Output)
{{execution_steps}}

## Evaluation Requirements
1. Check if actual output or execution answer meets all key test points
2. Check if actual output or execution answer violates any forbidden points
3. Score based on satisfaction level and violations (0-100)
4. Generate detailed evaluation report
5. The execution process must adhere to the procedures defined in "Expected How"; the higher the degree of alignment, the higher the score.

Please return evaluation results in JSON format:
{
    "score": 85,
    "report": "Detailed evaluation report...",
    "key_points_met": ["Key point met 1", "Key point met 2"],
    "forbidden_points_violated": ["Forbidden point violated 1"]
}`,
};

/** 写入 DB 的 config 中除 evaluation_prompt 外的默认块（界面不展示 JSON） */
function defaultEvaluatorConfigJson(): Record<string, unknown> {
  return {
    max_workers: defaultConfig.max_workers,
    variables: { ...defaultConfig.variables },
  };
}

/** 解析已有 config，去掉 evaluation_prompt，供与默认项合并 */
function parseStoredEvaluatorConfigWithoutPrompt(
  configStr: string | null | undefined,
): Record<string, unknown> {
  try {
    const raw = JSON.parse(configStr || "{}") as Record<string, unknown>;
    const rest = { ...raw };
    delete rest.evaluation_prompt;
    return rest;
  } catch {
    return {};
  }
}

function mergeEvaluatorConfigForSave(
  editing: LocalEvaluator | null,
  evaluationPrompt: string,
): Record<string, unknown> {
  const base = defaultEvaluatorConfigJson();
  const stored = parseStoredEvaluatorConfigWithoutPrompt(editing?.config);
  const merged: Record<string, unknown> = { ...base, ...stored };
  const baseVars = base.variables as Record<string, unknown>;
  const storedVars =
    stored.variables && typeof stored.variables === "object"
      ? (stored.variables as Record<string, unknown>)
      : {};
  merged.variables = { ...baseVars, ...storedVars };
  merged.evaluation_prompt = evaluationPrompt;
  return merged;
}

export function EvaluatorManagement() {
  const [evaluators, setEvaluators] = useState<LocalEvaluator[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvaluator, setEditingEvaluator] =
    useState<LocalEvaluator | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingEvaluator, setDeletingEvaluator] =
    useState<LocalEvaluator | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      model_id: undefined,
      evaluation_prompt: defaultConfig.evaluation_prompt,
    },
  });

  useEffect(() => {
    fetchEvaluators();
    fetchModels();
  }, []);

  const fetchEvaluators = async () => {
    try {
      const data = await api.evaluators.list();
      setEvaluators((data.evaluators as LocalEvaluator[]) || []);
    } catch (error) {
      console.error("Error fetching evaluators:", error);
      toast.error("Failed to fetch evaluators");
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = async () => {
    try {
      const data = await api.models.list();
      setModels(data.models || []);
    } catch (error) {
      console.error("Error fetching models:", error);
    }
  };

  const onSubmit = async (values: FormData) => {
    try {
      const mergedConfig = mergeEvaluatorConfigForSave(
        editingEvaluator,
        values.evaluation_prompt,
      );

      const scriptPath =
        editingEvaluator?.script_path ?? DEFAULT_EVALUATOR_SCRIPT_PATH;

      const payload = {
        name: values.name,
        description: values.description,
        script_path: scriptPath,
        model_id: values.model_id!,
        prompt_template: values.evaluation_prompt,
        config: mergedConfig,
      };

      if (editingEvaluator) {
        await api.evaluators.update(editingEvaluator.id, payload);
      } else {
        await api.evaluators.create(payload);
      }

      toast.success(
        editingEvaluator ? "Evaluator updated" : "Evaluator created",
      );
      setDialogOpen(false);
      form.reset();
      setEditingEvaluator(null);
      fetchEvaluators();
    } catch (error) {
      console.error("Error saving evaluator:", error);
      const message = error instanceof Error ? error.message : "Save failed";
      toast.error(message);
    }
  };

  const handleEdit = (evaluator: LocalEvaluator) => {
    setEditingEvaluator(evaluator);

    let evaluationPrompt = defaultConfig.evaluation_prompt;
    try {
      const parsedConfig = JSON.parse(evaluator.config || "{}") as Record<
        string,
        unknown
      >;
      if (
        parsedConfig.evaluation_prompt &&
        typeof parsedConfig.evaluation_prompt === "string"
      ) {
        evaluationPrompt = parsedConfig.evaluation_prompt;
      }
    } catch {
      // Use defaults
    }

    form.reset({
      name: evaluator.name,
      description: evaluator.description,
      model_id: evaluator.model_id ?? undefined,
      evaluation_prompt: evaluationPrompt,
    });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingEvaluator) return;

    try {
      await api.evaluators.delete(deletingEvaluator.id);
      toast.success("Evaluator deleted");
      setDeleteDialogOpen(false);
      setDeletingEvaluator(null);
      fetchEvaluators();
    } catch (error) {
      console.error("Error deleting evaluator:", error);
      const message = error instanceof Error ? error.message : "Delete failed";
      toast.error(message);
    }
  };

  const openCreateDialog = () => {
    setEditingEvaluator(null);
    form.reset({
      name: "",
      description: "",
      model_id: undefined,
      evaluation_prompt: defaultConfig.evaluation_prompt,
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Evaluator Management</h2>
          <p className="text-muted-foreground mt-1">
            Configure Benchmark result evaluators with variable context support
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          New Evaluator
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evaluator List</CardTitle>
          <CardDescription>{evaluators.length} evaluators</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : evaluators.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No evaluators</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={openCreateDialog}
              >
                Create first evaluator
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evaluators.map((evaluator) => (
                  <TableRow key={evaluator.id}>
                    <TableCell className="font-medium">
                      {evaluator.name}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {evaluator.description || "-"}
                    </TableCell>
                    <TableCell>
                      {formatDateTimeLocal(evaluator.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(evaluator)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDeletingEvaluator(evaluator);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingEvaluator ? "Edit Evaluator" : "New Evaluator"}
            </DialogTitle>
            <DialogDescription>
              Configure evaluator parameters with variable context for dynamic
              evaluation
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Evaluator Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Default Evaluator" {...field} />
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
                      <Textarea
                        placeholder="Evaluator description"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="model_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Model</FormLabel>
                    <Select
                      onValueChange={(value) =>
                        field.onChange(value ? parseInt(value) : undefined)
                      }
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select LLM model for evaluation">
                            {field.value
                              ? models.find((m) => m.id === field.value)?.name
                              : "Select LLM model for evaluation"}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {models.map((model) => (
                          <SelectItem
                            key={model.id}
                            value={model.id.toString()}
                          >
                            {model.name} ({model.model_id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Select a model from model management. The API key and
                      configuration of this model will be used for evaluation
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="evaluation_prompt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>evaluation_prompt</FormLabel>
                    <div className="space-y-2 pb-2">
                      <p className="text-xs text-muted-foreground">
                        Use placeholders like{" "}
                        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                          {"{{name}}"}
                        </code>
                        . Hover a badge for an English description. Custom keys
                        may also come from saved{" "}
                        <code className="rounded bg-muted px-0.5 font-mono text-[11px]">
                          variables
                        </code>{" "}
                        in config (same name overrides built-ins).
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {EVALUATION_PROMPT_VARIABLES.map(({ key, detail }) => (
                          <span
                            key={key}
                            title={detail}
                            className="inline-block cursor-default"
                          >
                            <Badge
                              variant="secondary"
                              className="font-mono text-[11px] font-normal"
                            >
                              {`{{${key}}}`}
                            </Badge>
                          </span>
                        ))}
                      </div>
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder="Evaluation prompt template..."
                        className="min-h-[280px] font-mono text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="submit">
                  {editingEvaluator ? "Save" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete evaluator &quot;
              {deletingEvaluator?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
