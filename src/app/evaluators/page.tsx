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

interface Model {
  id: number;
  name: string;
  model_id: string;
  provider: string;
}

interface Evaluator {
  id: number;
  name: string;
  description: string;
  script_path: string;
  config: string;
  model_id: number | null;
  created_at: string;
}

const formSchema = z.object({
  name: z.string().min(1, "名称不能为空"),
  description: z.string().optional(),
  script_path: z.string().min(1, "脚本路径不能为空"),
  model_id: z.number().optional(),
  config: z.string().min(1, "配置不能为空"),
});

type FormData = z.infer<typeof formSchema>;

const defaultConfig = {
  model: "claude-sonnet-4-6",
  max_workers: 1,
  variables: {
    evaluation_criteria: "accuracy,completeness,clarity",
    scoring_guide: "0-100分，根据满足关键测试点和违反禁止点的情况打分",
  },
  evaluation_prompt: `请评估以下 AI Agent 的回复质量。

## 测试用例信息
- 测试 ID: {{test_id}}
- 测试名称: {{test_case_name}}
- 输入: {{input}}
- 期望输出: {{expected_output}}
- 如何实现: {{how}}

## 关键测试点
{{key_points}}

## 禁止点
{{forbidden_points}}

## Agent 实际输出
{{actual_output}}

## Agent 执行答案（解析后的最终答案）
{{execution_answer}}

## Agent 执行过程（执行步骤和中间过程）
{{execution_steps}}

## 评估要求
1. 检查实际输出或执行答案是否满足所有关键测试点
2. 检查实际输出或执行答案是否触犯了任何禁止点
3. 根据满足程度和违规情况打分（0-100）
4. 生成详细的评估报告

请以 JSON 格式返回评估结果：
{
    "score": 85,
    "report": "详细的评估报告...",
    "key_points_met": ["满足的关键点1", "满足的关键点2"],
    "forbidden_points_violated": ["违反的禁止点1"]
}`,
};

export default function EvaluatorsPage() {
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvaluator, setEditingEvaluator] = useState<Evaluator | null>(
    null,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingEvaluator, setDeletingEvaluator] = useState<Evaluator | null>(
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
      const response = await fetch("/api/evaluators");
      const data = await response.json();
      setEvaluators(data.evaluators || []);
    } catch (error) {
      console.error("Error fetching evaluators:", error);
      toast.error("获取评估器失败");
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = async () => {
    try {
      const response = await fetch("/api/models");
      const data = await response.json();
      setModels(data.models || []);
    } catch (error) {
      console.error("Error fetching models:", error);
    }
  };

  const onSubmit = async (values: FormData) => {
    try {
      // 验证 JSON 格式
      try {
        JSON.parse(values.config);
      } catch {
        toast.error("配置必须是有效的 JSON 格式");
        return;
      }

      const url = editingEvaluator
        ? `/api/evaluators/${editingEvaluator.id}`
        : "/api/evaluators";
      const method = editingEvaluator ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        toast.success(editingEvaluator ? "评估器已更新" : "评估器已创建");
        setDialogOpen(false);
        form.reset();
        setEditingEvaluator(null);
        fetchEvaluators();
      } else {
        const error = await response.json();
        toast.error(error.error || "操作失败");
      }
    } catch (error) {
      console.error("Error saving evaluator:", error);
      toast.error("保存失败");
    }
  };

  const handleEdit = (evaluator: Evaluator) => {
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
      const response = await fetch(`/api/evaluators/${deletingEvaluator.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("评估器已删除");
        setDeleteDialogOpen(false);
        setDeletingEvaluator(null);
        fetchEvaluators();
      } else {
        toast.error("删除失败");
      }
    } catch (error) {
      console.error("Error deleting evaluator:", error);
      toast.error("删除失败");
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
    return new Date(dateStr).toLocaleString("zh-CN");
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">评估器管理</h1>
          <p className="text-muted-foreground mt-2">
            配置 Benchmark 结果评估器，支持变量引用上下文
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          新建评估器
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>评估器列表</CardTitle>
          <CardDescription>共 {evaluators.length} 个评估器</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : evaluators.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>暂无评估器</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={openCreateDialog}
              >
                创建第一个评估器
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead>脚本路径</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
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
              {editingEvaluator ? "编辑评估器" : "新建评估器"}
            </DialogTitle>
            <DialogDescription>
              配置评估器参数，支持使用变量引用上下文进行动态评估
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>评估器名称</FormLabel>
                    <FormControl>
                      <Input placeholder="如：默认评估器" {...field} />
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
                      <Textarea placeholder="评估器描述" {...field} />
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
                    <FormLabel>脚本路径</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="如：scripts/run_evaluator.py"
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
                    <FormLabel>选择模型</FormLabel>
                    <Select
                      onValueChange={(value) =>
                        field.onChange(value ? parseInt(value) : undefined)
                      }
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="选择用于评估的 LLM 模型">
                            {field.value
                              ? models.find((m) => m.id === field.value)?.name
                              : "选择用于评估的 LLM 模型"}
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
                      选择模型管理中配置的模型，评估时将使用该模型的 API
                      密钥和配置
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
                    <FormLabel>配置 (JSON)</FormLabel>
                    <FormDescription className="mb-2">
                      <div className="space-y-2">
                        <p>此配置用于自定义评估流程，包括：</p>
                        <ul className="list-disc pl-4 space-y-1 text-sm">
                          <li>
                            <strong>model</strong>：评估使用的 LLM 模型（如
                            claude-opus-4-6, claude-sonnet-4-6,
                            claude-haiku-4-5-20251001）
                          </li>
                          <li>
                            <strong>max_workers</strong>：并行评估的进程数
                          </li>
                          <li>
                            <strong>variables</strong>：自定义变量，可在
                            evaluation_prompt 中使用
                          </li>
                          <li>
                            <strong>evaluation_prompt</strong>：发送给 LLM
                            的评估提示词，支持变量替换
                          </li>
                        </ul>
                        <p className="text-xs text-muted-foreground">
                          可用变量：agent_name, test_id, test_case_name, input,
                          expected_output, actual_output, execution_answer,
                          execution_steps, key_points, forbidden_points, how,
                          execution_time_ms
                        </p>
                      </div>
                    </FormDescription>
                    <FormControl>
                      <Textarea
                        placeholder="评估器配置 JSON"
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
                  {editingEvaluator ? "保存" : "创建"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除评估器 "{deletingEvaluator?.name}" 吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
