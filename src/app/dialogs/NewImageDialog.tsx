import { useState } from 'react';
import { createBlankProject } from '@/app/editor/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { format, t } from '@/i18n';
import { detectMemoryConfig } from '@/services/platform/deviceTier';
import { useUiStore } from '@/stores/ui';

/** Preset "Tùy chỉnh" (mục 7.3): nhập kích thước ảnh mới, giới hạn theo tier thiết bị (5.11). */
export function NewImageDialog() {
  const open = useUiStore((s) => s.dialog?.kind === 'newImage');
  const closeDialog = useUiStore((s) => s.closeDialog);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
    >
      {open && <NewImageForm onClose={closeDialog} />}
    </Dialog>
  );
}

function parseSide(value: string, max: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
}

function NewImageForm({ onClose }: { onClose: () => void }) {
  const max = detectMemoryConfig().maxDocumentSide;
  const [width, setWidth] = useState('1280');
  const [height, setHeight] = useState('720');
  const w = parseSide(width, max);
  const h = parseSide(height, max);
  const valid = w !== null && h !== null;

  return (
    <DialogContent
      className="sm:max-w-sm"
      closeLabel={t.home.customSize.cancel}
      data-testid="new-image-dialog"
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (w === null || h === null) return;
          onClose();
          void createBlankProject(w, h);
        }}
      >
        <DialogHeader>
          <DialogTitle>{t.home.customSize.title}</DialogTitle>
          <DialogDescription>{format(t.home.customSize.description, { max })}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-sm font-medium">
            {t.home.customSize.width}
            <Input
              autoFocus
              inputMode="numeric"
              data-testid="new-image-width"
              value={width}
              aria-invalid={w === null}
              onChange={(e) => {
                setWidth(e.target.value);
              }}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {t.home.customSize.height}
            <Input
              inputMode="numeric"
              data-testid="new-image-height"
              value={height}
              aria-invalid={h === null}
              onChange={(e) => {
                setHeight(e.target.value);
              }}
            />
          </label>
        </div>
        {!valid && (
          <p className="text-sm text-destructive" role="alert">
            {format(t.home.customSize.invalid, { max })}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t.home.customSize.cancel}
          </Button>
          <Button type="submit" disabled={!valid} data-testid="new-image-create">
            {t.home.customSize.create}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
