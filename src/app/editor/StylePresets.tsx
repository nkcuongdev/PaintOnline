import type { Editor } from '@/engine/core/Editor';
import { t } from '@/i18n';
import { applyStylePreset, STYLE_PRESETS, type PresetKind, type StylePreset } from './presets';

/** Hình minh họa nhỏ (28 × 18) của preset. */
function PresetPreview({ preset }: { preset: StylePreset }) {
  const stroke = preset.primary;
  if (preset.kind === 'arrow') {
    const o = preset.options;
    const width = Math.min(3, Math.max(1.5, (o.strokeWidth ?? 4) / 2));
    const dash = o.dashed ? `${String(width * 2.5)} ${String(width * 1.5)}` : undefined;
    const head = (x: number, y: number, dx: number, dy: number) =>
      o.head === 'open' ? (
        <polyline
          points={`${String(x - dx * 6 - dy * 4)},${String(y - dy * 6 + dx * 4)} ${String(x)},${String(y)} ${String(x - dx * 6 + dy * 4)},${String(y - dy * 6 - dx * 4)}`}
          fill="none"
          stroke={stroke}
          strokeWidth={width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <polygon
          points={`${String(x)},${String(y)} ${String(x - dx * 7 - dy * 4)},${String(y - dy * 7 + dx * 4)} ${String(x - dx * 7 + dy * 4)},${String(y - dy * 7 - dx * 4)}`}
          fill={stroke}
        />
      );
    // Hướng đơn vị từ (4, 14) tới (24, 4).
    const len = Math.hypot(20, -10);
    const ux = 20 / len;
    const uy = -10 / len;
    return (
      <svg viewBox="0 0 28 18" className="h-[18px] w-7" aria-hidden="true">
        <line
          x1={4 + (o.bothEnds ? ux * 4 : 0)}
          y1={14 + (o.bothEnds ? uy * 4 : 0)}
          x2={24 - ux * 4}
          y2={4 - uy * 4}
          stroke={stroke}
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray={dash}
        />
        {head(24, 4, ux, uy)}
        {o.bothEnds && head(4, 14, -ux, -uy)}
      </svg>
    );
  }
  if (preset.kind === 'frame') {
    const o = preset.options;
    return (
      <svg viewBox="0 0 28 18" className="h-[18px] w-7" aria-hidden="true">
        <rect
          x={3}
          y={2.5}
          width={22}
          height={13}
          rx={(o.cornerRadius ?? 0) > 0 ? 4 : 0}
          fill={o.fill ? (preset.secondary ?? 'none') : 'none'}
          stroke={stroke}
          strokeWidth={2}
          strokeDasharray={o.dashed ? '4 2.5' : undefined}
        />
      </svg>
    );
  }
  const o = preset.options;
  return (
    <svg viewBox="0 0 28 18" className="h-[18px] w-7" aria-hidden="true">
      {o.background && <rect x={1} y={1} width={26} height={16} rx={3} fill={preset.secondary} />}
      <text
        x={14}
        y={13.5}
        textAnchor="middle"
        fontSize={(o.size ?? 32) >= 40 ? 13 : 11}
        fontWeight={o.weight ?? 600}
        fill={stroke}
        stroke={o.outline ? '#ffffff' : undefined}
        strokeWidth={o.outline ? 2 : undefined}
        paintOrder="stroke"
        fontFamily="Inter Variable, sans-serif"
      >
        Aa
      </text>
    </svg>
  );
}

/** Hàng "Kiểu nhanh" trên Options bar (mũi tên, khung, chữ). */
export function StylePresets({ editor, kind }: { editor: Editor; kind: PresetKind }) {
  return (
    <div
      role="group"
      aria-label={t.toolOptions.stylePresets}
      className="flex items-center gap-1.5"
      data-testid="style-presets"
    >
      <span className="whitespace-nowrap text-muted-foreground">{t.toolOptions.stylePresets}</span>
      <div className="flex rounded-lg bg-muted p-0.5">
        {STYLE_PRESETS[kind].map((preset) => {
          const name = t.presets[preset.label as keyof typeof t.presets];
          return (
            <button
              key={preset.id}
              type="button"
              title={name}
              aria-label={name}
              data-testid={`preset-${preset.id}`}
              onClick={() => {
                applyStylePreset(editor, preset);
              }}
              className="flex h-7 w-9 items-center justify-center rounded-md outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring"
            >
              <PresetPreview preset={preset} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
