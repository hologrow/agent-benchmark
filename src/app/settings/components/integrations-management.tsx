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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, ExternalLink, Settings, Puzzle, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Agent as ApiAgent, Integration } from "@/types/api";
import type {
  BuiltinIntegrationConfigField,
  BuiltinIntegrationPluginMeta,
} from "@/lib/plugins/builtin-integration-plugins.types";
import { cn } from "@/lib/utils";

/** Langfuse 集成里按 Agent 映射密钥（存于 `agentCredentialRows`） */
type LangfuseAgentCredentialRow = {
  agentId: string;
  publicKey: string;
  secretKey: string;
  baseUrl: string;
};

function emptyLangfuseRow(): LangfuseAgentCredentialRow {
  return { agentId: "", publicKey: "", secretKey: "", baseUrl: "" };
}

function normalizeLangfuseRowsFromUnknown(
  raw: unknown,
): LangfuseAgentCredentialRow[] {
  if (!Array.isArray(raw)) return [];
  const out: LangfuseAgentCredentialRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const agentId =
      typeof o.agentId === "number" && Number.isFinite(o.agentId)
        ? String(Math.trunc(o.agentId))
        : typeof o.agentId === "string"
          ? o.agentId
          : "";
    out.push({
      agentId,
      publicKey: typeof o.publicKey === "string" ? o.publicKey : "",
      secretKey: typeof o.secretKey === "string" ? o.secretKey : "",
      baseUrl: typeof o.baseUrl === "string" ? o.baseUrl : "",
    });
  }
  return out;
}

/** 从旧版 `agentCredentials` JSON 迁移为表格行 */
function langfuseAgentSelectLabel(
  agentId: string,
  agents: ApiAgent[],
): string | null {
  const id = agentId.trim();
  if (!id) return null;
  const a = agents.find((x) => String(x.id) === id);
  return a ? `${a.name} (#${a.id})` : `Agent #${id}`;
}

function legacyAgentCredentialsToRows(
  legacy: unknown,
): LangfuseAgentCredentialRow[] {
  if (legacy == null || legacy === "") return [];
  let obj: Record<string, unknown> | null = null;
  if (typeof legacy === "string") {
    const t = legacy.trim();
    if (!t) return [];
    try {
      const o = JSON.parse(t) as unknown;
      if (o && typeof o === "object" && !Array.isArray(o)) {
        obj = o as Record<string, unknown>;
      }
    } catch {
      return [];
    }
  } else if (typeof legacy === "object" && !Array.isArray(legacy)) {
    obj = legacy as Record<string, unknown>;
  }
  if (!obj) return [];
  const out: LangfuseAgentCredentialRow[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (!String(k).trim()) continue;
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      out.push({
        agentId: k,
        publicKey: "",
        secretKey: "",
        baseUrl: "",
      });
      continue;
    }
    const e = v as Record<string, unknown>;
    out.push({
      agentId: k,
      publicKey: typeof e.publicKey === "string" ? e.publicKey : "",
      secretKey: typeof e.secretKey === "string" ? e.secretKey : "",
      baseUrl: typeof e.baseUrl === "string" ? e.baseUrl : "",
    });
  }
  return out;
}

export function IntegrationsManagement({
  plugins,
}: {
  plugins: BuiltinIntegrationPluginMeta[];
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Integrations list from database
  const [integrations, setIntegrations] = useState<Integration[]>([]);

  // Currently editing plugin
  const [currentPlugin, setCurrentPlugin] =
    useState<BuiltinIntegrationPluginMeta | null>(null);
  const [currentConfig, setCurrentConfig] = useState<Record<string, unknown>>({});
  const [currentEnabled, setCurrentEnabled] = useState(false);
  const [langfuseAgents, setLangfuseAgents] = useState<ApiAgent[]>([]);
  const [langfuseAgentsLoading, setLangfuseAgentsLoading] = useState(false);

  useEffect(() => {
    fetchIntegrations();
  }, []);

  useEffect(() => {
    if (!dialogOpen || currentPlugin?.id !== "langfuse") return;
    let cancelled = false;
    (async () => {
      setLangfuseAgentsLoading(true);
      try {
        const res = await fetch("/api/agents");
        if (!res.ok) throw new Error("agents");
        const data = (await res.json()) as { agents?: ApiAgent[] };
        if (!cancelled) setLangfuseAgents(data.agents || []);
      } catch {
        if (!cancelled) toast.error("无法加载 Agent 列表");
      } finally {
        if (!cancelled) setLangfuseAgentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dialogOpen, currentPlugin?.id]);

  const fetchIntegrations = async () => {
    try {
      const data = await api.integrations.list();
      setIntegrations(data.integrations || []);
    } catch (error) {
      console.error("Error fetching integrations:", error);
      toast.error("Failed to fetch integration configuration");
    } finally {
      setLoading(false);
    }
  };

  const getIntegration = (type: string) => {
    return integrations.find((i) => i.type === type);
  };

  const handleOpenDialog = (plugin: BuiltinIntegrationPluginMeta) => {
    setCurrentPlugin(plugin);

    const buildDefaultsFromFields = (
      parsed?: Record<string, unknown>,
    ): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const field of plugin.configFields) {
        let v: unknown = parsed?.[field.name] ?? field.defaultValue ?? "";
        if (
          field.type === "textarea" &&
          v &&
          typeof v === "object" &&
          !Array.isArray(v)
        ) {
          v = JSON.stringify(v, null, 2);
        }
        out[field.name] = v ?? "";
      }
      return out;
    };

    const integration = getIntegration(plugin.id);
    if (integration) {
      setCurrentEnabled(integration.enabled);
      try {
        const parsed = JSON.parse(integration.config) as Record<
          string,
          unknown
        >;
        const base = buildDefaultsFromFields(parsed);
        if (plugin.id === "langfuse") {
          let rows = normalizeLangfuseRowsFromUnknown(
            parsed.agentCredentialRows,
          );
          if (rows.length === 0) {
            rows = legacyAgentCredentialsToRows(parsed.agentCredentials);
          }
          base.agentCredentialRows =
            rows.length > 0 ? rows : [emptyLangfuseRow()];
        }
        setCurrentConfig(base);
      } catch {
        const base = buildDefaultsFromFields();
        if (plugin.id === "langfuse") {
          base.agentCredentialRows = [emptyLangfuseRow()];
        }
        setCurrentConfig(base);
      }
    } else {
      setCurrentEnabled(false);
      const base = buildDefaultsFromFields();
      if (plugin.id === "langfuse") {
        base.agentCredentialRows = [emptyLangfuseRow()];
      }
      setCurrentConfig(base);
    }
    setDialogOpen(true);
  };

  const readLangfuseRowsFromConfig = (
    cfg: Record<string, unknown>,
  ): LangfuseAgentCredentialRow[] => {
    const r = normalizeLangfuseRowsFromUnknown(cfg.agentCredentialRows);
    return r.length > 0 ? r : [emptyLangfuseRow()];
  };

  const updateLangfuseRow = (
    index: number,
    patch: Partial<LangfuseAgentCredentialRow>,
  ) => {
    setCurrentConfig((prev) => {
      const rows = readLangfuseRowsFromConfig(prev);
      rows[index] = { ...rows[index], ...patch };
      return { ...prev, agentCredentialRows: rows };
    });
  };

  const addLangfuseRow = () => {
    setCurrentConfig((prev) => ({
      ...prev,
      agentCredentialRows: [
        ...readLangfuseRowsFromConfig(prev),
        emptyLangfuseRow(),
      ],
    }));
  };

  const removeLangfuseRow = (index: number) => {
    setCurrentConfig((prev) => {
      const rows = readLangfuseRowsFromConfig(prev);
      rows.splice(index, 1);
      return {
        ...prev,
        agentCredentialRows: rows.length > 0 ? rows : [emptyLangfuseRow()],
      };
    });
  };

  const saveIntegration = async () => {
    if (!currentPlugin) return;

    setSaving(true);
    try {
      let configPayload: Record<string, unknown> = { ...currentConfig };
      if (currentPlugin.id === "langfuse") {
        const rows = normalizeLangfuseRowsFromUnknown(
          configPayload.agentCredentialRows,
        );
        const kept = rows.filter(
          (r) =>
            String(r.agentId || "").trim() &&
            (String(r.publicKey || "").trim() ||
              String(r.secretKey || "").trim()),
        );
        configPayload = {
          ...configPayload,
          agentCredentialRows: kept,
        };
        delete configPayload.agentCredentials;
      }

      await api.integrations.update(currentPlugin.id, {
        enabled: currentEnabled,
        config: configPayload,
        name: currentPlugin.name,
      });

      toast.success(`${currentPlugin.name} configuration saved`);
      setDialogOpen(false);
      fetchIntegrations();
    } catch (error) {
      console.error("Error saving integration:", error);
      const message = error instanceof Error ? error.message : "Save failed";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!currentPlugin) return;

    setTesting(true);
    toast.info("Testing connection...");

    try {
      const result = await api.integrations.testConnection(
        currentPlugin.id,
        currentConfig as Record<string, unknown>,
      );

      if (result.success) {
        toast.success(result.message || "Connection test successful");
      } else {
        toast.error(result.message || "Connection test failed");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error occurred during connection test";
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const toggleIntegration = async (plugin: BuiltinIntegrationPluginMeta) => {
    const integration = getIntegration(plugin.id);
    const newEnabled = integration ? !integration.enabled : true;

    try {
      const config = integration
        ? JSON.parse(integration.config || "{}")
        : getDefaultConfig(plugin);

      const response = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: plugin.id,
          name: plugin.name,
          enabled: newEnabled,
          config,
        }),
      });

      if (response.ok) {
        toast.success(`${plugin.name} ${newEnabled ? "enabled" : "disabled"}`);
        fetchIntegrations();
      } else {
        const error = await response.json();
        toast.error(error.error || "Operation failed");
      }
    } catch (error) {
      console.error("Error toggling integration:", error);
      toast.error("Operation failed");
    }
  };

  const getDefaultConfig = (
    plugin: BuiltinIntegrationPluginMeta,
  ): Record<string, unknown> => {
    const defaults: Record<string, unknown> = {};
    for (const field of plugin.configFields) {
      defaults[field.name] = field.defaultValue ?? "";
    }
    return defaults;
  };

  const renderConfigField = (field: BuiltinIntegrationConfigField) => {
    const value = currentConfig[field.name] ?? "";

    switch (field.type) {
      case "select":
        return (
          <Select
            value={String(value)}
            onValueChange={(val) =>
              setCurrentConfig({ ...currentConfig, [field.name]: val })
            }
          >
            <SelectTrigger id={`field-${field.name}`}>
              <SelectValue placeholder={field.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "textarea":
        return (
          <textarea
            id={`field-${field.name}`}
            className="w-full min-h-[100px] px-3 py-2 border rounded-md text-sm"
            placeholder={field.placeholder}
            value={String(value)}
            onChange={(e) =>
              setCurrentConfig({ ...currentConfig, [field.name]: e.target.value })
            }
          />
        );

      default:
        return (
          <Input
            id={`field-${field.name}`}
            type={field.type}
            placeholder={field.placeholder}
            value={String(value)}
            onChange={(e) =>
              setCurrentConfig({ ...currentConfig, [field.name]: e.target.value })
            }
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">External Integrations</h2>
          <p className="text-muted-foreground mt-1">
            Configure integrations with third-party services to extend platform capabilities
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integration List</CardTitle>
          <CardDescription>Manage configured external tool integrations</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Features</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plugins.map((plugin) => {
                const integration = getIntegration(plugin.id);
                const isEnabled = integration?.enabled;

                return (
                  <TableRow key={plugin.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <img
                          src={plugin.icon}
                          alt={plugin.name}
                          className="h-5 w-5 object-contain"
                          onError={(e) => {
                            // Fallback to puzzle icon if image fails to load
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                        {plugin.name}
                      </div>
                    </TableCell>
                    <TableCell>{plugin.description}</TableCell>
                    <TableCell>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => toggleIntegration(plugin)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenDialog(plugin)}
                      >
                        <Settings className="h-4 w-4 mr-1" />
                        {integration ? "Edit" : "Configure"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {plugins.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center py-12 text-muted-foreground"
                  >
                    <Puzzle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No integrations available</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Configuration Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className={cn(
            "max-h-[90vh] overflow-y-auto",
            currentPlugin?.id === "langfuse" ? "max-w-4xl" : "max-w-lg",
          )}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {currentPlugin && (
                <>
                  <img
                    src={currentPlugin.icon}
                    alt={currentPlugin.name}
                    className="h-6 w-6 object-contain"
                  />
                  {currentPlugin.name} Configuration
                  {currentPlugin.docsUrl ? (
                    <a
                      href={currentPlugin.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {currentPlugin?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="plugin-enabled">Enable Integration</Label>
              <Switch
                id="plugin-enabled"
                checked={currentEnabled}
                onCheckedChange={setCurrentEnabled}
              />
            </div>

            {currentPlugin?.configFields.map((field) => (
              <div key={field.name} className="space-y-2">
                <Label htmlFor={`field-${field.name}`}>
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </Label>
                {renderConfigField(field)}
                {field.description && (
                  <p className="text-xs text-muted-foreground">
                    {field.description}
                  </p>
                )}
              </div>
            ))}

            {currentPlugin?.id === "langfuse" && (
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Label>按 Agent 的 Langfuse 密钥</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      为指定 Agent 配置独立 Public / Secret（及可选 Base
                      URL）；留空行不会保存。未列出的 Agent 使用上方默认密钥。
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addLangfuseRow}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    添加一行
                  </Button>
                </div>
                {langfuseAgentsLoading ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    加载 Agent 列表…
                  </p>
                ) : null}
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px] min-w-[160px]">
                          Agent
                        </TableHead>
                        <TableHead className="min-w-[140px]">
                          Public Key
                        </TableHead>
                        <TableHead className="min-w-[140px]">
                          Secret Key
                        </TableHead>
                        <TableHead className="min-w-[160px]">
                          Base URL（可选）
                        </TableHead>
                        <TableHead className="w-[72px] text-right">
                          操作
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {readLangfuseRowsFromConfig(currentConfig).map(
                        (row, index) => (
                        <TableRow key={index}>
                          <TableCell className="align-top py-2">
                            <Select
                              value={row.agentId ? String(row.agentId) : "__none__"}
                              onValueChange={(v) =>
                                updateLangfuseRow(index, {
                                  agentId:
                                    v === "__none__" || v == null ? "" : String(v),
                                })
                              }
                              disabled={langfuseAgentsLoading}
                            >
                              <SelectTrigger
                                id={`langfuse-agent-${index}`}
                                className="w-full max-w-[220px]"
                              >
                                <SelectValue placeholder="选择 Agent">
                                  {langfuseAgentSelectLabel(
                                    row.agentId,
                                    langfuseAgents,
                                  )}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">—</SelectItem>
                                {langfuseAgents.map((a) => (
                                  <SelectItem
                                    key={a.id}
                                    value={String(a.id)}
                                  >
                                    {a.name} (#{a.id})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="align-top py-2">
                            <Input
                              className="min-w-[120px]"
                              placeholder="pk-lf-…"
                              value={row.publicKey}
                              onChange={(e) =>
                                updateLangfuseRow(index, {
                                  publicKey: e.target.value,
                                })
                              }
                              autoComplete="off"
                            />
                          </TableCell>
                          <TableCell className="align-top py-2">
                            <Input
                              type="password"
                              className="min-w-[120px]"
                              placeholder="sk-lf-…"
                              value={row.secretKey}
                              onChange={(e) =>
                                updateLangfuseRow(index, {
                                  secretKey: e.target.value,
                                })
                              }
                              autoComplete="new-password"
                            />
                          </TableCell>
                          <TableCell className="align-top py-2">
                            <Input
                              className="min-w-[140px]"
                              placeholder="默认与上方一致"
                              value={row.baseUrl}
                              onChange={(e) =>
                                updateLangfuseRow(index, {
                                  baseUrl: e.target.value,
                                })
                              }
                              autoComplete="off"
                            />
                          </TableCell>
                          <TableCell className="align-top py-2 text-right">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => removeLangfuseRow(index)}
                              aria-label="删除此行"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        ),
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={testConnection}
              disabled={testing || saving}
            >
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test Connection
            </Button>
            <Button onClick={saveIntegration} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
