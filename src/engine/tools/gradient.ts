import type { Point, Rect } from '../core/types';
import type { TileCapture } from '../history/tiles';
import type { RasterLayer } from '../layers/layers';
import type { GrowableSurface } from '../memory/GrowableSurface';
import { isAllocationError } from '../memory/surfaces';
import { colorToCss, formatColor, parseColor } from '../utils/color';
import { intersectRect, isEmptyRect } from '../utils/rect';
import { commitStroke, paintableLayer, startTileCapture } from './paint';
import type { DocPointerEvent, OverlayContext, Tool, ToolContext, ToolDefinition } from './types';

/** Kéo ngắn hơn (CSS px) coi như click — không tô gì. */
const MIN_DRAG = 3;
const ACCENT = '#3B5BDB';

interface Drag {
  layer: RasterLayer;
  buffer: GrowableSurface;
  capture: TileCapture;
  /** Vùng tô: khung document, hoặc hình bao vùng chọn. */
  area: Rect;
  start: Point;
  end: Point;
  composite: GlobalCompositeOperation;
}

/** Góc bội số 45° khi giữ Shift. */
function snap45(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: start.x + Math.cos(angle) * len, y: start.y + Math.sin(angle) * len };
}

/**
 * Gradient (mục 2, GĐ6 — P2): kéo từ điểm đầu tới điểm cuối, tô màu chính → màu phụ (hoặc → trong
 * suốt), thẳng hoặc tỏa tròn. Vẽ trên stroke buffer nên xem trước như nét vẽ, bị giới hạn trong vùng
 * chọn (mục 5.5) và commit bằng một PaintCommand.
 */
function createGradient(ctx: ToolContext): Tool {
  let drag: Drag | null = null;

  const render = (d: Drag) => {
    const o = ctx.options('gradient');
    const colors = ctx.colors();
    const from = colors.primary;
    const to = o.toTransparent ? formatColor({ ...parseColor(from), a: 0 }) : colors.secondary;
    const session = d.buffer.begin();
    if (!session) return;
    const c = session.ctx;
    const { area, start, end } = d;
    const gradient =
      o.kind === 'radial'
        ? c.createRadialGradient(
            start.x,
            start.y,
            0,
            start.x,
            start.y,
            Math.max(0.5, Math.hypot(end.x - start.x, end.y - start.y)),
          )
        : c.createLinearGradient(start.x, start.y, end.x, end.y);
    gradient.addColorStop(0, colorToCss(from));
    gradient.addColorStop(1, colorToCss(to));
    c.clearRect(area.x, area.y, area.width, area.height);
    c.fillStyle = gradient;
    c.fillRect(area.x, area.y, area.width, area.height);
    session.end();
    ctx.invalidate(area);
  };

  const finish = (commit: boolean) => {
    const d = drag;
    drag = null;
    if (!d) return;
    ctx.setStrokePreview(null);
    const moved = ctx.viewport.zoom * Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y);
    if (commit && moved >= MIN_DRAG) {
      try {
        commitStroke(ctx, {
          label: 'history.gradient',
          layer: d.layer,
          buffer: d.buffer,
          bounds: d.area,
          capture: d.capture,
          opacity: ctx.options('gradient').opacity,
          composite: d.composite,
        });
      } catch (error) {
        if (!isAllocationError(error)) throw error;
        ctx.notify('memory.refused');
      }
    } else {
      d.capture.discard();
    }
    ctx.recycleStrokeBuffer(d.area);
    ctx.invalidate(d.area);
    ctx.invalidateOverlay();
  };

  return {
    cursor: () => ({ css: 'crosshair' }),

    onPointerDown(e: DocPointerEvent) {
      if (e.button !== 0 || drag) return;
      const layer = paintableLayer(ctx, 'draw', 'gradient');
      if (!layer) return;
      const doc = ctx.document;
      const clip = ctx.selection.clip();
      const area = clip ? intersectRect(clip.bounds, doc.bounds) : { ...doc.bounds };
      if (isEmptyRect(area)) return;
      let buffer: GrowableSurface;
      let capture: TileCapture;
      try {
        buffer = ctx.strokeBuffer();
        buffer.ensure(area);
        capture = startTileCapture(ctx, layer);
        capture.touch(area);
      } catch (error) {
        if (!isAllocationError(error)) throw error;
        ctx.notify('memory.refused');
        return;
      }
      const start = { x: e.x, y: e.y };
      drag = {
        layer,
        buffer,
        capture,
        area,
        start,
        end: { ...start },
        composite: layer.alphaLocked ? 'source-atop' : 'source-over',
      };
      ctx.setStrokePreview({
        layerId: layer.id,
        buffer,
        opacity: ctx.options('gradient').opacity,
        composite: drag.composite,
      });
      render(drag);
    },

    onPointerMove(e: DocPointerEvent) {
      if (!drag) return;
      const point = { x: e.x, y: e.y };
      drag.end = e.shiftKey ? snap45(drag.start, point) : point;
      render(drag);
      ctx.invalidateOverlay();
    },

    onPointerUp() {
      finish(true);
    },

    onCancel() {
      finish(false);
    },

    renderOverlay({ ctx: c, viewport }: OverlayContext) {
      if (!drag) return;
      const a = viewport.docToScreen(drag.start);
      const b = viewport.docToScreen(drag.end);
      c.save();
      c.lineWidth = 1.5;
      c.strokeStyle = '#FFFFFF';
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
      c.strokeStyle = ACCENT;
      c.setLineDash([4, 3]);
      c.stroke();
      c.setLineDash([]);
      for (const p of [a, b]) {
        c.beginPath();
        c.arc(p.x, p.y, 4, 0, Math.PI * 2);
        c.fillStyle = '#FFFFFF';
        c.fill();
        c.stroke();
      }
      c.restore();
    },
  };
}

export const gradientTool: ToolDefinition = {
  id: 'gradient',
  group: 'draw',
  icon: 'gradient',
  labelKey: 'gradient',
  shortcut: 'G',
  layerKinds: ['raster'],
  optionGroup: 'gradient',
  altEyedropper: true,
  create: createGradient,
};
