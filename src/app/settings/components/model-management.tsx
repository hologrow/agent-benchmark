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
import { api } from '@/lib/api';
import { formatDateTimeLocal } from '@/lib/format-datetime';
import type { Model } from '@/types/api';

// Extend the shared Model type with local properties
interface LocalModel extends Model {
  is_default: number;
  config: string | null;
}

export function ModelManagement() {
  const [models, setModels] = useState<LocalModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<LocalModel | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingModel, setDeletingModel] = useState<LocalModel | null>(null);

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
      const data = await api.models.list();
      setModels(data.models as LocalModel[] || []);
    } catch (error) {
      console.error('Error fetching models:', error);
      toast.error('Failed to fetch model configuration');
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
          toast.error('Configuration must be valid JSON format');
          return;
        }
      }

      const payload = {
        ...formData,
        api_key: formData.api_key || undefined,
        base_url: formData.base_url || undefined,
        config: formData.config ? JSON.parse(formData.config) : undefined,
      };

      if (editingModel) {
        await api.models.update(editingModel.id, payload);
      } else {
        await api.models.create(payload);
      }

      toast.success(editingModel ? 'Model configuration updated' : 'Model configuration created');
      setDialogOpen(false);
      setEditingModel(null);
      resetForm();
      fetchModels();
    } catch (error) {
      console.error('Error saving model:', error);
      const message = error instanceof Error ? error.message : 'Save failed';
      toast.error(message);
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

  const handleEdit = (model: LocalModel) => {
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
      await api.models.delete(deletingModel.id);
      toast.success('Model configuration deleted');
      setDeleteDialogOpen(false);
      setDeletingModel(null);
      fetchModels();
    } catch (error) {
      console.error('Error deleting model:', error);
      const message = error instanceof Error ? error.message : 'Delete failed';
      toast.error(message);
    }
  };

  const openCreateDialog = () => {
    setEditingModel(null);
    resetForm();
    setDialogOpen(true);
  };

  const maskApiKey = (key: string | undefined) => {
    if (!key) return '-';
    if (key.length <= 8) return '****';
    return key.substring(0, 4) + '****' + key.substring(key.length - 4);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Model Management</h2>
          <p className="text-muted-foreground mt-1">Configure LLM models and API credentials for evaluators</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          New Model
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Model List</CardTitle>
          <CardDescription>{models.length} model configurations</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : models.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No model configurations</p>
              <Button variant="outline" className="mt-4" onClick={openCreateDialog}>
                Create first model configuration
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Model ID</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>API Key</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                          Default
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>{formatDateTimeLocal(model.created_at)}</TableCell>
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
            <DialogTitle>{editingModel ? 'Edit Model Configuration' : 'New Model Configuration'}</DialogTitle>
            <DialogDescription>
              Configure LLM model API credentials and parameters
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Display Name</label>
                <Input
                  placeholder="e.g., Claude Sonnet"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Model ID</label>
                <Input
                  placeholder="e.g., claude-sonnet-4-6"
                  value={formData.model_id}
                  onChange={(e) => setFormData({ ...formData, model_id: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Provider</label>
              <Select
                value={formData.provider}
                onValueChange={(value) => setFormData({ ...formData, provider: value || "anthropic" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                  <SelectItem value="openai">OpenAI (GPT)</SelectItem>
                  <SelectItem value="azure">Azure OpenAI</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
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
              <label className="text-sm font-medium">Custom Base URL (Optional)</label>
              <Input
                placeholder="https://api.example.com/v1"
                value={formData.base_url}
                onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Additional Config (JSON)</label>
              <Textarea
                placeholder='{"temperature": 0.7, "max_tokens": 4096}'
                className="min-h-[150px] font-mono text-sm"
                value={formData.config}
                onChange={(e) => setFormData({ ...formData, config: e.target.value })}
              />
            </div>

            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <label className="text-base font-medium">Set as Default Model</label>
                <div className="text-sm text-muted-foreground">
                  Evaluators will default to using this model for evaluation
                </div>
              </div>
              <Switch
                checked={formData.is_default}
                onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
              />
            </div>

            <DialogFooter>
              <Button type="submit">{editingModel ? 'Save' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the model configuration &quot;{deletingModel?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
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
