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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Edit, Trash2, Loader2, Brain, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

interface Model {
  id: number;
  name: string;
  model_id: string;
  provider: string;
  api_key: string | null;
  base_url: string | null;
  config: string | null;
  is_default: number;
  created_at: string;
}

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingModel, setDeletingModel] = useState<Model | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    model_id: '',
    provider: 'anthropic',
    api_key: '',
    base_url: '',
    config: JSON.stringify({ temperature: 0.7, max_tokens: 4096 }, null, 2),
    is_default: false,
  });

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    try {
      const response = await fetch('/api/models');
      const data = await response.json();
      setModels(data.models || []);
    } catch (error) {
      console.error('Error fetching models:', error);
      toast.error('获取模型配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (formData.config) {
        try {
          JSON.parse(formData.config);
        } catch {
          toast.error('配置必须是有效的 JSON 格式');
          return;
        }
      }

      const url = editingModel ? `/api/models/${editingModel.id}` : '/api/models';
      const method = editingModel ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          api_key: formData.api_key || null,
          base_url: formData.base_url || null,
          config: formData.config || '{}',
        }),
      });

      if (response.ok) {
        toast.success(editingModel ? '模型配置已更新' : '模型配置已创建');
        setDialogOpen(false);
        setEditingModel(null);
        resetForm();
        fetchModels();
      } else {
        const error = await response.json();
        toast.error(error.error || '操作失败');
      }
    } catch (error) {
      console.error('Error saving model:', error);
      toast.error('保存失败');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      model_id: '',
      provider: 'anthropic',
      api_key: '',
      base_url: '',
      config: JSON.stringify({ temperature: 0.7, max_tokens: 4096 }, null, 2),
      is_default: false,
    });
  };

  const handleEdit = (model: Model) => {
    setEditingModel(model);
    setFormData({
      name: model.name,
      model_id: model.model_id,
      provider: model.provider,
      api_key: model.api_key || '',
      base_url: model.base_url || '',
      config: model.config || JSON.stringify({ temperature: 0.7, max_tokens: 4096 }, null, 2),
      is_default: model.is_default === 1,
    });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingModel) return;

    try {
      const response = await fetch(`/api/models/${deletingModel.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('模型配置已删除');
        setDeleteDialogOpen(false);
        setDeletingModel(null);
        fetchModels();
      } else {
        toast.error('删除失败');
      }
    } catch (error) {
      console.error('Error deleting model:', error);
      toast.error('删除失败');
    }
  };

  const openCreateDialog = () => {
    setEditingModel(null);
    resetForm();
    setDialogOpen(true);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  const maskApiKey = (key: string | null) => {
    if (!key) return '-';
    if (key.length <= 8) return '****';
    return key.substring(0, 4) + '****' + key.substring(key.length - 4);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">模型管理</h1>
          <p className="text-muted-foreground mt-2">配置 LLM 模型和 API 授权信息，供评估器使用</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          新建模型
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>模型列表</CardTitle>
          <CardDescription>共 {models.length} 个模型配置</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : models.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>暂无模型配置</p>
              <Button variant="outline" className="mt-4" onClick={openCreateDialog}>
                创建第一个模型配置
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>模型ID</TableHead>
                  <TableHead>提供商</TableHead>
                  <TableHead>API Key</TableHead>
                  <TableHead>默认</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell className="font-medium">{model.name}</TableCell>
                    <TableCell className="font-mono text-sm">{model.model_id}</TableCell>
                    <TableCell>{model.provider}</TableCell>
                    <TableCell className="font-mono text-sm">{maskApiKey(model.api_key)}</TableCell>
                    <TableCell>
                      {model.is_default ? (
                        <Badge variant="default" className="bg-yellow-500">
                          <Star className="h-3 w-3 mr-1" />
                          默认
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>{formatDate(model.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(model)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDeletingModel(model);
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingModel ? '编辑模型配置' : '新建模型配置'}</DialogTitle>
            <DialogDescription>
              配置 LLM 模型的 API 授权信息和参数
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">显示名称</label>
                <Input 
                  placeholder="如：Claude Sonnet" 
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">模型ID</label>
                <Input 
                  placeholder="如：claude-sonnet-4-6" 
                  value={formData.model_id}
                  onChange={(e) => setFormData({ ...formData, model_id: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">提供商</label>
              <Select 
                value={formData.provider} 
                onValueChange={(value) => setFormData({ ...formData, provider: value || "anthropic" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择提供商" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                  <SelectItem value="openai">OpenAI (GPT)</SelectItem>
                  <SelectItem value="azure">Azure OpenAI</SelectItem>
                  <SelectItem value="custom">自定义</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">API Key</label>
              <Input 
                type="password" 
                placeholder="sk-..." 
                value={formData.api_key}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">自定义 Base URL（可选）</label>
              <Input 
                placeholder="https://api.example.com/v1" 
                value={formData.base_url}
                onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">额外配置 (JSON)</label>
              <Textarea
                placeholder='{"temperature": 0.7, "max_tokens": 4096}'
                className="min-h-[150px] font-mono text-sm"
                value={formData.config}
                onChange={(e) => setFormData({ ...formData, config: e.target.value })}
              />
            </div>

            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <label className="text-base font-medium">设为默认模型</label>
                <div className="text-sm text-muted-foreground">
                  评估器将默认使用此模型进行评估
                </div>
              </div>
              <Switch
                checked={formData.is_default}
                onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
              />
            </div>

            <DialogFooter>
              <Button type="submit">{editingModel ? '保存' : '创建'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除模型配置 "{deletingModel?.name}" 吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
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
