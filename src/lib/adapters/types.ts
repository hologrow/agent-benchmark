/**
 * Agent adapter types — config shapes, execute options/results, utilities.
 */

import type { Agent } from '@/lib/db';

// --- Config shapes ---

/** OpenClaw: HTTP service + token */
export interface OpenClawConfig {
  /** Base URL */
  url: string;
  /** API token */
  token: string;
}

/** Shell-based agents (Hermes / Other) */
export interface CommandAgentConfig {
  /** Command template with {{prompt}}, {{execution_id}}, etc. */
  command: string;
}

export type AgentConfig = OpenClawConfig | CommandAgentConfig;

// --- Execute ---

export interface ExecuteOptions {
  agent: Agent;
  prompt: string;
  /** e.g. #14 */
  executionId: string;
  /** RL training round */
  round?: number;
}

export interface ExecuteResult {
  output: string;
  executionTime: number;
  command?: string;
  error?: string;
}

export interface AgentAdapter {
  execute(options: ExecuteOptions): Promise<ExecuteResult>;
}

// --- Narrowing ---

export function isOpenClawConfig(config: AgentConfig): config is OpenClawConfig {
  return 'url' in config && 'token' in config;
}

export function isCommandAgentConfig(config: AgentConfig): config is CommandAgentConfig {
  return 'command' in config;
}

// --- String helpers ---

export function escapeShellPrompt(prompt: string): string {
  return prompt
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$');
}

export function replaceCommandVariables(
  command: string,
  variables: Record<string, string>
): string {
  let result = command;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(placeholder, value);
  }
  return result;
}

export function parseAgentConfig(agent: Agent): AgentConfig {
  try {
    return JSON.parse(agent.config_json || '{}') as AgentConfig;
  } catch {
    return { command: agent.command } as CommandAgentConfig;
  }
}
