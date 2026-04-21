/**
 * Agent adapter factory — instantiate the right adapter per agent type.
 */

import type { AgentType } from '@/lib/db';
import type { AgentAdapter } from './types';
import { OpenClawAdapter } from './openclaw-adapter';
import { HermesAdapter } from './hermes-adapter';
import { OtherAdapter } from './other-adapter';

// Plain object cache (avoid Map / Turbopack quirks in some setups)
const adapterCache: Record<string, AgentAdapter> = {};

export class AgentAdapterFactory {
  static getAdapter(type: AgentType): AgentAdapter {
    if (adapterCache[type]) {
      return adapterCache[type];
    }

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
        console.warn(`[AgentAdapterFactory] Unknown agent type "${type}", falling back to "other"`);
        adapter = new OtherAdapter();
    }

    adapterCache[type] = adapter;
    return adapter;
  }

  /** Clear cache (tests / hot reload) */
  static clearCache(): void {
    Object.keys(adapterCache).forEach(key => {
      delete adapterCache[key];
    });
  }
}

export async function executeAgent(
  type: AgentType,
  options: import('./types').ExecuteOptions
): Promise<import('./types').ExecuteResult> {
  const adapter = AgentAdapterFactory.getAdapter(type);
  return adapter.execute(options);
}
