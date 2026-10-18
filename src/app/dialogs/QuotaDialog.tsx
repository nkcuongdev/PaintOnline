import { Archive, Download, HardDrive, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { retrySave } from '@/app/editor/session';
import { deleteCheckpoints, emptyTrash } from '@/app/projects';
import { navigate } from '@/app/router';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { t } from '@/i18n';
import { useProjectStore } from '@/stores/project';
import { useUiStore } from '@/stores/ui';

/**
 * Hết dung lượng (mục 6.6): autosave dừng, dữ liệu vẫn trong tab. Gợi ý dọn thùng rác, xóa
 * checkpoint, xóa project cũ, tải .paint ngay; autosave tự thử lại khi dung lượng được giải phóng.
 */
export function QuotaDialog({ projectId }: { projectId: string }) {
  const open = useUiStore((s) => s.dialog?.kind === 'quota');
  const openDialog = useUiStore((s) => s.openDialog);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const trashCount = useProjectStore(
    (s) => s.projects.filter((p) => p.deletedAt !== undefined).length,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        closeLabel={t.storage.quotaClose}
        data-testid="quota-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="size-5 text-destructive" />
            {t.storage.quotaTitle}
          </DialogTitle>
          <DialogDescription>{t.storage.quotaBody}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Action
            icon={<Download />}
            label={t.storage.quotaDownload}
            testId="quota-download"
            onClick={() => {
              openDialog({ kind: 'paintExport', projectId });
            }}
          />
          {trashCount > 0 && (
            <Action
              icon={<Trash2 />}
              label={`${t.storage.quotaEmptyTrash} (${String(trashCount)})`}
              testId="quota-empty-trash"
              onClick={() => {
                void emptyTrash().then(retrySave);
              }}
            />
          )}
          <Action
            icon={<Archive />}
            label={t.storage.quotaDeleteCheckpoints}
            testId="quota-delete-checkpoints"
            onClick={() => {
              void deleteCheckpoints().then(retrySave);
            }}
          />
          <Action
            icon={<HardDrive />}
            label={t.storage.quotaManage}
            testId="quota-manage"
            onClick={() => {
              closeDialog();
              navigate({ name: 'home' });
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={closeDialog}>
            {t.storage.quotaClose}
          </Button>
          <Button
            data-testid="quota-retry"
            onClick={() => {
              closeDialog();
              retrySave();
            }}
          >
            {t.storage.retry}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Action({
  icon,
  label,
  testId,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg border p-3 text-left text-sm font-medium transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:text-muted-foreground"
    >
      {icon}
      {label}
    </button>
  );
}
