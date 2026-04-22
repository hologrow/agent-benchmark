import { NextRequest, NextResponse } from 'next/server';
import {
  getAllAgents,
  createAgent,
  AgentType
} from '@/lib/db';

// GET /api/agents - list agents
export async function GET() {
  try {
    const agents = getAllAgents();
    return NextResponse.json({ agents });
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}

// POST /api/agents - create agent
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, command, agent_type, config_json, config } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    // Validate agent_type
    const agentType: AgentType = agent_type || 'other';
    if (!['openclaw', 'hermes', 'other'].includes(agentType)) {
      return NextResponse.json(
        { error: 'Invalid agent_type. Must be one of: openclaw, hermes, other' },
        { status: 400 }
      );
    }

    // Build config_json: prefer explicit config_json, then structured `config` (CreateAgentRequest), then legacy `command`
    let configJson: string | undefined;
    if (config_json !== undefined && config_json !== null && config_json !== '') {
      configJson =
        typeof config_json === 'string' ? config_json : JSON.stringify(config_json);
    } else if (config !== undefined && config !== null) {
      configJson = typeof config === 'string' ? config : JSON.stringify(config);
    } else if (command) {
      configJson = JSON.stringify({ command });
    }

    if (configJson === undefined) {
      return NextResponse.json(
        { error: 'config or config_json (or legacy command) is required' },
        { status: 400 }
      );
    }

    const agent = createAgent({
      name,
      description: description || '',
      command: command || '',
      agent_type: agentType,
      config_json: configJson
    });

    return NextResponse.json({ agent }, { status: 201 });
  } catch (error) {
    console.error('Error creating agent:', error);
    return NextResponse.json(
      { error: 'Failed to create agent' },
      { status: 500 }
    );
  }
}
