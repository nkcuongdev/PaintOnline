import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Dot,
  Link2,
  Link2Off,
} from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import type { Editor } from '@/engine/core/Editor';
import type { ResampleQuality } from '@/engine/core/types';
import type { CanvasAnchor } from '@/engine/document/ImageOps';
import { format, t } from '@/i18n';
import { cn } from '@/lib/utils';
import { detectMemoryConfig } from '@/services/platform/deviceTier';
import { useDocumentStore } from '@/stores/document';
import { useUiStore } from '@/stores/ui';

/**
 * Hộp thoại Resize và Canvas size (mục 7.3): ổ khóa tỉ lệ, đơn vị px hoặc %, thuật toán resample;
 * neo 9 hướng cho Canvas size. Giới hạn kích thước theo tier thiết bị (mục 5.11).
 */

function parsePositive(value: string): number | null {
  const n = Number(value.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Kích thước hợp lệ theo giới hạn thiết bị; null nếu vượt. */
function fits(width: number, height: number): boolean {
  const memory = detectMemoryConfig();
  return (
    width >= 1 &&
    height >= 1 &&
    width <= memory.maxDocumentSide &&
    height <= memory.maxDocumentSide &&
    width * height <= memory.maxDocumentPixels
  );
}

function limitMessage(): string {
  const memory = detectMemoryConfig();
  return format(t.resizeDialog.tooLarge, {
    side: memory.maxDocumentSide,
    megapixels: Math.round(memory.maxDocumentPixels / 1e6),
  });
}

function useDialog(kind: 'resizeImage' | 'canvasSize') {
  const open = useUiStore((s) => s.dialog?.kind === kind);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const doc = useDocumentStore((s) => s.doc);
  return { open, closeDialog, doc };
}

function NumberField({
  label,
  value,
  invalid,
  testId,
  autoFocus,
  onChange,
}: {
  label: string;
  value: string;
  invalid: boolean;
  testId: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <Input
        autoFocus={autoFocus}
        inputMode="decimal"
        data-testid={testId}
        value={value}
        aria-invalid={invalid}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </label>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  testId: string;
}) {
  return (
    <div className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-1" data-testid={testId}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => {
              onChange(o.value);
            }}
            className={cn(
              'h-8 flex-1 rounded-md border px-2 text-sm font-normal outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
              value === o.value && 'border-primary bg-primary-soft text-primary-soft-foreground',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resize ảnh
// ---------------------------------------------------------------------------

export function ResizeImageDialog({ editor }: { editor: Editor }) {
  const { open, closeDialog, doc } = useDialog('resizeImage');
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
    >
      {open && doc && (
        <ResizeForm editor={editor} width={doc.width} height={doc.height} onClose={closeDialog} />
      )}
    </Dialog>
  );
}

function ResizeForm({
  editor,
  width,
  height,
  onClose,
}: {
  editor: Editor;
  width: number;
  height: number;
  onClose: () => void;
}) {
  const [unit, setUnit] = useState<'px' | 'percent'>('px');
  const [keepRatio, setKeepRatio] = useState(true);
  const [w, setW] = useState(String(width));
  const [h, setH] = useState(String(height));
  const [quality, setQuality] = useState<ResampleQuality>('smooth');

  const toPx = (value: number | null, base: number) =>
    value === null ? null : Math.max(1, Math.round(unit === 'px' ? value : (base * value) / 100));
  const pw = toPx(parsePositive(w), width);
  const ph = toPx(parsePositive(h), height);
  const valid = pw !== null && ph !== null && fits(pw, ph);

  const format2 = (n: number) => String(Math.round(n * 100) / 100);
  const changeWidth = (value: string) => {
    setW(value);
    const n = parsePositive(value);
    if (!keepRatio || n === null) return;
    setH(unit === 'px' ? String(Math.max(1, Math.round((n * height) / width))) : format2(n));
  };
  const changeHeight = (value: string) => {
    setH(value);
    const n = parsePositive(value);
    if (!keepRatio || n === null) return;
    setW(unit === 'px' ? String(Math.max(1, Math.round((n * width) / height))) : format2(n));
  };
  const changeUnit = (next: 'px' | 'percent') => {
    if (next === unit) return;
    setUnit(next);
    if (next === 'percent') {
      setW(format2(((pw ?? width) / width) * 100));
      setH(format2(((ph ?? height) / height) * 100));
    } else {
      setW(String(pw ?? width));
      setH(String(ph ?? height));
    }
  };

  return (
    <DialogContent
      className="sm:max-w-sm"
      closeLabel={t.resizeDialog.cancel}
      data-testid="resize-dialog"
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onClose();
          void editor.image.resize(pw, ph, quality);
        }}
      >
        <DialogHeader>
          <DialogTitle>{t.resizeDialog.title}</DialogTitle>
          <DialogDescription>{t.resizeDialog.description}</DialogDescription>
        </DialogHeader>
        <Segmented
          label={t.resizeDialog.unit}
          value={unit}
          testId="resize-unit"
          options={[
            { value: 'px', label: t.resizeDialog.pixels },
            { value: 'percent', label: t.resizeDialog.percent },
          ]}
          onChange={changeUnit}
        />
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <NumberField
            autoFocus
            label={t.resizeDialog.width}
            value={w}
            invalid={pw === null}
            testId="resize-width"
            onChange={changeWidth}
          />
          <Button
            type="button"
            variant={keepRatio ? 'secondary' : 'ghost'}
            size="icon"
            aria-label={t.resizeDialog.keepRatio}
            aria-pressed={keepRatio}
            data-testid="resize-keep-ratio"
            onClick={() => {
              setKeepRatio(!keepRatio);
            }}
          >
            {keepRatio ? <Link2 /> : <Link2Off />}
          </Button>
          <NumberField
            label={t.resizeDialog.height}
            value={h}
            invalid={ph === null}
            testId="resize-height"
            onChange={changeHeight}
          />
        </div>
        <Segmented
          label={t.resizeDialog.resample}
          value={quality}
          testId="resize-quality"
          options={[
            { value: 'smooth', label: t.resizeDialog.smooth },
            { value: 'pixelated', label: t.resizeDialog.pixelated },
          ]}
          onChange={setQuality}
        />
        <p
          className={cn('text-sm', valid ? 'text-muted-foreground' : 'text-destructive')}
          role={valid ? undefined : 'alert'}
          data-testid="resize-result"
        >
          {valid ? format(t.resizeDialog.result, { width: pw, height: ph }) : limitMessage()}
        </p>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t.resizeDialog.cancel}
          </Button>
          <Button type="submit" disabled={!valid} data-testid="resize-apply">
            {t.resizeDialog.apply}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// ---------------------------------------------------------------------------
// Canvas size
// ---------------------------------------------------------------------------

const ANCHORS: readonly { value: CanvasAnchor; icon: ReactNode }[] = [
  { value: 'nw', icon: <ArrowUpLeft /> },
  { value: 'n', icon: <ArrowUp /> },
  { value: 'ne', icon: <ArrowUpRight /> },
  { value: 'w', icon: <ArrowLeft /> },
  { value: 'center', icon: <Dot /> },
  { value: 'e', icon: <ArrowRight /> },
  { value: 'sw', icon: <ArrowDownLeft /> },
  { value: 's', icon: <ArrowDown /> },
  { value: 'se', icon: <ArrowDownRight /> },
];

export function CanvasSizeDialog({ editor }: { editor: Editor }) {
  const { open, closeDialog, doc } = useDialog('canvasSize');
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
    >
      {open && doc && (
        <CanvasForm editor={editor} width={doc.width} height={doc.height} onClose={closeDialog} />
      )}
    </Dialog>
  );
}

function CanvasForm({
  editor,
  width,
  height,
  onClose,
}: {
  editor: Editor;
  width: number;
  height: number;
  onClose: () => void;
}) {
  const [w, setW] = useState(String(width));
  const [h, setH] = useState(String(height));
  const [anchor, setAnchor] = useState<CanvasAnchor>('center');
  const pw = parsePositive(w);
  const ph = parsePositive(h);
  const iw = pw === null ? null : Math.round(pw);
  const ih = ph === null ? null : Math.round(ph);
  const valid = iw !== null && ih !== null && fits(iw, ih);

  return (
    <DialogContent
      className="sm:max-w-sm"
      closeLabel={t.resizeDialog.cancel}
      data-testid="canvas-dialog"
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onClose();
          void editor.image.canvasSize(iw, ih, anchor);
        }}
      >
        <DialogHeader>
          <DialogTitle>{t.canvasDialog.title}</DialogTitle>
          <DialogDescription>{t.canvasDialog.description}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            autoFocus
            label={`${t.resizeDialog.width} (px)`}
            value={w}
            invalid={iw === null}
            testId="canvas-width"
            onChange={setW}
          />
          <NumberField
            label={`${t.resizeDialog.height} (px)`}
            value={h}
            invalid={ih === null}
            testId="canvas-height"
            onChange={setH}
          />
        </div>
        <div className="grid gap-1.5 text-sm font-medium">
          <span id="canvas-anchor-label">{t.canvasDialog.anchor}</span>
          <div
            role="radiogroup"
            aria-labelledby="canvas-anchor-label"
            className="grid w-fit grid-cols-3 gap-1"
            data-testid="canvas-anchor"
          >
            {ANCHORS.map((a) => (
              <button
                key={a.value}
                type="button"
                role="radio"
                aria-checked={anchor === a.value}
                aria-label={t.canvasDialog.anchors[a.value]}
                data-testid={`canvas-anchor-${a.value}`}
                onClick={() => {
                  setAnchor(a.value);
                }}
                className={cn(
                  'flex size-9 items-center justify-center rounded-md border text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4',
                  anchor === a.value &&
                    'border-primary bg-primary-soft text-primary-soft-foreground',
                )}
              >
                {a.icon}
              </button>
            ))}
          </div>
        </div>
        <p
          className={cn('text-sm', valid ? 'text-muted-foreground' : 'text-destructive')}
          role={valid ? undefined : 'alert'}
        >
          {valid ? format(t.resizeDialog.result, { width: iw, height: ih }) : limitMessage()}
        </p>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t.resizeDialog.cancel}
          </Button>
          <Button type="submit" disabled={!valid} data-testid="canvas-apply">
            {t.canvasDialog.apply}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
