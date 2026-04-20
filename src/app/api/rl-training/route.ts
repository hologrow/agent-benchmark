import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { getModelById } from '@/lib/db';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { modelId, messages, round } = body as {
      modelId: number;
      messages: Message[];
      round: number;
    };

    if (!modelId || !messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Missing required fields: modelId, messages' },
        { status: 400 }
      );
    }

    // Get model configuration from database
    const model = getModelById(modelId);
    if (!model) {
      return NextResponse.json(
        { error: 'Model not found' },
        { status: 404 }
      );
    }

    if (!model.api_key) {
      return NextResponse.json(
        { error: 'Model API key not configured' },
        { status: 400 }
      );
    }

    // Parse model config
    let modelConfig: Record<string, unknown> = {};
    if (model.config) {
      try {
        modelConfig = JSON.parse(model.config);
      } catch {
        console.warn('Failed to parse model config');
      }
    }

    // Create provider based on model provider
    let aiModel;
    const commonOptions = {
      apiKey: model.api_key,
      baseURL: model.base_url || undefined,
    };

    switch (model.provider) {
      case 'anthropic': {
        const anthropic = createAnthropic(commonOptions);
        aiModel = anthropic(model.model_id);
        break;
      }
      case 'openai':
      case 'azure': {
        const openai = createOpenAI(commonOptions);
        aiModel = openai(model.model_id);
        break;
      }
      case 'custom': {
        const openai = createOpenAI(commonOptions);
        aiModel = openai(model.model_id);
        break;
      }
      default: {
        const anthropic = createAnthropic(commonOptions);
        aiModel = anthropic(model.model_id);
      }
    }

    // Process messages
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    // Build properly formatted messages for Anthropic API
    const formattedMessages: { role: 'user' | 'assistant'; content: string }[] = [];

    for (const msg of conversationMessages) {
      const lastMsg = formattedMessages[formattedMessages.length - 1];

      if (lastMsg && lastMsg.role === msg.role) {
        // Merge consecutive messages of same role
        lastMsg.content += '\n\n' + msg.content;
      } else {
        formattedMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    // Ensure conversation starts with user message
    if (formattedMessages.length > 0 && formattedMessages[0].role === 'assistant') {
      formattedMessages.unshift({
        role: 'user',
        content: 'Please provide your first instruction.',
      });
    }

    console.log('[RL Training] Round', round, '- Formatted messages:',
      formattedMessages.map(m => ({ role: m.role, content: m.content.substring(0, 100) + '...' }))
    );

    // Always use messages format with proper system prompt
    const generateOptions: any = {
      model: aiModel,
      temperature: (modelConfig.temperature as number) ?? 0.7,
      maxOutputTokens: (modelConfig.max_tokens as number) ?? 4096,
    };

    if (formattedMessages.length === 0) {
      // First round - no conversation history yet
      generateOptions.system = systemMessage?.content || 'You are a helpful assistant.';
      generateOptions.prompt = 'Please start the training by giving the first task instruction to the Agent.';
    } else {
      // Subsequent rounds - use conversation history
      if (systemMessage) {
        generateOptions.system = systemMessage.content;
      }
      generateOptions.messages = formattedMessages;
    }

    const result = await generateText(generateOptions);

    return NextResponse.json({
      content: result.text,
      round,
      usage: result.usage,
    });
  } catch (error) {
    console.error('RL Training API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
