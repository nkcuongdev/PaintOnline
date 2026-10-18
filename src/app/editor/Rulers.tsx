import type { Editor } from '@/engine/core/Editor';
import { t } from '@/i18n';
import { useDocumentStore } from '@/stores/document';
import { RULER_SIZE, rulerTicks } from './rulerTicks';
import { useViewTransform } from './useViewTransform';

function Ruler({
  orientation,
  length,
  zoom,
  offset,
  pointer,
}: {
  orientation: 'horizontal' | 'vertical';
  length: number;
  zoom: number;
  offset: number;
  pointer: number | null;
}) {
  const horizontal = orientation === 'horizontal';
  const ticks = rulerTicks(length, zoom, offset);
  const marker = pointer === null ? null : offset + pointer * zoom;
  return (
    <svg
      aria-hidden="true"
      className="block text-muted-foreground"
      width={horizontal ? length : RULER_SIZE}
      height={horizontal ? RULER_SIZE : length}
    >
      {ticks.map((tick) => {
        const size = tick.major ? RULER_SIZE * 0.55 : RULER_SIZE * 0.25;
        const p = Math.round(tick.pos) + 0.5;
        return (
          <g key={tick.value}>
            {horizontal ? (
              <line x1={p} x2={p} y1={RULER_SIZE - size} y2={RULER_SIZE} stroke="currentColor" />
            ) : (
              <line y1={p} y2={p} x1={RULER_SIZE - size} x2={RULER_SIZE} stroke="currentColor" />
            )}
            {tick.major &&
              (horizontal ? (
                <text x={p + 3} y={9} fontSize={9} fill="currentColor">
                  {tick.value}
                </text>
              ) : (
                <text
                  x={9}
                  y={p + 3}
                  fontSize={9}
                  fill="currentColor"
                  transform={`rotate(-90 9 ${String(p + 3)})`}
                >
                  {tick.value}
                </text>
              ))}
          </g>
        );
      })}
      {marker !== null &&
        marker >= 0 &&
        marker <= length &&
        (horizontal ? (
          <line x1={marker} x2={marker} y1={0} y2={RULER_SIZE} className="stroke-primary" />
        ) : (
          <line y1={marker} y2={marker} x1={0} x2={RULER_SIZE} className="stroke-primary" />
        ))}
    </svg>
  );
}

/**
 * Thước đo (mục 2, P2): vạch theo pixel ảnh dọc cạnh trên và cạnh trái vùng canvas, đánh dấu vị trí
 * con trỏ. Vẽ bằng SVG (không tạo canvas ngoài engine/memory).
 */
export function Rulers({ editor }: { editor: Editor }) {
  const view = useViewTransform(editor);
  const viewport = useDocumentStore((s) => s.viewport);
  const pointer = useDocumentStore((s) => s.pointer);
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]" data-testid="rulers">
      <div
        className="absolute top-0 right-0 left-0 overflow-hidden border-b bg-card/95"
        style={{ height: RULER_SIZE, paddingLeft: RULER_SIZE }}
        title={t.view.rulers}
      >
        <Ruler
          orientation="horizontal"
          length={viewport.width}
          zoom={view.zoom}
          offset={view.panX}
          pointer={pointer?.x ?? null}
        />
      </div>
      <div
        className="absolute top-0 bottom-0 left-0 overflow-hidden border-r bg-card/95"
        style={{ width: RULER_SIZE, paddingTop: RULER_SIZE }}
      >
        <Ruler
          orientation="vertical"
          length={viewport.height}
          zoom={view.zoom}
          offset={view.panY}
          pointer={pointer?.y ?? null}
        />
      </div>
      <div
        className="absolute top-0 left-0 border-r border-b bg-card"
        style={{ width: RULER_SIZE, height: RULER_SIZE }}
      />
    </div>
  );
}
