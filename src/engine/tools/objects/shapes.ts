import type { AnnotationObject, Point, PolygonObject, StepObject, ToolId } from '../../core/types';
import { DEFAULT_SHADOW } from '../../layers/objects/draw';
import { constrainSquare, rectFromPoints, snapAngle } from '../../layers/objects/geometry';
import { makeStroke } from '../../layers/objects/style';
import type { PendingObjects } from '../../render/Compositor';
import type {
  DocPointerEvent,
  HoverEvent,
  OverlayContext,
  Tool,
  ToolContext,
  ToolDefinition,
} from '../types';
import { beginObjectDrag, hoverCursor, type ObjectDrag } from './drag';

/** Kéo ngắn hơn ngưỡng này (CSS px) được coi là click — không tạo đối tượng. */
const MIN_DRAG = 3;
/** Click gần điểm đầu của polygon trong bán kính này (CSS px) thì khép kín. */
const CLOSE_RADIUS = 8;
const DOUBLE_CLICK_MS = 350;

type Builder = (
  ctx: ToolContext,
  a: Point,
  b: Point,
  e: DocPointerEvent,
) => AnnotationObject | null;

function newId(): string {
  return crypto.randomUUID();
}

/** Vị trí bản nháp: layer chú thích sẽ nhận đối tượng, hoặc vị trí layer sẽ được tạo. */
export function pendingTarget(ctx: ToolContext): Omit<PendingObjects, 'objects'> | null {
  const doc = ctx.document;
  const active = doc.activeLayer;
  if (active.kind === 'vector') {
    if (active.locked) {
      ctx.notify('layer.locked');
      return null;
    }
    if (!active.visible) {
      ctx.notify('layer.hidden');
      return null;
    }
    return { layerId: active.id, afterLayerId: active.id };
  }
  const index = doc.indexOfLayer(active.id);
  const above = index + 1 < doc.layers.length ? doc.layers[index + 1] : null;
  if (above?.kind === 'vector' && above.visible && !above.locked) {
    return { layerId: above.id, afterLayerId: above.id };
  }
  return { layerId: null, afterLayerId: active.id };
}

/**
 * Tool tạo đối tượng bằng kéo (Rectangle, Ellipse, Line, Arrow, Highlight, Redact, Spotlight,
 * Magnifier). Đối tượng vừa tạo được chọn sẵn; kéo handle hoặc thân đối tượng đang chọn để sửa ngay
 * mà không đổi tool.
 */
function createDragTool(ctx: ToolContext, build: Builder, label: string): Tool {
  let drag: ObjectDrag | null = null;
  let creating: {
    start: Point;
    startScreen: Point;
    target: Omit<PendingObjects, 'objects'>;
    object: AnnotationObject | null;
  } | null = null;
  let cursor = 'crosshair';

  const end = (commit: boolean) => {
    const c = creating;
    creating = null;
    if (!c) return;
    ctx.objects.setPending(null);
    if (commit && c.object) ctx.objects.add(c.object, label);
  };

  return {
    cursor: () => ({ css: drag?.cursor ?? cursor }),

    onHover(e: HoverEvent) {
      const next = hoverCursor(ctx, { x: e.screenX, y: e.screenY }, e, false) ?? 'crosshair';
      if (next !== cursor) {
        cursor = next;
        ctx.refreshCursor();
      }
    },

    onPointerDown(e) {
      if (e.button !== 0 || drag || creating) return;
      drag = beginObjectDrag(ctx, e, { selectOnHit: false });
      if (drag) return;
      const target = pendingTarget(ctx);
      if (!target) return;
      ctx.objects.clearSelection();
      creating = {
        start: { x: e.x, y: e.y },
        startScreen: { x: e.screenX, y: e.screenY },
        target,
        object: null,
      };
    },

    onPointerMove(e) {
      if (drag) {
        drag.move(e);
        return;
      }
      const c = creating;
      if (!c) return;
      if (
        Math.hypot(e.screenX - c.startScreen.x, e.screenY - c.startScreen.y) < MIN_DRAG &&
        !c.object
      )
        return;
      c.object = build(ctx, c.start, { x: e.x, y: e.y }, e);
      ctx.objects.setPending(c.object ? { ...c.target, objects: [c.object] } : null);
    },

    onPointerUp() {
      if (drag) {
        drag.end();
        drag = null;
        return;
      }
      end(true);
    },

    onCancel() {
      drag?.cancel();
      drag = null;
      end(false);
    },

    onDeactivate() {
      drag?.cancel();
      drag = null;
      end(false);
    },

    renderOverlay(overlay: OverlayContext) {
      ctx.objects.renderOverlay(overlay);
    },
  };
}

// ---------------------------------------------------------------------------
// Builder từng loại (option lấy tại thời điểm vẽ; viền = màu chính, tô = màu phụ — ADR 0019)
// ---------------------------------------------------------------------------

const boxOf = (a: Point, b: Point, e: DocPointerEvent) =>
  rectFromPoints(a, e.shiftKey ? constrainSquare(a, b) : b);

const buildRectLike =
  (type: 'rect' | 'ellipse'): Builder =>
  (ctx, a, b, e) => {
    const o = ctx.options('shape');
    const colors = ctx.colors();
    const rect = boxOf(a, b, e);
    if (rect.width < 1 || rect.height < 1) return null;
    const base = {
      id: newId(),
      rotation: 0,
      opacity: 1,
      rect,
      stroke: makeStroke(colors.primary, o.strokeWidth, o.dashed),
      fill: o.fill ? colors.secondary : undefined,
      shadow: o.shadow ? { ...DEFAULT_SHADOW } : undefined,
    };
    return type === 'rect' ? { ...base, type, cornerRadius: o.cornerRadius } : { ...base, type };
  };

const buildLine: Builder = (ctx, a, b, e) => {
  const o = ctx.options('shape');
  const to = e.shiftKey ? snapAngle(a, b) : b;
  if (Math.hypot(to.x - a.x, to.y - a.y) < 1) return null;
  return {
    id: newId(),
    type: 'line',
    rotation: 0,
    opacity: 1,
    from: { ...a },
    to,
    stroke: makeStroke(ctx.colors().primary, o.strokeWidth, o.dashed),
    shadow: o.shadow ? { ...DEFAULT_SHADOW } : undefined,
  };
};

const buildArrow: Builder = (ctx, a, b, e) => {
  const o = ctx.options('arrow');
  const to = e.shiftKey ? snapAngle(a, b) : b;
  if (Math.hypot(to.x - a.x, to.y - a.y) < 1) return null;
  return {
    id: newId(),
    type: 'arrow',
    rotation: 0,
    opacity: 1,
    from: { ...a },
    to,
    stroke: makeStroke(ctx.colors().primary, o.strokeWidth, o.dashed),
    head: o.head,
    bothEnds: o.bothEnds,
    shadow: o.shadow ? { ...DEFAULT_SHADOW } : undefined,
  };
};

const buildHighlight: Builder = (ctx, a, b, e) => {
  const rect = boxOf(a, b, e);
  if (rect.width < 1 || rect.height < 1) return null;
  return {
    id: newId(),
    type: 'highlight',
    rotation: 0,
    opacity: 1,
    rect,
    color: ctx.options('highlight').color,
  };
};

const buildRedact: Builder = (ctx, a, b, e) => {
  const rect = boxOf(a, b, e);
  if (rect.width < 1 || rect.height < 1) return null;
  const o = ctx.options('redact');
  return {
    id: newId(),
    type: 'redact',
    rotation: 0,
    opacity: 1,
    rect,
    mode: o.mode,
    strength: o.mode === 'pixelate' ? o.blockSize : o.mode === 'blur' ? o.blurRadius : 0,
    // Màu tô kín (và nền lót của khảm/làm mờ) luôn đen đục — an toàn mặc định (mục 5.4).
    color: '#000000FF',
  };
};

const buildSpotlight: Builder = (ctx, a, b, e) => {
  const rect = boxOf(a, b, e);
  if (rect.width < 1 || rect.height < 1) return null;
  const o = ctx.options('spotlight');
  return {
    id: newId(),
    type: 'spotlight',
    rotation: 0,
    opacity: 1,
    rect,
    shape: o.shape,
    dim: o.dim,
  };
};

/** Khoảng cách giữa vùng nguồn và bản phóng to (px document, tối thiểu). */
const MAGNIFIER_GAP = 24;

/**
 * Magnifier: kéo chọn vùng nguồn; bản phóng to tự đặt bên phải (hết chỗ thì bên trái, rồi bên
 * dưới) — kéo tâm của nó đi chỗ khác sau.
 */
const buildMagnifier: Builder = (ctx, a, b, e) => {
  const source = boxOf(a, b, e);
  if (source.width < 4 || source.height < 4) return null;
  const o = ctx.options('magnifier');
  const doc = ctx.document;
  const w = source.width * o.zoom;
  const h = source.height * o.zoom;
  const gap = Math.max(MAGNIFIER_GAP, source.width * 0.25);
  const cy = source.y + source.height / 2;
  let target = { x: source.x + source.width + gap + w / 2, y: cy };
  if (target.x + w / 2 > doc.width) {
    const left = { x: source.x - gap - w / 2, y: cy };
    target =
      left.x - w / 2 >= 0
        ? left
        : { x: source.x + source.width / 2, y: source.y + source.height + gap + h / 2 };
  }
  return {
    id: newId(),
    type: 'magnifier',
    rotation: 0,
    opacity: 1,
    source,
    target,
    zoom: o.zoom,
    shape: o.shape,
    stroke: { color: ctx.colors().primary, width: 3 },
    shadow: { ...DEFAULT_SHADOW },
  };
};

// ---------------------------------------------------------------------------
// Step badge: click đặt số thứ tự (kéo trước khi thả để dời); số tự tăng theo layer
// ---------------------------------------------------------------------------

function createStepTool(ctx: ToolContext): Tool {
  let drag: ObjectDrag | null = null;
  let creating: { target: Omit<PendingObjects, 'objects'>; object: StepObject } | null = null;
  let cursor = 'crosshair';

  const place = (p: Point) => {
    const c = creating;
    if (!c) return;
    c.object = { ...c.object, center: { x: p.x, y: p.y } };
    ctx.objects.setPending({ ...c.target, objects: [c.object] });
  };

  const end = (commit: boolean) => {
    const c = creating;
    creating = null;
    if (!c) return;
    ctx.objects.setPending(null);
    if (commit) ctx.objects.add(c.object, 'history.addStep');
  };

  return {
    cursor: () => ({ css: drag?.cursor ?? cursor }),

    onHover(e) {
      const next = hoverCursor(ctx, { x: e.screenX, y: e.screenY }, e, false) ?? 'crosshair';
      if (next !== cursor) {
        cursor = next;
        ctx.refreshCursor();
      }
    },

    onPointerDown(e) {
      if (e.button !== 0 || drag || creating) return;
      drag = beginObjectDrag(ctx, e, { selectOnHit: false });
      if (drag) return;
      const target = pendingTarget(ctx);
      if (!target) return;
      ctx.objects.clearSelection();
      creating = {
        target,
        object: {
          id: newId(),
          type: 'step',
          rotation: 0,
          opacity: 1,
          center: { x: e.x, y: e.y },
          radius: ctx.options('step').size,
          color: ctx.colors().primary,
          shadow: { ...DEFAULT_SHADOW },
        },
      };
      place(e);
    },

    onPointerMove(e) {
      if (drag) {
        drag.move(e);
        return;
      }
      place(e);
    },

    onPointerUp() {
      if (drag) {
        drag.end();
        drag = null;
        return;
      }
      end(true);
    },

    onCancel() {
      drag?.cancel();
      drag = null;
      end(false);
    },

    onDeactivate() {
      drag?.cancel();
      drag = null;
      end(false);
    },

    renderOverlay(overlay: OverlayContext) {
      ctx.objects.renderOverlay(overlay);
    },
  };
}

// ---------------------------------------------------------------------------
// Polygon: click thêm đỉnh; click đỉnh đầu = khép kín; double-click hoặc Enter = kết thúc
// ---------------------------------------------------------------------------

function createPolygonTool(ctx: ToolContext): Tool {
  let points: Point[] = [];
  let hover: Point | null = null;
  let target: Omit<PendingObjects, 'objects'> | null = null;
  let lastDown = 0;
  let drag: ObjectDrag | null = null;
  let cursor = 'crosshair';

  const build = (closed: boolean, withHover: boolean): PolygonObject | null => {
    const all = withHover && hover ? [...points, hover] : points;
    if (all.length < 2) return null;
    const o = ctx.options('shape');
    const colors = ctx.colors();
    return {
      id: newId(),
      type: 'polygon',
      rotation: 0,
      opacity: 1,
      points: all.map((p) => ({ ...p })),
      closed,
      stroke: makeStroke(colors.primary, o.strokeWidth, o.dashed),
      fill: o.fill && closed ? colors.secondary : undefined,
      shadow: o.shadow ? { ...DEFAULT_SHADOW } : undefined,
    };
  };

  const preview = () => {
    const obj = build(false, true);
    ctx.objects.setPending(obj && target ? { ...target, objects: [obj] } : null);
    ctx.invalidateOverlay();
  };

  const finish = (closed: boolean) => {
    const obj = points.length >= (closed ? 3 : 2) ? build(closed, false) : null;
    points = [];
    hover = null;
    target = null;
    ctx.objects.setPending(null);
    if (obj) ctx.objects.add(obj, 'history.addObject');
    ctx.invalidateOverlay();
  };

  const nearFirst = (e: { screenX: number; screenY: number }) => {
    if (points.length < 3) return false;
    const first = points[0];
    const s = ctx.viewport.docToScreen(first);
    return Math.hypot(s.x - e.screenX, s.y - e.screenY) <= CLOSE_RADIUS;
  };

  return {
    cursor: () => ({ css: drag?.cursor ?? cursor }),

    onHover(e) {
      if (points.length > 0) {
        hover = { x: e.x, y: e.y };
        const last = points.at(-1);
        // Shift: bắt góc 15° so với đỉnh trước.
        if (last && e.shiftKey) hover = snapAngle(last, hover);
        preview();
        return;
      }
      const next = hoverCursor(ctx, { x: e.screenX, y: e.screenY }, e, false) ?? 'crosshair';
      if (next !== cursor) {
        cursor = next;
        ctx.refreshCursor();
      }
    },

    onPointerDown(e) {
      if (e.button !== 0 || drag) return;
      if (points.length === 0) {
        drag = beginObjectDrag(ctx, e, { selectOnHit: false });
        if (drag) return;
        target = pendingTarget(ctx);
        if (!target) return;
        ctx.objects.clearSelection();
        points = [{ x: e.x, y: e.y }];
        lastDown = e.timeStamp;
        hover = { x: e.x, y: e.y };
        preview();
        return;
      }
      if (nearFirst(e)) {
        finish(true);
        return;
      }
      const previous = points.at(-1);
      const prevScreen = previous ? ctx.viewport.docToScreen(previous) : null;
      const isDouble =
        e.timeStamp - lastDown < DOUBLE_CLICK_MS &&
        prevScreen !== null &&
        Math.hypot(prevScreen.x - e.screenX, prevScreen.y - e.screenY) <= CLOSE_RADIUS;
      lastDown = e.timeStamp;
      if (isDouble) {
        finish(false);
        return;
      }
      const last = points.at(-1);
      points.push(e.shiftKey && last ? snapAngle(last, e) : { x: e.x, y: e.y });
      preview();
    },

    onPointerMove(e) {
      if (drag) {
        drag.move(e);
        return;
      }
      if (points.length > 0) {
        const last = points.at(-1);
        hover = e.shiftKey && last ? snapAngle(last, e) : { x: e.x, y: e.y };
        preview();
      }
    },

    onPointerUp() {
      if (drag) {
        drag.end();
        drag = null;
      }
    },

    onCancel() {
      drag?.cancel();
      drag = null;
    },

    onDeactivate() {
      drag?.cancel();
      drag = null;
      // Đổi tool giữa chừng: giữ phần đã vẽ nếu đủ đỉnh.
      if (points.length > 0) finish(false);
    },

    onKeyDown(e) {
      if (points.length === 0) return false;
      if (e.key === 'Enter') {
        finish(false);
        return true;
      }
      if (e.key === 'Escape') {
        points = [];
        hover = null;
        target = null;
        ctx.objects.setPending(null);
        return true;
      }
      if (e.key === 'Backspace') {
        points.pop();
        if (points.length === 0) {
          target = null;
          ctx.objects.setPending(null);
        } else preview();
        return true;
      }
      return false;
    },

    renderOverlay(overlay) {
      ctx.objects.renderOverlay(overlay);
      if (points.length === 0) return;
      const { ctx: o, viewport } = overlay;
      // Đánh dấu các đỉnh; đỉnh đầu to hơn để gợi ý click vào đó để khép kín.
      o.save();
      points.forEach((p, i) => {
        const s = viewport.docToScreen(p);
        o.fillStyle = '#FFFFFF';
        o.strokeStyle = '#3B5BDB';
        o.lineWidth = 1.5;
        o.beginPath();
        o.arc(s.x, s.y, i === 0 ? 5 : 3, 0, Math.PI * 2);
        o.fill();
        o.stroke();
      });
      o.restore();
    },
  };
}

// ---------------------------------------------------------------------------

const define = (
  id: ToolId,
  icon: string,
  group: ToolDefinition['group'],
  optionGroup: ToolDefinition['optionGroup'],
  create: (ctx: ToolContext) => Tool,
  shortcut?: string,
): ToolDefinition => ({
  id,
  group,
  icon,
  labelKey: id,
  shortcut,
  layerKinds: ['vector'],
  optionGroup,
  altEyedropper: true,
  create,
});

export const rectTool = define('rect', 'rect', 'shape', 'shape', (ctx) =>
  createDragTool(ctx, buildRectLike('rect'), 'history.addObject'),
);
export const ellipseTool = define('ellipse', 'ellipse', 'shape', 'shape', (ctx) =>
  createDragTool(ctx, buildRectLike('ellipse'), 'history.addObject'),
);
export const lineTool = define('line', 'line', 'shape', 'shape', (ctx) =>
  createDragTool(ctx, buildLine, 'history.addObject'),
);
export const arrowTool = define(
  'arrow',
  'arrow',
  'shape',
  'arrow',
  (ctx) => createDragTool(ctx, buildArrow, 'history.addArrow'),
  'A',
);
export const polygonTool = define('polygon', 'polygon', 'shape', 'shape', createPolygonTool);
export const highlightTool = define(
  'highlight',
  'highlight',
  'annotate',
  'highlight',
  (ctx) => createDragTool(ctx, buildHighlight, 'history.addHighlight'),
  'H',
);
export const redactTool = define(
  'redact',
  'redact',
  'annotate',
  'redact',
  (ctx) => createDragTool(ctx, buildRedact, 'history.addRedact'),
  'K',
);
export const stepTool = define('step', 'step', 'annotate', 'step', createStepTool, 'N');
export const spotlightTool = define('spotlight', 'spotlight', 'annotate', 'spotlight', (ctx) =>
  createDragTool(ctx, buildSpotlight, 'history.addSpotlight'),
);
export const magnifierTool = define('magnifier', 'magnifier', 'annotate', 'magnifier', (ctx) =>
  createDragTool(ctx, buildMagnifier, 'history.addMagnifier'),
);
