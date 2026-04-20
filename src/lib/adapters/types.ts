/**
 * Agent Adapter Types
 * 定义Agent类型、配置结构和执行选项
 */

import type { Agent } from '@/lib/db';

// ==================== 配置类型 ====================

/**
 * OpenClaw配置
 */
export interface OpenClawConfig {
  /** OpenClaw服务URL */
  url: string;
  /** 访问令牌 */
  token: string;
}

/**
 * 命令行Agent配置 (Hermes/Other)
 */
export interface CommandAgentConfig {
  /** 执行命令模板 */
  command: string;
}

/**
 * Agent配置联合类型
 */
export type AgentConfig = OpenClawConfig | CommandAgentConfig;

// ==================== 执行选项和结果 ====================

/**
 * 执行选项
 */
export interface ExecuteOptions {
  /** Agent数据 */
  agent: Agent;
  /** 输入提示 */
  prompt: string;
  /** 执行ID (如 #14) */
  executionId: string;
  /** 可选：回合数 (用于RL训练) */
  round?: number;
}

/**
 * 执行结果
 */
export interface ExecuteResult {
  /** 输出内容 */
  output: string;
  /** 执行时间(毫秒) */
  executionTime: number;
  /** 执行的命令 (用于调试) */
  command?: string;
  /** 错误信息 */
  error?: string;
}

// ==================== 适配器接口 ====================

/**
 * Agent适配器接口
 * 所有Agent类型适配器必须实现此接口
 */
export interface AgentAdapter {
  /**
   * 执行Agent
   * @param options 执行选项
   * @returns 执行结果
   */
  execute(options: ExecuteOptions): Promise<ExecuteResult>;
}

// ==================== 类型守卫 ====================

/**
 * 检查配置是否为OpenClaw配置
 */
export function isOpenClawConfig(config: AgentConfig): config is OpenClawConfig {
  return 'url' in config && 'token' in config;
}

/**
 * 检查配置是否为命令行配置
 */
export function isCommandAgentConfig(config: AgentConfig): config is CommandAgentConfig {
  return 'command' in config;
}

// ==================== 工具函数 ====================

/**
 * 转义命令行参数中的特殊字符
 */
export function escapeShellPrompt(prompt: string): string {
  return prompt
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$');
}

/**
 * 替换命令模板中的变量
 */
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

/**
 * 解析Agent配置
 */
export function parseAgentConfig(agent: Agent): AgentConfig {
  try {
    return JSON.parse(agent.config_json || '{}') as AgentConfig;
  } catch {
    // 向后兼容：如果没有config_json，从command字段构建
    return { command: agent.command } as CommandAgentConfig;
  }
}
