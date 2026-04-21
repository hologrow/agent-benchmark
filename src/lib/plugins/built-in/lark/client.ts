'use client';

/**
 * Lark 插件（默认运行在浏览器）：通过 {@link PluginHostContext} 落库，编排「API 拉数 → 宿主持久化」。
 * Node 侧 Bitable 能力见同目录 `index.ts`（LarkPlugin）与 `bitable.ts`。
 */

import { api } from '@/lib/api';
import type { SyncTestCasesToDatabaseInput } from '@/lib/plugins/types';
import type { PluginHostContext } from '@/lib/plugins/host';
import { createBrowserPluginHostContext } from '@/lib/plugins/host/browser';

const PLUGIN_ID = 'lark';

export class LarkClientRuntime {
  constructor(private readonly host: PluginHostContext) {}

  /** 服务端 `persist: false` 拉数，再经宿主写入。 */
  async syncTable(
    input: SyncTestCasesToDatabaseInput,
    pluginId: string = PLUGIN_ID,
  ) {
    const { fetchResult } = await api.testCases.legacySyncFetchOnly(
      pluginId,
      input,
    );
    return this.host.externalTableSync.persistAfterFetch(input, fetchResult);
  }
}

/** 默认使用浏览器宿主；单测或定制可传入自构 {@link PluginHostContext}。 */
export function createLarkClientRuntime(host?: PluginHostContext) {
  return new LarkClientRuntime(host ?? createBrowserPluginHostContext());
}
