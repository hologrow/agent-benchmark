'use client';

import { useEffect, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Loader2,
  Eye,
  Trash2,
  CheckSquare,
  Database,
  CloudSync,
  History,
  X,
  Edit,
  FolderOpen,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';

// ==================== Types ====================
interface TestSet {
  id: number;
  name: string;
  description: string;
  source: 'lark' | 'manual' | null;
  source_url: string | null;
  created_at: string;
  test_cases?: TestCase[];
}

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

// ==================== Schemas ====================
const testSetFormSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  description: z.string().optional(),
  test_case_ids: z.array(z.number()).min(1, '至少选择一个测试用例'),
});

const testCaseFormSchema = z.object({
  input: z.string().min(1, '输入不能为空'),
  expected_output: z.string().min(1, '期望输出不能为空'),
  key_points: z.string().optional(),
  forbidden_points: z.string().optional(),
  category: z.string().optional(),
  how: z.string().optional(),
});

const syncFormSchema = z.object({
  appToken: z.string().min(1, 'App Token 不能为空'),
  tableId: z.string().min(1, 'Table ID 不能为空'),
  viewId: z.string().optional(),
  syncMode: z.enum(['upsert', 'create_only', 'update_only']).default('upsert'),
});

type TestSetFormData = z.infer<typeof testSetFormSchema>;
type TestCaseFormData = z.infer<typeof testCaseFormSchema>;
type SyncFormData = z.infer<typeof syncFormSchema>;

const APP_TOKEN_HISTORY_KEY = 'lark_app_token_history';
const MAX_HISTORY_ITEMS = 10;

// ==================== Main Component ====================
export default function TestSetsPage() {
  // Common state
  const [activeTab, setActiveTab] = useState('test-sets');
  const [testSets, setTestSets] = useState<TestSet[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);

  // Test Set dialogs
  const [createSetDialogOpen, setCreateSetDialogOpen] = useState(false);
  const [editSetDialogOpen, setEditSetDialogOpen] = useState(false);
  const [editingTestSet, setEditingTestSet] = useState<TestSet | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedTestSet, setSelectedTestSet] = useState<TestSet | null>(null);
  const [deleteSetDialogOpen, setDeleteSetDialogOpen] = useState(false);
  const [testSetToDelete, setTestSetToDelete] = useState<TestSet | null>(null);
  const [deletingSet, setDeletingSet] = useState(false);
  const [selectedTestCaseIds, setSelectedTestCaseIds] = useState<number[]>([]);

  // Test Case dialogs
  const [caseDialogOpen, setCaseDialogOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<TestCase | null>(null);
  const [deleteCaseDialogOpen, setDeleteCaseDialogOpen] = useState(false);
  const [deletingCase, setDeletingCase] = useState<TestCase | null>(null);

  // Lark Sync dialogs
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
  const [tableFields, setTableFields] = useState<TableField[]>([]);
  const [systemFields, setSystemFields] = useState<SystemField[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [loadingFields, setLoadingFields] = useState(false);
  const [showColumnMapping, setShowColumnMapping] = useState(false);
  const [appTokenHistory, setAppTokenHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Forms
  const testSetForm = useForm<TestSetFormData>({
    resolver: zodResolver(testSetFormSchema),
    defaultValues: {
      name: '',
      description: '',
      test_case_ids: [],
    },
  });

  const testCaseForm = useForm<TestCaseFormData>({
    resolver: zodResolver(testCaseFormSchema),
    defaultValues: {
      input: '',
      expected_output: '',
      key_points: '',
      forbidden_points: '',
      category: '',
      how: '',
    },
  });

  const syncForm = useForm<SyncFormData>({
    resolver: zodResolver(syncFormSchema) as never,
    defaultValues: {
      appToken: '',
      tableId: '',
      viewId: '',
      syncMode: 'upsert',
    },
  });

  // ==================== Data Fetching ====================
  useEffect(() => {
    fetchData();
    loadAppTokenHistory();
  }, []);

  const fetchData = async () => {
    try {
      const [testSetsRes, testCasesRes] = await Promise.all([
        fetch('/api/test-sets'),
        fetch('/api/test-cases'),
      ]);

      const testSetsData = await testSetsRes.json();
      const testCasesData = await testCasesRes.json();

      setTestSets(testSetsData.testSets || []);
      setTestCases(testCasesData.testCases || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchTestSetDetails = async (id: number) => {
    try {
      const response = await fetch(`/api/test-sets?id=${id}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedTestSet(data.testSet);
        setViewDialogOpen(true);
      }
    } catch (error) {
      console.error('Error fetching test set details:', error);
      toast.error('获取详情失败');
    }
  };

  // ==================== Test Set Operations ====================
  const onCreateTestSet = async (values: TestSetFormData) => {
    try {
      const response = await fetch('/api/test-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          source: 'manual',
        }),
      });

      if (response.ok) {
        toast.success('测试集已创建');
        setCreateSetDialogOpen(false);
        testSetForm.reset();
        setSelectedTestCaseIds([]);
        fetchData();
      } else {
        const error = await response.json();
        toast.error(error.error || '创建失败');
      }
    } catch (error) {
      console.error('Error creating test set:', error);
      toast.error('创建失败');
    }
  };

  const toggleTestCase = (testCaseId: number) => {
    setSelectedTestCaseIds((prev) =>
      prev.includes(testCaseId)
        ? prev.filter((id) => id !== testCaseId)
        : [...prev, testCaseId]
    );
  };

  useEffect(() => {
    testSetForm.setValue('test_case_ids', selectedTestCaseIds);
  }, [selectedTestCaseIds, testSetForm]);

  const openDeleteSetDialog = (testSet: TestSet) => {
    setTestSetToDelete(testSet);
    setDeleteSetDialogOpen(true);
  };

  const openEditSetDialog = async (testSet: TestSet) => {
    // Fetch full details including test cases
    try {
      const response = await fetch(`/api/test-sets?id=${testSet.id}`);
      if (response.ok) {
        const data = await response.json();
        const fullTestSet = data.testSet;
        setEditingTestSet(fullTestSet);
        testSetForm.reset({
          name: fullTestSet.name,
          description: fullTestSet.description || '',
          test_case_ids: fullTestSet.test_cases?.map((tc: TestCase) => tc.id) || [],
        });
        setSelectedTestCaseIds(fullTestSet.test_cases?.map((tc: TestCase) => tc.id) || []);
        setEditSetDialogOpen(true);
      } else {
        toast.error('获取测试集详情失败');
      }
    } catch (error) {
      console.error('Error fetching test set details:', error);
      toast.error('获取测试集详情失败');
    }
  };

  const onUpdateTestSet = async (values: TestSetFormData) => {
    if (!editingTestSet) return;

    try {
      const response = await fetch(`/api/test-sets?id=${editingTestSet.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          source: editingTestSet.source || 'manual',
        }),
      });

      if (response.ok) {
        toast.success('测试集已更新');
        setEditSetDialogOpen(false);
        setEditingTestSet(null);
        testSetForm.reset();
        setSelectedTestCaseIds([]);
        fetchData();
      } else {
        const error = await response.json();
        toast.error(error.error || '更新失败');
      }
    } catch (error) {
      console.error('Error updating test set:', error);
      toast.error('更新失败');
    }
  };

  const handleDeleteSet = async () => {
    if (!testSetToDelete) return;

    setDeletingSet(true);
    try {
      const response = await fetch(`/api/test-sets?id=${testSetToDelete.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('测试集已删除');
        setDeleteSetDialogOpen(false);
        setTestSetToDelete(null);
        fetchData();
      } else {
        const error = await response.json();
        toast.error(error.error || '删除失败');
      }
    } catch (error) {
      console.error('Error deleting test set:', error);
      toast.error('删除失败');
    } finally {
      setDeletingSet(false);
    }
  };

  // ==================== Test Case Operations ====================
  const onSaveTestCase = async (values: TestCaseFormData) => {
    try {
      const url = editingCase
        ? `/api/test-cases/${editingCase.id}`
        : '/api/test-cases';
      const method = editingCase ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          key_points: values.key_points
            ? JSON.stringify(values.key_points.split('\n').filter(Boolean))
            : '[]',
          forbidden_points: values.forbidden_points
            ? JSON.stringify(
                values.forbidden_points.split('\n').filter(Boolean)
              )
            : '[]',
        }),
      });

      if (response.ok) {
        toast.success(editingCase ? '测试用例已更新' : '测试用例已创建');
        setCaseDialogOpen(false);
        testCaseForm.reset();
        setEditingCase(null);
        fetchData();
      } else {
        const error = await response.json();
        toast.error(error.error || '操作失败');
      }
    } catch (error) {
      console.error('Error saving test case:', error);
      toast.error('保存失败');
    }
  };

  const handleEditCase = (testCase: TestCase) => {
    setEditingCase(testCase);
    testCaseForm.reset({
      input: testCase.input,
      expected_output: testCase.expected_output,
      key_points: parseJson(testCase.key_points).join('\n'),
      forbidden_points: parseJson(testCase.forbidden_points).join('\n'),
      category: testCase.category,
      how: testCase.how || '',
    });
    setCaseDialogOpen(true);
  };

  const handleDeleteCase = async () => {
    if (!deletingCase) return;

    try {
      const response = await fetch(`/api/test-cases/${deletingCase.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('测试用例已删除');
        setDeleteCaseDialogOpen(false);
        setDeletingCase(null);
        fetchData();
      } else {
        toast.error('删除失败');
      }
    } catch (error) {
      console.error('Error deleting test case:', error);
      toast.error('删除失败');
    }
  };

  const openCreateCaseDialog = () => {
    setEditingCase(null);
    testCaseForm.reset({
      input: '',
      expected_output: '',
      key_points: '',
      forbidden_points: '',
      category: '',
      how: '',
    });
    setCaseDialogOpen(true);
  };

  const parseJson = (str: string) => {
    try {
      return JSON.parse(str);
    } catch {
      return [];
    }
  };

  // ==================== Lark Sync Operations ====================
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

  const saveAppTokenToHistory = (token: string) => {
    if (!token) return;
    try {
      const newHistory = [
        token,
        ...appTokenHistory.filter((t) => t !== token),
      ].slice(0, MAX_HISTORY_ITEMS);
      localStorage.setItem(APP_TOKEN_HISTORY_KEY, JSON.stringify(newHistory));
      setAppTokenHistory(newHistory);
    } catch {
      // ignore
    }
  };

  const selectAppTokenFromHistory = (token: string) => {
    syncForm.setValue('appToken', token);
    setShowHistory(false);
    fetchLarkTables(token);
  };

  const removeFromHistory = (token: string, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const newHistory = appTokenHistory.filter((t) => t !== token);
    localStorage.setItem(APP_TOKEN_HISTORY_KEY, JSON.stringify(newHistory));
    setAppTokenHistory(newHistory);
  };

  const fetchLarkTables = async (appToken: string) => {
    if (!appToken) return;
    setLoadingTables(true);
    setPermissionError(null);
    setTables([]);
    setTableFields([]);
    setShowColumnMapping(false);
    try {
      const response = await fetch(
        `/api/test-cases/sync-lark?appToken=${encodeURIComponent(appToken)}`
      );
      const data = await response.json();
      if (response.ok) {
        setTables(data.tables || []);
        if (data.tables?.length > 0 && !syncForm.getValues('tableId')) {
          syncForm.setValue('tableId', data.tables[0].tableId);
          fetchTableFields(appToken, data.tables[0].tableId);
        }
      } else {
        if (data.isPermissionError && data.permissionHint) {
          setPermissionError(data.permissionHint);
          toast.error('权限不足：请在飞书开放平台为应用申请多维表格读取权限');
        } else {
          toast.error(data.error || '获取表格列表失败');
        }
      }
    } catch (error) {
      console.error('Error fetching tables:', error);
      toast.error('获取表格列表失败');
    } finally {
      setLoadingTables(false);
    }
  };

  const fetchTableFields = async (appToken: string, tableId: string) => {
    if (!appToken || !tableId) return;
    setLoadingFields(true);
    try {
      const response = await fetch(
        `/api/test-cases/sync-lark?appToken=${encodeURIComponent(
          appToken
        )}&tableId=${encodeURIComponent(tableId)}`
      );
      const data = await response.json();
      if (response.ok) {
        setTableFields(data.fields || []);
        setSystemFields(data.systemFields || []);
        const autoMapping: Record<string, string> = {};
        data.systemFields?.forEach((sf: SystemField) => {
          const matchedField = data.fields?.find(
            (f: TableField) =>
              f.fieldName === sf.label || f.fieldName === sf.key
          );
          if (matchedField) {
            autoMapping[sf.key] = matchedField.fieldName;
          }
        });
        setColumnMapping(autoMapping);
        setShowColumnMapping(true);
      } else {
        toast.error(data.error || '获取字段列表失败');
      }
    } catch (error) {
      console.error('Error fetching fields:', error);
      toast.error('获取字段列表失败');
    } finally {
      setLoadingFields(false);
    }
  };

  const handleTableChange = (tableId: string | null) => {
    if (!tableId) return;
    syncForm.setValue('tableId', tableId);
    const appToken = syncForm.getValues('appToken');
    if (appToken && tableId) {
      fetchTableFields(appToken, tableId);
    }
  };

  const onSyncSubmit = async (values: SyncFormData) => {
    setSyncLoading(true);
    setSyncProgress(null);
    saveAppTokenToHistory(values.appToken);

    try {
      const response = await fetch('/api/test-cases/sync-lark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          columnMapping,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSyncProgress(data.stats);
        toast.success(
          `同步完成！创建: ${data.stats.created}, 更新: ${data.stats.updated}, 跳过: ${data.stats.skipped}`
        );
        fetchData();
        if (data.stats.errors > 0) {
          toast.error(`有 ${data.stats.errors} 条记录处理失败`);
        }
        if (data.testSet) {
          toast.success(`已自动创建测试集: ${data.testSet.name}`);
        }
      } else {
        toast.error(data.error || '同步失败');
      }
    } catch (error) {
      console.error('Error syncing from Lark:', error);
      toast.error('同步失败');
    } finally {
      setSyncLoading(false);
    }
  };

  const openSyncDialog = () => {
    syncForm.reset({
      appToken: '',
      tableId: '',
      viewId: '',
      syncMode: 'upsert',
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

  // ==================== Helpers ====================
  const getSourceBadge = (source: string | null) => {
    if (source === 'lark') {
      return <Badge variant="default">Lark</Badge>;
    }
    return <Badge variant="secondary">手动</Badge>;
  };

  // ==================== Render ====================
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">测试集管理</h1>
          <p className="text-muted-foreground mt-2">
            管理测试集和测试用例
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openSyncDialog}>
            <CloudSync className="h-4 w-4 mr-2" />
            从 Lark 同步
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="test-sets" className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            测试集
          </TabsTrigger>
          <TabsTrigger value="test-cases" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            测试用例
          </TabsTrigger>
        </TabsList>

        {/* Test Sets Tab */}
        <TabsContent value="test-sets">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>测试集列表</CardTitle>
                <CardDescription>共 {testSets.length} 个测试集</CardDescription>
              </div>
              <Button onClick={() => setCreateSetDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                新建测试集
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : testSets.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>暂无测试集</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setCreateSetDialogOpen(true)}
                  >
                    创建第一个测试集
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>来源</TableHead>
                      <TableHead>描述</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {testSets.map((testSet) => (
                      <TableRow key={testSet.id}>
                        <TableCell className="font-medium">
                          {testSet.name}
                        </TableCell>
                        <TableCell>{getSourceBadge(testSet.source)}</TableCell>
                        <TableCell className="max-w-[300px] truncate">
                          {testSet.description || '-'}
                        </TableCell>
                        <TableCell>
                          {new Date(testSet.created_at).toLocaleDateString(
                            'zh-CN'
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => fetchTestSetDetails(testSet.id)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              查看
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditSetDialog(testSet)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => openDeleteSetDialog(testSet)}
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
        </TabsContent>

        {/* Test Cases Tab */}
        <TabsContent value="test-cases">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>测试用例列表</CardTitle>
                <CardDescription>共 {testCases.length} 个测试用例</CardDescription>
              </div>
              <Button onClick={openCreateCaseDialog}>
                <Plus className="h-4 w-4 mr-2" />
                新建测试用例
              </Button>
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
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={openCreateCaseDialog}
                  >
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
                        <TableCell
                          className="font-medium max-w-[300px] truncate"
                          title={testCase.input}
                        >
                          {testCase.input.slice(0, 50)}
                          {testCase.input.length > 50 ? '...' : ''}
                        </TableCell>
                        <TableCell>
                          {testCase.category ? (
                            <Badge variant="secondary">{testCase.category}</Badge>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell
                          className="max-w-[150px] truncate"
                          title={testCase.how}
                        >
                          {testCase.how
                            ? `${testCase.how.slice(0, 20)}...`
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {parseJson(testCase.key_points).length}
                        </TableCell>
                        <TableCell>
                          {parseJson(testCase.forbidden_points).length}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditCase(testCase)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDeletingCase(testCase);
                                setDeleteCaseDialogOpen(true);
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
        </TabsContent>
      </Tabs>

      {/* Create Test Set Dialog */}
      <Dialog open={createSetDialogOpen} onOpenChange={setCreateSetDialogOpen}>
        <DialogContent className="!max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新建测试集</DialogTitle>
            <DialogDescription>
              选择测试用例组成一个新的测试集
            </DialogDescription>
          </DialogHeader>

          <Form {...testSetForm}>
            <form
              onSubmit={testSetForm.handleSubmit(onCreateTestSet)}
              className="space-y-6"
            >
              <FormField
                control={testSetForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>名称</FormLabel>
                    <FormControl>
                      <Input placeholder="测试集名称" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={testSetForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>描述</FormLabel>
                    <FormControl>
                      <Textarea placeholder="测试集描述" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <FormLabel>选择测试用例</FormLabel>
                <div className="mt-2 border rounded-md p-4 space-y-2 max-h-[300px] overflow-y-auto">
                  {testCases.map((testCase) => (
                    <div
                      key={testCase.id}
                      className={`flex items-center gap-2 p-2 rounded transition-colors ${
                        selectedTestCaseIds.includes(testCase.id)
                          ? 'bg-primary/10'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <div
                        className="flex items-center gap-2 flex-1 cursor-pointer"
                        onClick={() => toggleTestCase(testCase.id)}
                      >
                        <CheckSquare
                          className={`h-4 w-4 ${
                            selectedTestCaseIds.includes(testCase.id)
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          }`}
                        />
                        <div>
                          <div className="font-medium">{testCase.test_id}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                            {testCase.name}
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCreateSetDialogOpen(false);
                          setEditSetDialogOpen(false);
                          handleEditCase(testCase);
                        }}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        编辑
                      </Button>
                    </div>
                  ))}
                </div>
                {testSetForm.formState.errors.test_case_ids && (
                  <p className="text-sm text-destructive mt-1">
                    {testSetForm.formState.errors.test_case_ids.message}
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button type="submit">创建</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Test Set Dialog */}
      <Dialog open={editSetDialogOpen} onOpenChange={setEditSetDialogOpen}>
        <DialogContent className="!max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑测试集</DialogTitle>
            <DialogDescription>
              修改测试集的名称、描述和包含的测试用例
            </DialogDescription>
          </DialogHeader>

          <Form {...testSetForm}>
            <form
              onSubmit={testSetForm.handleSubmit(onUpdateTestSet)}
              className="space-y-6"
            >
              <FormField
                control={testSetForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>名称</FormLabel>
                    <FormControl>
                      <Input placeholder="测试集名称" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={testSetForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>描述</FormLabel>
                    <FormControl>
                      <Textarea placeholder="测试集描述" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <FormLabel>选择测试用例</FormLabel>
                <div className="mt-2 border rounded-md p-4 space-y-2 max-h-[300px] overflow-y-auto">
                  {testCases.map((testCase) => (
                    <div
                      key={testCase.id}
                      className={`flex items-center gap-2 p-2 rounded transition-colors ${
                        selectedTestCaseIds.includes(testCase.id)
                          ? 'bg-primary/10'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <div
                        className="flex items-center gap-2 flex-1 cursor-pointer"
                        onClick={() => toggleTestCase(testCase.id)}
                      >
                        <CheckSquare
                          className={`h-4 w-4 ${
                            selectedTestCaseIds.includes(testCase.id)
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          }`}
                        />
                        <div>
                          <div className="font-medium">{testCase.test_id}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                            {testCase.name}
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCreateSetDialogOpen(false);
                          setEditSetDialogOpen(false);
                          handleEditCase(testCase);
                        }}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        编辑
                      </Button>
                    </div>
                  ))}
                </div>
                {testSetForm.formState.errors.test_case_ids && (
                  <p className="text-sm text-destructive mt-1">
                    {testSetForm.formState.errors.test_case_ids.message}
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setEditSetDialogOpen(false)}>
                  取消
                </Button>
                <Button type="submit">保存</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* View Test Set Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="!max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTestSet?.name}</DialogTitle>
            <DialogDescription>
              {selectedTestSet?.description || '无描述'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>来源: {getSourceBadge(selectedTestSet?.source || null)}</span>
              <span>
                创建时间:{' '}
                {selectedTestSet?.created_at
                  ? new Date(selectedTestSet.created_at).toLocaleString('zh-CN')
                  : '-'}
              </span>
            </div>

            <div>
              <h3 className="font-semibold mb-2">
                包含的测试用例 ({selectedTestSet?.test_cases?.length || 0})
              </h3>
              <div className="border rounded-md divide-y">
                {selectedTestSet?.test_cases?.map((testCase, index) => (
                  <div key={testCase.id} className="p-3 flex gap-3">
                    <span className="text-muted-foreground w-8">{index + 1}.</span>
                    <div>
                      <div className="font-medium">{testCase.test_id}</div>
                      <div className="text-sm text-muted-foreground">
                        {testCase.name}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Test Set Dialog */}
      <Dialog
        open={deleteSetDialogOpen}
        onOpenChange={setDeleteSetDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除测试集 &quot;{testSetToDelete?.name}&quot; 吗？
              <br />
              此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteSetDialogOpen(false)}
              disabled={deletingSet}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSet}
              disabled={deletingSet}
            >
              {deletingSet ? (
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

      {/* Create/Edit Test Case Dialog */}
      <Dialog open={caseDialogOpen} onOpenChange={setCaseDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingCase ? '编辑测试用例' : '新建测试用例'}
            </DialogTitle>
            <DialogDescription>填写测试用例的详细信息</DialogDescription>
          </DialogHeader>

          <Form {...testCaseForm}>
            <form
              onSubmit={testCaseForm.handleSubmit(onSaveTestCase)}
              className="space-y-4"
            >
              <FormField
                control={testCaseForm.control}
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
                control={testCaseForm.control}
                name="input"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      输入 <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="用户输入/问题"
                        className="min-h-[80px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={testCaseForm.control}
                name="expected_output"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      期望输出 <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="期望的回复内容"
                        className="min-h-[80px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={testCaseForm.control}
                name="how"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>如何实现</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="实现方法/步骤说明"
                        className="min-h-[60px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={testCaseForm.control}
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
                  control={testCaseForm.control}
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
                <Button type="submit">
                  {editingCase ? '保存' : '创建'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Test Case Dialog */}
      <Dialog
        open={deleteCaseDialogOpen}
        onOpenChange={setDeleteCaseDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除测试用例 &quot;{deletingCase?.name}&quot; 吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteCaseDialogOpen(false)}
            >
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteCase}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lark Sync Dialog */}
      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>从 Lark 多维表格同步</DialogTitle>
            <DialogDescription>
              从飞书多维表格导入测试用例，会自动创建一个新的测试集。
            </DialogDescription>
          </DialogHeader>

          <Form {...syncForm}>
            <form
              onSubmit={syncForm.handleSubmit(onSyncSubmit)}
              className="space-y-4"
            >
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
                          <span
                            className="truncate max-w-[300px]"
                            title={token}
                          >
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
                          <SelectValue
                            placeholder={
                              loadingTables
                                ? '加载中...'
                                : tables.length === 0
                                  ? '先输入 App Token'
                                  : '选择表格'
                            }
                          />
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

              {showColumnMapping && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">列映射配置</div>
                    {loadingFields && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    将多维表格的列映射到系统字段（输入为必填）
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {systemFields.map((sf) => (
                      <div key={sf.key} className="space-y-1">
                        <label className="text-sm">
                          {sf.label}
                          {sf.required && (
                            <span className="text-destructive">*</span>
                          )}
                        </label>
                        <Select
                          value={columnMapping[sf.key] || '__none__'}
                          onValueChange={(value) => {
                            const newValue =
                              value && value !== '__none__' ? value : '';
                            setColumnMapping((prev) => {
                              const updated: Record<string, string> = {
                                ...prev,
                              };
                              updated[sf.key] = newValue;
                              return updated;
                            });
                          }}
                          disabled={loadingFields || tableFields.length === 0}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue
                              placeholder={
                                loadingFields ? '加载中...' : '选择列'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">-- 不映射 --</SelectItem>
                            {tableFields.map((field) => (
                              <SelectItem
                                key={field.fieldId}
                                value={field.fieldName}
                              >
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
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="upsert">
                          更新或创建（默认）
                        </SelectItem>
                        <SelectItem value="create_only">
                          仅创建新记录
                        </SelectItem>
                        <SelectItem value="update_only">
                          仅更新现有记录
                        </SelectItem>
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
                      <div className="text-2xl font-bold">
                        {syncProgress.total}
                      </div>
                      <div className="text-muted-foreground text-xs">总计</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600">
                        {syncProgress.created}
                      </div>
                      <div className="text-muted-foreground text-xs">创建</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-600">
                        {syncProgress.updated}
                      </div>
                      <div className="text-muted-foreground text-xs">更新</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-500">
                        {syncProgress.skipped}
                      </div>
                      <div className="text-muted-foreground text-xs">跳过</div>
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSyncDialogOpen(false)}
                >
                  取消
                </Button>
                <Button type="submit" disabled={syncLoading}>
                  {syncLoading && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
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
