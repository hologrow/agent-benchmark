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
import { Loader2, ExternalLink, Settings, Puzzle } from "lucide-react";
import { api } from "@/lib/api";
import type { Integration } from "@/types/api";

// Plugin metadata definitions
interface PluginMeta {
  id: string;
  name: string;
  description: string;
  icon: string;
  capabilities: string[];
  configFields: ConfigField[];
}

interface ConfigField {
  name: string;
  label: string;
  type: "text" | "password" | "url" | "select" | "textarea";
  required?: boolean;
  defaultValue?: string | number | boolean;
  placeholder?: string;
  description?: string;
  options?: { label: string; value: string }[];
}

// Bundled plugin metadata
const BUILTIN_PLUGINS: PluginMeta[] = [
  {
    id: "langfuse",
    name: "Langfuse",
    description: "Trace tracking service",
    icon: "/langfuse.png",
    capabilities: ["trace:execution"],
    configFields: [
      {
        name: "baseUrl",
        label: "Base URL",
        type: "url",
        required: true,
        defaultValue: "https://cloud.langfuse.com",
        placeholder: "https://cloud.langfuse.com",
        description: "Langfuse service URL, keep default for cloud version, fill custom domain for self-hosted",
      },
      {
        name: "publicKey",
        label: "Public Key",
        type: "text",
        required: true,
        placeholder: "pk-lf-...",
        description: "Public Key from Langfuse project settings",
      },
      {
        name: "secretKey",
        label: "Secret Key",
        type: "password",
        required: true,
        placeholder: "sk-lf-...",
        description: "Secret Key from Langfuse project settings",
      },
    ],
  },
  {
    id: "lark",
    name: "Lark/Feishu",
    description: "Import test cases from Lark/Feishu",
    icon: "/lark.png",
    capabilities: ["import:test-cases"],
    configFields: [
      {
        name: "appType",
        label: "App Type",
        type: "select",
        required: true,
        defaultValue: "feishu",
        description: "Choose Lark (International) or Feishu (China)",
        options: [
          { label: "Feishu (China)", value: "feishu" },
          { label: "Lark (International)", value: "lark" },
        ],
      },
      {
        name: "appId",
        label: "App ID",
        type: "text",
        required: true,
        placeholder: "cli_xxx",
        description: "App ID from Lark/Feishu developer console",
      },
      {
        name: "appSecret",
        label: "App Secret",
        type: "password",
        required: true,
        placeholder: "xxx",
        description: "App Secret from Lark/Feishu developer console",
      },
      {
        name: "baseUrl",
        label: "Custom Domain",
        type: "url",
        required: false,
        placeholder: "https://open.feishu.cn",
        description: "For private deployment, fill in custom domain (optional)",
      },
    ],
  },
];

export function IntegrationsManagement() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Integrations list from database
  const [integrations, setIntegrations] = useState<Integration[]>([]);

  // Currently editing plugin
  const [currentPlugin, setCurrentPlugin] = useState<PluginMeta | null>(null);
  const [currentConfig, setCurrentConfig] = useState<Record<string, unknown>>({});
  const [currentEnabled, setCurrentEnabled] = useState(false);

  useEffect(() => {
    fetchIntegrations();
  }, []);

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

  const handleOpenDialog = (plugin: PluginMeta) => {
    setCurrentPlugin(plugin);

    const integration = getIntegration(plugin.id);
    if (integration) {
      setCurrentEnabled(integration.enabled);
      try {
        const parsed = JSON.parse(integration.config);
        // Merge with defaults
        const configWithDefaults: Record<string, unknown> = {};
        for (const field of plugin.configFields) {
          configWithDefaults[field.name] = parsed[field.name] ?? field.defaultValue ?? "";
        }
        setCurrentConfig(configWithDefaults);
      } catch {
        // Use defaults
        const defaults: Record<string, unknown> = {};
        for (const field of plugin.configFields) {
          defaults[field.name] = field.defaultValue ?? "";
        }
        setCurrentConfig(defaults);
      }
    } else {
      setCurrentEnabled(false);
      // Use defaults
      const defaults: Record<string, unknown> = {};
      for (const field of plugin.configFields) {
        defaults[field.name] = field.defaultValue ?? "";
      }
      setCurrentConfig(defaults);
    }
    setDialogOpen(true);
  };

  const saveIntegration = async () => {
    if (!currentPlugin) return;

    setSaving(true);
    try {
      await api.integrations.update(currentPlugin.id, {
        enabled: currentEnabled,
        config: currentConfig,
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
      const result = await api.integrations.testConnection(currentPlugin.id);

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

  const toggleIntegration = async (plugin: PluginMeta) => {
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

  const getDefaultConfig = (plugin: PluginMeta): Record<string, unknown> => {
    const defaults: Record<string, unknown> = {};
    for (const field of plugin.configFields) {
      defaults[field.name] = field.defaultValue ?? "";
    }
    return defaults;
  };

  const renderConfigField = (field: ConfigField) => {
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
              {BUILTIN_PLUGINS.map((plugin) => {
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

              {BUILTIN_PLUGINS.length === 0 && (
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                  <a
                    href={
                      currentPlugin.id === "langfuse"
                        ? "https://langfuse.com"
                        : currentPlugin.id === "lark"
                          ? "https://open.feishu.cn"
                          : "#"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
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
