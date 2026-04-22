"use client";

import { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Model, Agent as ApiAgent } from "@/types/api";

// Extended agent type with UI-specific fields
interface Agent extends ApiAgent {
  command?: string;
}

interface Message {
  role: "teacher" | "student" | "system";
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
  status: "idle" | "running" | "paused" | "completed";
  currentRound: number;
  maxRounds: number;
  createdAt: string;
  systemPrompt?: string;
}

const defaultSystemPrompt = `You are the Teacher model responsible for training the Student Agent.

## Training Process
1. You give clear task instructions to the Agent
2. The Agent executes commands and returns results
3. You evaluate the results and provide improvement suggestions or new tasks
4. Loop until the Agent masters the skill

## Instruction Format
Give clear instructions to the Agent, for example:
- "Please analyze the main functionality of src/app/page.tsx"
- "Help me optimize the performance of this code"
- "Fix the test errors in tests/login.spec.ts"

## Evaluation Criteria
- Accuracy: Whether the Agent completed the task
- Efficiency: Whether the execution method is optimal
- Completeness: Whether the output is comprehensive

## End Condition
When the Agent performs excellently for 3 consecutive rounds, or the training goal is reached, reply "training complete" to end the training.`;

export default function RLTrainingPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [activeSession, setActiveSession] = useState<TrainingSession | null>(
    null,
  );
  const [isTraining, setIsTraining] = useState(false);
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingSession, setEditingSession] = useState<TrainingSession | null>(
    null,
  );

  // New session form
  const [newSessionForm, setNewSessionForm] = useState({
    task: "",
    teacherModelId: "",
    studentAgentId: "",
    maxRounds: "10",
    systemPrompt: defaultSystemPrompt,
  });

  // Edit session form
  const [editForm, setEditForm] = useState({
    task: "",
    teacherModelId: "",
    studentAgentId: "",
    maxRounds: "10",
    systemPrompt: defaultSystemPrompt,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData();
    loadSavedSessions();
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeSession?.messages]);

  const fetchData = async () => {
    try {
      const [modelsData, agentsData] = await Promise.all([
        api.models.list(),
        api.agents.list(),
      ]);

      setModels(modelsData.models || []);
      setAgents(agentsData.agents || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  const loadSavedSessions = () => {
    const saved = localStorage.getItem("rl-training-sessions");
    if (saved) {
      try {
        setSessions(JSON.parse(saved));
      } catch {
        console.error("Failed to parse saved sessions");
      }
    }
  };

  const saveSessions = (updatedSessions: TrainingSession[]) => {
    localStorage.setItem(
      "rl-training-sessions",
      JSON.stringify(updatedSessions),
    );
    setSessions(updatedSessions);
  };

  const createNewSession = () => {
    if (!newSessionForm.task.trim()) {
      toast.error("Please enter training task");
      return;
    }
    if (!newSessionForm.teacherModelId || !newSessionForm.studentAgentId) {
      toast.error("Please select Teacher model and Student Agent");
      return;
    }

    const newSession: TrainingSession = {
      id: Date.now().toString(),
      task: newSessionForm.task,
      teacherModelId: parseInt(newSessionForm.teacherModelId),
      studentAgentId: parseInt(newSessionForm.studentAgentId),
      messages: [
        {
          role: "system",
          content: newSessionForm.systemPrompt,
          round: 0,
          timestamp: new Date().toISOString(),
        },
      ],
      status: "idle",
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
    toast.success("Training session created");
  };

  const resetNewForm = () => {
    setNewSessionForm({
      task: "",
      teacherModelId: "",
      studentAgentId: "",
      maxRounds: "10",
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
      toast.error("Please enter training task");
      return;
    }
    if (!editForm.teacherModelId || !editForm.studentAgentId) {
      toast.error("Please select Teacher model and Student Agent");
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
        m.role === "system" ? { ...m, content: editForm.systemPrompt } : m,
      ),
    };

    const updatedSessions = sessions.map((s) =>
      s.id === editingSession.id ? updatedSession : s,
    );
    saveSessions(updatedSessions);

    // Update active session if it's the one being edited
    if (activeSession?.id === editingSession.id) {
      setActiveSession(updatedSession);
    }

    setShowEditDialog(false);
    setEditingSession(null);
    toast.success("Training session configuration updated");
  };

  const startTraining = async () => {
    if (!activeSession) return;

    setIsTraining(true);
    const updatedSession = { ...activeSession, status: "running" as const };
    updateSession(updatedSession);

    try {
      await runTrainingRound(updatedSession);
    } catch (error) {
      console.error("Training error:", error);
      toast.error("Training process error");
      setIsTraining(false);
    }
  };

  const runTrainingRound = async (session: TrainingSession) => {
    const teacherModel = models.find((m) => m.id === session.teacherModelId);
    const studentAgent = agents.find((a) => a.id === session.studentAgentId);

    if (!teacherModel) {
      toast.error("Teacher model configuration error");
      return;
    }
    if (!studentAgent) {
      toast.error("Student Agent configuration error");
      return;
    }

    const currentRound = session.currentRound + 1;
    if (currentRound > session.maxRounds) {
      const completedSession = { ...session, status: "completed" as const };
      updateSession(completedSession);
      setIsTraining(false);
      toast.success("Training complete - Max rounds reached");
      return;
    }

    // Build conversation history - map teacher to user, student to assistant
    const conversationHistory = session.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "teacher" ? "user" : "assistant",
        content: m.content,
      }));

    setActiveSession((prev) =>
      prev
        ? {
            ...prev,
            status: "running",
            currentRound,
          }
        : null,
    );

    // Step 1: Teacher generates instruction
    const teacherData = await api.rlTraining.generate({
      modelId: teacherModel.id,
      messages: [
        {
          role: "system",
          content: `You are the Teacher model training an Agent. You communicate directly with the Agent.

Round: ${currentRound}/${session.maxRounds}
Training Goal: ${session.task}

Guidelines:
1. Give clear, specific instructions to the Agent
2. The Agent executes commands via acpx and supports long-running tasks
3. Review the Agent's output and provide feedback
4. Give improvement suggestions or next tasks

Say "training complete" when the Agent has mastered the task.`,
        },
        ...conversationHistory,
      ],
      round: currentRound,
    });

    // Check if training should end
    if (
      teacherData.content.toLowerCase().includes("training complete")
    ) {
      const teacherMessage: Message = {
        role: "teacher",
        content: teacherData.content,
        round: currentRound,
        timestamp: new Date().toISOString(),
      };
      const completedSession = {
        ...session,
        messages: [...session.messages, teacherMessage],
        status: "completed" as const,
        currentRound,
      };
      updateSession(completedSession);
      setIsTraining(false);
      toast.success("Training complete - Teacher believes Agent has mastered the task");
      return;
    }

    const teacherMessage: Message = {
      role: "teacher",
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

    console.log(
      `[RL Training] Round ${currentRound} - Teacher message:`,
      teacherData.content,
    );
    console.log(
      `[RL Training] Round ${currentRound} - Sending to Agent ${studentAgent.id} (${studentAgent.name})`,
    );

    // Step 2: Agent executes the instruction
    const startTime = Date.now();
    const agentData = await api.rlTraining.executeAgent({
      agentId: studentAgent.id,
      prompt: teacherData.content,
      round: currentRound,
    });

    const executionTime = Date.now() - startTime;
    let agentContent: string;
    let isError = false;
    let metadata: Message["metadata"] = {
      command: studentAgent.command,
      executionTime,
    };

    if (agentData.error) {
      agentContent = `Execution error: ${agentData.error}`;
      isError = true;
    } else {
      agentContent = agentData.output || "Agent has no output";
      metadata.executionTime = agentData.executionTime;
    }

    const studentMessage: Message = {
      role: "student",
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
    if (updatedSession.status === "running") {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await runTrainingRound(updatedSession);
    }
  };

  const pauseTraining = () => {
    if (activeSession) {
      const pausedSession = { ...activeSession, status: "paused" as const };
      updateSession(pausedSession);
      setIsTraining(false);
      toast.info("Training paused");
    }
  };

  const continueTraining = () => {
    if (activeSession) {
      setIsTraining(true);
      const resumedSession = { ...activeSession, status: "running" as const };
      updateSession(resumedSession);
      runTrainingRound(resumedSession);
    }
  };

  const updateSession = (session: TrainingSession) => {
    setActiveSession(session);
    const updatedSessions = sessions.map((s) =>
      s.id === session.id ? session : s,
    );
    saveSessions(updatedSessions);
  };

  const resetSession = () => {
    if (
      activeSession &&
      confirm("Are you sure you want to reset this training session? All progress will be lost.")
    ) {
      const resetSession: TrainingSession = {
        ...activeSession,
        messages: activeSession.messages.filter((m) => m.role === "system"),
        status: "idle",
        currentRound: 0,
      };
      updateSession(resetSession);
      setIsTraining(false);
      toast.success("Training session reset");
    }
  };

  const deleteSession = (sessionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (confirm("Are you sure you want to delete this training session?")) {
      const updatedSessions = sessions.filter((s) => s.id !== sessionId);
      saveSessions(updatedSessions);
      if (activeSession?.id === sessionId) {
        setActiveSession(null);
      }
      toast.success("Training session deleted");
    }
  };

  const getModelName = (modelId: number) => {
    return models.find((m) => m.id === modelId)?.name || `Model #${modelId}`;
  };

  const getAgentName = (agentId: number) => {
    return agents.find((a) => a.id === agentId)?.name || `Agent #${agentId}`;
  };

  const getStatusBadge = (status: TrainingSession["status"]) => {
    const config = {
      idle: { label: "Not Started", className: "bg-gray-500" },
      running: { label: "Training", className: "bg-blue-500 animate-pulse" },
      paused: { label: "Paused", className: "bg-yellow-500" },
      completed: { label: "Completed", className: "bg-green-500" },
    };
    const { label, className } = config[status];
    return <Badge className={className}>{label}</Badge>;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">RL Training</h1>
          <p className="text-muted-foreground mt-2">
            Supervised evolution to improve Agent capabilities through instruction-execution-feedback loops
          </p>
        </div>
        <Button
          onClick={() => setShowNewSessionDialog(true)}
          disabled={loading}
        >
          <GraduationCap className="h-4 w-4 mr-2" />
          New Training Session
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Session List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Training Sessions</CardTitle>
            <CardDescription>{sessions.length} sessions total</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No training sessions</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setShowNewSessionDialog(true)}
                >
                  Create first session
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      activeSession?.id === session.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => setActiveSession(session)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{session.task}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Teacher: {getModelName(session.teacherModelId)} ·
                          Agent: {getAgentName(session.studentAgentId)}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          {getStatusBadge(session.status)}
                          <span className="text-xs text-muted-foreground">
                            Round {session.currentRound}/{session.maxRounds}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => openEditDialog(session, e)}
                          title="Edit Configuration"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={(e) => deleteSession(session.id, e)}
                          title="Delete Session"
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
                  {activeSession ? "Training Dialogue" : "Select or Create Session"}
                </CardTitle>
                {activeSession && (
                  <CardDescription>
                    Teacher: {getModelName(activeSession.teacherModelId)} ·
                    Agent: {getAgentName(activeSession.studentAgentId)}
                  </CardDescription>
                )}
              </div>
              {activeSession && (
                <div className="flex items-center gap-2">
                  {activeSession.status === "running" ? (
                    <Button variant="outline" onClick={pauseTraining}>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause
                    </Button>
                  ) : activeSession.status === "paused" ? (
                    <Button onClick={continueTraining}>
                      <Play className="h-4 w-4 mr-2" />
                      Resume
                    </Button>
                  ) : activeSession.status === "idle" ? (
                    <Button onClick={startTraining}>
                      <Play className="h-4 w-4 mr-2" />
                      Start Training
                    </Button>
                  ) : null}
                  <Button variant="outline" onClick={resetSession}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!activeSession ? (
              <div className="text-center py-16 text-muted-foreground">
                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p>Please select a training session from the left</p>
                <p className="text-sm mt-2">
                  Or click &quot;New Training Session&quot; to start
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Progress */}
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span>Training Progress</span>
                      <span>
                        {activeSession.currentRound}/{activeSession.maxRounds}{" "}
                        Rounds
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
                    .filter((m) => m.role !== "system")
                    .map((message, index) => (
                      <div
                        key={index}
                        className={`flex gap-3 ${
                          message.role === "teacher"
                            ? "flex-row"
                            : "flex-row-reverse"
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                            message.role === "teacher"
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-secondary-foreground"
                          }`}
                        >
                          {message.role === "teacher" ? "T" : "A"}
                        </div>
                        <div
                          className={`max-w-[85%] rounded-lg p-3 ${
                            message.role === "teacher"
                              ? "bg-primary text-primary-foreground"
                              : message.isError
                                ? "bg-destructive/10 border border-destructive/30"
                                : "bg-card border"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium">
                              {message.role === "teacher"
                                ? "Teacher (Instruction)"
                                : "Agent (Execution)"}
                            </span>
                            <span className="text-xs opacity-70">
                              Round {message.round}
                            </span>
                            {message.metadata?.executionTime && (
                              <span className="text-xs opacity-70">
                                (
                                {Math.round(
                                  message.metadata.executionTime / 1000,
                                )}
                                s)
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
                                <span>Execution Command</span>
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
                      <span className="text-sm">Training...</span>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Task Info */}
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-sm font-medium">Training Goal</p>
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
      <Dialog
        open={showNewSessionDialog}
        onOpenChange={setShowNewSessionDialog}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Training Session</DialogTitle>
            <DialogDescription>
              Configure Teacher model and Student Agent, start reinforcement learning training
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Training Goal *</label>
              <Textarea
                placeholder="Describe the skill you want the Agent to learn, e.g.: learn to use acpx tool to analyze and optimize code"
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
                  Teacher Model *
                </label>
                <Select
                  value={newSessionForm.teacherModelId}
                  onValueChange={(value) =>
                    setNewSessionForm({
                      ...newSessionForm,
                      teacherModelId: value || "",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Teacher model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem key={model.id} value={String(model.id)}>
                        {model.name || `Model #${model.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Large language model responsible for issuing instructions and evaluation feedback
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
                    setNewSessionForm({
                      ...newSessionForm,
                      studentAgentId: value || "",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Student Agent" />
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
                  Agent program executed via acpx command
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Max Training Rounds</label>
              <Input
                type="number"
                min={1}
                max={50}
                value={newSessionForm.maxRounds}
                onChange={(e) =>
                  setNewSessionForm({
                    ...newSessionForm,
                    maxRounds: e.target.value,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Maximum loop count: Teacher issues instruction → Agent executes
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Teacher System Prompt (Optional)
              </label>
              <Textarea
                className="min-h-[150px] font-mono text-sm"
                value={newSessionForm.systemPrompt}
                onChange={(e) =>
                  setNewSessionForm({
                    ...newSessionForm,
                    systemPrompt: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowNewSessionDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={createNewSession}>Create Session</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Session Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Training Session Configuration</DialogTitle>
            <DialogDescription>
              Modify training task, model configuration and training parameters
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Training Goal *</label>
              <Textarea
                placeholder="Describe the skill you want the Agent to learn"
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
                  Teacher Model *
                </label>
                <Select
                  value={editForm.teacherModelId}
                  onValueChange={(value) =>
                    setEditForm({ ...editForm, teacherModelId: value || "" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Teacher model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem key={model.id} value={String(model.id)}>
                        {model.name || `Model #${model.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Large language model responsible for issuing instructions and evaluation feedback
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
                    setEditForm({ ...editForm, studentAgentId: value || "" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Student Agent" />
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
                  Agent program executed via acpx command
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Max Training Rounds</label>
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
                Modifiable range, executed rounds will not be affected
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Teacher System Prompt</label>
              <Textarea
                className="min-h-[150px] font-mono text-sm"
                value={editForm.systemPrompt}
                onChange={(e) =>
                  setEditForm({ ...editForm, systemPrompt: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Changes will apply to subsequent training rounds
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveEditSession}>
              <Pencil className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
