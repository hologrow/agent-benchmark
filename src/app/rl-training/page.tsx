'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Play,
  Pause,
  RotateCcw,
  MessageSquare,
  Bot,
  GraduationCap,
  Loader2,
  Trash2,
  Users,
  Brain,
  Terminal,
  Pencil,
  Settings,
} from 'lucide-react';
import { toast } from 'sonner';

interface Model {
  id: number;
  name: string;
  model_id: string;
  provider: string;
}

interface Agent {
  id: number;
  name: string;
  description: string;
  command: string;
}

interface Message {
  role: 'teacher' | 'student' | 'system';
  content: string;
  round: number;
  timestamp: string;
  isError?: boolean;
  metadata?: {
    command?: string;
    executionTime?: number;
  };
}

interface TrainingSession {
  id: string;
  task: string;
  teacherModelId: number;
  studentAgentId: number;
  messages: Message[];
  status: 'idle' | 'running' | 'paused' | 'completed';
  currentRound: number;
  maxRounds: number;
  createdAt: string;
  systemPrompt?: string;
}

const defaultSystemPrompt = `你是 Teacher（教师模型），负责训练 Student Agent（学生代理）。

## 训练流程
1. 你向 Agent 发出明确的任务指令
2. Agent 执行命令并返回结果
3. 你评估结果并给出改进建议或新任务
4. 循环往复，直到 Agent 掌握技能

## 指令格式
直接向 Agent 发出清晰的指令，例如：
- "请分析 src/app/page.tsx 文件的主要功能"
- "帮我优化这段代码的性能"
- "修复 tests/login.spec.ts 中的测试错误"

## 评估要点
- 准确性：Agent 是否完成了任务
- 效率：执行方式是否最优
- 完整性：输出是否全面

## 结束条件
当 Agent 连续 3 轮表现优秀，或已达到训练目标时，回复 "训练完成" 结束训练。`;

export default function RLTrainingPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [activeSession, setActiveSession] = useState<TrainingSession | null>(null);
  const [isTraining, setIsTraining] = useState(false);
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingSession, setEditingSession] = useState<TrainingSession | null>(null);

  // New session form
  const [newSessionForm, setNewSessionForm] = useState({
    task: '',
    teacherModelId: '',
    studentAgentId: '',
    maxRounds: '10',
    systemPrompt: defaultSystemPrompt,
  });

  // Edit session form
  const [editForm, setEditForm] = useState({
    task: '',
    teacherModelId: '',
    studentAgentId: '',
    maxRounds: '10',
    systemPrompt: defaultSystemPrompt,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData();
    loadSavedSessions();
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeSession?.messages]);

  const fetchData = async () => {
    try {
      const [modelsRes, agentsRes] = await Promise.all([
        fetch('/api/models'),
        fetch('/api/agents'),
      ]);

      const modelsData = await modelsRes.json();
      const agentsData = await agentsRes.json();

      setModels(modelsData.models || []);
      setAgents(agentsData.agents || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadSavedSessions = () => {
    const saved = localStorage.getItem('rl-training-sessions');
    if (saved) {
      try {
        setSessions(JSON.parse(saved));
      } catch {
        console.error('Failed to parse saved sessions');
      }
    }
  };

  const saveSessions = (updatedSessions: TrainingSession[]) => {
    localStorage.setItem('rl-training-sessions', JSON.stringify(updatedSessions));
    setSessions(updatedSessions);
  };

  const createNewSession = () => {
    if (!newSessionForm.task.trim()) {
      toast.error('请输入训练任务');
      return;
    }
    if (!newSessionForm.teacherModelId || !newSessionForm.studentAgentId) {
      toast.error('请选择 Teacher 模型和 Student Agent');
      return;
    }

    const newSession: TrainingSession = {
      id: Date.now().toString(),
      task: newSessionForm.task,
      teacherModelId: parseInt(newSessionForm.teacherModelId),
      studentAgentId: parseInt(newSessionForm.studentAgentId),
      messages: [
        {
          role: 'system',
          content: newSessionForm.systemPrompt,
          round: 0,
          timestamp: new Date().toISOString(),
        },
      ],
      status: 'idle',
      currentRound: 0,
      maxRounds: parseInt(newSessionForm.maxRounds) || 10,
      createdAt: new Date().toISOString(),
      systemPrompt: newSessionForm.systemPrompt,
    };

    const updatedSessions = [newSession, ...sessions];
    saveSessions(updatedSessions);
    setActiveSession(newSession);
    setShowNewSessionDialog(false);
    resetNewForm();
    toast.success('训练会话已创建');
  };

  const resetNewForm = () => {
    setNewSessionForm({
      task: '',
      teacherModelId: '',
      studentAgentId: '',
      maxRounds: '10',
      systemPrompt: defaultSystemPrompt,
    });
  };

  const openEditDialog = (session: TrainingSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSession(session);
    setEditForm({
      task: session.task,
      teacherModelId: String(session.teacherModelId),
      studentAgentId: String(session.studentAgentId),
      maxRounds: String(session.maxRounds),
      systemPrompt: session.systemPrompt || defaultSystemPrompt,
    });
    setShowEditDialog(true);
  };

  const saveEditSession = () => {
    if (!editingSession) return;

    if (!editForm.task.trim()) {
      toast.error('请输入训练任务');
      return;
    }
    if (!editForm.teacherModelId || !editForm.studentAgentId) {
      toast.error('请选择 Teacher 模型和 Student Agent');
      return;
    }

    const updatedSession: TrainingSession = {
      ...editingSession,
      task: editForm.task,
      teacherModelId: parseInt(editForm.teacherModelId),
      studentAgentId: parseInt(editForm.studentAgentId),
      maxRounds: parseInt(editForm.maxRounds) || 10,
      systemPrompt: editForm.systemPrompt,
      // Update system message if it exists
      messages: editingSession.messages.map((m) =>
        m.role === 'system'
          ? { ...m, content: editForm.systemPrompt }
          : m
      ),
    };

    const updatedSessions = sessions.map((s) =>
      s.id === editingSession.id ? updatedSession : s
    );
    saveSessions(updatedSessions);

    // Update active session if it's the one being edited
    if (activeSession?.id === editingSession.id) {
      setActiveSession(updatedSession);
    }

    setShowEditDialog(false);
    setEditingSession(null);
    toast.success('训练会话配置已更新');
  };

  const startTraining = async () => {
    if (!activeSession) return;

    setIsTraining(true);
    const updatedSession = { ...activeSession, status: 'running' as const };
    updateSession(updatedSession);

    try {
      await runTrainingRound(updatedSession);
    } catch (error) {
      console.error('Training error:', error);
      toast.error('训练过程出错');
      setIsTraining(false);
    }
  };

  const runTrainingRound = async (session: TrainingSession) => {
    const teacherModel = models.find((m) => m.id === session.teacherModelId);
    const studentAgent = agents.find((a) => a.id === session.studentAgentId);

    if (!teacherModel) {
      toast.error('Teacher 模型配置错误');
      return;
    }
    if (!studentAgent) {
      toast.error('Student Agent 配置错误');
      return;
    }

    const currentRound = session.currentRound + 1;
    if (currentRound > session.maxRounds) {
      const completedSession = { ...session, status: 'completed' as const };
      updateSession(completedSession);
      setIsTraining(false);
      toast.success('训练完成 - 达到最大轮数');
      return;
    }

    // Build conversation history - map teacher to user, student to assistant
    const conversationHistory = session.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'teacher' ? 'user' : 'assistant',
        content: m.content,
      }));

    setActiveSession((prev) =>
      prev
        ? {
            ...prev,
            status: 'running',
            currentRound,
          }
        : null
    );

    // Step 1: Teacher generates instruction
    const teacherResponse = await fetch('/api/rl-training', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: teacherModel.id,
        messages: [
          {
            role: 'system',
            content: `You are the Teacher model training an Agent. You communicate directly with the Agent.

Round: ${currentRound}/${session.maxRounds}
Training Goal: ${session.task}

Guidelines:
1. Give clear, specific instructions to the Agent
2. The Agent executes commands via acpx and supports long-running tasks
3. Review the Agent's output and provide feedback
4. Give improvement suggestions or next tasks

Say "训练完成" or "training complete" when the Agent has mastered the task.`,
          },
          ...conversationHistory,
        ],
        round: currentRound,
      }),
    });

    if (!teacherResponse.ok) {
      throw new Error('Teacher model request failed');
    }

    const teacherData = await teacherResponse.json();

    // Check if training should end
    if (
      teacherData.content.toLowerCase().includes('训练完成') ||
      teacherData.content.toLowerCase().includes('training complete')
    ) {
      const teacherMessage: Message = {
        role: 'teacher',
        content: teacherData.content,
        round: currentRound,
        timestamp: new Date().toISOString(),
      };
      const completedSession = {
        ...session,
        messages: [...session.messages, teacherMessage],
        status: 'completed' as const,
        currentRound,
      };
      updateSession(completedSession);
      setIsTraining(false);
      toast.success('训练完成 - Teacher 认为 Agent 已掌握任务');
      return;
    }

    const teacherMessage: Message = {
      role: 'teacher',
      content: teacherData.content,
      round: currentRound,
      timestamp: new Date().toISOString(),
    };

    let updatedSession = {
      ...session,
      messages: [...session.messages, teacherMessage],
      currentRound,
    };
    updateSession(updatedSession);

    console.log(`[RL Training] Round ${currentRound} - Teacher message:`, teacherData.content);
    console.log(`[RL Training] Round ${currentRound} - Sending to Agent ${studentAgent.id} (${studentAgent.name})`);

    // Step 2: Agent executes the instruction
    const startTime = Date.now();
    const agentResponse = await fetch('/api/rl-training/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: studentAgent.id,
        prompt: teacherData.content,
        round: currentRound,
      }),
    });

    console.log(`[RL Training] Round ${currentRound} - Agent response status:`, agentResponse.status);

    const executionTime = Date.now() - startTime;
    let agentContent: string;
    let isError = false;
    let metadata: Message['metadata'] = {
      command: studentAgent.command,
      executionTime,
    };

    if (!agentResponse.ok) {
      const errorData = await agentResponse.json();
      agentContent = `执行错误: ${errorData.error || 'Unknown error'}`;
      isError = true;
    } else {
      const agentData = await agentResponse.json();
      agentContent = agentData.output || 'Agent 没有输出';
      metadata.executionTime = agentData.executionTime;
    }

    const studentMessage: Message = {
      role: 'student',
      content: agentContent,
      round: currentRound,
      timestamp: new Date().toISOString(),
      isError,
      metadata,
    };

    updatedSession = {
      ...updatedSession,
      messages: [...updatedSession.messages, studentMessage],
    };
    updateSession(updatedSession);

    // Continue to next round if training is still running
    if (updatedSession.status === 'running') {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await runTrainingRound(updatedSession);
    }
  };

  const pauseTraining = () => {
    if (activeSession) {
      const pausedSession = { ...activeSession, status: 'paused' as const };
      updateSession(pausedSession);
      setIsTraining(false);
      toast.info('训练已暂停');
    }
  };

  const continueTraining = () => {
    if (activeSession) {
      setIsTraining(true);
      const resumedSession = { ...activeSession, status: 'running' as const };
      updateSession(resumedSession);
      runTrainingRound(resumedSession);
    }
  };

  const updateSession = (session: TrainingSession) => {
    setActiveSession(session);
    const updatedSessions = sessions.map((s) => (s.id === session.id ? session : s));
    saveSessions(updatedSessions);
  };

  const resetSession = () => {
    if (activeSession && confirm('确定要重置这个训练会话吗？所有进度将丢失。')) {
      const resetSession: TrainingSession = {
        ...activeSession,
        messages: activeSession.messages.filter((m) => m.role === 'system'),
        status: 'idle',
        currentRound: 0,
      };
      updateSession(resetSession);
      setIsTraining(false);
      toast.success('训练会话已重置');
    }
  };

  const deleteSession = (sessionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (confirm('确定要删除这个训练会话吗？')) {
      const updatedSessions = sessions.filter((s) => s.id !== sessionId);
      saveSessions(updatedSessions);
      if (activeSession?.id === sessionId) {
        setActiveSession(null);
      }
      toast.success('训练会话已删除');
    }
  };

  const getModelName = (modelId: number) => {
    return models.find((m) => m.id === modelId)?.name || `模型 #${modelId}`;
  };

  const getAgentName = (agentId: number) => {
    return agents.find((a) => a.id === agentId)?.name || `Agent #${agentId}`;
  };

  const getStatusBadge = (status: TrainingSession['status']) => {
    const config = {
      idle: { label: '待开始', className: 'bg-gray-500' },
      running: { label: '训练中', className: 'bg-blue-500 animate-pulse' },
      paused: { label: '已暂停', className: 'bg-yellow-500' },
      completed: { label: '已完成', className: 'bg-green-500' },
    };
    const { label, className } = config[status];
    return <Badge className={className}>{label}</Badge>;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">RL-强化训练</h1>
          <p className="text-muted-foreground mt-2">
            Teacher 模型与 Student Agent 直接对话，通过指令-执行-反馈循环提升 Agent 能力
          </p>
        </div>
        <Button onClick={() => setShowNewSessionDialog(true)} disabled={loading}>
          <GraduationCap className="h-4 w-4 mr-2" />
          新建训练会话
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Session List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>训练会话</CardTitle>
            <CardDescription>共 {sessions.length} 个会话</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>暂无训练会话</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setShowNewSessionDialog(true)}
                >
                  创建第一个会话
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      activeSession?.id === session.id
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => setActiveSession(session)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{session.task}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Teacher: {getModelName(session.teacherModelId)} · Agent:{' '}
                          {getAgentName(session.studentAgentId)}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          {getStatusBadge(session.status)}
                          <span className="text-xs text-muted-foreground">
                            轮次 {session.currentRound}/{session.maxRounds}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => openEditDialog(session, e)}
                          title="编辑配置"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={(e) => deleteSession(session.id, e)}
                          title="删除会话"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Training Area */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {activeSession ? '训练对话' : '选择或创建会话'}
                </CardTitle>
                {activeSession && (
                  <CardDescription>
                    Teacher: {getModelName(activeSession.teacherModelId)} · Agent:{' '}
                    {getAgentName(activeSession.studentAgentId)}
                  </CardDescription>
                )}
              </div>
              {activeSession && (
                <div className="flex items-center gap-2">
                  {activeSession.status === 'running' ? (
                    <Button variant="outline" onClick={pauseTraining}>
                      <Pause className="h-4 w-4 mr-2" />
                      暂停
                    </Button>
                  ) : activeSession.status === 'paused' ? (
                    <Button onClick={continueTraining}>
                      <Play className="h-4 w-4 mr-2" />
                      继续
                    </Button>
                  ) : activeSession.status === 'idle' ? (
                    <Button onClick={startTraining}>
                      <Play className="h-4 w-4 mr-2" />
                      开始训练
                    </Button>
                  ) : null}
                  <Button variant="outline" onClick={resetSession}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    重置
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!activeSession ? (
              <div className="text-center py-16 text-muted-foreground">
                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p>请从左侧选择一个训练会话</p>
                <p className="text-sm mt-2">或点击&quot;新建训练会话&quot;开始</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Progress */}
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span>训练进度</span>
                      <span>
                        {activeSession.currentRound}/{activeSession.maxRounds} 轮
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{
                          width: `${(activeSession.currentRound / activeSession.maxRounds) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  {getStatusBadge(activeSession.status)}
                </div>

                {/* Messages */}
                <div className="border rounded-lg h-[500px] overflow-y-auto p-4 space-y-4 bg-muted/30">
                  {activeSession.messages
                    .filter((m) => m.role !== 'system')
                    .map((message, index) => (
                      <div
                        key={index}
                        className={`flex gap-3 ${
                          message.role === 'teacher' ? 'flex-row' : 'flex-row-reverse'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                            message.role === 'teacher'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary text-secondary-foreground'
                          }`}
                        >
                          {message.role === 'teacher' ? 'T' : 'A'}
                        </div>
                        <div
                          className={`max-w-[85%] rounded-lg p-3 ${
                            message.role === 'teacher'
                              ? 'bg-primary text-primary-foreground'
                              : message.isError
                                ? 'bg-destructive/10 border border-destructive/30'
                                : 'bg-card border'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium">
                              {message.role === 'teacher' ? 'Teacher (指令)' : 'Agent (执行)'}
                            </span>
                            <span className="text-xs opacity-70">
                              第{message.round}轮
                            </span>
                            {message.metadata?.executionTime && (
                              <span className="text-xs opacity-70">
                                ({Math.round(message.metadata.executionTime / 1000)}s)
                              </span>
                            )}
                          </div>
                          <div className="whitespace-pre-wrap text-sm">
                            {message.content}
                          </div>
                          {message.metadata?.command && (
                            <div className="mt-2 pt-2 border-t border-border/50">
                              <div className="flex items-center gap-1 text-xs opacity-70">
                                <Terminal className="h-3 w-3" />
                                <span>执行命令</span>
                              </div>
                              <code className="text-xs block mt-1 opacity-90 font-mono">
                                {message.metadata.command}
                              </code>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  {isTraining && (
                    <div className="flex items-center gap-2 text-muted-foreground py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">训练中...</span>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Task Info */}
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-sm font-medium">训练目标</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {activeSession.task}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* New Session Dialog */}
      <Dialog open={showNewSessionDialog} onOpenChange={setShowNewSessionDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新建训练会话</DialogTitle>
            <DialogDescription>
              配置 Teacher 模型和 Student Agent，开始强化学习训练
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">训练目标 *</label>
              <Textarea
                placeholder="描述你希望 Agent 学会的技能，例如：学会使用 acpx 工具分析和优化代码"
                value={newSessionForm.task}
                onChange={(e) =>
                  setNewSessionForm({ ...newSessionForm, task: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  Teacher 模型 *
                </label>
                <Select
                  value={newSessionForm.teacherModelId}
                  onValueChange={(value) =>
                    setNewSessionForm({ ...newSessionForm, teacherModelId: value || '' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择 Teacher 模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem key={model.id} value={String(model.id)}>
                        {model.name || `模型 #${model.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  负责发出指令和评估反馈的大语言模型
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Student Agent *
                </label>
                <Select
                  value={newSessionForm.studentAgentId}
                  onValueChange={(value) =>
                    setNewSessionForm({ ...newSessionForm, studentAgentId: value || '' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择 Student Agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={String(agent.id)}>
                        {agent.name || `Agent #${agent.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  通过 acpx 命令执行的 Agent 程序
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">最大训练轮数</label>
              <Input
                type="number"
                min={1}
                max={50}
                value={newSessionForm.maxRounds}
                onChange={(e) =>
                  setNewSessionForm({ ...newSessionForm, maxRounds: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Teacher 发出指令 → Agent 执行的循环次数上限
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Teacher 系统提示词（可选）</label>
              <Textarea
                className="min-h-[150px] font-mono text-sm"
                value={newSessionForm.systemPrompt}
                onChange={(e) =>
                  setNewSessionForm({ ...newSessionForm, systemPrompt: e.target.value })
                }
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNewSessionDialog(false)}>
              取消
            </Button>
            <Button onClick={createNewSession}>创建会话</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Session Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑训练会话配置</DialogTitle>
            <DialogDescription>
              修改训练任务、模型配置和训练参数
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">训练目标 *</label>
              <Textarea
                placeholder="描述你希望 Agent 学会的技能"
                value={editForm.task}
                onChange={(e) =>
                  setEditForm({ ...editForm, task: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  Teacher 模型 *
                </label>
                <Select
                  value={editForm.teacherModelId}
                  onValueChange={(value) =>
                    setEditForm({ ...editForm, teacherModelId: value || '' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择 Teacher 模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem key={model.id} value={String(model.id)}>
                        {model.name || `模型 #${model.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  负责发出指令和评估反馈的大语言模型
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Student Agent *
                </label>
                <Select
                  value={editForm.studentAgentId}
                  onValueChange={(value) =>
                    setEditForm({ ...editForm, studentAgentId: value || '' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择 Student Agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={String(agent.id)}>
                        {agent.name || `Agent #${agent.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  通过 acpx 命令执行的 Agent 程序
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">最大训练轮数</label>
              <Input
                type="number"
                min={1}
                max={50}
                value={editForm.maxRounds}
                onChange={(e) =>
                  setEditForm({ ...editForm, maxRounds: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                可修改范围，已执行的轮次不会受到影响
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Teacher 系统提示词</label>
              <Textarea
                className="min-h-[150px] font-mono text-sm"
                value={editForm.systemPrompt}
                onChange={(e) =>
                  setEditForm({ ...editForm, systemPrompt: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                修改后将应用于后续的训练轮次
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              取消
            </Button>
            <Button onClick={saveEditSession}>
              <Pencil className="h-4 w-4 mr-2" />
              保存修改
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
