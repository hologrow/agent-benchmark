import { NextRequest, NextResponse } from 'next/server';
import { getAgentById } from '@/lib/db';
import { AgentAdapterFactory } from '@/lib/adapters';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { agentId, prompt, round, executionId } = body as {
      agentId: number;
      prompt: string;
      round: number;
      executionId?: string;
    };

    console.log(`[RL Training] Round ${round} - Received request:`, {
      agentId,
      promptLength: prompt?.length,
      promptPreview: prompt?.substring(0, 200) + (prompt?.length > 200 ? '...' : ''),
    });

    if (!agentId || !prompt) {
      console.error('[RL Training] Missing required fields:', { agentId, hasPrompt: !!prompt });
      return NextResponse.json(
        { error: 'Missing required fields: agentId, prompt' },
        { status: 400 }
      );
    }

    // Get agent from database
    const agent = getAgentById(agentId);
    if (!agent) {
      console.error('[RL Training] Agent not found:', agentId);
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    console.log(`[RL Training] Round ${round} - Using agent:`, {
      name: agent.name,
      agentType: agent.agent_type,
      command: agent.command,
    });

    // 使用适配器工厂执行Agent
    const adapter = AgentAdapterFactory.getAdapter(agent.agent_type);
    const execId = executionId || `#${round}`;

    console.log(`[RL Training] Round ${round} - Using ${agent.agent_type} adapter with executionId: ${execId}`);

    const result = await adapter.execute({
      agent,
      prompt,
      executionId: execId,
      round,
    });

    const executionTime = Date.now() - startTime;

    if (result.error) {
      console.error(`[RL Training] Agent execution failed:`, result.error);

      // 根据错误类型返回不同状态码
      if (result.error.includes('timeout')) {
        return NextResponse.json(
          {
            error: result.error,
            executionTime,
          },
          { status: 504 }
        );
      }

      return NextResponse.json(
        {
          error: result.error,
          executionTime,
        },
        { status: 500 }
      );
    }

    console.log(`[RL Training] Round ${round} - Execution completed in ${executionTime}ms`);
    console.log(`[RL Training] Round ${round} - Agent output preview:`, result.output.substring(0, 500) + (result.output.length > 500 ? '...' : ''));

    return NextResponse.json({
      output: result.output,
      round,
      command: result.command,
      agentName: agent.name,
      executionTime,
    });
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error(`[RL Training] Agent execution error after ${executionTime}ms:`, error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error during agent execution',
        executionTime,
      },
      { status: 500 }
    );
  }
}
