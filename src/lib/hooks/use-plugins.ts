'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { ImportButtonUI } from '@/types/api';

export type { ImportButtonUI };

export function usePlugins() {
  const [importButtons, setImportButtons] = useState<ImportButtonUI[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPluginCapabilities();
  }, []);

  const fetchPluginCapabilities = async () => {
    try {
      const data = await api.plugins.discover();
      setImportButtons(data.capabilities?.importTestCases || []);
    } catch (error) {
      console.error('Error fetching plugin capabilities:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    importButtons,
    loading,
    refresh: fetchPluginCapabilities,
  };
}
