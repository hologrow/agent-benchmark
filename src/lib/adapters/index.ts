/**
 * Agent adapters — types, factory, and concrete implementations.
 *
 * ```typescript
 * import { AgentAdapterFactory, executeAgent } from '@/lib/adapters';
 *
 * const adapter = AgentAdapterFactory.getAdapter('openclaw');
 * const result = await adapter.execute({ agent, prompt, executionId });
 *
 * const result2 = await executeAgent('openclaw', { agent, prompt, executionId });
 * ```
 */

export type {
  AgentAdapter,
  ExecuteOptions,
  ExecuteResult,
  AgentConfig,
  OpenClawConfig,
  CommandAgentConfig,
} from './types';

export {
  isOpenClawConfig,
  isCommandAgentConfig,
  escapeShellPrompt,
  replaceCommandVariables,
  parseAgentConfig,
} from './types';

export { AgentAdapterFactory, executeAgent } from './agent-adapter';

export { OpenClawAdapter } from './openclaw-adapter';
export { HermesAdapter } from './hermes-adapter';
export { OtherAdapter } from './other-adapter';
