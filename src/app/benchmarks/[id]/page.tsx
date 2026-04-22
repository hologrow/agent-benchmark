"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/ui/markdown";
import {
  ArrowLeft,
  Loader2,
  Play,
  FileText,
  AlertCircle,
  RotateCcw,
  ExternalLink,
  RefreshCw,
  Square,
  Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateTimeLocal } from "@/lib/format-datetime";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Benchmark {
  id: number;
  name: string;
  description: string;
  agent_ids: string;
  test_case_ids: string;
  evaluator_id: number | null;
  run_config: string;
  created_at: string;
  updated_at: string;
}

interface BenchmarkExecution {
  id: number;
  benchmark_id: number;
  name: string | null;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  pid: number | null;
}

interface BenchmarkResult {
  id: number;
  execution_id: number;
  agent_id: number;
  test_case_id: number;
  status:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "timeout"
    | "cancelled";
  actual_output: string | null;
  execution_steps: string | null; // Parsed execution steps
  execution_answer: string | null; // Parsed execution answer
  output_file: string | null;
  execution_time_ms: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  magic_code: string | null;
  agent_name: string;
  test_id: string;
  test_case_name: string;
  test_input: string;
  expected_output: string;
  key_points: string;
  forbidden_points: string;
  score: number | null;
  evaluation_report: string | null;
  evaluation_error: string | null;
  key_points_met: string | null;
  forbidden_points_violated: string | null;
  trace_id: string | null;
  trace_synced_at: string | null;
  trace_content: string | null;
  diagnosis_report: string | null;
}

interface ExecutionWithDetails extends BenchmarkExecution {
  results: BenchmarkResult[];
}

interface BenchmarkWithExecutions extends Benchmark {
  executions: BenchmarkExecution[];
}

export default function BenchmarkDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const benchmarkId = parseInt(params.id as string);

  const [loading, setLoading] = useState(true);
  const [benchmark, setBenchmark] = useState<BenchmarkWithExecutions | null>(
    null,
  );
  const [selectedExecution, setSelectedExecution] =
    useState<ExecutionWithDetails | null>(null);
  const [activeTab, setActiveTab] = useState<string>("");
  const [langfuseBaseUrl, setLangfuseBaseUrl] = useState<string>(
    "https://cloud.langfuse.com",
  );

  useEffect(() => {
    fetchBenchmark();
    fetchLangfuseConfig();
  }, [benchmarkId]);

  const fetchLangfuseConfig = async () => {
    try {
      const response = await fetch("/api/integrations/langfuse/config");
      if (response.ok) {
        const data = await response.json();
        setLangfuseBaseUrl(data.baseUrl);
      }
    } catch (error) {
      console.error("Error fetching Langfuse config:", error);
    }
  };

  const fetchBenchmark = async () => {
    try {
      const response = await fetch(`/api/benchmarks/${benchmarkId}`);
      if (response.ok) {
        const data = await response.json();
        setBenchmark(data.benchmark);

        // Default to selecting the last execution
        if (data.benchmark.executions && data.benchmark.executions.length > 0) {
          const latestExecution = data.benchmark.executions[0];
          setActiveTab(latestExecution.id.toString());
          fetchExecutionDetails(latestExecution.id);
        }
      } else {
        toast.error("Failed to fetch details");
      }
    } catch (error) {
      console.error("Error fetching benchmark:", error);
      toast.error("Failed to fetch details");
    } finally {
      setLoading(false);
    }
  };

  const fetchExecutionDetails = async (executionId: number) => {
    try {
      const response = await fetch(`/api/executions/${executionId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedExecution(data.details);
      } else {
        toast.error("Failed to fetch execution details");
      }
    } catch (error) {
      console.error("Error fetching execution details:", error);
      toast.error("Failed to fetch execution details");
    }
  };

  const startNewExecution = async () => {
    try {
      const response = await fetch(`/api/benchmarks/${benchmarkId}/start`, {
        method: "POST",
      });

      if (response.ok) {
        toast.success("New execution started");
        // Refresh page to show new execution record
        fetchBenchmark();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to start");
      }
    } catch (error) {
      console.error("Error starting execution:", error);
      toast.error("Failed to start");
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const executionId = parseInt(value);
    fetchExecutionDetails(executionId);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      "default" | "secondary" | "destructive" | "outline"
    > = {
      pending: "secondary",
      running: "default",
      completed: "default",
      failed: "destructive",
      timeout: "destructive",
      error: "destructive",
      cancelled: "outline",
    };
    const labels: Record<string, string> = {
      pending: "Pending",
      running: "Running",
      completed: "Success",
      failed: "Failed",
      timeout: "Timeout",
      error: "Error",
      cancelled: "Stopped",
    };
    return (
      <Badge variant={variants[status] || "default"}>
        {labels[status] || status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!benchmark) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12 text-muted-foreground">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Benchmark not found</p>
          <Button className="mt-4" onClick={() => router.push("/benchmarks")}>
            Back to list
          </Button>
        </div>
      </div>
    );
  }

  const agentCount = JSON.parse(benchmark.agent_ids).length;
  const testCaseCount = JSON.parse(benchmark.test_case_ids).length;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push("/benchmarks")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to list
        </Button>
        <Button onClick={startNewExecution}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Run again
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">{benchmark.name}</h1>
        <p className="text-muted-foreground mt-2">
          {benchmark.description || "No description"}
        </p>
        <div className="flex gap-4 mt-4 text-sm text-muted-foreground">
          <span>Agents: {agentCount}</span>
          <span>Test cases: {testCaseCount}</span>
          <span>Executions: {benchmark.executions?.length || 0}</span>
        </div>
      </div>

      {!benchmark.executions || benchmark.executions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Play className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">No execution records</p>
            <Button className="mt-4" onClick={startNewExecution}>
              <Play className="h-4 w-4 mr-2" />
              Start first execution
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Execution Records</CardTitle>
                <CardDescription>Select execution batch to view details</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex flex-wrap gap-2">
              {benchmark.executions?.map((execution) => (
                <button
                  key={execution.id}
                  onClick={() => handleTabChange(execution.id.toString())}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    activeTab === execution.id.toString()
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  <span>{execution.name || `Execution #${execution.id}`}</span>
                  <span className="text-xs opacity-80">
                    {execution.created_at
                      ? formatDateTimeLocal(execution.created_at, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </span>
                  {getStatusBadge(execution.status)}
                </button>
              ))}
            </div>

            {selectedExecution ? (
              <ExecutionDetails
                execution={selectedExecution}
                onReevaluate={fetchBenchmark}
                langfuseBaseUrl={langfuseBaseUrl}
              />
            ) : (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ExecutionDetails({
  execution,
  onReevaluate,
  langfuseBaseUrl,
}: {
  execution: ExecutionWithDetails;
  onReevaluate?: () => void;
  langfuseBaseUrl: string;
}) {
  const [selectedResult, setSelectedResult] = useState<BenchmarkResult | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reevaluating, setReevaluating] = useState(false);
  const [syncingTraces, setSyncingTraces] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosisReport, setDiagnosisReport] = useState<string | null>(null);
  const [diagnosisDialogOpen, setDiagnosisDialogOpen] = useState(false);
  const [currentDiagnosisResult, setCurrentDiagnosisResult] =
    useState<BenchmarkResult | null>(null);

  const handleSyncTraces = async () => {
    setSyncingTraces(true);
    try {
      const response = await fetch("/api/traces/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executionId: execution.id }),
      });

      if (response.ok) {
        toast.success("Trace sync completed");
        // Refresh page to show new trace info
        window.location.reload();
      } else {
        const error = await response.json();
        toast.error(error.error || "Sync failed");
      }
    } catch (error) {
      console.error("Error syncing traces:", error);
      toast.error("Sync failed");
    } finally {
      setSyncingTraces(false);
    }
  };

  const handleReevaluate = async () => {
    if (!onReevaluate) return;
    setReevaluating(true);
    try {
      const response = await fetch(`/api/executions/${execution.id}/evaluate`, {
        method: "POST",
      });

      if (response.ok) {
        toast.success("Evaluation task started");
        onReevaluate();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to start evaluation");
      }
    } catch (error) {
      console.error("Error starting evaluation:", error);
      toast.error("Failed to start evaluation");
    } finally {
      setReevaluating(false);
    }
  };

  const handleStopExecution = async () => {
    if (!confirm("Are you sure you want to force stop the current execution?")) return;

    setStopping(true);
    try {
      const response = await fetch(`/api/executions/${execution.id}/stop`, {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(
          `Execution stopped (PID: ${data.pid}, cancelled ${data.cancelledResultsCount} tasks)`,
        );
        // Refresh page to show updated status
        window.location.reload();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to stop execution");
      }
    } catch (error) {
      console.error("Error stopping execution:", error);
      toast.error("Failed to stop execution");
    } finally {
      setStopping(false);
    }
  };

  const handleDiagnose = async (result: BenchmarkResult, force = false) => {
    setCurrentDiagnosisResult(result);

    // If diagnosis report exists and not forcing re-diagnosis, show directly
    if (result.diagnosis_report && !force) {
      setDiagnosisReport(result.diagnosis_report);
      setDiagnosisDialogOpen(true);
      return;
    }

    // Call API for diagnosis
    setDiagnosing(true);
    setDiagnosisReport(null);
    try {
      const response = await fetch(`/api/results/${result.id}/diagnose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        setDiagnosisReport(data.diagnosis_report);
        setDiagnosisDialogOpen(true);
        toast.success("Diagnosis completed");
      } else {
        const error = await response.json();
        toast.error(error.error || "Diagnosis failed");
      }
    } catch (error) {
      console.error("Error diagnosing:", error);
      toast.error("Diagnosis failed");
    } finally {
      setDiagnosing(false);
    }
  };

  const handleReDiagnose = async () => {
    if (!currentDiagnosisResult) return;
    await handleDiagnose(currentDiagnosisResult, true);
  };

  const completedCount = execution.results.filter(
    (r) => r.status === "completed",
  ).length;
  const failedCount = execution.results.filter((r) =>
    ["failed", "error", "timeout"].includes(r.status),
  ).length;

  const formatDuration = (ms: number | null) => {
    if (!ms) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      "default" | "secondary" | "destructive" | "outline"
    > = {
      pending: "secondary",
      running: "default",
      completed: "default",
      failed: "destructive",
      timeout: "destructive",
      error: "destructive",
      cancelled: "outline",
    };
    const labels: Record<string, string> = {
      pending: "Pending",
      running: "Running",
      completed: "Success",
      failed: "Failed",
      timeout: "Timeout",
      error: "Error",
      cancelled: "Stopped",
    };
    return (
      <Badge variant={variants[status] || "default"}>
        {labels[status] || status}
      </Badge>
    );
  };

  const parseJson = (str: string | null) => {
    if (!str) return [];
    try {
      return JSON.parse(str);
    } catch {
      return str
        .split(/[\n,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  };

  // Parse actual output, separate main output and execution process

  const openResultDialog = (result: BenchmarkResult) => {
    setSelectedResult(result);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-4 gap-4 flex-1">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {execution.results.length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-600">
                Success
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {completedCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-600">
                Failed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {failedCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Avg Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(() => {
                  const scores = execution.results
                    .filter((r) => r.score !== null)
                    .map((r) => r.score!);
                  if (scores.length === 0) return "-";
                  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
                  return avg.toFixed(1) || "--";
                })()}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {execution.status === "running" && (
          <Button
            variant="destructive"
            onClick={handleStopExecution}
            disabled={stopping}
          >
            {stopping ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Stopping...
              </>
            ) : (
              <>
                <Square className="h-4 w-4 mr-2" />
                Force Stop
              </>
            )}
          </Button>
        )}
        {execution.status === "completed" && (
          <Button
            variant="outline"
            onClick={handleSyncTraces}
            disabled={syncingTraces}
          >
            {syncingTraces ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Langfuse
              </>
            )}
          </Button>
        )}
        {execution.status === "completed" && onReevaluate && (
          <Button
            variant="outline"
            onClick={handleReevaluate}
            disabled={reevaluating}
          >
            {reevaluating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Evaluating...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Re-evaluate
              </>
            )}
          </Button>
        )}
      </div>
      <Table>
        <TableBody>
          {execution.results.map((result) => (
            <TableRow key={result.id}>
              <TableCell className="font-medium">{result.agent_name}</TableCell>
              <TableCell>
                <div className="font-medium">{result.test_id}</div>
                <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {result.test_case_name}
                </div>
              </TableCell>
              <TableCell>{getStatusBadge(result.status)}</TableCell>
              <TableCell>{formatDuration(result.execution_time_ms)}</TableCell>
              <TableCell>
                {result.score !== null ? (
                  <span
                    className={`font-bold ${
                      result.score >= 80
                        ? "text-green-600"
                        : result.score >= 60
                          ? "text-yellow-600"
                          : "text-red-600"
                    }`}
                  >
                    {result.score?.toFixed(1) || "--"}
                  </span>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell>
                {result.trace_id ? (
                  <Badge
                    variant="default"
                    className="bg-green-100 text-green-800 hover:bg-green-200"
                  >
                    <a
                      href={`${langfuseBaseUrl}/trace/${result.trace_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1"
                    >
                      Synced
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Badge>
                ) : result.magic_code ? (
                  <Badge variant="outline">Trace pending sync</Badge>
                ) : (
                  <Badge variant="secondary">-</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openResultDialog(result)}
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDiagnose(result)}
                    disabled={diagnosing}
                    className="text-purple-600 border-purple-200 hover:bg-purple-50"
                  >
                    {diagnosing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Stethoscope className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Result detail dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedResult?.agent_name} - {selectedResult?.test_id}
            </DialogTitle>
            <DialogDescription>
              {selectedResult?.test_case_name}
            </DialogDescription>
          </DialogHeader>

          {selectedResult && (
            <div className="space-y-4 mt-4">
              {/* Basic info */}
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <span>Status: {getStatusBadge(selectedResult.status)}</span>
                <span>
                  Execution time: {formatDuration(selectedResult.execution_time_ms)}
                </span>
                {selectedResult.score !== null && (
                  <span
                    className={`font-bold ${
                      selectedResult.score >= 80
                        ? "text-green-600"
                        : selectedResult.score >= 60
                          ? "text-yellow-600"
                          : "text-red-600"
                    }`}
                  >
                    Score: {selectedResult.score?.toFixed(1)}
                  </span>
                )}
                {selectedResult.magic_code && (
                  <span className="text-xs text-muted-foreground">
                    Magic: {selectedResult.magic_code}
                  </span>
                )}
              </div>

              {/* Langfuse Trace link */}
              {selectedResult.trace_id && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
                  <span className="text-sm font-medium text-green-800">
                    Langfuse Trace:
                  </span>
                  <a
                    href={`${langfuseBaseUrl}/trace/${selectedResult.trace_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-green-700 hover:text-green-900 flex items-center gap-1"
                  >
                    {selectedResult.trace_id}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              {/* Input (single line) */}
              <div>
                <h4 className="font-semibold mb-1 text-sm">Input</h4>
                <div
                  className="bg-muted px-3 py-2 rounded-md text-sm truncate"
                  title={selectedResult.test_input}
                >
                  {selectedResult.test_input || "None"}
                </div>
              </div>

              {/* Execution answer and expected output (side by side) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-1 text-sm">Expected Output</h4>
                  <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap max-h-[400px] overflow-y-auto border border-dashed border-gray-300">
                    {selectedResult.expected_output || "None"}
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-1 text-sm">Execution Answer</h4>
                  <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap max-h-[400px] overflow-y-auto border border-green-200">
                    {selectedResult.execution_answer ||
                      selectedResult.actual_output ||
                      "No output"}
                  </div>
                </div>
              </div>

              {/* Execution steps and Trace (side by side) */}
              <div className="grid grid-cols-2 gap-4">
                {selectedResult.execution_steps && (
                  <div>
                    <h4 className="font-semibold mb-1 text-sm text-gray-500">
                      Execution Steps
                    </h4>
                    <div className="bg-gray-50 p-3 rounded-md text-xs whitespace-pre-wrap max-h-[300px] overflow-y-auto text-gray-600 font-mono">
                      {selectedResult.execution_steps}
                    </div>
                  </div>
                )}
                {selectedResult.trace_content && (
                  <div>
                    <h4 className="font-semibold mb-1 text-sm text-green-600">
                      Trace
                    </h4>
                    <div className="bg-green-50 p-3 rounded-md text-xs whitespace-pre-wrap max-h-[300px] overflow-y-auto text-green-800 font-mono">
                      {selectedResult.trace_content}
                    </div>
                  </div>
                )}
              </div>

              {/* Error message */}
              {selectedResult.error_message && (
                <div>
                  <h4 className="font-semibold mb-2 text-red-600">Execution Error</h4>
                  <div className="bg-red-50 border border-red-200 p-3 rounded-md text-sm text-red-700 whitespace-pre-wrap">
                    {selectedResult.error_message}
                  </div>
                </div>
              )}

              {/* Evaluation error message */}
              {selectedResult.evaluation_error && (
                <div>
                  <h4 className="font-semibold mb-2 text-orange-600">
                    Evaluation Error
                  </h4>
                  <div className="bg-orange-50 border border-orange-200 p-3 rounded-md text-sm text-orange-700 whitespace-pre-wrap">
                    {selectedResult.evaluation_error}
                  </div>
                </div>
              )}

              {/* Key test points and forbidden points */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Key Test Points</h4>
                  <ul className="space-y-1">
                    {parseJson(selectedResult.key_points).map(
                      (point: string, idx: number) => (
                        <li key={idx} className="text-sm text-muted-foreground">
                          • {point}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Forbidden Points</h4>
                  <ul className="space-y-1">
                    {parseJson(selectedResult.forbidden_points).map(
                      (point: string, idx: number) => (
                        <li key={idx} className="text-sm text-muted-foreground">
                          • {point}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              </div>

              {/* Evaluation report */}
              {selectedResult.evaluation_report && (
                <div>
                  <h4 className="font-semibold mb-2">Evaluation Report</h4>
                  <div className="bg-muted p-3 rounded-md">
                    <Markdown content={selectedResult.evaluation_report} />
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Diagnosis result dialog */}
      <Dialog open={diagnosisDialogOpen} onOpenChange={setDiagnosisDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-purple-600" />
                  AI Diagnosis Report
                </DialogTitle>
                <DialogDescription>
                  Test case diagnosis results based on LLM analysis
                </DialogDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleReDiagnose}
                disabled={diagnosing}
                className="text-purple-600 border-purple-200 hover:bg-purple-50 mr-[80px]"
              >
                {diagnosing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Stethoscope className="h-4 w-4 mr-1" />
                )}
                Rediagnose
              </Button>
            </div>
          </DialogHeader>

          {diagnosisReport && (
            <div className="mt-4">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <Markdown content={diagnosisReport} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
