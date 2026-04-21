"use client";

import { useEffect, useState } from "react";
import { LangfuseClient } from "@langfuse/client";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, ExternalLink, Settings, Puzzle } from "lucide-react";

interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
}

interface Integration {
  id: number;
  name: string;
  type: string;
  enabled: number;
  config: string;
  created_at: string;
  updated_at: string;
}

const defaultLangfuseConfig: LangfuseConfig = {
  publicKey: "",
  secretKey: "",
  baseUrl: "https://cloud.langfuse.com",
};

export function IntegrationsManagement() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Integrations list
  const [integrations, setIntegrations] = useState<Integration[]>([]);

  // Langfuse configuration (for dialog editing)
  const [langfuseEnabled, setLangfuseEnabled] = useState(false);
  const [langfuseConfig, setLangfuseConfig] = useState<LangfuseConfig>(
    defaultLangfuseConfig,
  );

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    try {
      const response = await fetch("/api/integrations");
      const data = await response.json();
      const integrationsList = data.integrations || [];
      setIntegrations(integrationsList);
    } catch (error) {
      console.error("Error fetching integrations:", error);
      toast.error("获取集成配置失败");
    } finally {
      setLoading(false);
    }
  };

  const getLangfuseIntegration = () => {
    return integrations.find((i) => i.type === "langfuse");
  };

  const handleOpenDialog = () => {
    const langfuseIntegration = getLangfuseIntegration();
    if (langfuseIntegration) {
      setLangfuseEnabled(langfuseIntegration.enabled === 1);
      try {
        const parsed = JSON.parse(langfuseIntegration.config);
        setLangfuseConfig({
          ...defaultLangfuseConfig,
          ...parsed,
        });
      } catch {
        setLangfuseConfig(defaultLangfuseConfig);
      }
    } else {
      setLangfuseEnabled(false);
      setLangfuseConfig(defaultLangfuseConfig);
    }
    setDialogOpen(true);
  };

  const saveLangfuseIntegration = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "langfuse",
          name: "Langfuse",
          enabled: langfuseEnabled,
          config: langfuseConfig,
        }),
      });

      if (response.ok) {
        toast.success("Langfuse 配置已保存");
        setDialogOpen(false);
        fetchIntegrations();
      } else {
        const error = await response.json();
        toast.error(error.error || "保存失败");
      }
    } catch (error) {
      console.error("Error saving integration:", error);
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    toast.info("正在测试连接...");
    const langfuse = new LangfuseClient({
      publicKey: langfuseConfig.publicKey,
      secretKey: langfuseConfig.secretKey,
      baseUrl: langfuseConfig.baseUrl,
    });
    return langfuse.api.health
      .health()
      .then((response) => {
        toast.success("连接测试成功！langfuse version:" + response.version);
      })
      .catch(() => {
        toast.error("连接失败");
      });
  };

  const toggleIntegration = async (integration: Integration) => {
    try {
      const newEnabled = integration.enabled === 1 ? 0 : 1;
      const response = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: integration.type,
          name: integration.name,
          enabled: newEnabled,
          config: JSON.parse(integration.config || "{}"),
        }),
      });

      if (response.ok) {
        toast.success(`${integration.name} 已${newEnabled === 1 ? "启用" : "禁用"}`);
        fetchIntegrations();
      } else {
        const error = await response.json();
        toast.error(error.error || "操作失败");
      }
    } catch (error) {
      console.error("Error toggling integration:", error);
      toast.error("操作失败");
    }
  };

  const getLangfuseDisplayConfig = () => {
    const integration = getLangfuseIntegration();
    if (!integration) return null;
    try {
      return JSON.parse(integration.config) as LangfuseConfig;
    } catch {
      return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const langfuseIntegration = getLangfuseIntegration();
  const langfuseDisplayConfig = getLangfuseDisplayConfig();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">外部工具集成</h2>
          <p className="text-muted-foreground mt-1">
            配置与第三方服务的集成，扩展平台功能
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>集成列表</CardTitle>
          <CardDescription>管理已配置的外部工具集成</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>Base URL</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Langfuse Integration */}
              <TableRow>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <img
                      src="/langfuse.png"
                      alt="Langfuse"
                      className="h-5 w-5 object-contain"
                    />
                    Langfuse
                  </div>
                </TableCell>
                <TableCell>路径追踪</TableCell>
                <TableCell className="font-mono text-xs">
                  {langfuseDisplayConfig?.baseUrl || "https://cloud.langfuse.com"}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={langfuseIntegration?.enabled === 1}
                    onCheckedChange={() =>
                      langfuseIntegration && toggleIntegration(langfuseIntegration)
                    }
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={handleOpenDialog}>
                    <Settings className="h-4 w-4 mr-1" />
                    编辑
                  </Button>
                </TableCell>
              </TableRow>

              {/* Empty state */}
              {!langfuseIntegration && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center py-12 text-muted-foreground"
                  >
                    <Puzzle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>暂无集成配置</p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={handleOpenDialog}
                    >
                      配置 Langfuse
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Langfuse Configuration Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img
                src="/langfuse.png"
                alt="Langfuse"
                className="h-6 w-6 object-contain"
              />
              Langfuse 配置
              <a
                href="https://langfuse.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </DialogTitle>
            <DialogDescription>配置 Langfuse 路径追踪服务</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="langfuse-enabled">启用集成</Label>
              <Switch
                id="langfuse-enabled"
                checked={langfuseEnabled}
                onCheckedChange={setLangfuseEnabled}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="langfuse-base-url">Base URL</Label>
              <Input
                id="langfuse-base-url"
                placeholder="https://cloud.langfuse.com"
                value={langfuseConfig.baseUrl}
                onChange={(e) =>
                  setLangfuseConfig({
                    ...langfuseConfig,
                    baseUrl: e.target.value,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Langfuse 服务地址，使用云版本请保持默认，自建请填写自定义域名
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="langfuse-public-key">Public Key</Label>
              <Input
                id="langfuse-public-key"
                placeholder="pk-lf-..."
                value={langfuseConfig.publicKey}
                onChange={(e) =>
                  setLangfuseConfig({
                    ...langfuseConfig,
                    publicKey: e.target.value,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                从 Langfuse 项目设置中获取的 Public Key
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="langfuse-secret-key">Secret Key</Label>
              <Input
                id="langfuse-secret-key"
                type="password"
                placeholder="sk-lf-..."
                value={langfuseConfig.secretKey}
                onChange={(e) =>
                  setLangfuseConfig({
                    ...langfuseConfig,
                    secretKey: e.target.value,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                从 Langfuse 项目设置中获取的 Secret Key
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={testConnection} disabled={saving}>
              测试连接
            </Button>
            <Button onClick={saveLangfuseIntegration} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
