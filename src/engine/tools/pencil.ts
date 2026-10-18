import type { Rect } from '../core/types';
import type { RasterLayer } from '../layers/layers';
import type { TileCapture } from '../history/tiles';
import type { GrowableSurface } from '../memory/GrowableSurface';
import { isAllocationError } from '../memory/surfaces';
import { colorToCss, opaqueColor, parseColor } from '../utils/color';
import { bresenham } from '../utils/geometry';
import { EMPTY_RECT, unionRect } from '../utils/rect';
import { commitStroke, paintableLayer, startTileCapture } from './paint';
import type { DocPointerEvent, Tool, ToolContext, ToolDefinition } from './types';

interface PencilStroke {
  layer: RasterLayer;
  buffer: GrowableSurface;
  bounds: Rect;
  capture: TileCapture;
  opacity: number;
  composite: GlobalCompositeOperation;
  css: string;
  lastX: number;
  lastY: number;
}

/**
 * Pencil 1 px, không khử răng cưa — đúng chất Paint (mục 5.5). Tọa độ làm tròn xuống (floor),
 * các pixel giữa hai mẫu nối bằng Bresenham.
 */
function createPencil(ctx: ToolContext): Tool {
  let active: PencilStroke | null = null;

  const plotLine = (s: PencilStroke, x0: number, y0: number, x1: number, y1: number) => {
    const area = {
      x: Math.min(x0, x1),
      y: Math.min(y0, y1),
      width: Math.abs(x1 - x0) + 1,
      height: Math.abs(y1 - y0) + 1,
    };
    s.capture.touch(area);
    if (!s.buffer.ensure(area)) return;
    const session = s.buffer.begin();
    if (!session) return;
    session.ctx.fillStyle = s.css;
    bresenham(x0, y0, x1, y1, (x, y) => {
      session.ctx.fillRect(x, y, 1, 1);
    });
    session.end();
    s.bounds = unionRect(s.bounds, area);
    ctx.invalidate(area);
  };

  const finish = (commit: boolean) => {
    const s = active;
    if (!s) return;
    active = null;
    ctx.setStrokePreview(null);
    if (!commit || s.bounds.width <= 0) s.capture.discard();
    if (commit && s.bounds.width > 0) {
      commitStroke(ctx, {
        label: 'history.pencil',
        layer: s.layer,
        buffer: s.buffer,
        bounds: s.bounds,
        capture: s.capture,
        opacity: s.opacity,
        composite: s.composite,
      });
    }
    ctx.recycleStrokeBuffer(s.bounds);
    ctx.invalidate(s.bounds);
  };

  const guarded = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      if (!isAllocationError(error)) throw error;
      ctx.notify('memory.refused');
      finish(false);
    }
  };

  return {
    cursor: () => ({ css: 'crosshair' }),

    onPointerDown(e: DocPointerEvent) {
      if (e.button !== 0 || active) return;
      const layer = paintableLayer(ctx, 'draw', 'pencil');
      if (!layer) return;
      const color = ctx.colors().primary;
      const composite: GlobalCompositeOperation = layer.alphaLocked ? 'source-atop' : 'source-over';
      const s: PencilStroke = {
        layer,
        buffer: ctx.strokeBuffer(),
        bounds: { ...EMPTY_RECT },
        capture: startTileCapture(ctx, layer),
        opacity: parseColor(color).a / 255,
        composite,
        css: colorToCss(opaqueColor(color)),
        lastX: Math.floor(e.x),
        lastY: Math.floor(e.y),
      };
      active = s;
      ctx.setStrokePreview({ layerId: layer.id, buffer: s.buffer, opacity: s.opacity, composite });
      guarded(() => {
        plotLine(s, s.lastX, s.lastY, s.lastX, s.lastY);
      });
    },

    onPointerMove(e: DocPointerEvent) {
      const s = active;
      if (!s) return;
      guarded(() => {
        for (const p of e.points) {
          const x = Math.floor(p.x);
          const y = Math.floor(p.y);
          if (x === s.lastX && y === s.lastY) continue;
          plotLine(s, s.lastX, s.lastY, x, y);
          s.lastX = x;
          s.lastY = y;
        }
      });
    },

    onPointerUp() {
      finish(true);
    },

    onCancel() {
      finish(false);
    },

    onDeactivate() {
      finish(false);
    },
  };
}

export const pencilTool: ToolDefinition = {
  id: 'pencil',
  group: 'draw',
  icon: 'pencil',
  labelKey: 'pencil',
  shortcut: 'P',
  layerKinds: ['raster'],
  altEyedropper: true,
  create: createPencil,
};
