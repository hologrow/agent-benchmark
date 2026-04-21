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
  Plus,
  Loader2,
  Eye,
  Trash2,
  CheckSquare,
  Database,
  Edit,
  FolderOpen,
} from 'lucide-react';
import { PluginImportHeaderActions } from '@/lib/plugins/plugin-import-header-actions';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { formatDateLocal, formatDateTimeLocal } from '@/lib/format-datetime';
import { api } from '@/lib/api';
import type { TestSet, TestCase } from '@/types/api';

// ==================== Types ====================

// ==================== Schemas ====================
const testSetFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  test_case_ids: z.array(z.number()).min(1, 'Select at least one test case'),
});

const testCaseFormSchema = z.object({
  input: z.string().min(1, 'Input is required'),
  expected_output: z.string().min(1, 'Expected output is required'),
  key_points: z.string().optional(),
  forbidden_points: z.string().optional(),
  category: z.string().optional(),
  how: z.string().optional(),
});

type TestSetFormData = z.infer<typeof testSetFormSchema>;
type TestCaseFormData = z.infer<typeof testCaseFormSchema>;

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

  // ==================== Data Fetching ====================
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [testSetsData, testCasesData] = await Promise.all([
        api.testSets.list(),
        api.testCases.list(),
      ]);

      setTestSets(testSetsData.testSets || []);
      setTestCases(testCasesData.testCases || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const fetchTestSetDetails = async (id: number) => {
    try {
      const data = await api.testSets.get(id);
      setSelectedTestSet(data.testSet);
      setViewDialogOpen(true);
    } catch (error) {
      console.error('Error fetching test set details:', error);
      toast.error('Failed to fetch details');
    }
  };

  // ==================== Test Set Operations ====================
  const onCreateTestSet = async (values: TestSetFormData) => {
    try {
      await api.testSets.create({
        ...values,
        source: 'manual',
      });

      toast.success('Test set created');
      setCreateSetDialogOpen(false);
      testSetForm.reset();
      setSelectedTestCaseIds([]);
      fetchData();
    } catch (error) {
      console.error('Error creating test set:', error);
      const message = error instanceof Error ? error.message : 'Create failed';
      toast.error(message);
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
      const data = await api.testSets.get(testSet.id);
      const fullTestSet = data.testSet;
      setEditingTestSet(fullTestSet);
      testSetForm.reset({
        name: fullTestSet.name,
        description: fullTestSet.description || '',
        test_case_ids: fullTestSet.test_cases?.map((tc: TestCase) => tc.id) || [],
      });
      setSelectedTestCaseIds(fullTestSet.test_cases?.map((tc: TestCase) => tc.id) || []);
      setEditSetDialogOpen(true);
    } catch (error) {
      console.error('Error fetching test set details:', error);
      toast.error('Failed to fetch test set details');
    }
  };

  const onUpdateTestSet = async (values: TestSetFormData) => {
    if (!editingTestSet) return;

    try {
      await api.testSets.update(editingTestSet.id, {
        ...values,
        source: editingTestSet.source || 'manual',
      });

      toast.success('Test set updated');
      setEditSetDialogOpen(false);
      setEditingTestSet(null);
      testSetForm.reset();
      setSelectedTestCaseIds([]);
      fetchData();
    } catch (error) {
      console.error('Error updating test set:', error);
      const message = error instanceof Error ? error.message : 'Update failed';
      toast.error(message);
    }
  };

  const handleDeleteSet = async () => {
    if (!testSetToDelete) return;

    setDeletingSet(true);
    try {
      await api.testSets.delete(testSetToDelete.id);

      toast.success('Test set deleted');
      setDeleteSetDialogOpen(false);
      setTestSetToDelete(null);
      fetchData();
    } catch (error) {
      console.error('Error deleting test set:', error);
      const message = error instanceof Error ? error.message : 'Delete failed';
      toast.error(message);
    } finally {
      setDeletingSet(false);
    }
  };

  // ==================== Test Case Operations ====================
  const onSaveTestCase = async (values: TestCaseFormData) => {
    try {
      const keyPoints = values.key_points
        ? JSON.stringify(values.key_points.split('\n').filter(Boolean))
        : '[]';
      const forbiddenPoints = values.forbidden_points
        ? JSON.stringify(values.forbidden_points.split('\n').filter(Boolean))
        : '[]';

      if (editingCase) {
        await api.testCases.update(editingCase.id, {
          ...values,
          key_points: keyPoints,
          forbidden_points: forbiddenPoints,
        });
      } else {
        await api.testCases.create({
          ...values,
          key_points: keyPoints,
          forbidden_points: forbiddenPoints,
        });
      }

      toast.success(editingCase ? 'Test case updated' : 'Test case created');
      setCaseDialogOpen(false);
      testCaseForm.reset();
      setEditingCase(null);
      fetchData();
    } catch (error) {
      console.error('Error saving test case:', error);
      const message = error instanceof Error ? error.message : 'Save failed';
      toast.error(message);
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
      await api.testCases.delete(deletingCase.id);

      toast.success('Test case deleted');
      setDeleteCaseDialogOpen(false);
      setDeletingCase(null);
      fetchData();
    } catch (error) {
      console.error('Error deleting test case:', error);
      const message = error instanceof Error ? error.message : 'Delete failed';
      toast.error(message);
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

  // ==================== Helpers ====================
  const getSourceBadge = (source: string | null) => {
    if (source === 'lark') {
      return <Badge variant="default">Lark</Badge>;
    }
    return <Badge variant="secondary">Manual</Badge>;
  };

  // ==================== Render ====================
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Test Sets</h1>
          <p className="text-muted-foreground mt-2">
            Manage test sets and test cases
          </p>
        </div>
        <div className="flex gap-2">
          <PluginImportHeaderActions onImportSuccess={fetchData} />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="test-sets" className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Test Sets
          </TabsTrigger>
          <TabsTrigger value="test-cases" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Test Cases
          </TabsTrigger>
        </TabsList>

        {/* Test Sets Tab */}
        <TabsContent value="test-sets">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Test Sets</CardTitle>
                <CardDescription>{testSets.length} test sets</CardDescription>
              </div>
              <Button onClick={() => setCreateSetDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Test Set
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
                  <p>No test sets</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setCreateSetDialogOpen(true)}
                  >
                    Create your first test set
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Created At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
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
                          {formatDateLocal(testSet.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => fetchTestSetDetails(testSet.id)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
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
                <CardTitle>Test Cases</CardTitle>
                <CardDescription>{testCases.length} test cases</CardDescription>
              </div>
              <Button onClick={openCreateCaseDialog}>
                <Plus className="h-4 w-4 mr-2" />
                New Test Case
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
                  <p>No test cases</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={openCreateCaseDialog}
                  >
                    Create your first test case
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Input Question</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>How To</TableHead>
                      <TableHead>Key Points</TableHead>
                      <TableHead>Forbidden Points</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
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
            <DialogTitle>New Test Set</DialogTitle>
            <DialogDescription>
              Select test cases to form a new test set
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
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Test set name" {...field} />
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
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Test set description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <FormLabel>Select Test Cases</FormLabel>
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
                        Edit
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
                <Button type="submit">Create</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Test Set Dialog */}
      <Dialog open={editSetDialogOpen} onOpenChange={setEditSetDialogOpen}>
        <DialogContent className="!max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Test Set</DialogTitle>
            <DialogDescription>
              Modify the name, description, and included test cases of the test set
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
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Test set name" {...field} />
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
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Test set description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <FormLabel>Select Test Cases</FormLabel>
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
                        Edit
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
                  Cancel
                </Button>
                <Button type="submit">Save</Button>
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
              {selectedTestSet?.description || 'No description'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>Source: {getSourceBadge(selectedTestSet?.source || null)}</span>
              <span>
                Created At:{' '}
                {selectedTestSet?.created_at
                  ? formatDateTimeLocal(selectedTestSet.created_at)
                  : '-'}
              </span>
            </div>

            <div>
              <h3 className="font-semibold mb-2">
                Included test cases ({selectedTestSet?.test_cases?.length || 0})
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
              Close
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
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete test set &quot;{testSetToDelete?.name}&quot; ?
              <br />
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteSetDialogOpen(false)}
              disabled={deletingSet}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSet}
              disabled={deletingSet}
            >
              {deletingSet ? (
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

      {/* Create/Edit Test Case Dialog */}
      <Dialog open={caseDialogOpen} onOpenChange={setCaseDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingCase ? 'Edit Test Case' : 'New Test Case'}
            </DialogTitle>
            <DialogDescription>Fill in the detailed information of the test case</DialogDescription>
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
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g.: Data Analysis" {...field} />
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
                      Input <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="User input/question"
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
                      Expected Output <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Expected response content"
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
                    <FormLabel>How To</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Implementation method/step description"
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
                      <FormLabel>Key Test Points (one per line)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Key Test Point 1&#10;Key Test Point 2"
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
                      <FormLabel>Forbidden Points (one per line)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Forbidden Point 1&#10;Forbidden Point 2"
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
                  {editingCase ? 'Save' : 'Create'}
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
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete test case &quot;{deletingCase?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteCaseDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteCase}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
