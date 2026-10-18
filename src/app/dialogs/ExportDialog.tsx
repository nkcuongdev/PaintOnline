import { Download, LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { downloadExport, renderExport } from '@/app/editor/actions';
import type { OpenProject } from '@/app/editor/session';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import type { Color } from '@/engine/core/types';
import { format, t } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  DEFAULT_EXPORT_OPTIONS,
  exportSize,
  formatBytes,
  MAX_EXPORT_SCALE,
  MIN_EXPORT_SCALE,
  type ExportFormat,
  type ImageExportOptions,
} from '@/services/io/exportImage';
import { useUiStore } from '@/stores/ui';

const FORMATS: readonly ExportFormat[] = ['png', 'jpeg', 'webp'];
const PREVIEW_DEBOUNCE_MS = 250;

/** Tùy chọn lần xuất trước (trong phiên). */
let lastOptions: ImageExportOptions = DEFAULT_EXPORT_OPTIONS;

function sameOptions(a: ImageExportOptions, b: ImageExportOptions): boolean {
  return (
    a.format === b.format &&
    a.quality === b.quality &&
    a.scale === b.scale &&
    a.background === b.background &&
    a.selectionOnly === b.selectionOnly &&
    a.beautify === b.beautify
  );
}

interface Rendered {
  options: ImageExportOptions;
  blob: Blob;
  url: string;
}

/**
 * Hộp thoại Export (mục 7.3): PNG/JPG/WebP, chất lượng, scale 0,5×–2×, nền cho JPG, kích thước
 * đầu ra, dung lượng ước lượng (mã hóa thật) và xem trước. Ctrl+Shift+S mở hộp thoại này (7.4).
 * "Chỉ vùng chọn" được thêm khi có vùng chọn (GĐ5); "Gồm khung Làm đẹp" khi document đang bật (GĐ7).
 */
export function ExportDialog({ project }: { project: OpenProject }) {
  const open = useUiStore((s) => s.dialog?.kind === 'export');
  const closeDialog = useUiStore((s) => s.closeDialog);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
    >
      {open && <ExportDialogContent project={project} onClose={closeDialog} />}
    </Dialog>
  );
}

function ExportDialogContent({ project, onClose }: { project: OpenProject; onClose: () => void }) {
  // "Chỉ vùng chọn" chỉ có nghĩa khi đang có vùng chọn (mục 7.3).
  const selection = project.editor.selection.summary;
  const [options, setOptions] = useState<ImageExportOptions>(() => ({
    ...lastOptions,
    selectionOnly: lastOptions.selectionOnly && selection !== null,
  }));
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const doc = project.editor.document;
  const framed = project.editor.beautify.settings;
  const area = options.selectionOnly && selection ? selection.bounds : doc;
  // Khung Làm đẹp không áp khi chỉ xuất vùng chọn.
  const padding =
    framed && options.beautify && !(options.selectionOnly && selection) ? framed.padding : 0;
  const size = exportSize(
    (area?.width ?? 1) + padding * 2,
    (area?.height ?? 1) + padding * 2,
    options.scale,
  );

  const update = (patch: Partial<ImageExportOptions>) => {
    setOptions((prev) => ({ ...prev, ...patch }));
  };

  // Mã hóa thật (debounce) để ước lượng dung lượng và xem trước.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      renderExport(project, options).then(
        (blob) => {
          if (cancelled) return;
          setFailed(false);
          setRendered({ options, blob, url: URL.createObjectURL(blob) });
        },
        () => {
          if (!cancelled) setFailed(true);
        },
      );
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [project, options]);

  // Thu hồi object URL của bản xem trước cũ và khi đóng hộp thoại (mục 10.2).
  useEffect(
    () => () => {
      if (rendered) URL.revokeObjectURL(rendered.url);
    },
    [rendered],
  );

  const current = rendered && sameOptions(rendered.options, options) ? rendered : null;

  const download = async () => {
    setDownloading(true);
    try {
      const blob = current?.blob ?? (await renderExport(project, options));
      lastOptions = options;
      downloadExport(project, blob, options);
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setDownloading(false);
    }
  };

  const qualityPercent = Math.round(options.quality * 100);
  const scaleLabel = useMemo(
    () => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(options.scale)}×`,
    [options.scale],
  );

  return (
    <DialogContent
      className="sm:max-w-2xl"
      closeLabel={t.exportDialog.cancel}
      data-testid="export-dialog"
    >
      <DialogHeader>
        <DialogTitle>{t.exportDialog.title}</DialogTitle>
        <DialogDescription>{t.exportDialog.description}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">{t.exportDialog.format}</legend>
            <div role="radiogroup" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {FORMATS.map((format_) => (
                <button
                  key={format_}
                  type="button"
                  role="radio"
                  aria-checked={options.format === format_}
                  data-testid={`export-format-${format_}`}
                  onClick={() => {
                    update({ format: format_ });
                  }}
                  className={cn(
                    'h-8 rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    options.format === format_
                      ? 'bg-background text-foreground shadow-card'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.exportDialog.formats[format_]}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {t.exportDialog.formatHints[options.format]}
            </p>
          </fieldset>

          {options.format !== 'png' && (
            <LabeledSlider
              label={t.exportDialog.quality}
              value={options.quality}
              display={`${String(qualityPercent)}%`}
              min={0.1}
              max={1}
              step={0.05}
              testId="export-quality"
              onChange={(quality) => {
                update({ quality });
              }}
            />
          )}

          <LabeledSlider
            label={t.exportDialog.scale}
            value={options.scale}
            display={scaleLabel}
            min={MIN_EXPORT_SCALE}
            max={MAX_EXPORT_SCALE}
            step={0.25}
            testId="export-scale"
            onChange={(scale) => {
              update({ scale });
            }}
          />

          {selection && (
            <label className="flex items-center justify-between gap-3 text-sm font-medium">
              {t.exportDialog.selectionOnly}
              <input
                type="checkbox"
                data-testid="export-selection-only"
                checked={options.selectionOnly}
                onChange={(e) => {
                  update({ selectionOnly: e.target.checked });
                }}
                className="size-4 cursor-pointer accent-primary"
              />
            </label>
          )}

          {framed && (
            <label className="flex items-center justify-between gap-3 text-sm font-medium">
              {t.exportDialog.beautify}
              <input
                type="checkbox"
                data-testid="export-beautify"
                checked={options.beautify}
                onChange={(e) => {
                  update({ beautify: e.target.checked });
                }}
                className="size-4 cursor-pointer accent-primary"
              />
            </label>
          )}

          {options.format === 'jpeg' && (
            <label className="flex items-center justify-between gap-3 text-sm font-medium">
              {t.exportDialog.background}
              <input
                type="color"
                data-testid="export-background"
                value={options.background.slice(0, 7).toLowerCase()}
                onChange={(e) => {
                  update({ background: `${e.target.value.toUpperCase()}FF` as Color });
                }}
                className="h-8 w-14 cursor-pointer rounded-md border bg-transparent p-0.5"
              />
            </label>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div
            className="bg-checker flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border"
            aria-label={t.exportDialog.preview}
            role="img"
          >
            {rendered ? (
              <img
                src={rendered.url}
                alt=""
                className={cn(
                  'max-h-full max-w-full object-contain transition-opacity',
                  !current && 'opacity-60',
                )}
              />
            ) : (
              <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="text-sm" data-testid="export-size">
            {format(t.exportDialog.outputSize, size)}
          </p>
          <p
            className="text-sm text-muted-foreground"
            data-testid="export-estimate"
            aria-live="polite"
          >
            {failed
              ? t.exportDialog.estimateFailed
              : current
                ? format(t.exportDialog.estimate, { size: formatBytes(current.blob.size) })
                : t.exportDialog.estimating}
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          {t.exportDialog.cancel}
        </Button>
        <Button
          data-testid="export-download"
          disabled={downloading}
          onClick={() => {
            void download();
          }}
        >
          {downloading ? <LoaderCircle className="animate-spin" /> : <Download />}
          {t.exportDialog.download}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function LabeledSlider({
  label,
  value,
  display,
  min,
  max,
  step,
  testId,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  testId: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">{display}</span>
      </div>
      <Slider
        aria-label={label}
        data-testid={testId}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(values) => {
          const next = values.at(0);
          if (next !== undefined) onChange(Math.round(next * 100) / 100);
        }}
      />
    </div>
  );
}
