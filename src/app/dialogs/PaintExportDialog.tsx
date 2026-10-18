import { LoaderCircle, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { exportProjectFile, redactionCount } from '@/app/editor/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { format, t } from '@/i18n';
import { useUiStore } from '@/stores/ui';

/**
 * Xuất bản sao lưu .paint (mục 6.5). File .paint chứa ảnh gốc vì Redact không phá hủy — khi project
 * có Redact, hiện cảnh báo rõ và nút "Áp dụng vĩnh viễn vùng che trước khi xuất" (mục 10.2).
 */
export function PaintExportDialog() {
  const dialog = useUiStore((s) => s.dialog);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const projectId = dialog?.kind === 'paintExport' ? dialog.projectId : null;
  const [redactions, setRedactions] = useState<{ id: string; count: number } | null>(null);
  const [busy, setBusy] = useState(false);

  // Đếm Redact; không có thì xuất ngay, không cần hỏi.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void redactionCount(projectId)
      .catch(() => 0)
      .then(async (count) => {
        if (cancelled) return;
        if (count === 0) {
          closeDialog();
          await exportProjectFile(projectId, { bakeRedactions: false });
          return;
        }
        setRedactions({ id: projectId, count });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, closeDialog]);

  const count = redactions?.id === projectId ? redactions.count : null;
  const run = async (bakeRedactions: boolean) => {
    if (!projectId) return;
    setBusy(true);
    await exportProjectFile(projectId, { bakeRedactions });
    setBusy(false);
    closeDialog();
  };

  return (
    <Dialog
      open={projectId !== null && count !== null}
      onOpenChange={(open) => {
        if (!open) closeDialog();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        closeLabel={t.projectFile.cancel}
        data-testid="paint-export-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-warning" />
            {t.projectFile.redactWarningTitle}
          </DialogTitle>
          <DialogDescription>
            {format(t.projectFile.redactWarningBody, { n: count ?? 0 })}
          </DialogDescription>
        </DialogHeader>
        <button
          type="button"
          autoFocus
          disabled={busy}
          data-testid="paint-export-bake"
          onClick={() => {
            void run(true);
          }}
          className="flex flex-col items-start gap-0.5 rounded-lg border border-primary/40 bg-primary-soft/50 p-3 text-left transition-colors outline-none hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <span className="flex items-center gap-2 font-medium">
            {busy && <LoaderCircle className="size-4 animate-spin" />}
            {t.projectFile.bake}
          </span>
          <span className="text-xs text-muted-foreground">{t.projectFile.bakeHint}</span>
        </button>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={closeDialog}>
            {t.projectFile.cancel}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            data-testid="paint-export-original"
            onClick={() => {
              void run(false);
            }}
          >
            {t.projectFile.keepOriginal}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
