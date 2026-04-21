/**
 * Plugin System Entry
 *
 * Usage Example:
 *
 * ```typescript
 * // 1. Initialize plugins at app startup
 * import { setupPlugins } from '@/lib/plugins';
 * await setupPlugins();
 *
 * // 2. Use plugin capabilities
 * import { pluginRegistry, Capability } from '@/lib/plugins';
 *
 * const tracePlugin = pluginRegistry.getFirstEnabledPluginByCapability(Capability.TRACE_EXECUTION);
 * if (tracePlugin) {
 *   const traces = await tracePlugin.searchTraces({ magicCode: 'BM-xxx' });
 * }
 * ```
 */

export * from './types';
export * from './registry';
export * from './base';
export * from './loader';
