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
    const { name, description, command, agent_type, config_json } = body;

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

    // Build config_json from body or legacy command
    let configJson: string;
    if (config_json) {
      configJson = typeof config_json === 'string' ? config_json : JSON.stringify(config_json);
    } else if (command) {
      // Legacy: command-only → config_json
      configJson = JSON.stringify({ command });
    } else {
      return NextResponse.json(
        { error: 'Command is required for this agent type' },
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
