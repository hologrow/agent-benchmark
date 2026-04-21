'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LarkImportDialog } from './lark-import-dialog';

// Registry of plugin dialog components
const pluginDialogRegistry: Record<string, React.ComponentType<{
  onSuccess?: () => void;
  onCancel?: () => void;
}>> = {
  'lark-import': LarkImportDialog,
};

interface PluginImportDialogProps {
  pluginId: string;
  pluginName: string;
  componentId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess?: () => void;
}

export function PluginImportDialog({
  pluginId,
  pluginName,
  componentId,
  open,
  onOpenChange,
  onImportSuccess,
}: PluginImportDialogProps) {
  // Get the dialog component from registry
  const DialogComponent = componentId ? pluginDialogRegistry[componentId] : null;

  // If no component found, show fallback
  if (!DialogComponent) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import from {pluginName}</DialogTitle>
            <DialogDescription>
              This plugin does not support UI import
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 text-center text-muted-foreground">
            Please use API to import data
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogComponent
          onSuccess={() => {
            onOpenChange(false);
            onImportSuccess?.();
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
