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
import { Plus, Edit, Trash2, Loader2, Database, CloudSync, History, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";

interface TestCase {
  id: number;
  test_id: string;
  name: string;
  description: string;
  input: string;
  expected_output: string;
  key_points: string;
  forbidden_points: string;
  category: string;
  how: string;
  created_at: string;
}

interface TableField {
  fieldId: string;
  fieldName: string;
  type: string;
}

interface SystemField {
  key: string;
  label: string;
  required: boolean;
}

const formSchema = z.object({
  input: z.string().min(1, "输入不能为空"),
  expected_output: z.string().optional(),
  key_points: z.string().optional(),
  forbidden_points: z.string().optional(),
  category: z.string().optional(),
  how: z.string().optional(),
});

const syncFormSchema = z.object({
  appToken: z.string().min(1, "App Token 不能为空"),
  tableId: z.string().min(1, "Table ID 不能为空"),
  viewId: z.string().optional(),
  syncMode: z.enum(["upsert", "create_only", "update_only"]).default("upsert"),
});

type FormData = z.infer<typeof formSchema>;
type SyncFormData = z.infer<typeof syncFormSchema>;

const APP_TOKEN_HISTORY_KEY = "lark_app_token_history";
const MAX_HISTORY_ITEMS = 10;

export default function TestCasesPage() {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<TestCase | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingCase, setDeletingCase] = useState<TestCase | null>(null);

  // Lark 同步相关状态
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    total: number;
    created: number;
    updated: number;
    skipped: number;
  } | null>(null);
  const [tables, setTables] = useState<{ tableId: string; name: string }[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // 列映射相关
  const [tableFields, setTableFields] = useState<TableField[]>([]);
  const [systemFields, setSystemFields] = useState<SystemField[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [loadingFields, setLoadingFields] = useState(false);
  const [showColumnMapping, setShowColumnMapping] = useState(false);

  // App Token 历史
  const [appTokenHistory, setAppTokenHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      input: "",
      expected_output: "",
      key_points: "",
      forbidden_points: "",
      category: "",
      how: "",
    },
  });

  const syncForm = useForm<SyncFormData>({
    resolver: zodResolver(syncFormSchema) as never,
    defaultValues: {
      appToken: "",
      tableId: "",
      viewId: "",
      syncMode: "upsert",
    },
  });

  useEffect(() => {
    fetchTestCases();
    loadAppTokenHistory();
  }, []);

  const fetchTestCases = async () => {
    try {
      const response = await fetch("/api/test-cases");
      const data = await response.json();
      setTestCases(data.testCases || []);
    } catch (error) {
      console.error("Error fetching test cases:", error);
      toast.error("获取测试用例失败");
    } finally {
      setLoading(false);
    }
  };

  // 加载 App Token 历史
  const loadAppTokenHistory = () => {
    try {
      const history = localStorage.getItem(APP_TOKEN_HISTORY_KEY);
      if (history) {
        setAppTokenHistory(JSON.parse(history));
      }
    } catch {
      // ignore
    }
  };

  // 保存 App Token 到历史
  const saveAppTokenToHistory = (token: string) => {
    if (!token) return;
    try {
      const newHistory = [token, ...appTokenHistory.filter(t => t !== token)].slice(0, MAX_HISTORY_ITEMS);
      localStorage.setItem(APP_TOKEN_HISTORY_KEY, JSON.stringify(newHistory));
      setAppTokenHistory(newHistory);
    } catch {
      // ignore
    }
  };

  // 从历史中选择 App Token
  const selectAppTokenFromHistory = (token: string) => {
    syncForm.setValue("appToken", token);
    setShowHistory(false);
    fetchLarkTables(token);
  };

  // 删除历史记录
  const removeFromHistory = (token: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newHistory = appTokenHistory.filter(t => t !== token);
    localStorage.setItem(APP_TOKEN_HISTORY_KEY, JSON.stringify(newHistory));
    setAppTokenHistory(newHistory);
  };

  const onSubmit = async (values: FormData) => {
    try {
      const url = editingCase
        ? `/api/test-cases/${editingCase.id}`
        : "/api/test-cases";
      const method = editingCase ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          key_points: values.key_points
            ? JSON.stringify(values.key_points.split("\n").filter(Boolean))
            : "[]",
          forbidden_points: values.forbidden_points
            ? JSON.stringify(
                values.forbidden_points.split("\n").filter(Boolean),
              )
            : "[]",
        }),
      });

      if (response.ok) {
        toast.success(editingCase ? "测试用例已更新" : "测试用例已创建");
        setDialogOpen(false);
        form.reset();
        setEditingCase(null);
        fetchTestCases();
      } else {
        const error = await response.json();
        toast.error(error.error || "操作失败");
      }
    } catch (error) {
      console.error("Error saving test case:", error);
      toast.error("保存失败");
    }
  };

  const handleEdit = (testCase: TestCase) => {
    setEditingCase(testCase);
    form.reset({
      input: testCase.input,
      expected_output: testCase.expected_output,
      key_points: parseJson(testCase.key_points).join("\n"),
      forbidden_points: parseJson(testCase.forbidden_points).join("\n"),
      category: testCase.category,
      how: testCase.how || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingCase) return;

    try {
      const response = await fetch(`/api/test-cases/${deletingCase.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("测试用例已删除");
        setDeleteDialogOpen(false);
        setDeletingCase(null);
        fetchTestCases();
      } else {
        toast.error("删除失败");
      }
    } catch (error) {
      console.error("Error deleting test case:", error);
      toast.error("删除失败");
    }
  };

  const parseJson = (str: string) => {
    try {
      return JSON.parse(str);
    } catch {
      return [];
    }
  };

  const openCreateDialog = () => {
    setEditingCase(null);
    form.reset({
      input: "",
      expected_output: "",
      key_points: "",
      forbidden_points: "",
      category: "",
      how: "",
    });
    setDialogOpen(true);
  };

  // 获取 Lark 表格列表
  const fetchLarkTables = async (appToken: string) => {
    if (!appToken) return;
    setLoadingTables(true);
    setPermissionError(null);
    setTables([]);
    setTableFields([]);
    setShowColumnMapping(false);
    try {
      const response = await fetch(
        `/api/test-cases/sync-lark?appToken=${encodeURIComponent(appToken)}`,
      );
      const data = await response.json();
      if (response.ok) {
        setTables(data.tables || []);
        if (data.tables?.length > 0 && !syncForm.getValues("tableId")) {
          syncForm.setValue("tableId", data.tables[0].tableId);
          // 自动获取字段
          fetchTableFields(appToken, data.tables[0].tableId);
        }
      } else {
        if (data.isPermissionError && data.permissionHint) {
          setPermissionError(data.permissionHint);
          toast.error("权限不足：请在飞书开放平台为应用申请多维表格读取权限");
        } else {
          toast.error(data.error || "获取表格列表失败");
        }
      }
    } catch (error) {
      console.error("Error fetching tables:", error);
      toast.error("获取表格列表失败");
    } finally {
      setLoadingTables(false);
    }
  };

  // 获取表格字段列表
  const fetchTableFields = async (appToken: string, tableId: string) => {
    if (!appToken || !tableId) return;
    setLoadingFields(true);
    try {
      const response = await fetch(
        `/api/test-cases/sync-lark?appToken=${encodeURIComponent(appToken)}&tableId=${encodeURIComponent(tableId)}`,
      );
      const data = await response.json();
      if (response.ok) {
        setTableFields(data.fields || []);
        setSystemFields(data.systemFields || []);
        // 自动映射同名字段
        const autoMapping: Record<string, string> = {};
        data.systemFields?.forEach((sf: SystemField) => {
          const matchedField = data.fields?.find(
            (f: TableField) => f.fieldName === sf.label || f.fieldName === sf.key
          );
          if (matchedField) {
            autoMapping[sf.key] = matchedField.fieldName;
          }
        });
        setColumnMapping(autoMapping);
        setShowColumnMapping(true);
      } else {
        toast.error(data.error || "获取字段列表失败");
      }
    } catch (error) {
      console.error("Error fetching fields:", error);
      toast.error("获取字段列表失败");
    } finally {
      setLoadingFields(false);
    }
  };

  // 处理表格选择变化
  const handleTableChange = (tableId: string | null) => {
    if (!tableId) return;
    syncForm.setValue("tableId", tableId);
    const appToken = syncForm.getValues("appToken");
    if (appToken && tableId) {
      fetchTableFields(appToken, tableId);
    }
  };

  // 执行 Lark 同步
  const onSyncSubmit = async (values: SyncFormData) => {
    setSyncLoading(true);
    setSyncProgress(null);

    // 保存 App Token 到历史
    saveAppTokenToHistory(values.appToken);

    try {
      const response = await fetch("/api/test-cases/sync-lark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          columnMapping,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSyncProgress(data.stats);
        toast.success(`同步完成！创建: ${data.stats.created}, 更新: ${data.stats.updated}, 跳过: ${data.stats.skipped}`);
        fetchTestCases();
        if (data.stats.errors > 0) {
          toast.error(`有 ${data.stats.errors} 条记录处理失败`);
        }
      } else {
        toast.error(data.error || "同步失败");
      }
    } catch (error) {
      console.error("Error syncing from Lark:", error);
      toast.error("同步失败");
    } finally {
      setSyncLoading(false);
    }
  };

  const openSyncDialog = () => {
    syncForm.reset({
      appToken: "",
      tableId: "",
      viewId: "",
      syncMode: "upsert",
    });
    setTables([]);
    setTableFields([]);
    setSyncProgress(null);
    setPermissionError(null);
    setShowColumnMapping(false);
    setColumnMapping({});
    setShowHistory(false);
    setSyncDialogOpen(true);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">测试集管理</h1>
          <p className="text-muted-foreground mt-2">管理测试用例（支持未来连接外部数据源）</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openSyncDialog}>
            <CloudSync className="h-4 w-4 mr-2" />
            从 Lark 同步
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            新建测试用例
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>测试用例列表</CardTitle>
          <CardDescription>共 {testCases.length} 个测试用例</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : testCases.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>暂无测试用例</p>
              <Button variant="outline" className="mt-4" onClick={openCreateDialog}>
                创建第一个测试用例
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>输入问题</TableHead>
                  <TableHead>分类</TableHead>
                  <TableHead>如何实现</TableHead>
                  <TableHead>关键点</TableHead>
                  <TableHead>禁止点</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {testCases.map((testCase) => (
                  <TableRow key={testCase.id}>
                    <TableCell className="font-medium max-w-[300px] truncate" title={testCase.input}>
                      {testCase.input.slice(0, 50)}{testCase.input.length > 50 ? '...' : ''}
                    </TableCell>
                    <TableCell>
                      {testCase.category ? (
                        <Badge variant="secondary">{testCase.category}</Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate" title={testCase.how}>
                      {testCase.how ? `${testCase.how.slice(0, 20)}...` : '-'}
                    </TableCell>
                    <TableCell>{parseJson(testCase.key_points).length}</TableCell>
                    <TableCell>{parseJson(testCase.forbidden_points).length}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(testCase)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDeletingCase(testCase);
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingCase ? "编辑测试用例" : "新建测试用例"}</DialogTitle>
            <DialogDescription>填写测试用例的详细信息</DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>分类</FormLabel>
                      <FormControl>
                        <Input placeholder="如：数据分析" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="expected_output"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>期望输出</FormLabel>
                      <FormControl>
                        <Input placeholder="期望的回复内容" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="input"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>输入 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Textarea placeholder="用户输入/问题" className="min-h-[80px]" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="how"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>如何实现</FormLabel>
                    <FormControl>
                      <Textarea placeholder="实现方法/步骤说明" className="min-h-[60px]" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="key_points"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>关键测试点（每行一个）</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="关键测试点1&#10;关键测试点2"
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="forbidden_points"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>禁止点（每行一个）</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="禁止点1&#10;禁止点2"
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button type="submit">{editingCase ? "保存" : "创建"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>确定要删除测试用例 "{deletingCase?.name}" 吗？此操作不可撤销。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>从 Lark 多维表格同步</DialogTitle>
            <DialogDescription>
              从飞书多维表格导入测试用例。请先配置 App Token 和列映射关系。
            </DialogDescription>
          </DialogHeader>

          <Form {...syncForm}>
            <form onSubmit={syncForm.handleSubmit(onSyncSubmit)} className="space-y-4">
              {/* App Token 输入和历史 */}
              <div className="relative">
                <FormField
                  control={syncForm.control}
                  name="appToken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>App Token（多维表格链接中的 token）</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            placeholder="如：BvG2bY5P0aabcdefg123"
                            {...field}
                            onBlur={() => fetchLarkTables(field.value)}
                          />
                        </FormControl>
                        {appTokenHistory.length > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setShowHistory(!showHistory)}
                            title="历史记录"
                          >
                            <History className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 历史记录下拉 */}
                {showHistory && appTokenHistory.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-md">
                    <div className="py-1">
                      <div className="px-3 py-2 text-xs text-muted-foreground border-b">
                        点击选择历史 App Token
                      </div>
                      {appTokenHistory.map((token, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between px-3 py-2 hover:bg-muted cursor-pointer text-sm"
                          onClick={() => selectAppTokenFromHistory(token)}
                        >
                          <span className="truncate max-w-[300px]" title={token}>
                            {token.slice(0, 20)}...
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => removeFromHistory(token, e)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {permissionError && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  <div className="font-medium mb-1">⚠️ 权限不足</div>
                  <div>{permissionError}</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    操作步骤：
                    <ol className="list-decimal list-inside mt-1 space-y-0.5">
                      <li>登录飞书开放平台</li>
                      <li>进入「开发配置」-「权限管理」</li>
                      <li>申请「多维表格」相关读取权限</li>
                      <li>重新发布应用</li>
                    </ol>
                  </div>
                </div>
              )}

              <FormField
                control={syncForm.control}
                name="tableId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Table ID</FormLabel>
                    <Select
                      onValueChange={handleTableChange}
                      value={field.value}
                      disabled={loadingTables || tables.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={loadingTables ? '加载中...' : tables.length === 0 ? '先输入 App Token' : '选择表格'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {tables.map((table) => (
                          <SelectItem key={table.tableId} value={table.tableId}>
                            {table.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 列映射配置 */}
              {showColumnMapping && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">列映射配置</div>
                    {loadingFields && <Loader2 className="h-4 w-4 animate-spin" />}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    将多维表格的列映射到系统字段（测试 ID 和输入为必填）
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {systemFields.map((sf) => (
                      <div key={sf.key} className="space-y-1">
                        <label className="text-sm">
                          {sf.label}
                          {sf.required && <span className="text-destructive">*</span>}
                        </label>
                        <Select
                          value={columnMapping[sf.key] || "__none__"}
                          onValueChange={(value) => {
                            const newValue = value && value !== "__none__" ? value : "";
                            setColumnMapping(prev => {
                              const updated: Record<string, string> = { ...prev };
                              updated[sf.key] = newValue;
                              return updated;
                            });
                          }}
                          disabled={loadingFields || tableFields.length === 0}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder={loadingFields ? "加载中..." : "选择列"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">-- 不映射 --</SelectItem>
                            {tableFields.map((field) => (
                              <SelectItem key={field.fieldId} value={field.fieldName}>
                                {field.fieldName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <FormField
                control={syncForm.control}
                name="viewId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>View ID（可选，特定视图 ID）</FormLabel>
                    <FormControl>
                      <Input placeholder="如：vewXXXXXX" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={syncForm.control}
                name="syncMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>同步模式</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="upsert">更新或创建（默认）</SelectItem>
                        <SelectItem value="create_only">仅创建新记录</SelectItem>
                        <SelectItem value="update_only">仅更新现有记录</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {syncProgress && (
                <div className="rounded-lg bg-muted p-4 text-sm">
                  <div className="font-medium mb-2">同步结果</div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <div className="text-2xl font-bold">{syncProgress.total}</div>
                      <div className="text-muted-foreground text-xs">总计</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600">{syncProgress.created}</div>
                      <div className="text-muted-foreground text-xs">创建</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-600">{syncProgress.updated}</div>
                      <div className="text-muted-foreground text-xs">更新</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-500">{syncProgress.skipped}</div>
                      <div className="text-muted-foreground text-xs">跳过</div>
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setSyncDialogOpen(false)}>
                  取消
                </Button>
                <Button type="submit" disabled={syncLoading}>
                  {syncLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  开始同步
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
