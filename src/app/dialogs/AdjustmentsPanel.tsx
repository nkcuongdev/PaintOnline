import { Check, Eye, RotateCcw, X } from 'lucide-react';
import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { ADJUSTMENTS, defaultSteps } from '@/app/editor/adjustments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import type { Editor } from '@/engine/core/Editor';
import type { FilterStep } from '@/engine/core/types';
import { FILTER_PARAMS, stepParam, type FilterParamSpec } from '@/engine/filters/spec';
import { format, t } from '@/i18n';
import { useDocumentStore } from '@/stores/document';
import { useUiStore } from '@/stores/ui';

/** Bước mới với một tham số đã đổi (giá trị khác giữ nguyên). */
function withParam(
  steps: readonly FilterStep[],
  index: number,
  key: string,
  value: number,
): FilterStep[] {
  return steps.map((step, i) => (i === index ? { ...step, [key]: value } : step));
}

function ParamControl({
  spec,
  testKey,
  label,
  value,
  disabled,
  autoFocus,
  onChange,
}: {
  spec: FilterParamSpec;
  /** `bước-tham số` (vd. `brightness-amount`) cho test. */
  testKey: string;
  label: string;
  value: number;
  disabled: boolean;
  autoFocus: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const unit = t.filters.units[spec.unit];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium">
          {label}
        </label>
        <div className="flex items-center gap-1">
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={value}
            disabled={disabled}
            data-testid={`filter-input-${testKey}`}
            className="h-7 w-[4.5rem] px-2 text-right text-xs tabular-nums"
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (e.currentTarget.value !== '' && Number.isFinite(next)) {
                onChange(Math.min(spec.max, Math.max(spec.min, next)));
              }
            }}
          />
          <span className="w-4 text-xs text-muted-foreground">{unit}</span>
        </div>
      </div>
      <Slider
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={[value]}
        disabled={disabled}
        aria-label={label}
        data-testid={`filter-slider-${testKey}`}
        autoFocus={autoFocus}
        onValueChange={([next]) => {
          onChange(next);
        }}
      />
    </div>
  );
}

/**
 * Bảng điều chỉnh nổi (mục 7.3): không chặn canvas (vẫn zoom, pan được), xem trước trực tiếp khi kéo
 * slider, giữ "So sánh" để xem ảnh gốc, Áp dụng / Hủy. Khi áp dụng: thanh tiến trình và nút Dừng.
 * Tham số là bản sao từ Engine (nguồn sự thật); mỗi thay đổi gọi `editor.filters.update`.
 */
export function AdjustmentsPanel({ editor }: { editor: Editor }) {
  const kind = useUiStore((s) => s.adjustment);
  const state = useDocumentStore((s) => s.filter);
  const hasSelection = useDocumentStore((s) => s.pixelSelection !== null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Đóng bảng thì trả focus về vùng làm việc (phím tắt canvas dùng được ngay).
  const open = kind !== null && state !== null;
  useEffect(() => {
    if (open) return;
    const panel = panelRef.current;
    if (panel?.contains(document.activeElement)) document.getElementById('main')?.focus();
  }, [open]);

  if (!kind || !state) return null;
  const def = ADJUSTMENTS[kind];
  const applying = state.phase === 'applying';
  const steps = state.steps;
  const percent = Math.round(state.progress * 100);
  const title = t.filters.titles[kind];

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      editor.filters.cancel();
    } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && !applying) {
      e.preventDefault();
      e.stopPropagation();
      void editor.filters.apply();
    }
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-testid="adjust-panel"
      onKeyDown={onKeyDown}
      className="surface-glass pointer-events-auto absolute top-32 right-3 z-20 flex w-80 flex-col gap-3 rounded-xl p-3 text-sm shadow-island"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} className="font-semibold">
          {title}
        </h2>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t.filters.cancel}
          data-testid="adjust-close"
          onClick={() => {
            editor.filters.cancel();
          }}
        >
          <X />
        </Button>
      </div>

      {steps.map((step, index) =>
        FILTER_PARAMS[step.id].map((spec, specIndex) => {
          // Focus vào slider đầu tiên khi mở bảng (bàn phím chỉnh được ngay).
          const autoFocus = index === 0 && specIndex === 0;
          const key = `${step.id}.${spec.key}` as keyof typeof t.filters.params;
          return (
            <ParamControl
              key={key}
              spec={spec}
              testKey={`${step.id}-${spec.key}`}
              label={t.filters.params[key]}
              value={stepParam(step, spec.key)}
              disabled={applying}
              autoFocus={autoFocus}
              onChange={(value) => {
                editor.filters.update(withParam(steps, index, spec.key, value));
              }}
            />
          );
        }),
      )}

      {hasSelection && <p className="text-xs text-muted-foreground">{t.filters.selectionNote}</p>}

      {applying ? (
        <div className="flex flex-col gap-2">
          <div
            role="progressbar"
            aria-label={t.filters.applyingLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            data-testid="adjust-progress"
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {format(t.filters.applying, { percent })}
            </span>
            <Button
              size="xs"
              variant="outline"
              data-testid="adjust-stop"
              onClick={() => {
                editor.filters.cancel();
              }}
            >
              {t.filters.stop}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_PARAMS[def.filters[0] ?? 'invert'].length > 0 && (
            <>
              <Button
                size="xs"
                variant={state.comparing ? 'secondary' : 'ghost'}
                aria-pressed={state.comparing}
                title={t.filters.compare}
                data-testid="adjust-compare"
                onPointerDown={() => {
                  editor.filters.compare(true);
                }}
                onPointerUp={() => {
                  editor.filters.compare(false);
                }}
                onPointerLeave={() => {
                  editor.filters.compare(false);
                }}
                onPointerCancel={() => {
                  editor.filters.compare(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    editor.filters.compare(true);
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') editor.filters.compare(false);
                }}
                onBlur={() => {
                  editor.filters.compare(false);
                }}
              >
                <Eye />
                {t.filters.compareShort}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                data-testid="adjust-reset"
                onClick={() => {
                  editor.filters.update(defaultSteps(kind));
                }}
              >
                <RotateCcw />
                {t.filters.reset}
              </Button>
            </>
          )}
          <span className="flex-1" />
          <Button
            size="xs"
            variant="ghost"
            data-testid="adjust-cancel"
            onClick={() => {
              editor.filters.cancel();
            }}
          >
            {t.filters.cancel}
          </Button>
          <Button
            size="xs"
            data-testid="adjust-apply"
            onClick={() => {
              void editor.filters.apply();
            }}
          >
            <Check />
            {t.filters.apply}
          </Button>
        </div>
      )}
    </div>
  );
}
