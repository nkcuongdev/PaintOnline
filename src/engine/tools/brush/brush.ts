import type { Point } from '../../core/types';
import { isAllocationError } from '../../memory/surfaces';
import { colorToCss, opaqueColor, parseColor } from '../../utils/color';
import { commitStroke, paintableLayer, startTileCapture } from '../paint';
import type { TileCapture } from '../../history/tiles';
import type { RasterLayer } from '../../layers/layers';
import type {
  CursorSpec,
  DocPointerEvent,
  OverlayContext,
  PointerSample,
  Tool,
  ToolContext,
  ToolDefinition,
} from '../types';
import { BrushStroke, type BrushStrokeOptions } from './BrushStroke';
import { LazyRope } from './stabilizer';

/** Vòng tròn kích thước brush trên overlay chỉ hiện khi đủ lớn trên màn hình (CSS px). */
const MIN_RING_RADIUS = 3;

interface ActiveStroke {
  stroke: BrushStroke;
  capture: TileCapture;
  layer: RasterLayer;
  opacity: number;
  composite: GlobalCompositeOperation;
  cssColor: string;
  size: number;
  lineMode: boolean;
  last: Point;
  /** Bộ làm mượt dây kéo (null = tắt). */
  rope: LazyRope | null;
  /** Vị trí con trỏ thật (đầu dây) để vẽ sợi dây trên overlay. */
  pointer: Point;
}

/**
 * Brush và Eraser dùng chung một engine (mục 5.5): Eraser là brush ghép bằng
 * `destination-out` khi commit, xem trước qua scratch trong vùng bẩn. Brush có preset tròn, mềm,
 * marker, thư pháp; áp lực bút (chỉ với bút — chuột luôn báo 0,5) và bộ làm mượt dây kéo.
 */
function createBrushLikeTool(ctx: ToolContext, kind: 'brush' | 'eraser'): Tool {
  let active: ActiveStroke | null = null;
  const predicted: PointerSample[] = [];

  const currentSize = () =>
    kind === 'brush' ? ctx.options('brush').size : ctx.options('eraser').size;

  const finish = (commit: boolean) => {
    const a = active;
    if (!a) return;
    active = null;
    predicted.length = 0;
    ctx.setStrokePreview(null);
    let changed = a.stroke.dirtyBounds;
    if (commit && !a.stroke.isEmpty) {
      commitStroke(ctx, {
        label: kind === 'brush' ? 'history.brush' : 'history.eraser',
        layer: a.layer,
        buffer: a.stroke.buffer,
        bounds: a.stroke.dirtyBounds,
        capture: a.capture,
        opacity: a.opacity,
        composite: a.composite,
      });
      changed = a.stroke.dirtyBounds;
    }
    if (!commit || a.stroke.isEmpty) a.capture.discard();
    a.stroke.release();
    ctx.recycleStrokeBuffer(a.stroke.dirtyBounds);
    ctx.invalidate(changed);
    ctx.invalidateOverlay();
  };

  return {
    cursor({ active: dragging }): CursorSpec {
      const radius = (currentSize() / 2) * ctx.viewport.zoom;
      return { css: radius >= MIN_RING_RADIUS || dragging ? 'none' : 'crosshair' };
    },

    onPointerDown(e: DocPointerEvent) {
      if (e.button !== 0 || active) return;
      const layer = paintableLayer(ctx, kind === 'brush' ? 'draw' : 'modify', kind);
      if (!layer) return;

      let opacity: number;
      let cssColor: string;
      let composite: GlobalCompositeOperation;
      let strokeOptions: BrushStrokeOptions;
      let smoothing = 0;
      if (kind === 'brush') {
        // Bản chụp option tại pointerdown: kéo slider giữa chừng không đổi nét đang vẽ.
        const o = ctx.options('brush');
        const color = ctx.colors().primary;
        const hardness = o.preset === 'soft' ? Math.min(o.hardness, 0.99) : o.hardness;
        const usePressure = e.pointerType === 'pen' && (o.pressure.size || o.pressure.opacity);
        const tip =
          o.preset === 'marker' ? 'square' : o.preset === 'calligraphy' ? 'chisel' : 'round';
        const lineMode = tip === 'round' && hardness >= 0.99 && o.flow >= 0.99 && !usePressure;
        opacity = o.opacity * (parseColor(color).a / 255);
        cssColor = colorToCss(opaqueColor(color));
        composite = layer.alphaLocked ? 'source-atop' : 'source-over';
        smoothing = o.smoothing;
        strokeOptions = {
          size: o.size,
          hardness,
          flow: o.flow,
          cssColor,
          mode: lineMode ? 'line' : 'stamp',
          tip,
          pressure: usePressure ? o.pressure : null,
        };
      } else {
        const o = ctx.options('eraser');
        opacity = o.opacity;
        if (layer.alphaLocked) {
          // Khóa trong suốt: tẩy không được làm đổi alpha — tô màu phụ lên chỗ đã có pixel, như
          // tẩy của MS Paint (mục 5.4: source-atop khi commit).
          const secondary = ctx.colors().secondary;
          opacity *= parseColor(secondary).a / 255;
          cssColor = colorToCss(opaqueColor(secondary));
          composite = 'source-atop';
        } else {
          cssColor = 'rgb(0 0 0)';
          composite = 'destination-out';
        }
        strokeOptions = {
          size: o.size,
          hardness: o.hardness,
          flow: 1,
          cssColor,
          mode: o.hardness >= 0.99 ? 'line' : 'stamp',
        };
      }

      try {
        // Bản trước của tile được chụp ngay khi nét chạm tile lần đầu (rải chi phí đọc pixel).
        const capture = startTileCapture(ctx, layer);
        const stroke = new BrushStroke(ctx.memory, ctx.strokeBuffer(), strokeOptions, (rect) => {
          capture.touch(rect);
          ctx.invalidate(rect);
        });
        // Độ dài dây tính theo px màn hình để cảm giác như nhau ở mọi mức zoom.
        const ropeLength = smoothing / ctx.viewport.zoom;
        active = {
          stroke,
          capture,
          layer,
          opacity,
          composite,
          cssColor,
          size: strokeOptions.size,
          lineMode: strokeOptions.mode === 'line',
          last: { x: e.x, y: e.y },
          rope: ropeLength > 0 ? new LazyRope(e, ropeLength) : null,
          pointer: { x: e.x, y: e.y },
        };
        ctx.setStrokePreview({ layerId: layer.id, buffer: stroke.buffer, opacity, composite });
        stroke.begin(e.x, e.y, e.pressure);
      } catch (error) {
        if (!isAllocationError(error)) throw error;
        ctx.notify('memory.refused');
        finish(false);
      }
    },

    onPointerMove(e: DocPointerEvent) {
      const a = active;
      if (!a) return;
      try {
        for (const p of e.points) {
          if (a.rope) {
            if (a.rope.pull(p)) a.stroke.addPoint(a.rope.tip.x, a.rope.tip.y, p.pressure);
          } else {
            a.stroke.addPoint(p.x, p.y, p.pressure);
          }
        }
      } catch (error) {
        if (!isAllocationError(error)) throw error;
        ctx.notify('memory.refused');
        finish(false);
        return;
      }
      a.last = a.rope ? { x: a.rope.tip.x, y: a.rope.tip.y } : { x: e.x, y: e.y };
      a.pointer = { x: e.x, y: e.y };
      predicted.length = 0;
      // Đuôi dự đoán vô nghĩa khi làm mượt (đầu cọ đi sau con trỏ).
      if (!a.rope) {
        for (const p of e.predicted) predicted.push({ x: p.x, y: p.y, pressure: p.pressure });
      }
      ctx.invalidateOverlay();
    },

    onPointerUp() {
      if (!active) return;
      try {
        active.stroke.end();
      } catch (error) {
        if (!isAllocationError(error)) throw error;
        ctx.notify('memory.refused');
        finish(false);
        return;
      }
      finish(true);
    },

    onCancel() {
      finish(false);
    },

    onDeactivate() {
      finish(false);
    },

    renderOverlay({ ctx: o, viewport, hover }: OverlayContext) {
      const a = active;
      // Đuôi nét dự đoán (getPredictedEvents) chỉ vẽ trên overlay để giảm độ trễ cảm nhận.
      if (a?.lineMode && kind === 'brush' && predicted.length > 0) {
        o.save();
        o.lineCap = 'round';
        o.lineJoin = 'round';
        o.strokeStyle = a.cssColor;
        o.globalAlpha = a.opacity;
        o.lineWidth = a.size * viewport.zoom;
        o.beginPath();
        const start = viewport.docToScreen(a.last);
        o.moveTo(start.x, start.y);
        for (const p of predicted) {
          const s = viewport.docToScreen(p);
          o.lineTo(s.x, s.y);
        }
        o.stroke();
        o.restore();
      }

      // Sợi dây của bộ làm mượt: từ con trỏ tới đầu cọ.
      if (a?.rope) {
        const tip = viewport.docToScreen(a.rope.tip);
        const pointer = viewport.docToScreen(a.pointer);
        o.save();
        o.strokeStyle = 'rgb(59 91 219 / 0.8)';
        o.lineWidth = 1.5;
        o.setLineDash([3, 3]);
        o.beginPath();
        o.moveTo(pointer.x, pointer.y);
        o.lineTo(tip.x, tip.y);
        o.stroke();
        o.setLineDash([]);
        o.fillStyle = 'rgb(59 91 219)';
        o.beginPath();
        o.arc(pointer.x, pointer.y, 2.5, 0, Math.PI * 2);
        o.fill();
        o.restore();
      }

      const center = a?.rope ? a.rope.tip : hover;
      if (!center) return;
      const radius = (currentSize() / 2) * viewport.zoom;
      const c = viewport.docToScreen(center);
      if (radius < MIN_RING_RADIUS) return;
      // Vòng kép đen/trắng thấy được trên mọi nền.
      o.save();
      o.lineWidth = 1;
      o.strokeStyle = 'rgb(0 0 0 / 0.75)';
      o.beginPath();
      o.arc(c.x, c.y, radius + 0.5, 0, Math.PI * 2);
      o.stroke();
      o.strokeStyle = 'rgb(255 255 255 / 0.9)';
      o.beginPath();
      o.arc(c.x, c.y, Math.max(0.5, radius - 0.5), 0, Math.PI * 2);
      o.stroke();
      o.fillStyle = 'rgb(0 0 0 / 0.6)';
      o.fillRect(c.x - 0.5, c.y - 0.5, 1, 1);
      o.restore();
    },
  };
}

export const brushTool: ToolDefinition = {
  id: 'brush',
  group: 'draw',
  icon: 'brush',
  labelKey: 'brush',
  shortcut: 'B',
  layerKinds: ['raster'],
  optionGroup: 'brush',
  altEyedropper: true,
  create: (ctx) => createBrushLikeTool(ctx, 'brush'),
};

export const eraserTool: ToolDefinition = {
  id: 'eraser',
  group: 'draw',
  icon: 'eraser',
  labelKey: 'eraser',
  shortcut: 'E',
  layerKinds: ['raster'],
  optionGroup: 'eraser',
  create: (ctx) => createBrushLikeTool(ctx, 'eraser'),
};
