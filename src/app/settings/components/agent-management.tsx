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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Plus, Edit, Trash2, Loader2, Users } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';

type AgentType = 'openclaw' | 'hermes' | 'other';

interface Agent {
  id: number;
  name: string;
  description: string;
  command: string;
  agent_type: AgentType;
  config_json: string;
  created_at: string;
}

interface OpenClawConfig {
  url: string;
  token: string;
}

interface CommandAgentConfig {
  command: string;
}

const formSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  description: z.string().optional(),
  agentType: z.enum(['openclaw', 'hermes', 'other'] as const),
  openclawUrl: z.string().optional(),
  openclawToken: z.string().optional(),
  command: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

const defaultCommand = `acpx agent-name exec "{{prompt}}"`;

const commandExamples = `# 本地 acpx
acpx myagent exec "{{prompt}}"

# Docker 方式
docker run --rm myimage python -c "print('{{prompt}}')"

# SSH 远程执行
ssh user@host "acpx myagent exec '{{prompt}}'"

# 带额外参数
acpx --approve-all --format json myagent exec "{{prompt}}"

# 使用执行批次ID创建日志目录
acpx --log-dir ./logs/{{execution_id}} myagent exec "{{prompt}}"`;

export function AgentManagement() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState<Agent | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      agentType: 'other',
      openclawUrl: '',
      openclawToken: '',
      command: defaultCommand,
    },
  });

  const agentType = useWatch({ control: form.control, name: 'agentType' });

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const response = await fetch('/api/agents');
      const data = await response.json();
      setAgents(data.agents || []);
    } catch (error) {
      console.error('Error fetching agents:', error);
      toast.error('获取 Agent 失败');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (values: FormData) => {
    try {
      const url = editingAgent ? `/api/agents/${editingAgent.id}` : '/api/agents';
      const method = editingAgent ? 'PUT' : 'POST';

      let configJson: Record<string, string> = {};
      let command = '';

      if (values.agentType === 'openclaw') {
        if (!values.openclawUrl || !values.openclawToken) {
          toast.error('OpenClaw 类型需要填写 URL 和 Token');
          return;
        }
        const openclawConfig: OpenClawConfig = {
          url: values.openclawUrl,
          token: values.openclawToken,
        };
        configJson = {
          url: openclawConfig.url,
          token: openclawConfig.token,
        };
        command = `openclaw --url ${values.openclawUrl} --token ***`;
      } else {
        if (!values.command) {
          toast.error('命令行不能为空');
          return;
        }
        const commandConfig: CommandAgentConfig = {
          command: values.command,
        };
        configJson = {
          command: commandConfig.command,
        };
        command = values.command;
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          description: values.description,
          agent_type: values.agentType,
          command,
          config_json: configJson,
        }),
      });

      if (response.ok) {
        toast.success(editingAgent ? 'Agent 已更新' : 'Agent 已创建');
        setDialogOpen(false);
        form.reset();
        setEditingAgent(null);
        fetchAgents();
      } else {
        const error = await response.json();
        toast.error(error.error || '操作失败');
      }
    } catch (error) {
      console.error('Error saving agent:', error);
      toast.error('保存失败');
    }
  };

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);

    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(agent.config_json || '{}');
    } catch {
      config = { command: agent.command };
    }

    form.reset({
      name: agent.name,
      description: agent.description,
      agentType: agent.agent_type || 'other',
      openclawUrl: (config as unknown as OpenClawConfig).url || '',
      openclawToken: (config as unknown as OpenClawConfig).token || '',
      command: (config as unknown as CommandAgentConfig).command || agent.command || defaultCommand,
    });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingAgent) return;

    try {
      const response = await fetch(`/api/agents/${deletingAgent.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Agent 已删除');
        setDeleteDialogOpen(false);
        setDeletingAgent(null);
        fetchAgents();
      } else {
        toast.error('删除失败');
      }
    } catch (error) {
      console.error('Error deleting agent:', error);
      toast.error('删除失败');
    }
  };

  const openCreateDialog = () => {
    setEditingAgent(null);
    form.reset({
      name: '',
      description: '',
      agentType: 'other',
      openclawUrl: '',
      openclawToken: '',
      command: defaultCommand,
    });
    setDialogOpen(true);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  const getAgentTypeLabel = (type: AgentType) => {
    switch (type) {
      case 'openclaw':
        return 'OpenClaw';
      case 'hermes':
        return 'Hermes';
      case 'other':
        return 'Other';
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Agent 管理</h2>
          <p className="text-muted-foreground mt-1">管理用于执行 Benchmark 的 AI Agents</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          新建 Agent
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agent 列表</CardTitle>
          <CardDescription>共 {agents.length} 个 Agent</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : agents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>暂无 Agent</p>
              <Button variant="outline" className="mt-4" onClick={openCreateDialog}>
                创建第一个 Agent
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead>配置预览</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium">{agent.name}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted">
                        {getAgentTypeLabel(agent.agent_type || 'other')}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{agent.description || '-'}</TableCell>
                    <TableCell className="max-w-md truncate font-mono text-xs">
                      {agent.agent_type === 'openclaw' ? (
                        <span className="text-muted-foreground">OpenClaw 配置</span>
                      ) : (
                        (() => {
                          try {
                            const config = JSON.parse(agent.config_json || '{}');
                            return config.command || agent.command;
                          } catch {
                            return agent.command;
                          }
                        })()
                      )}
                    </TableCell>
                    <TableCell>{formatDate(agent.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(agent)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDeletingAgent(agent);
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
            <DialogTitle>{editingAgent ? '编辑 Agent' : '新建 Agent'}</DialogTitle>
            <DialogDescription>
              配置 Agent 名称、类型和对应参数
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agent 名称</FormLabel>
                    <FormControl>
                      <Input placeholder="如：hermes, openclaw" {...field} />
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
                      <Textarea placeholder="Agent 描述" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="agentType"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Agent 类型</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                        className="flex flex-col space-y-1"
                      >
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="openclaw" />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer">
                            <span className="font-medium">OpenClaw</span>
                            <span className="text-muted-foreground text-sm ml-2">通过 URL 和 Token 连接 OpenClaw 服务</span>
                          </FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="hermes" />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer">
                            <span className="font-medium">Hermes</span>
                            <span className="text-muted-foreground text-sm ml-2">使用 Hermes CLI 执行</span>
                          </FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="other" />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer">
                            <span className="font-medium">Other</span>
                            <span className="text-muted-foreground text-sm ml-2">自定义命令行执行</span>
                          </FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {agentType === 'openclaw' && (
                <div className="space-y-4 border rounded-lg p-4 bg-muted/50">
                  <h4 className="font-medium text-sm">OpenClaw 配置</h4>
                  <FormField
                    control={form.control}
                    name="openclawUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>OpenClaw URL</FormLabel>
                        <FormControl>
                          <Input placeholder="如：http://localhost:8080" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="openclawToken"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Token</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="OpenClaw 访问令牌" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {(agentType === 'hermes' || agentType === 'other') && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="command"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>执行命令</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="输入执行命令，可使用 {{prompt}}、{{execution_id}} 等变量"
                            className="min-h-[100px] font-mono text-sm"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="bg-muted p-4 rounded-md">
                    <h4 className="font-semibold mb-2 text-sm">可用变量</h4>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <code className="text-xs bg-background px-1.5 py-0.5 rounded font-mono text-primary">{'{{prompt}}'}</code>
                        <span className="text-xs text-muted-foreground">测试用例输入内容或训练指令</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <code className="text-xs bg-background px-1.5 py-0.5 rounded font-mono text-primary">{'{{execution_id}}'}</code>
                        <span className="text-xs text-muted-foreground">执行批次ID，例如 #14，可用于创建日志目录或标识执行批次</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted p-4 rounded-md">
                    <h4 className="font-semibold mb-2 text-sm">命令示例</h4>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                      {commandExamples}
                    </pre>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button type="submit">{editingAgent ? '保存' : '创建'}</Button>
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
              确定要删除 Agent &quot;{deletingAgent?.name}&quot; 吗？此操作不可撤销。
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
