'use client';

import { useState, useRef, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import * as LucideIcons from 'lucide-react';
import { Loader2, AlertCircle, HelpCircle, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { ImportButtonUI, LarkField, LarkTable } from '@/types/api';

/** Lark Bitable 向导表单 props */
export type LarkBitableImportFormProps = {
  pluginId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
};

const LARK_PLUGIN_ID = 'lark';

interface SystemField {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

const SYSTEM_FIELDS: SystemField[] = [
  { key: 'input', label: 'Input', required: true, description: 'Test case input/prompt' },
  { key: 'expected_output', label: 'Expected Output', required: true, description: 'Expected answer/output' },
  { key: 'key_points', label: 'Key Points', required: false, description: 'Scoring key points' },
  { key: 'forbidden_points', label: 'Forbidden Points', required: false, description: 'Points that should not appear' },
  { key: 'how', label: 'How', required: false, description: 'Test type/category' },
];

/** Lark/Feishu Bitable 导入向导（仅表单内容；弹层请用 {@link openLarkBitableImportDialog} 命令式挂载）。 */
export function LarkBitableImportForm({
  pluginId,
  onSuccess,
  onCancel,
}: LarkBitableImportFormProps) {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [tables, setTables] = useState<LarkTable[]>([]);
  const [tableFields, setTableFields] = useState<LarkField[]>([]);
  const [appId, setAppId] = useState('');
  const [selectedTableId, setSelectedTableId] = useState('');
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'input' | 'select' | 'mapping'>('input');

  const extractAppIdFromUrl = (url: string): string => {
    const match = url.match(/base\/([a-zA-Z0-9]+)/);
    return match ? match[1] : url.trim();
  };

  const handleAppIdChange = (value: string) => {
    const extracted = extractAppIdFromUrl(value);
    setAppId(extracted);
    setError(null);
  };

  const fetchTables = async () => {
    if (!appId) {
      toast.error('Please enter App ID');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await api.plugins.importTables(pluginId, appId);
      setTables(data.tables || []);
      if (data.tables?.length > 0) {
        setSelectedTableId(data.tables[0].id);
      } else {
        setSelectedTableId('');
      }
      setStep('select');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get table list';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTableFields = async () => {
    if (!appId || !selectedTableId) {
      toast.error('Please select a table');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await api.plugins.importFields(
        pluginId,
        appId,
        selectedTableId,
      );
      setTableFields(data.fields || []);

      const autoMapping: Record<string, string> = {};
      data.fields?.forEach((field: LarkField) => {
        SYSTEM_FIELDS.forEach((sf) => {
          if (
            field.name.toLowerCase() === sf.label.toLowerCase() ||
            field.name.toLowerCase() === sf.key.toLowerCase()
          ) {
            autoMapping[sf.key] = field.name;
          }
        });
      });
      setFieldMapping(autoMapping);
      setStep('mapping');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get field list';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!appId || !selectedTableId) {
      toast.error('Please select a table');
      return;
    }

    const missingRequired = SYSTEM_FIELDS.filter(
      (sf) => sf.required && !fieldMapping[sf.key]
    );
    if (missingRequired.length > 0) {
      toast.error(
        `Please map required fields: ${missingRequired.map((f) => f.label).join(', ')}`
      );
      return;
    }

    setImporting(true);
    try {
      /** 必须走 `/api/test-cases/sync` 落库；`plugins.importTestCases` / `importItems` 只拉数不落库。 */
      const result = await api.testCases.legacySyncToDatabase(pluginId, {
        appToken: appId,
        tableId: selectedTableId,
        columnMapping: fieldMapping,
        syncMode: 'upsert',
        createTestSet: true,
      });

      if (!result.success) {
        const msg =
          result.errors?.length > 0
            ? result.errors.join('; ')
            : 'Import failed';
        toast.error(msg);
        return;
      }

      const { created, updated, skipped } = result.stats;
      const parts = [
        created > 0 ? `${created} created` : null,
        updated > 0 ? `${updated} updated` : null,
        skipped > 0 ? `${skipped} skipped` : null,
      ].filter(Boolean);
      toast.success(
        parts.length > 0
          ? `Sync done: ${parts.join(', ')}`
          : 'Sync completed',
      );
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      toast.error(message);
    } finally {
      setImporting(false);
    }
  };

  const handleBack = () => {
    if (step === 'mapping') {
      setStep('select');
    } else if (step === 'select') {
      setStep('input');
      setTables([]);
      setSelectedTableId('');
    }
    setError(null);
  };

  const getStepTitle = () => {
    switch (step) {
      case 'input':
        return 'Enter Bitable URL';
      case 'select':
        return 'Select Table';
      case 'mapping':
        return 'Map Fields';
      default:
        return 'Import from Lark/Feishu';
    }
  };

  const getStepDescription = () => {
    switch (step) {
      case 'input':
        return 'Enter the Bitable App ID from your multidimensional table URL';
      case 'select':
        return 'Choose a table to import test cases from';
      case 'mapping':
        return 'Map table fields to test case fields';
      default:
        return '';
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{getStepTitle()}</DialogTitle>
        <DialogDescription>{getStepDescription()}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <div>
              <div className="font-medium">Error</div>
              <div>{error}</div>
            </div>
          </div>
        )}

        {step === 'input' && (
          <div className="space-y-2">
            <Label htmlFor="app-id">App ID (Base Token)</Label>
            <Input
              id="app-id"
              placeholder="e.g., BvG2bY5P0aabcdefg123 or paste the full URL"
              value={appId}
              onChange={(e) => handleAppIdChange(e.target.value)}
              disabled={loading}
            />
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <HelpCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div>
                <p>Copy the App ID from your Bitable URL:</p>
                <p className="mt-1 font-mono bg-muted px-1.5 py-0.5 rounded">
                  https://example.feishu.cn/base/<span className="text-primary font-semibold">AbCdEfG123</span>
                </p>
                <p className="mt-1">You can paste the full URL, and we will extract the App ID automatically.</p>
              </div>
            </div>
          </div>
        )}

        {step === 'select' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">App ID:</span>
              <code className="bg-muted px-2 py-0.5 rounded">{appId}</code>
            </div>

            <div className="space-y-2">
              <Label>Select Table</Label>
              <Select
                value={selectedTableId}
                onValueChange={(val) => setSelectedTableId(val || '')}
                disabled={loading || tables.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loading
                        ? 'Loading...'
                        : tables.length === 0
                          ? 'No table available'
                          : 'Select table'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {tables.map((table) => (
                    <SelectItem key={table.id} value={table.id}>
                      {table.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tables.length === 0 && !loading && (
                <p className="text-sm text-muted-foreground">
                  No tables found in this Bitable. Please check the App ID and try again.
                </p>
              )}
            </div>
          </div>
        )}

        {step === 'mapping' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Table:</span>
              <span className="font-medium">
                {tables.find((t) => t.id === selectedTableId)?.name}
              </span>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-medium">Field Mapping</div>
              <p className="text-xs text-muted-foreground">
                Map the table fields to the corresponding test case fields. Auto-mapping has been applied based on field names.
              </p>

              <div className="space-y-3 pt-2">
                {SYSTEM_FIELDS.map((sf) => (
                  <div key={sf.key} className="grid grid-cols-[1fr,1.5fr] gap-3 items-center">
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">
                        {sf.label}
                        {sf.required && <span className="text-destructive ml-1">*</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{sf.description}</div>
                    </div>
                    <Select
                      value={fieldMapping[sf.key] || '__none__'}
                      onValueChange={(value) =>
                        setFieldMapping((prev) => ({
                          ...prev,
                          [sf.key]: value === '__none__' ? '' : (value || ''),
                        }))
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- Not mapped --</SelectItem>
                        {tableFields.map((field) => (
                          <SelectItem key={field.id} value={field.name}>
                            {field.name} ({field.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="gap-2">
        {step !== 'input' && (
          <Button variant="outline" onClick={handleBack} disabled={loading || importing}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        )}
        <Button variant="outline" onClick={onCancel} disabled={loading || importing}>
          Cancel
        </Button>
        {step === 'input' && (
          <Button onClick={fetchTables} disabled={loading || !appId}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Next
          </Button>
        )}
        {step === 'select' && (
          <Button onClick={fetchTableFields} disabled={loading || !selectedTableId}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Next
          </Button>
        )}
        {step === 'mapping' && (
          <Button onClick={handleImport} disabled={importing}>
            {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Import
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

function LarkBitableImportDialogLayer({
  onFinish,
}: {
  onFinish: (result: 'success' | 'cancel') => void;
}) {
  const [open, setOpen] = useState(true);
  const settled = useRef(false);

  const settle = (result: 'success' | 'cancel') => {
    if (settled.current) return;
    settled.current = true;
    setOpen(false);
    queueMicrotask(() => onFinish(result));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) settle('cancel');
      }}
    >
      <DialogContent className="max-w-lg">
        <LarkBitableImportForm
          pluginId={LARK_PLUGIN_ID}
          onSuccess={() => settle('success')}
          onCancel={() => settle('cancel')}
        />
      </DialogContent>
    </Dialog>
  );
}

export type OpenLarkBitableImportOptions = {
  /** 仅当用户完成导入且关闭弹层后调用 */
  onSuccess?: () => void;
};

/**
 * 命令式打开 Lark 导入弹窗：`createRoot` 挂到 `document.body` 下独立节点，页面无需包含任何 Dialog 子树。
 */
export function openLarkBitableImportDialog(
  options?: OpenLarkBitableImportOptions,
): void {
  if (typeof document === 'undefined') return;

  const host = document.createElement('div');
  host.setAttribute('data-lark-bitable-import-root', '');
  document.body.appendChild(host);

  const root = createRoot(host);

  const teardown = (result: 'success' | 'cancel') => {
    root.unmount();
    host.remove();
    if (result === 'success') {
      options?.onSuccess?.();
    }
  };

  root.render(
    <LarkBitableImportDialogLayer
      onFinish={teardown}
    />,
  );
}

/** Discover 的 label/icon + 点击拉起命令式弹窗（与 Lark 插件一体）。 */
export function LarkImportHeaderButton({
  button,
  onImportSuccess,
}: {
  button: ImportButtonUI;
  onImportSuccess: () => void | Promise<void>;
}) {
  const Pack = LucideIcons as unknown as Record<
    string,
    ComponentType<{ className?: string }>
  >;
  const IconComp = Pack[button.icon] ?? LucideIcons.CloudDownload;

  return (
    <Button
      type="button"
      variant={button.variant ?? 'outline'}
      onClick={() => {
        openLarkBitableImportDialog({
          onSuccess: () => {
            void onImportSuccess();
          },
        });
      }}
      style={
        button.color
          ? { borderColor: button.color, color: button.color }
          : undefined
      }
    >
      <IconComp className="h-4 w-4 mr-2" />
      {button.label}
    </Button>
  );
}

