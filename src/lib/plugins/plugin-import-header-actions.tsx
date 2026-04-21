'use client';

import type { ImportButtonUI } from '@/types/api';
import { usePlugins } from '@/lib/hooks/use-plugins';
import { LarkImportHeaderButton } from '@/lib/plugins/built-in/lark/import-dialog';
import type { ComponentType } from 'react';

const importHeaderButtonByPluginId: Partial<
  Record<
    string,
    ComponentType<{
      button: ImportButtonUI;
      onImportSuccess: () => void | Promise<void>;
    }>
  >
> = {
  lark: LarkImportHeaderButton,
};

/**
 * 发现已启用导入能力的插件并渲染对应入口按钮；业务页只挂这一处 UI。
 */
export function PluginImportHeaderActions({
  onImportSuccess,
}: {
  onImportSuccess: () => void | Promise<void>;
}) {
  const { importButtons, loading } = usePlugins();

  if (loading) {
    return null;
  }

  return (
    <>
      {importButtons.map((btn) => {
        const Cmp = importHeaderButtonByPluginId[btn.pluginId];
        if (!Cmp) {
          return null;
        }
        return (
          <Cmp key={btn.pluginId} button={btn} onImportSuccess={onImportSuccess} />
        );
      })}
    </>
  );
}
