import type { DocPointerEvent, Tool, ToolContext, ToolDefinition } from './types';

/** Kéo để di chuyển khung nhìn. Dùng tạm khi giữ Space hoặc chuột giữa (mục 5.3). */
function createPan(ctx: ToolContext): Tool {
  let last: { x: number; y: number } | null = null;
  return {
    cursor: ({ active }) => ({ css: active ? 'grabbing' : 'grab' }),
    onPointerDown(e: DocPointerEvent) {
      last = { x: e.screenX, y: e.screenY };
    },
    onPointerMove(e: DocPointerEvent) {
      if (!last) return;
      ctx.viewport.panBy(e.screenX - last.x, e.screenY - last.y);
      last = { x: e.screenX, y: e.screenY };
    },
    onPointerUp() {
      last = null;
    },
    onCancel() {
      last = null;
    },
  };
}

/** Kéo ngang ít hơn ngưỡng này (CSS px) được coi là click. */
const DRAG_THRESHOLD = 4;

/** Click phóng to tới mức chuẩn kế tiếp, Alt+click thu nhỏ; kéo ngang để zoom liên tục. */
function createZoom(ctx: ToolContext): Tool {
  let start: { x: number; y: number; zoom: number; dragged: boolean } | null = null;
  return {
    cursor: ({ altKey }) => ({ css: altKey ? 'zoom-out' : 'zoom-in' }),
    onPointerDown(e: DocPointerEvent) {
      start = { x: e.screenX, y: e.screenY, zoom: ctx.viewport.zoom, dragged: false };
    },
    onPointerMove(e: DocPointerEvent) {
      if (!start) return;
      const dx = e.screenX - start.x;
      if (!start.dragged && Math.abs(dx) < DRAG_THRESHOLD) return;
      start.dragged = true;
      ctx.viewport.zoomTo(start.zoom * Math.exp(dx * 0.01), { x: start.x, y: start.y });
    },
    onPointerUp(e: DocPointerEvent) {
      if (start && !start.dragged) {
        ctx.viewport.zoomStep(e.altKey ? -1 : 1, { x: e.screenX, y: e.screenY });
      }
      start = null;
    },
    onCancel() {
      start = null;
    },
  };
}

export const panTool: ToolDefinition = {
  id: 'pan',
  group: 'view',
  icon: 'hand',
  labelKey: 'pan',
  shortcut: 'Space',
  layerKinds: ['raster', 'vector'],
  create: createPan,
};

export const zoomTool: ToolDefinition = {
  id: 'zoom',
  group: 'view',
  icon: 'zoom',
  labelKey: 'zoom',
  shortcut: 'Z',
  layerKinds: ['raster', 'vector'],
  create: createZoom,
};
