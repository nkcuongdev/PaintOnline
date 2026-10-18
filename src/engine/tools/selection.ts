import type { Point, Rect, SelectionMode, SelectionShape } from '../core/types';
import { rectFromPoints } from '../layers/objects/geometry';
import { isAllocationError } from '../memory/surfaces';
import type { FloatingTransform } from '../selection/Floating';
import type { FloatingHandle } from '../selection/SelectionManager';
import { polygonArea, simplifyLasso, traceShape } from '../selection/shape';
import { HANDLE_CURSORS } from './objects/drag';
import type {
  DocPointerEvent,
  HoverEvent,
  OverlayContext,
  Tool,
  ToolContext,
  ToolDefinition,
} from './types';

/** Kéo ít hơn ngưỡng này (CSS px) được coi là click. */
const DRAG_THRESHOLD = 3;

/** Phím bổ trợ lúc bấm chuột (mục 5.7): Shift = thêm, Alt = bớt, Shift+Alt = giao. */
export function selectionMode(
  e: { shiftKey: boolean; altKey: boolean },
  fallback: SelectionMode,
): SelectionMode {
  if (e.shiftKey && e.altKey) return 'intersect';
  if (e.shiftKey) return 'add';
  if (e.altKey) return 'subtract';
  return fallback;
}

/** Thao tác kéo trên vùng chọn/pixel nổi đang diễn ra. */
export interface SelectionDrag {
  move(e: DocPointerEvent): void;
  end(): void;
  cancel(): void;
  readonly cursor: string;
}

/**
 * Bắt đầu kéo pixel nổi (handle co giãn/xoay, hoặc kéo trong khung) hoặc kéo vùng chọn (nhấc pixel
 * ra khi kéo quá ngưỡng — giữ Alt để nhân bản, mục 5.7). Trả null nếu không trúng: tool tự xử lý.
 * `allowMove`: kéo bên trong vùng chọn (chưa nổi) thì di chuyển pixel.
 */
export function beginSelectionDrag(
  ctx: ToolContext,
  e: DocPointerEvent,
  allowMove: boolean,
): SelectionDrag | null {
  const sel = ctx.selection;
  const f = sel.floating;
  if (f) {
    const handle = sel.handleAt({ x: e.screenX, y: e.screenY });
    if (handle) return handleDrag(ctx, handle, f.transform);
    if (f.contains(e)) return moveDrag(ctx, e, false, false);
    return null;
  }
  if (allowMove && sel.selection?.contains(e)) return moveDrag(ctx, e, true, e.altKey);
  return null;
}

function cloneTransform(t: FloatingTransform): FloatingTransform {
  return { ...t, rect: { ...t.rect } };
}

function handleDrag(
  ctx: ToolContext,
  handle: FloatingHandle,
  start: FloatingTransform,
): SelectionDrag {
  const initial = cloneTransform(start);
  return {
    cursor: handle === 'rotate' ? 'grabbing' : (HANDLE_CURSORS[handle] ?? 'move'),
    move(e) {
      ctx.selection.setTransform(ctx.selection.dragHandle(initial, handle, e, e.shiftKey));
    },
    end() {
      // Pixel nổi vẫn nổi tới khi commit (Enter, click ra ngoài).
    },
    cancel() {
      ctx.selection.setTransform(initial);
    },
  };
}

function moveDrag(
  ctx: ToolContext,
  e: DocPointerEvent,
  needsLift: boolean,
  duplicate: boolean,
): SelectionDrag {
  const startDoc = { x: e.x, y: e.y };
  const startScreen = { x: e.screenX, y: e.screenY };
  let lifted = !needsLift;
  let failed = false;
  let initial = ctx.selection.floating ? cloneTransform(ctx.selection.floating.transform) : null;
  return {
    cursor: duplicate ? 'copy' : 'move',
    move(ev) {
      if (failed) return;
      if (!lifted) {
        if (Math.hypot(ev.screenX - startScreen.x, ev.screenY - startScreen.y) < DRAG_THRESHOLD) {
          return;
        }
        if (!ctx.selection.lift(duplicate)) {
          failed = true;
          return;
        }
        lifted = true;
        initial = ctx.selection.floating ? cloneTransform(ctx.selection.floating.transform) : null;
      }
      if (!initial) return;
      let dx = ev.x - startDoc.x;
      let dy = ev.y - startDoc.y;
      // Shift: chỉ di chuyển theo trục ngang hoặc dọc.
      if (ev.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      // Pixel nổi chưa xoay, đang ở tọa độ nguyên: dời theo pixel nguyên để giữ nguyên ảnh.
      if (
        initial.rotation === 0 &&
        Number.isInteger(initial.rect.x) &&
        Number.isInteger(initial.rect.y)
      ) {
        dx = Math.round(dx);
        dy = Math.round(dy);
      }
      ctx.selection.setTransform({
        ...initial,
        rect: { ...initial.rect, x: initial.rect.x + dx, y: initial.rect.y + dy },
      });
    },
    end() {
      // Click (không kéo) vào vùng chọn: không nhấc gì.
    },
    cancel() {
      if (!lifted || !initial) return;
      if (needsLift) ctx.selection.cancelFloating();
      else ctx.selection.setTransform(initial);
    },
  };
}

/** Con trỏ khi rê chuột trên vùng chọn/pixel nổi; null nếu không trên chúng. */
export function selectionHoverCursor(
  ctx: ToolContext,
  e: HoverEvent | DocPointerEvent,
  allowMove: boolean,
  altKey = false,
): string | null {
  const sel = ctx.selection;
  if (sel.floating) {
    const handle = sel.handleAt({ x: e.screenX, y: e.screenY });
    if (handle) return handle === 'rotate' ? 'grab' : (HANDLE_CURSORS[handle] ?? 'move');
    return sel.floating.contains(e) ? 'move' : null;
  }
  if (allowMove && sel.selection?.contains(e)) return altKey ? 'copy' : 'move';
  return null;
}

/** Khung chữ nhật nguyên pixel từ hai điểm kéo; `square` giữ cạnh bằng nhau (Shift sau khi bắt đầu). */
function bandRect(a: Readonly<Point>, b: Readonly<Point>, square: boolean): Rect {
  let bx = b.x;
  let by = b.y;
  if (square) {
    const side = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    bx = a.x + Math.sign(b.x - a.x || 1) * side;
    by = a.y + Math.sign(b.y - a.y || 1) * side;
  }
  const r = rectFromPoints(
    { x: Math.round(a.x), y: Math.round(a.y) },
    { x: Math.round(bx), y: Math.round(by) },
  );
  return r;
}

/** Vẽ hình đang kéo bằng nét marching ants tĩnh. */
function drawDraft(overlay: OverlayContext, shape: SelectionShape | null, open = false): void {
  if (!shape) return;
  const { ctx: o, viewport } = overlay;
  const { zoom, panX, panY } = viewport.state;
  o.save();
  o.setTransform(o.getTransform().multiply(new DOMMatrix([zoom, 0, 0, zoom, panX, panY])));
  o.beginPath();
  if (shape.kind === 'polygon' && open) {
    shape.points.forEach((p, i) => {
      if (i === 0) o.moveTo(p.x, p.y);
      else o.lineTo(p.x, p.y);
    });
  } else {
    traceShape(o, shape);
  }
  o.restore();
  o.save();
  o.lineWidth = 1;
  o.strokeStyle = '#FFFFFF';
  o.stroke();
  o.strokeStyle = '#000000';
  o.setLineDash([4, 4]);
  o.stroke();
  o.restore();
}

// ---------------------------------------------------------------------------
// Marquee chữ nhật / ellipse (M)
// ---------------------------------------------------------------------------

interface Band {
  a: Point;
  b: Point;
  mode: SelectionMode;
  /** Shift giữ từ lúc bấm là "thêm vùng", không phải "giữ hình vuông". */
  startedWithShift: boolean;
  square: boolean;
  startScreen: Point;
  endScreen: Point;
}

/** Hành vi chung khi bấm chuột của tool chọn vùng: kéo pixel nổi/vùng chọn trước, rồi tới tool. */
function pressSelection(
  ctx: ToolContext,
  e: DocPointerEvent,
  movable = true,
): SelectionDrag | null {
  const fallback = ctx.options('selection').mode;
  // Kéo bên trong vùng chọn di chuyển pixel khi không ở chế độ kết hợp (Alt = nhân bản).
  const allowMove = movable && fallback === 'replace' && !e.shiftKey;
  const drag = beginSelectionDrag(ctx, e, allowMove);
  if (drag) return drag;
  // Click ra ngoài pixel nổi: commit trước khi chọn vùng mới (mục 5.7).
  if (ctx.selection.floating) ctx.selection.commitFloating();
  return null;
}

function createMarquee(ctx: ToolContext, kind: 'rect' | 'ellipse'): Tool {
  let drag: SelectionDrag | null = null;
  let band: Band | null = null;
  let cursor = 'crosshair';

  const shapeOf = (b: Band): Extract<SelectionShape, { rect: Rect }> => ({
    kind,
    rect: bandRect(b.a, b.b, b.square),
  });

  return {
    cursor: () => ({ css: drag?.cursor ?? cursor }),

    onHover(e) {
      const allowMove = ctx.options('selection').mode === 'replace' && !e.shiftKey;
      const next = selectionHoverCursor(ctx, e, allowMove) ?? 'crosshair';
      if (next !== cursor) {
        cursor = next;
        ctx.refreshCursor();
      }
    },

    onPointerDown(e) {
      if (e.button !== 0 || drag || band) return;
      drag = pressSelection(ctx, e);
      if (drag) return;
      const screen = { x: e.screenX, y: e.screenY };
      band = {
        a: { x: e.x, y: e.y },
        b: { x: e.x, y: e.y },
        mode: selectionMode(e, ctx.options('selection').mode),
        startedWithShift: e.shiftKey,
        square: false,
        startScreen: screen,
        endScreen: screen,
      };
    },

    onPointerMove(e) {
      if (drag) {
        drag.move(e);
        return;
      }
      if (!band) return;
      band.b = { x: e.x, y: e.y };
      band.endScreen = { x: e.screenX, y: e.screenY };
      band.square = e.shiftKey && !band.startedWithShift;
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
      const moved = Math.hypot(b.endScreen.x - b.startScreen.x, b.endScreen.y - b.startScreen.y);
      const shape = shapeOf(b);
      if (moved < DRAG_THRESHOLD || shape.rect.width < 1 || shape.rect.height < 1) {
        // Click không kéo: bỏ chọn (như MS Paint).
        if (b.mode === 'replace') ctx.selection.deselect();
        return;
      }
      const o = ctx.options('selection');
      ctx.selection.applyShape(shape, b.mode, { feather: o.feather, antiAlias: o.antiAlias });
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
      if (band) drawDraft(overlay, shapeOf(band));
    },
  };
}

// ---------------------------------------------------------------------------
// Lasso (L): vùng chọn tự do
// ---------------------------------------------------------------------------

function createLasso(ctx: ToolContext): Tool {
  let drag: SelectionDrag | null = null;
  let draft: { points: Point[]; mode: SelectionMode } | null = null;
  let cursor = 'crosshair';

  return {
    cursor: () => ({ css: drag?.cursor ?? cursor }),

    onHover(e) {
      const allowMove = ctx.options('selection').mode === 'replace' && !e.shiftKey;
      const next = selectionHoverCursor(ctx, e, allowMove) ?? 'crosshair';
      if (next !== cursor) {
        cursor = next;
        ctx.refreshCursor();
      }
    },

    onPointerDown(e) {
      if (e.button !== 0 || drag || draft) return;
      drag = pressSelection(ctx, e);
      if (drag) return;
      draft = {
        points: [{ x: e.x, y: e.y }],
        mode: selectionMode(e, ctx.options('selection').mode),
      };
    },

    onPointerMove(e) {
      if (drag) {
        drag.move(e);
        return;
      }
      if (!draft) return;
      const min = 0.5 / ctx.viewport.zoom;
      for (const p of e.points) {
        const last = draft.points.at(-1);
        if (last && Math.hypot(p.x - last.x, p.y - last.y) < min) continue;
        draft.points.push({ x: p.x, y: p.y });
      }
      ctx.invalidateOverlay();
    },

    onPointerUp() {
      if (drag) {
        drag.end();
        drag = null;
        return;
      }
      const d = draft;
      draft = null;
      ctx.invalidateOverlay();
      if (!d) return;
      const points = simplifyLasso(d.points, 0.5);
      if (points.length < 3 || polygonArea(points) < 1) {
        if (d.mode === 'replace') ctx.selection.deselect();
        return;
      }
      const o = ctx.options('selection');
      ctx.selection.applyShape({ kind: 'polygon', points }, d.mode, {
        feather: o.feather,
        antiAlias: o.antiAlias,
      });
    },

    onCancel() {
      drag?.cancel();
      drag = null;
      draft = null;
      ctx.invalidateOverlay();
    },

    onDeactivate() {
      drag?.cancel();
      drag = null;
      draft = null;
    },

    renderOverlay(overlay) {
      if (draft && draft.points.length > 1) {
        drawDraft(overlay, { kind: 'polygon', points: draft.points }, true);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Magic Wand (W): chọn vùng màu giống nhau — dùng lại tô loang trong Worker (mục 2, 5.8)
// ---------------------------------------------------------------------------

function createWand(ctx: ToolContext): Tool {
  let drag: SelectionDrag | null = null;
  let cursor = 'crosshair';

  return {
    cursor: () => ({ css: drag?.cursor ?? (ctx.busy ? 'progress' : cursor) }),

    onHover(e) {
      const next = selectionHoverCursor(ctx, e, false) ?? 'crosshair';
      if (next !== cursor) {
        cursor = next;
        ctx.refreshCursor();
      }
    },

    onPointerDown(e) {
      if (e.button !== 0 || drag || ctx.busy) return;
      // Click là thao tác chính của Đũa thần (Alt = bớt): chỉ kéo được pixel đang nổi.
      drag = pressSelection(ctx, e, false);
      if (drag) return;
      const doc = ctx.document;
      const x = Math.floor(e.x);
      const y = Math.floor(e.y);
      const mode = selectionMode(e, ctx.options('selection').mode);
      if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) {
        if (mode === 'replace') ctx.selection.deselect();
        return;
      }
      const o = ctx.options('selection');
      const layer = doc.activeLayer;
      let sample: ImageData;
      try {
        sample =
          o.sampleAll || layer.kind !== 'raster'
            ? ctx.readPixels(doc.bounds)
            : (layer.surface.read(doc.bounds) ?? new ImageData(doc.width, doc.height));
      } catch (error) {
        if (!isAllocationError(error)) throw error;
        ctx.notify('memory.refused');
        return;
      }
      const rev = doc.rev;
      ctx.setBusy(true);
      ctx.workers
        .floodFill({
          width: doc.width,
          height: doc.height,
          data: sample.data,
          x,
          y,
          tolerance: o.tolerance,
          contiguous: o.contiguous,
          expand: 0,
        })
        .then(
          (result) => {
            ctx.setBusy(false);
            if (ctx.currentDocument !== doc || doc.rev !== rev) return;
            if (!result) {
              if (mode === 'replace') ctx.selection.deselect();
              return;
            }
            ctx.selection.applyMask({ bounds: result.bounds, data: result.mask }, mode);
          },
          () => {
            ctx.setBusy(false);
            ctx.notify('image.failed');
          },
        );
    },

    onPointerMove(e) {
      drag?.move(e);
    },

    onPointerUp() {
      drag?.end();
      drag = null;
    },

    onCancel() {
      drag?.cancel();
      drag = null;
    },

    onDeactivate() {
      drag?.cancel();
      drag = null;
    },
  };
}

export const marqueeRectTool: ToolDefinition = {
  id: 'marquee-rect',
  group: 'select',
  icon: 'marquee-rect',
  labelKey: 'marquee-rect',
  shortcut: 'M',
  layerKinds: ['raster', 'vector'],
  optionGroup: 'selection',
  create: (ctx) => createMarquee(ctx, 'rect'),
};

export const marqueeEllipseTool: ToolDefinition = {
  id: 'marquee-ellipse',
  group: 'select',
  icon: 'marquee-ellipse',
  labelKey: 'marquee-ellipse',
  layerKinds: ['raster', 'vector'],
  optionGroup: 'selection',
  create: (ctx) => createMarquee(ctx, 'ellipse'),
};

export const lassoTool: ToolDefinition = {
  id: 'lasso',
  group: 'select',
  icon: 'lasso',
  labelKey: 'lasso',
  shortcut: 'L',
  layerKinds: ['raster', 'vector'],
  optionGroup: 'selection',
  create: createLasso,
};

export const wandTool: ToolDefinition = {
  id: 'wand',
  group: 'select',
  icon: 'wand',
  labelKey: 'wand',
  shortcut: 'W',
  layerKinds: ['raster', 'vector'],
  optionGroup: 'selection',
  create: createWand,
};
