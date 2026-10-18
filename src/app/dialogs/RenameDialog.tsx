import { useState } from 'react';
import { renameProject } from '@/app/editor/session';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { t } from '@/i18n';
import { toast, useUiStore } from '@/stores/ui';

const MAX_NAME = 120;

/** Đổi tên project (trang chủ và editor). */
export function RenameDialog() {
  const dialog = useUiStore((s) => s.dialog);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const target = dialog?.kind === 'rename' ? dialog : null;
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) closeDialog();
      }}
    >
      {target && (
        <RenameForm
          key={target.projectId}
          projectId={target.projectId}
          initial={target.name}
          onClose={closeDialog}
        />
      )}
    </Dialog>
  );
}

function RenameForm({
  projectId,
  initial,
  onClose,
}: {
  projectId: string;
  initial: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const valid = name.trim().length > 0;
  return (
    <DialogContent
      className="sm:max-w-sm"
      closeLabel={t.projects.cancel}
      data-testid="rename-dialog"
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onClose();
          renameProject(projectId, name).catch(() => {
            toast('error', t.projects.actionFailed);
          });
        }}
      >
        <DialogHeader>
          <DialogTitle>{t.projects.renameTitle}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          aria-label={t.projects.renameLabel}
          data-testid="rename-input"
          value={name}
          maxLength={MAX_NAME}
          onFocus={(e) => {
            e.currentTarget.select();
          }}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t.projects.cancel}
          </Button>
          <Button type="submit" disabled={!valid} data-testid="rename-save">
            {t.projects.save}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
