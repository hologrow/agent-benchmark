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
  { value: 'agents', label: 'Agents', icon: Users },
  { value: 'models', label: 'Models', icon: Brain },
  { value: 'evaluators', label: 'Evaluators', icon: Settings2 },
  { value: 'integrations', label: 'Integrations', icon: Puzzle },
];

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB);

  // Read tab parameter from URL
  useEffect(() => {
    const tabFromUrl = searchParams.get(TAB_PARAM);
    if (tabFromUrl && tabs.some((t) => t.value === tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  // Update URL when switching tabs
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const params = new URLSearchParams(searchParams);
    params.set(TAB_PARAM, value);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage Agents, Models, Evaluators and external tool integrations
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
