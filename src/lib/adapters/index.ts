/**
 * Agent Adapters Module
 *
 * 导出所有Agent适配器相关类型和函数
 *
 * 使用示例:
 * ```typescript
 * import { AgentAdapterFactory, executeAgent } from '@/lib/adapters';
 *
 * // 方式1: 使用工厂获取适配器
 * const adapter = AgentAdapterFactory.getAdapter('openclaw');
 * const result = await adapter.execute({ agent, prompt, executionId });
 *
 * // 方式2: 使用便捷函数
 * const result = await executeAgent('openclaw', { agent, prompt, executionId });
 * ```
 */

// 导出类型
export type {
  AgentAdapter,
  ExecuteOptions,
  ExecuteResult,
  AgentConfig,
  OpenClawConfig,
  CommandAgentConfig,
} from './types';

// 导出工具函数
export {
  isOpenClawConfig,
  isCommandAgentConfig,
  escapeShellPrompt,
  replaceCommandVariables,
  parseAgentConfig,
} from './types';

// 导出工厂和便捷函数
export { AgentAdapterFactory, executeAgent } from './agent-adapter';

// 导出适配器类 (主要用于测试)
export { OpenClawAdapter } from './openclaw-adapter';
export { HermesAdapter } from './hermes-adapter';
export { OtherAdapter } from './other-adapter';
