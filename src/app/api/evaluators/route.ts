import { NextRequest, NextResponse } from 'next/server';
import {
  getAllEvaluators,
  createEvaluator
} from '@/lib/db';

// GET /api/evaluators - list evaluators
export async function GET() {
  try {
    const evaluators = getAllEvaluators();
    return NextResponse.json({ evaluators });
  } catch (error) {
    console.error('Error fetching evaluators:', error);
    return NextResponse.json(
      { error: 'Failed to fetch evaluators' },
      { status: 500 }
    );
  }
}

// POST /api/evaluators - create evaluator
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, script_path, model_id, config } = body;

    if (!name || !script_path || !config) {
      return NextResponse.json(
        { error: 'name, script_path, and config are required' },
        { status: 400 }
      );
    }

    const evaluator = createEvaluator({
      name,
      description: description || '',
      script_path,
      model_id: model_id || null,
      config: typeof config === 'string' ? config : JSON.stringify(config)
    });

    return NextResponse.json({ evaluator }, { status: 201 });
  } catch (error) {
    console.error('Error creating evaluator:', error);
    return NextResponse.json(
      { error: 'Failed to create evaluator' },
      { status: 500 }
    );
  }
}
