import type { Point, Rect } from '../core/types';
import {
  BOX_RESIZE_HANDLES,
  boxHandlePosition,
  rectFromPoints,
  resizeBox,
  type BoxHandle,
} from '../layers/objects/geometry';
import { isEmptyRect, rectEquals } from '../utils/rect';
import { HANDLE_CURSORS } from './objects/drag';
import type {
  DocPointerEvent,
  HoverEvent,
  OverlayContext,
  Tool,
  ToolContext,
  ToolDefinition,
} from './types';

const HANDLE_SIZE = 8;
const HANDLE_HIT = 7;
const DOUBLE_CLICK_MS = 400;
const ACCENT = '#3B5BDB';

type CropHandle = Exclude<BoxHandle, 'rotate'>;

type CropDrag =
  | { kind: 'new'; a: Point }
  | { kind: 'move'; start: Rect; from: Point }
  | { kind: 'handle'; handle: CropHandle; start: Rect };

/** Khung nguyên pixel nằm trong document (ít nhất 1 × 1). */
function clampFrame(r: Readonly<Rect>, doc: Readonly<Rect>): Rect {
  const x0 = Math.max(doc.x, Math.round(r.x));
  const y0 = Math.max(doc.y, Math.round(r.y));
  const x1 = Math.min(doc.x + doc.width, Math.round(r.x + r.width));
  const y1 = Math.min(doc.y + doc.height, Math.round(r.y + r.height));
  return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
}

/**
 * Crop (C — mục 2): khung cắt mặc định là vùng chọn (nếu có) hoặc cả ảnh; kéo handle để chỉnh,
 * kéo bên trong để dời, kéo ra ngoài để vẽ khung mới. Enter hoặc double-click để cắt (áp dụng cho
 * mọi layer, có undo), Esc để đặt lại khung.
 */
function createCrop(ctx: ToolContext): Tool {
  let frame: Rect | null = null;
  /** Kích thước document khi đặt khung — đổi (vừa cắt, undo) thì đặt lại khung. */
  let frameDoc = { width: 0, height: 0 };
  let drag: CropDrag | null = null;
  let cursor = 'crosshair';
  let lastClick = -Infinity;

  const doc = () => ctx.currentDocument;

  const current = (): Rect | null => {
    const d = doc();
    if (!d) return null;
    if (!frame || frameDoc.width !== d.width || frameDoc.height !== d.height) {
      const sel = ctx.selection.selection?.bounds;
      frame = sel && !isEmptyRect(sel) ? { ...sel } : d.bounds;
      frameDoc = { width: d.width, height: d.height };
    }
    return frame;
  };

  const handleAt = (screen: Readonly<Point>): CropHandle | null => {
    const f = current();
    if (!f) return null;
    for (const handle of BOX_RESIZE_HANDLES as readonly CropHandle[]) {
      const s = ctx.viewport.docToScreen(boxHandlePosition(f, 0, handle, 0));
      if (Math.abs(s.x - screen.x) <= HANDLE_HIT && Math.abs(s.y - screen.y) <= HANDLE_HIT) {
        return handle;
      }
    }
    return null;
  };

  const inside = (p: Readonly<Point>): boolean => {
    const f = current();
    return f !== null && p.x >= f.x && p.y >= f.y && p.x <= f.x + f.width && p.y <= f.y + f.height;
  };

  const apply = () => {
    const d = doc();
    const f = current();
    if (!d || !f || rectEquals(f, d.bounds)) return;
    ctx.cropDocument(f);
  };

  return {
    cursor: () => ({ css: cursor }),

    onActivate() {
      frame = null;
      ctx.selection.commitFloating();
      ctx.invalidateOverlay();
    },

    onDeactivate() {
      drag = null;
      frame = null;
      ctx.invalidateOverlay();
    },

    onHover(e: HoverEvent) {
      const handle = handleAt({ x: e.screenX, y: e.screenY });
      const f = current();
      const d = doc();
      const movable = f !== null && d !== null && !rectEquals(f, d.bounds) && inside(e);
      const next = handle ? (HANDLE_CURSORS[handle] ?? 'move') : movable ? 'move' : 'crosshair';
      if (next !== cursor) {
        cursor = next;
        ctx.refreshCursor();
      }
    },

    onPointerDown(e: DocPointerEvent) {
      if (e.button !== 0 || drag) return;
      const f = current();
      const d = doc();
      if (!f || !d) return;
      const isDouble = e.timeStamp - lastClick < DOUBLE_CLICK_MS;
      lastClick = e.timeStamp;
      if (isDouble && inside(e)) {
        lastClick = -Infinity;
        apply();
        return;
      }
      const handle = handleAt({ x: e.screenX, y: e.screenY });
      if (handle) drag = { kind: 'handle', handle, start: { ...f } };
      // Khung đang là cả ảnh (chưa chỉnh): kéo ở đâu cũng vẽ khung mới.
      else if (inside(e) && !rectEquals(f, d.bounds)) {
        drag = { kind: 'move', start: { ...f }, from: { x: e.x, y: e.y } };
      } else drag = { kind: 'new', a: { x: e.x, y: e.y } };
    },

    onPointerMove(e: DocPointerEvent) {
      const d = doc();
      if (!drag || !d) return;
      if (drag.kind === 'new') {
        const r = rectFromPoints(drag.a, e);
        if (r.width * ctx.viewport.zoom < 2 && r.height * ctx.viewport.zoom < 2) return;
        frame = clampFrame(r, d.bounds);
      } else if (drag.kind === 'move') {
        const s = drag.start;
        const dx = Math.round(e.x - drag.from.x);
        const dy = Math.round(e.y - drag.from.y);
        frame = {
          ...s,
          x: Math.min(d.width - s.width, Math.max(0, s.x + dx)),
          y: Math.min(d.height - s.height, Math.max(0, s.y + dy)),
        };
      } else {
        const r = resizeBox(drag.start, 0, drag.handle, e, e.shiftKey, 1);
        frame = clampFrame(r, d.bounds);
      }
      ctx.invalidateOverlay();
    },

    onPointerUp() {
      drag = null;
    },

    onCancel() {
      drag = null;
    },

    onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        apply();
        return true;
      }
      if (e.key === 'Escape') {
        const d = doc();
        if (!d || !frame || rectEquals(frame, d.bounds)) return false;
        frame = d.bounds;
        ctx.invalidateOverlay();
        return true;
      }
      return false;
    },

    renderOverlay({ ctx: o, viewport }: OverlayContext) {
      const d = doc();
      const f = current();
      if (!d || !f) return;
      const docRect = viewport.docRectToScreen(d.bounds);
      const r = viewport.docRectToScreen(f);
      o.save();
      // Làm tối phần bị cắt bỏ.
      o.fillStyle = 'rgb(0 0 0 / 0.45)';
      o.beginPath();
      o.rect(docRect.x, docRect.y, docRect.width, docRect.height);
      o.rect(r.x, r.y, r.width, r.height);
      o.fill('evenodd');
      // Lưới một phần ba.
      o.strokeStyle = 'rgb(255 255 255 / 0.55)';
      o.lineWidth = 1;
      o.beginPath();
      for (const k of [1, 2]) {
        o.moveTo(r.x + (r.width * k) / 3, r.y);
        o.lineTo(r.x + (r.width * k) / 3, r.y + r.height);
        o.moveTo(r.x, r.y + (r.height * k) / 3);
        o.lineTo(r.x + r.width, r.y + (r.height * k) / 3);
      }
      o.stroke();
      o.strokeStyle = '#FFFFFF';
      o.lineWidth = 1.5;
      o.strokeRect(r.x, r.y, r.width, r.height);
      for (const handle of BOX_RESIZE_HANDLES) {
        const p = viewport.docToScreen(boxHandlePosition(f, 0, handle, 0));
        o.fillStyle = '#FFFFFF';
        o.strokeStyle = ACCENT;
        o.lineWidth = 1.5;
        o.beginPath();
        o.rect(p.x - HANDLE_SIZE / 2, p.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
        o.fill();
        o.stroke();
      }
      // Kích thước khung.
      const label = `${String(f.width)} × ${String(f.height)}`;
      o.font = '600 12px "Inter Variable", system-ui, sans-serif';
      const w = o.measureText(label).width + 12;
      const lx = r.x + r.width / 2 - w / 2;
      const ly = Math.max(4, r.y - 26);
      o.fillStyle = 'rgb(20 20 24 / 0.85)';
      o.beginPath();
      o.roundRect(lx, ly, w, 20, 6);
      o.fill();
      o.fillStyle = '#FFFFFF';
      o.textBaseline = 'middle';
      o.fillText(label, lx + 6, ly + 10);
      o.restore();
    },
  };
}

export const cropTool: ToolDefinition = {
  id: 'crop',
  group: 'select',
  icon: 'crop',
  labelKey: 'crop',
  shortcut: 'C',
  layerKinds: ['raster', 'vector'],
  create: createCrop,
};
