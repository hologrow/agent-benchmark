import { NextRequest, NextResponse } from 'next/server';
import {
  getAllAgents,
  createAgent,
  Agent
} from '@/lib/db';

// GET /api/agents - 获取所有 agents
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

// POST /api/agents - 创建新 agent
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, command } = body;

    if (!name || !command) {
      return NextResponse.json(
        { error: 'Name and command are required' },
        { status: 400 }
      );
    }

    const agent = createAgent({
      name,
      description: description || '',
      command
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
