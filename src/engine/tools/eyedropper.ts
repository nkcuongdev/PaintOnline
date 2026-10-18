import type { Color, Point } from '../core/types';
import { formatColor } from '../utils/color';
import type {
  DocPointerEvent,
  HoverEvent,
  OverlayContext,
  Tool,
  ToolContext,
  ToolDefinition,
} from './types';

/** Bán kính vòng xem trước màu quanh con trỏ (CSS px). */
const LOUPE_RADIUS = 22;

/**
 * Eyedropper (mục 2): lấy mẫu ẢNH ĐÃ GHÉP tại pixel dưới con trỏ. Click = màu chính, Shift + click
 * = màu phụ; kéo để xem trước liên tục. Dùng tạm khi giữ Alt ở tool vẽ (phím dự phòng: I — mục 7.7).
 */
function createEyedropper(ctx: ToolContext): Tool {
  let dragging: { slot: 'primary' | 'secondary'; color: Color | null } | null = null;
  let hoverColor: Color | null = null;
  let hoverPoint: Point | null = null;

  const sample = (p: Readonly<Point>): Color | null => {
    const doc = ctx.currentDocument;
    if (!doc) return null;
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return null;
    const data = ctx.readPixels({ x, y, width: 1, height: 1 }).data;
    const a = data[3];
    // Pixel trong suốt hoàn toàn không có màu để lấy.
    if (a === 0) return null;
    return formatColor({ r: data[0], g: data[1], b: data[2], a });
  };

  const pick = (e: DocPointerEvent, transient: boolean) => {
    if (!dragging) return;
    const color = sample(e);
    hoverColor = color;
    hoverPoint = { x: e.x, y: e.y };
    if (color) {
      dragging.color = color;
      ctx.setColor(dragging.slot, color, transient);
    }
    ctx.invalidateOverlay();
  };

  return {
    cursor: () => ({ css: 'crosshair' }),

    onPointerDown(e) {
      if (e.button !== 0) return;
      dragging = { slot: e.shiftKey ? 'secondary' : 'primary', color: null };
      pick(e, true);
    },
    onPointerMove(e) {
      pick(e, true);
    },
    onPointerUp() {
      // Ghi màu cuối cùng vào "màu gần đây".
      if (dragging?.color) ctx.setColor(dragging.slot, dragging.color, false);
      dragging = null;
    },
    onCancel() {
      dragging = null;
    },
    onDeactivate() {
      dragging = null;
      hoverColor = null;
      hoverPoint = null;
    },
    onHover(e: HoverEvent) {
      hoverPoint = { x: e.x, y: e.y };
      hoverColor = sample(e);
      ctx.invalidateOverlay();
    },

    renderOverlay({ ctx: o, viewport, hover }: OverlayContext) {
      const p = hoverPoint ?? hover;
      if (!p || !hover) return;
      const c = viewport.docToScreen(p);
      const current =
        dragging?.slot === 'secondary' ? ctx.colors().secondary : ctx.colors().primary;
      o.save();
      o.lineWidth = 8;
      // Nửa trên: màu đang lấy mẫu; nửa dưới: màu hiện tại.
      o.strokeStyle = hoverColor ? `#${hoverColor.slice(1)}` : 'rgb(127 127 127 / 0.4)';
      o.beginPath();
      o.arc(c.x, c.y, LOUPE_RADIUS, Math.PI, 0);
      o.stroke();
      o.strokeStyle = `#${current.slice(1)}`;
      o.beginPath();
      o.arc(c.x, c.y, LOUPE_RADIUS, 0, Math.PI);
      o.stroke();
      o.lineWidth = 1;
      o.strokeStyle = 'rgb(0 0 0 / 0.5)';
      o.beginPath();
      o.arc(c.x, c.y, LOUPE_RADIUS + 4.5, 0, Math.PI * 2);
      o.stroke();
      o.strokeStyle = 'rgb(255 255 255 / 0.8)';
      o.beginPath();
      o.arc(c.x, c.y, LOUPE_RADIUS - 4.5, 0, Math.PI * 2);
      o.stroke();
      o.restore();
    },
  };
}

export const eyedropperTool: ToolDefinition = {
  id: 'eyedropper',
  group: 'draw',
  icon: 'eyedropper',
  labelKey: 'eyedropper',
  shortcut: 'I',
  layerKinds: ['raster', 'vector'],
  create: createEyedropper,
};
