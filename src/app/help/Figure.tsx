import { Expand } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { format, t } from '@/i18n';
import { cn } from '@/lib/utils';
import { Inline } from './inline';
import { shotBox, shotInfo, shotUrl, SHOTS_VERSION } from './shots';
import type { FigureBlock, Marker } from './types';

type Box = readonly [x: number, y: number, w: number, h: number];

function markerBox(shot: string, marker: Marker): Box | null {
  if (marker.target) return shotBox(shot, marker.target);
  if (marker.at) return [marker.at[0], marker.at[1], 0, 0];
  return null;
}

const pct = (v: number) => `${String(v * 100)}%`;
/** Giữ số đánh dấu trong ảnh khi vùng nằm sát mép. */
const clamp = (v: number) => Math.min(0.975, Math.max(0.025, v));

/** Ảnh và các điểm đánh số chồng lên (tọa độ tỉ lệ theo ảnh nên đúng ở mọi kích thước). */
function Annotated({
  figure,
  className,
  large = false,
}: {
  figure: FigureBlock;
  className?: string;
  large?: boolean;
}) {
  const info = shotInfo(figure.shot);
  const markers = figure.markers ?? [];
  return (
    <div className={cn('relative', className)}>
      <img
        src={shotUrl(figure.shot)}
        width={info?.w}
        height={info?.h}
        alt={figure.caption ? '' : figure.shot}
        loading={large ? 'eager' : 'lazy'}
        decoding="async"
        className="block h-auto w-full select-none"
        draggable={false}
      />
      {markers.map((marker, index) => {
        const box = markerBox(figure.shot, marker);
        if (!box) return null;
        const [x, y, w, h] = box;
        const point = w === 0 && h === 0;
        // Vùng nhỏ (nút, ô nhập): khung viền quanh vùng, số ở góc trên bên phải để không che nút.
        // Vùng lớn (khung vẽ, bảng): số ở giữa vùng.
        const small = !point && w < 0.16 && h < 0.16;
        const ring = !point && (marker.outline === true || small);
        const badge = point
          ? { left: x, top: y }
          : ring
            ? { left: clamp(x + w), top: clamp(y) }
            : { left: x + w / 2, top: y + h / 2 };
        return (
          <div key={index} aria-hidden="true">
            {ring && (
              <span
                className="pointer-events-none absolute rounded-[5px] ring-2 ring-[#f03e3e]/90"
                style={{ left: pct(x), top: pct(y), width: pct(w), height: pct(h) }}
              />
            )}
            <span
              className={cn(
                'pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#f03e3e] font-semibold text-white shadow-[0_0_0_2px_#fff,0_2px_6px_rgb(0_0_0/0.35)]',
                large ? 'size-7 text-sm' : 'size-5 text-[0.6875rem] sm:size-6 sm:text-xs',
              )}
              style={{ left: pct(badge.left), top: pct(badge.top) }}
            >
              {index + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const SIZES = { full: 'w-full', medium: 'w-full lg:w-[78%]', small: 'w-full sm:w-[55%]' };

/** Ảnh minh họa chụp từ app thật (script `npm run guide:shots`), kèm chú thích đánh số. */
export function Figure({ figure }: { figure: FigureBlock }) {
  const [zoomed, setZoomed] = useState(false);
  const markers = figure.markers ?? [];
  return (
    <figure className={cn('my-6', SIZES[figure.size ?? 'full'])} data-help-shot={figure.shot}>
      <button
        type="button"
        onClick={() => {
          setZoomed(true);
        }}
        aria-label={t.help.figureZoom}
        className="group relative block w-full cursor-zoom-in overflow-hidden rounded-xl border bg-workspace text-left shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Annotated figure={figure} />
        <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md bg-background/85 text-muted-foreground opacity-0 shadow-card transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Expand className="size-4" />
        </span>
      </button>
      {(figure.caption !== undefined || markers.length > 0) && (
        <figcaption className="mt-2.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
          {figure.caption && (
            <p>
              <Inline text={figure.caption} />
            </p>
          )}
          {markers.length > 0 && (
            <ol
              aria-label={t.help.markersLabel}
              className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2"
            >
              {markers.map((marker, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-[#f03e3e] text-[0.6875rem] font-semibold text-white">
                    {index + 1}
                  </span>
                  <span className="text-foreground/85">
                    <Inline text={marker.label} />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </figcaption>
      )}
      <Dialog open={zoomed} onOpenChange={setZoomed}>
        <DialogContent
          closeLabel={t.actions.close}
          className="max-h-[94vh] w-[min(96vw,1600px)] max-w-none gap-2 overflow-y-auto p-3 sm:max-w-none"
        >
          <DialogTitle className="pr-8 text-sm font-medium">
            {figure.caption ? <Inline text={figure.caption} /> : t.help.figureZoom}
          </DialogTitle>
          <div className="overflow-hidden rounded-lg border">
            <Annotated figure={figure} large />
          </div>
          <p className="text-xs text-muted-foreground">
            {format(t.help.figureNote, { version: SHOTS_VERSION })}
          </p>
        </DialogContent>
      </Dialog>
    </figure>
  );
}
