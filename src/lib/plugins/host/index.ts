/**
 * 插件宿主：应用向插件注入能力的统一入口。
 * - 服务端：`createServerPluginHostContext`
 * - 浏览器：从 `./browser` 单独导入（避免服务端打包进 client 组件）
 */

export type {
  PluginHostContext,
  TestCasePersistencePort,
} from './types';
export { createServerPluginHostContext } from './server';
export { applyExternalTableSyncWithPersistence } from './apply-external-sync';
