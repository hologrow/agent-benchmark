'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentManagement } from './components/agent-management';
import { ModelManagement } from './components/model-management';
import { EvaluatorManagement } from './components/evaluator-management';
import { IntegrationsManagement } from './components/integrations-management';
import { Users, Brain, Settings2, Puzzle } from 'lucide-react';

const TAB_PARAM = 'tab';
const DEFAULT_TAB = 'agents';

const tabs = [
  { value: 'agents', label: 'Agent 管理', icon: Users },
  { value: 'models', label: '模型管理', icon: Brain },
  { value: 'evaluators', label: '评估器管理', icon: Settings2 },
  { value: 'integrations', label: '集成', icon: Puzzle },
];

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB);

  // 从 URL 读取 tab 参数
  useEffect(() => {
    const tabFromUrl = searchParams.get(TAB_PARAM);
    if (tabFromUrl && tabs.some((t) => t.value === tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  // 切换标签时更新 URL
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const params = new URLSearchParams(searchParams);
    params.set(TAB_PARAM, value);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">设置</h1>
        <p className="text-muted-foreground mt-2">
          管理 Agents、模型、评估器和外部工具集成
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full max-w-lg grid-cols-4">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-2">
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="agents">
          <AgentManagement />
        </TabsContent>

        <TabsContent value="models">
          <ModelManagement />
        </TabsContent>

        <TabsContent value="evaluators">
          <EvaluatorManagement />
        </TabsContent>

        <TabsContent value="integrations">
          <IntegrationsManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
