import type { Point, Rect, TextObject } from '../../core/types';
import { rectFromPoints } from '../../layers/objects/geometry';
import { textOutline } from '../../layers/objects/style';
import type {
  DocPointerEvent,
  HoverEvent,
  OverlayContext,
  Tool,
  ToolContext,
  ToolDefinition,
} from '../types';
import { beginSelectionDrag, selectionHoverCursor, type SelectionDrag } from '../selection';
import { beginObjectDrag, hoverCursor, type ObjectDrag } from './drag';

const DOUBLE_CLICK_MS = 400;
const DOUBLE_CLICK_RADIUS = 5;
/** Kéo rộng hơn ngưỡng này (CSS px) khi tạo chữ thì tạo khung chữ có độ rộng cố định. */
const BOX_THRESHOLD = 8;
const LINE_HEIGHT = 1.25;

/** Phát hiện double-click từ chuỗi pointerdown (DocPointerEvent không có `detail`). */
function doubleClickDetector() {
  let last = { t: -Infinity, x: 0, y: 0 };
  return (e: DocPointerEvent): boolean => {
    const isDouble =
      e.timeStamp - last.t < DOUBLE_CLICK_MS &&
      Math.hypot(e.screenX - last.x, e.screenY - last.y) <= DOUBLE_CLICK_RADIUS;
    last = isDouble ? { t: -Infinity, x: 0, y: 0 } : { t: e.timeStamp, x: e.screenX, y: e.screenY };
    return isDouble;
  };
}

function drawBand(
  overlay: OverlayContext,
  band: { a: Point; b: Point } | null,
  dashed: boolean,
): void {
  if (!band) return;
  const { ctx: o, viewport } = overlay;
  const a = viewport.docToScreen(band.a);
  const b = viewport.docToScreen(band.b);
  o.save();
  o.fillStyle = 'rgb(59 91 219 / 0.08)';
  o.strokeStyle = 'rgb(59 91 219 / 0.9)';
  o.lineWidth = 1;
  o.setLineDash(dashed ? [4, 3] : []);
  const r = rectFromPoints(a, b);
  o.fillRect(r.x, r.y, r.width, r.height);
  o.strokeRect(r.x + 0.5, r.y + 0.5, r.width, r.height);
  o.restore();
}

// ---------------------------------------------------------------------------
// Select (V): chọn, di chuyển, đổi kích thước, xoay đối tượng; kéo khung để chọn nhiều
// ---------------------------------------------------------------------------

function createSelectTool(ctx: ToolContext): Tool {
  let drag: ObjectDrag | SelectionDrag | null = null;
  let band: { a: Point; b: Point; additive: boolean } | null = null;
  let cursor = 'default';
  const isDouble = doubleClickDetector();

  return {
    cursor: () => ({ css: drag?.cursor ?? cursor }),

    onHover(e: HoverEvent) {
      // Pixel nổi nằm trên cùng; sau đó tới đối tượng vector, rồi vùng chọn pixel (V = chọn/di chuyển).
      const floating = ctx.selection.floating ? selectionHoverCursor(ctx, e, false) : null;
      const next =
        floating ??
        hoverCursor(ctx, { x: e.screenX, y: e.screenY }, e, true) ??
        selectionHoverCursor(ctx, e, true) ??
        'default';
      if (next !== cursor) {
        cursor = next;
        ctx.refreshCursor();
      }
    },

    onPointerDown(e) {
      if (e.button !== 0 || drag || band) return;
      if (isDouble(e)) {
        // Double-click vào chữ: sửa chữ.
        const hit = ctx.objects.hitTest(e);
        if (hit?.object.type === 'text') {
          ctx.text.begin(hit.object, hit.object.id);
          return;
        }
      }
      if (ctx.selection.floating) {
        drag = beginSelectionDrag(ctx, e, false);
        if (drag) return;
        // Click ra ngoài pixel nổi: commit (mục 5.7).
        ctx.selection.commitFloating();
      }
      drag = beginObjectDrag(ctx, e, { selectOnHit: true });
      if (drag) return;
      drag = beginSelectionDrag(ctx, e, !e.shiftKey);
      if (drag) return;
      if (!e.shiftKey) ctx.objects.clearSelection();
      band = { a: { x: e.x, y: e.y }, b: { x: e.x, y: e.y }, additive: e.shiftKey };
    },

    onPointerMove(e) {
      if (drag) {
        drag.move(e);
        return;
      }
      if (!band) return;
      band.b = { x: e.x, y: e.y };
      ctx.invalidateOverlay();
    },

    onPointerUp() {
      if (drag) {
        drag.end();
        drag = null;
        return;
      }
      const b = band;
      band = null;
      ctx.invalidateOverlay();
      if (!b) return;
      const rect: Rect = rectFromPoints(b.a, b.b);
      if (rect.width * ctx.viewport.zoom < 2 && rect.height * ctx.viewport.zoom < 2) return;
      const ids = ctx.objects.objectsInRect(rect);
      ctx.objects.select(b.additive ? [...ctx.objects.selection, ...ids] : ids);
    },

    onCancel() {
      drag?.cancel();
      drag = null;
      band = null;
      ctx.invalidateOverlay();
    },

    onDeactivate() {
      drag?.cancel();
      drag = null;
      band = null;
    },

    renderOverlay(overlay) {
      ctx.objects.renderOverlay(overlay);
      drawBand(overlay, band, true);
    },
  };
}

// ---------------------------------------------------------------------------
// Text (T): click = chữ một dòng tự giãn; kéo khung = chữ tự xuống dòng theo độ rộng khung
// ---------------------------------------------------------------------------

/** Chữ mới theo option hiện tại: màu chữ = màu chính, nền = màu phụ (ADR 0019). */
export function newTextObject(
  ctx: ToolContext,
  origin: Point,
  wrapWidth: number | null,
): TextObject {
  const o = ctx.options('text');
  const colors = ctx.colors();
  return {
    id: crypto.randomUUID(),
    type: 'text',
    rotation: 0,
    opacity: 1,
    origin,
    wrapWidth,
    text: '',
    font: { family: o.family, size: o.size, weight: o.weight, italic: o.italic },
    align: o.align,
    lineHeight: LINE_HEIGHT,
    color: colors.primary,
    background: o.background ? colors.secondary : undefined,
    outline: o.outline ? textOutline(colors.primary, o.size) : undefined,
  };
}

function createTextTool(ctx: ToolContext): Tool {
  let drag: ObjectDrag | null = null;
  let creating: { a: Point; b: Point; startScreen: Point; endScreen: Point } | null = null;
  let cursor = 'text';

  return {
    cursor: () => ({ css: drag?.cursor ?? cursor }),

    onHover(e) {
      const next = hoverCursor(ctx, { x: e.screenX, y: e.screenY }, e, false) ?? 'text';
      if (next !== cursor) {
        cursor = next;
        ctx.refreshCursor();
      }
    },

    onPointerDown(e) {
      if (e.button !== 0 || drag || creating) return;
      // Click ra ngoài khi đang gõ: chỉ kết thúc phiên sửa.
      if (ctx.text.active) {
        ctx.text.commit(ctx.text.current?.object.text ?? '');
        return;
      }
      drag = beginObjectDrag(ctx, e, { selectOnHit: false });
      if (drag) return;
      const hit = ctx.objects.hitTest(e);
      if (hit?.object.type === 'text') {
        ctx.text.begin(hit.object, hit.object.id);
        return;
      }
      const screen = { x: e.screenX, y: e.screenY };
      creating = {
        a: { x: e.x, y: e.y },
        b: { x: e.x, y: e.y },
        startScreen: screen,
        endScreen: screen,
      };
    },

    onPointerMove(e) {
      if (drag) {
        drag.move(e);
        return;
      }
      if (!creating) return;
      creating.b = { x: e.x, y: e.y };
      creating.endScreen = { x: e.screenX, y: e.screenY };
      ctx.invalidateOverlay();
    },

    onPointerUp() {
      if (drag) {
        drag.end();
        drag = null;
        return;
      }
      const c = creating;
      creating = null;
      ctx.invalidateOverlay();
      if (!c) return;
      const size = ctx.options('text').size;
      const boxed = Math.abs(c.endScreen.x - c.startScreen.x) >= BOX_THRESHOLD;
      if (boxed) {
        const r = rectFromPoints(c.a, c.b);
        ctx.text.begin(newTextObject(ctx, { x: r.x, y: r.y }, Math.max(size, r.width)), null);
      } else {
        // Click: dòng chữ đầu tiên canh giữa theo chiều dọc tại điểm click.
        const origin = { x: c.a.x, y: c.a.y - (size * LINE_HEIGHT) / 2 };
        ctx.text.begin(newTextObject(ctx, origin, null), null);
      }
    },

    onCancel() {
      drag?.cancel();
      drag = null;
      creating = null;
    },

    onDeactivate() {
      drag?.cancel();
      drag = null;
      creating = null;
    },

    renderOverlay(overlay) {
      ctx.objects.renderOverlay(overlay);
      if (creating && Math.abs(creating.endScreen.x - creating.startScreen.x) >= BOX_THRESHOLD) {
        drawBand(overlay, creating, true);
      }
    },
  };
}

export const selectTool: ToolDefinition = {
  id: 'select',
  group: 'select',
  icon: 'select',
  labelKey: 'select',
  shortcut: 'V',
  layerKinds: ['vector'],
  create: createSelectTool,
};

export const textTool: ToolDefinition = {
  id: 'text',
  group: 'annotate',
  icon: 'text',
  labelKey: 'text',
  shortcut: 'T',
  layerKinds: ['vector'],
  optionGroup: 'text',
  altEyedropper: true,
  create: createTextTool,
};
