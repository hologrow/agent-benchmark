"use client";

import { useEffect, useState } from "react";
import { LangfuseClient, LangfuseClientParams } from "@langfuse/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, ExternalLink } from "lucide-react";

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

const defaultLangfuseConfig = {
  publicKey: "",
  secretKey: "",
  baseUrl: "https://cloud.langfuse.com",
};

export function IntegrationsManagement() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Langfuse configuration
  const [langfuseEnabled, setLangfuseEnabled] = useState(false);
  const [langfuseConfig, setLangfuseConfig] = useState<LangfuseClientParams>(
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

      // Load Langfuse config if exists
      const langfuseIntegration = integrationsList.find(
        (i: Integration) => i.type === "langfuse",
      );
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
      }
    } catch (error) {
      console.error("Error fetching integrations:", error);
      toast.error("获取集成配置失败");
    } finally {
      setLoading(false);
    }
  };

  const saveLangfuseIntegration = async () => {
    setSaving(true);
    await testConnection();
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
    const langfuse = new LangfuseClient(langfuseConfig);
    return langfuse.api.health
      .health()
      .then((response) => {
        toast.success("连接测试成功！langfuse version:" + response.version);
      })
      .catch(() => {
        toast.error("连接失败");
        throw new Error("连接失败");
      });
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
      <div>
        <h2 className="text-2xl font-bold">外部工具集成</h2>
        <p className="text-muted-foreground mt-1">
          配置与第三方服务的集成，扩展平台功能
        </p>
      </div>

      {/* Langfuse Integration Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <img
                  src="/langfuse.png"
                  alt="Langfuse"
                  className="h-6 w-6 object-contain"
                />
                Langfuse
                <a
                  href="https://langfuse.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </CardTitle>
              <CardDescription>路径追踪</CardDescription>
            </div>
            <Switch
              checked={langfuseEnabled}
              onCheckedChange={setLangfuseEnabled}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
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

          <div className="flex items-center gap-2 pt-4">
            <Button onClick={saveLangfuseIntegration} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存配置
            </Button>
            <Button
              variant="outline"
              onClick={testConnection}
              disabled={saving}
            >
              测试连接
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
