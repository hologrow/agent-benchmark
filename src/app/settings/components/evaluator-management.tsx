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
import { Plus, Edit, Trash2, Loader2, Settings } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Model, Evaluator } from "@/types/api";

// Extend Evaluator with local properties
interface LocalEvaluator extends Evaluator {
  script_path: string;
  config: string;
}

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  script_path: z.string().min(1, "Script path is required"),
  model_id: z.number().optional(),
  config: z.string().min(1, "Configuration is required"),
});

type FormData = z.infer<typeof formSchema>;

const defaultConfig = {
  model: "claude-sonnet-4-6",
  max_workers: 1,
  variables: {
    evaluation_criteria: "accuracy,completeness,clarity",
    scoring_guide: "0-100 points, score based on meeting key test points and violating forbidden points",
  },
  evaluation_prompt: `Please evaluate the quality of the AI Agent's response.

## Test Case Information
- Test ID: {{test_id}}
- Test Name: {{test_case_name}}
- Input: {{input}}
- Expected Output: {{expected_output}}
- How: {{how}}

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

Please return evaluation results in JSON format:
{
    "score": 85,
    "report": "Detailed evaluation report...",
    "key_points_met": ["Key point met 1", "Key point met 2"],
    "forbidden_points_violated": ["Forbidden point violated 1"]
}`,
};

export function EvaluatorManagement() {
  const [evaluators, setEvaluators] = useState<LocalEvaluator[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvaluator, setEditingEvaluator] = useState<LocalEvaluator | null>(
    null,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingEvaluator, setDeletingEvaluator] = useState<LocalEvaluator | null>(
    null,
  );

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      script_path: "scripts/run_evaluator.py",
      model_id: undefined,
      config: JSON.stringify(defaultConfig, null, 2),
    },
  });

  useEffect(() => {
    fetchEvaluators();
    fetchModels();
  }, []);

  const fetchEvaluators = async () => {
    try {
      const data = await api.evaluators.list();
      setEvaluators(data.evaluators as LocalEvaluator[] || []);
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
      // Validate JSON format
      try {
        JSON.parse(values.config);
      } catch {
        toast.error("Configuration must be valid JSON format");
        return;
      }

      const payload = {
        ...values,
        config: JSON.parse(values.config),
      };

      if (editingEvaluator) {
        await api.evaluators.update(editingEvaluator.id, payload);
      } else {
        await api.evaluators.create(payload);
      }

      toast.success(editingEvaluator ? "Evaluator updated" : "Evaluator created");
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
    form.reset({
      name: evaluator.name,
      description: evaluator.description,
      script_path: evaluator.script_path,
      model_id: evaluator.model_id ?? undefined,
      config: evaluator.config,
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
      script_path: "scripts/run_evaluator.py",
      model_id: undefined,
      config: JSON.stringify(defaultConfig, null, 2),
    });
    setDialogOpen(true);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US");
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
                  <TableHead>Script Path</TableHead>
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
                    <TableCell className="font-mono text-sm">
                      {evaluator.script_path}
                    </TableCell>
                    <TableCell>{formatDate(evaluator.created_at)}</TableCell>
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
              Configure evaluator parameters with variable context for dynamic evaluation
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
                      <Textarea placeholder="Evaluator description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="script_path"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Script Path</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g.: scripts/run_evaluator.py"
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
                name="config"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Configuration (JSON)</FormLabel>
                    <FormDescription className="mb-2">
                      <div className="space-y-2">
                        <p>This configuration is used to customize the evaluation process, including:</p>
                        <ul className="list-disc pl-4 space-y-1 text-sm">
                          <li>
                            <strong>model</strong>: LLM model for evaluation (e.g.,
                            claude-opus-4-6, claude-sonnet-4-6,
                            claude-haiku-4-5-20251001)
                          </li>
                          <li>
                            <strong>max_workers</strong>: Number of parallel evaluation processes
                          </li>
                          <li>
                            <strong>variables</strong>: Custom variables that can be used in
                            evaluation_prompt
                          </li>
                          <li>
                            <strong>evaluation_prompt</strong>: Evaluation prompt sent to LLM,
                            supports variable substitution
                          </li>
                        </ul>
                        <p className="text-xs text-muted-foreground">
                          Available variables: agent_name, test_id, test_case_name, input,
                          expected_output, actual_output, execution_answer,
                          execution_steps, key_points, forbidden_points, how,
                          execution_time_ms, trace
                        </p>
                      </div>
                    </FormDescription>
                    <FormControl>
                      <Textarea
                        placeholder="Evaluator configuration JSON"
                        className="min-h-[400px] font-mono text-sm"
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
              Are you sure you want to delete evaluator &quot;{deletingEvaluator?.name}&quot;? This action cannot be undone.
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
