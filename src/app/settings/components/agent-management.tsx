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
import { api } from '@/lib/api';
import { formatDateTimeLocal } from '@/lib/format-datetime';
import type { Agent } from '@/types/api';

type AgentType = 'openclaw' | 'hermes' | 'other';

interface LocalAgent extends Agent {
  command?: string;
}

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  agentType: z.enum(['openclaw', 'hermes', 'other'] as const),
  openclawUrl: z.string().optional(),
  openclawToken: z.string().optional(),
  command: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

const defaultCommand = `acpx agent-name exec "{{prompt}}"`;

const commandExamples = `# Local acpx
acpx myagent exec "{{prompt}}"

# Docker mode
docker run --rm myimage python -c "print('{{prompt}}')"

# SSH remote execution
ssh user@host "acpx myagent exec '{{prompt}}'"

# With extra parameters
acpx --approve-all --format json myagent exec "{{prompt}}"

# Use execution batch ID to create log directory
acpx --log-dir ./logs/{{execution_id}} myagent exec "{{prompt}}"`;

export function AgentManagement() {
  const [agents, setAgents] = useState<LocalAgent[]>([]);
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

  const showAllAgentTypes =
    process.env.NEXT_PUBLIC_OPEN_AGENT_TYPE === '1';

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const data = await api.agents.list();
      setAgents(data.agents || []);
    } catch (error) {
      console.error('Error fetching agents:', error);
      toast.error('Failed to fetch Agents');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (values: FormData) => {
    try {
      let configJson: Record<string, string> = {};

      if (values.agentType === 'openclaw') {
        if (!values.openclawUrl || !values.openclawToken) {
          toast.error('OpenClaw type requires URL and Token');
          return;
        }
        configJson = {
          url: values.openclawUrl,
          token: values.openclawToken,
        };
      } else {
        if (!values.command) {
          toast.error('Command is required');
          return;
        }
        configJson = {
          command: values.command,
        };
      }

      const payload = {
        name: values.name,
        description: values.description || '',
        agent_type: values.agentType,
        config: configJson,
      };

      if (editingAgent) {
        await api.agents.update(editingAgent.id, payload);
      } else {
        await api.agents.create(payload);
      }

      toast.success(editingAgent ? 'Agent updated' : 'Agent created');
      setDialogOpen(false);
      form.reset();
      setEditingAgent(null);
      fetchAgents();
    } catch (error) {
      console.error('Error saving agent:', error);
      const message = error instanceof Error ? error.message : 'Save failed';
      toast.error(message);
    }
  };

  const handleEdit = (agent: LocalAgent) => {
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
      openclawUrl: (config.url as string) || '',
      openclawToken: (config.token as string) || '',
      command: (config.command as string) || agent.command || defaultCommand,
    });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingAgent) return;

    try {
      await api.agents.delete(deletingAgent.id);
      toast.success('Agent deleted');
      setDeleteDialogOpen(false);
      setDeletingAgent(null);
      fetchAgents();
    } catch (error) {
      console.error('Error deleting agent:', error);
      const message = error instanceof Error ? error.message : 'Delete failed';
      toast.error(message);
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
          <h2 className="text-2xl font-bold">Agent Management</h2>
          <p className="text-muted-foreground mt-1">Manage AI Agents for executing Benchmark</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          New Agent
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agent List</CardTitle>
          <CardDescription>{agents.length} Agents</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : agents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No Agents</p>
              <Button variant="outline" className="mt-4" onClick={openCreateDialog}>
                Create your first Agent
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Config Preview</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                        <span className="text-muted-foreground">OpenClaw Config</span>
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
                    <TableCell>{formatDateTimeLocal(agent.created_at)}</TableCell>
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
            <DialogTitle>{editingAgent ? 'Edit Agent' : 'New Agent'}</DialogTitle>
            <DialogDescription>
Configure Agent name, type and corresponding parameters
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agent Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g.: hermes, openclaw" {...field} />
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
                      <Textarea placeholder="Agent description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="agentType"
                render={({ field }) => {
                  const restrictedTypeEdit =
                    !showAllAgentTypes &&
                    editingAgent &&
                    (editingAgent.agent_type === 'openclaw' ||
                      editingAgent.agent_type === 'hermes');

                  if (restrictedTypeEdit) {
                    return (
                      <FormItem className="space-y-3">
                        <FormLabel>Agent Type</FormLabel>
                        <FormControl>
                          <input type="hidden" {...field} />
                        </FormControl>
                        <p className="text-sm text-muted-foreground rounded-md border bg-muted/30 px-3 py-2">
                          Current type:{' '}
                          <span className="font-medium text-foreground">
                            {getAgentTypeLabel(
                              (editingAgent.agent_type || 'other') as AgentType,
                            )}
                          </span>
                          . To show OpenClaw / Hermes in the UI, set{' '}
                          <code className="rounded bg-muted px-1 text-xs">
                            NEXT_PUBLIC_OPEN_AGENT_TYPE=1
                          </code>{' '}
                          at build time.
                        </p>
                        <FormMessage />
                      </FormItem>
                    );
                  }

                  return (
                    <FormItem className="space-y-3">
                      <FormLabel>Agent Type</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          value={field.value}
                          className="flex flex-col space-y-1"
                        >
                          {showAllAgentTypes ? (
                            <>
                              <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl>
                                  <RadioGroupItem value="openclaw" />
                                </FormControl>
                                <FormLabel className="font-normal cursor-pointer">
                                  <span className="font-medium">OpenClaw</span>
                                  <span className="text-muted-foreground text-sm ml-2">Connect to OpenClaw service via URL and Token</span>
                                </FormLabel>
                              </FormItem>
                              <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl>
                                  <RadioGroupItem value="hermes" />
                                </FormControl>
                                <FormLabel className="font-normal cursor-pointer">
                                  <span className="font-medium">Hermes</span>
                                  <span className="text-muted-foreground text-sm ml-2">Execute using Hermes CLI</span>
                                </FormLabel>
                              </FormItem>
                            </>
                          ) : null}
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="other" />
                            </FormControl>
                            <FormLabel className="font-normal cursor-pointer">
                              <span className="font-medium">Other</span>
                              <span className="text-muted-foreground text-sm ml-2">Custom command line execution</span>
                            </FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              {agentType === 'openclaw' && (
                <div className="space-y-4 border rounded-lg p-4 bg-muted/50">
                  <h4 className="font-medium text-sm">OpenClaw Config</h4>
                  <FormField
                    control={form.control}
                    name="openclawUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>OpenClaw URL</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g.: http://localhost:8080" {...field} />
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
                          <Input type="password" placeholder="OpenClaw access token" {...field} />
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
                        <FormLabel>Execution Command</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter execution command, can use {{prompt}}, {{execution_id}} and other variables"
                            className="min-h-[100px] font-mono text-sm"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="bg-muted p-4 rounded-md">
                    <h4 className="font-semibold mb-2 text-sm">Available Variables</h4>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <code className="text-xs bg-background px-1.5 py-0.5 rounded font-mono text-primary">{'{{prompt}}'}</code>
                        <span className="text-xs text-muted-foreground">Test case input content or training instructions</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <code className="text-xs bg-background px-1.5 py-0.5 rounded font-mono text-primary">{'{{execution_id}}'}</code>
                        <span className="text-xs text-muted-foreground">Execution batch ID, e.g. #14, can be used to create log directories or identify execution batches</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted p-4 rounded-md">
                    <h4 className="font-semibold mb-2 text-sm">Command Examples</h4>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                      {commandExamples}
                    </pre>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button type="submit">{editingAgent ? 'Save' : 'Create'}</Button>
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
              Are you sure you want to delete Agent &quot;{deletingAgent?.name}&quot;? This action cannot be undone.
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
