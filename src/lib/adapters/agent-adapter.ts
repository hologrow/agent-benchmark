/**
 * Agent Adapter Factory
 * 根据Agent类型创建对应的适配器实例
 */

import type { AgentType } from '@/lib/db';
import type { AgentAdapter } from './types';
import { OpenClawAdapter } from './openclaw-adapter';
import { HermesAdapter } from './hermes-adapter';
import { OtherAdapter } from './other-adapter';

// 简单对象缓存，避免使用 Map (可能引起 Turbopack 内存问题)
const adapterCache: Record<string, AgentAdapter> = {};

/**
 * Agent适配器工厂类
 */
export class AgentAdapterFactory {
  /**
   * 根据Agent类型获取对应的适配器
   * @param type Agent类型
   * @returns 对应的适配器实例
   * @throws 如果类型不支持
   */
  static getAdapter(type: AgentType): AgentAdapter {
    // 检查缓存
    if (adapterCache[type]) {
      return adapterCache[type];
    }

    // 创建新的适配器实例
    let adapter: AgentAdapter;

    switch (type) {
      case 'openclaw':
        adapter = new OpenClawAdapter();
        break;
      case 'hermes':
        adapter = new HermesAdapter();
        break;
      case 'other':
        adapter = new OtherAdapter();
        break;
      default:
        // 对于未知类型，使用OtherAdapter作为默认
        console.warn(`[AgentAdapterFactory] Unknown agent type "${type}", falling back to "other"`);
        adapter = new OtherAdapter();
    }

    // 缓存适配器
    adapterCache[type] = adapter;
    return adapter;
  }

  /**
   * 清除适配器缓存
   * 可用于测试或热重载场景
   */
  static clearCache(): void {
    Object.keys(adapterCache).forEach(key => {
      delete adapterCache[key];
    });
  }
}

/**
 * 便捷函数：执行Agent
 * 自动根据Agent类型选择适配器并执行
 */
export async function executeAgent(
  type: AgentType,
  options: import('./types').ExecuteOptions
): Promise<import('./types').ExecuteResult> {
  const adapter = AgentAdapterFactory.getAdapter(type);
  return adapter.execute(options);
}
