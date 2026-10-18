import { Layers, Plus, Stamp } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { settings } from '@/app/storage';
import type { Editor } from '@/engine/core/Editor';
import type { PaintTargetChoice } from '@/engine/core/types';
import { format, t } from '@/i18n';
import { useUiStore } from '@/stores/ui';

const CHOICE_ICONS: Readonly<Record<PaintTargetChoice, ReactNode>> = {
  'new-layer': <Plus />,
  'layer-below': <Layers />,
  rasterize: <Stamp />,
};

/**
 * Dùng tool pixel trên layer chú thích (mục 5.3): hỏi vẽ trên layer mới / dùng layer ảnh bên dưới
 * / rasterize, có tùy chọn nhớ lựa chọn. Lựa chọn được thực hiện ngay; người dùng vẽ lại nét.
 */
export function PaintTargetDialog({ editor }: { editor: Editor }) {
  const request = useUiStore((s) => s.paintTargetRequest);
  const setRequest = useUiStore((s) => s.setPaintTargetRequest);
  const [remember, setRemember] = useState(false);

  const close = () => {
    setRequest(null);
    setRemember(false);
  };

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        closeLabel={t.paintTarget.cancel}
        data-testid="paint-target-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t.paintTarget.title}</DialogTitle>
          <DialogDescription>
            {request ? format(t.paintTarget.body, { tool: t.tools[request.tool] }) : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {request?.choices.map((choice, index) => (
            <button
              key={choice}
              type="button"
              autoFocus={index === 0}
              data-testid={`paint-target-${choice}`}
              onClick={() => {
                const kind = request.kind;
                close();
                editor.layers.choosePaintTarget(kind, choice, remember);
                // Lựa chọn đã nhớ được lưu cùng cài đặt (dùng cho các phiên sau).
                if (remember) settings.update({ paintPolicy: { ...editor.layers.paintPolicy } });
              }}
              className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
            >
              {CHOICE_ICONS[choice]}
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{t.paintTarget[choice]}</span>
                <span className="text-xs text-muted-foreground">
                  {t.paintTarget[`${choice}Hint`]}
                </span>
              </span>
            </button>
          ))}
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remember}
              data-testid="paint-target-remember"
              onChange={(e) => {
                setRemember(e.target.checked);
              }}
              className="size-4 accent-primary"
            />
            {t.paintTarget.remember}
          </label>
          <Button variant="ghost" onClick={close}>
            {t.paintTarget.cancel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
