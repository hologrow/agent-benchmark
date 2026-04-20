'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentManagement } from './components/agent-management';
import { ModelManagement } from './components/model-management';
import { EvaluatorManagement } from './components/evaluator-management';
import { IntegrationsManagement } from './components/integrations-management';
import { Users, Brain, Settings2, Puzzle } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">设置</h1>
        <p className="text-muted-foreground mt-2">
          管理 Agents、模型、评估器和外部工具集成
        </p>
      </div>

      <Tabs defaultValue="agents" className="space-y-6">
        <TabsList className="grid w-full max-w-lg grid-cols-4">
          <TabsTrigger value="agents" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Agent 管理
          </TabsTrigger>
          <TabsTrigger value="models" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            模型管理
          </TabsTrigger>
          <TabsTrigger value="evaluators" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            评估器管理
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-2">
            <Puzzle className="h-4 w-4" />
            集成
          </TabsTrigger>
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
