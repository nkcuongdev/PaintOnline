import type { ArrowObject, LineObject, Point, PolygonObject } from '../../core/types';
import { colorToCss } from '../../utils/color';
import { aaPad, applyStroke, paintWithShadow, shadowPad } from './draw';
import {
  boundsOfPoints,
  controlThrough,
  distanceToSegment,
  pointInPolygon,
  quadraticPoint,
  snapAngle,
} from './geometry';
import type { HandleId, ObjectRenderer } from './types';

/** Line, Arrow (thẳng hoặc cong qua điểm uốn) và Polygon: đối tượng dạng điểm. */

function handleIndex(handle: HandleId): number {
  return handle.startsWith('p') ? Number(handle.slice(1)) : -1;
}

function translatePoint(p: Readonly<Point>, dx: number, dy: number): Point {
  return { x: p.x + dx, y: p.y + dy };
}

// ---------------------------------------------------------------------------
// Line
// ---------------------------------------------------------------------------

export const lineRenderer: ObjectRenderer<LineObject> = {
  draw(ctx, obj) {
    ctx.save();
    ctx.globalAlpha *= obj.opacity;
    paintWithShadow(
      ctx,
      obj.shadow,
      () => {
        applyStroke(ctx, obj.stroke);
        ctx.beginPath();
        ctx.moveTo(obj.from.x, obj.from.y);
        ctx.lineTo(obj.to.x, obj.to.y);
        ctx.stroke();
      },
      false,
    );
    ctx.restore();
  },
  bounds: (obj) =>
    aaPad(boundsOfPoints([obj.from, obj.to]), obj.stroke.width / 2 + shadowPad(obj.shadow)),
  hitTest: (obj, p, tolerance) =>
    distanceToSegment(p, obj.from, obj.to) <= obj.stroke.width / 2 + tolerance,
  frame: (obj) => ({ kind: 'points', points: [obj.from, obj.to], control: null, closed: false }),
  translate: (obj, dx, dy) => ({
    ...obj,
    from: translatePoint(obj.from, dx, dy),
    to: translatePoint(obj.to, dx, dy),
  }),
  dragHandle(start, handle, p, mods) {
    if (handle === 'p0') return { ...start, from: mods.shift ? snapAngle(start.to, p) : { ...p } };
    if (handle === 'p1') return { ...start, to: mods.shift ? snapAngle(start.from, p) : { ...p } };
    return start;
  },
};

// ---------------------------------------------------------------------------
// Arrow
// ---------------------------------------------------------------------------

export interface ArrowHead {
  tip: Point;
  left: Point;
  right: Point;
  /** Điểm thân mũi tên dừng lại (để đầu nét không lòi ra khỏi đầu mũi tên). */
  shaftEnd: Point;
}

export interface ArrowGeometry {
  start: Point;
  end: Point;
  control: Point | null;
  heads: ArrowHead[];
}

function unit(x: number, y: number): Point {
  const len = Math.hypot(x, y);
  return len === 0 ? { x: 1, y: 0 } : { x: x / len, y: y / len };
}

function headAt(
  tip: Point,
  from: Point,
  length: number,
  width: number,
  kind: ArrowObject['head'],
  stroke: number,
): ArrowHead {
  const d = unit(tip.x - from.x, tip.y - from.y);
  const base = { x: tip.x - d.x * length, y: tip.y - d.y * length };
  const nx = -d.y;
  const ny = d.x;
  const inset = kind === 'triangle' ? length * 0.7 : stroke * 0.5;
  return {
    tip,
    left: { x: base.x + nx * width, y: base.y + ny * width },
    right: { x: base.x - nx * width, y: base.y - ny * width },
    shaftEnd: kind === 'none' ? tip : { x: tip.x - d.x * inset, y: tip.y - d.y * inset },
  };
}

/** Hình học mũi tên: kích thước đầu tỉ lệ với độ dày nét, thu nhỏ khi mũi tên ngắn. */
export function arrowGeometry(obj: Readonly<ArrowObject>): ArrowGeometry {
  const w = obj.stroke.width;
  const length = Math.hypot(obj.to.x - obj.from.x, obj.to.y - obj.from.y);
  let headLength = Math.max(10, w * 3.2);
  const maxHead = length * (obj.bothEnds ? 0.4 : 0.6);
  if (headLength > maxHead) headLength = Math.max(2, maxHead);
  const headWidth = headLength * 0.55;
  const control = obj.control ?? null;
  const heads: ArrowHead[] = [];
  if (obj.head !== 'none') {
    heads.push(headAt(obj.to, control ?? obj.from, headLength, headWidth, obj.head, w));
    if (obj.bothEnds)
      heads.push(headAt(obj.from, control ?? obj.to, headLength, headWidth, obj.head, w));
  }
  return {
    start: obj.bothEnds && heads[1] ? heads[1].shaftEnd : obj.from,
    end: heads[0]?.shaftEnd ?? obj.to,
    control,
    heads,
  };
}

export const arrowRenderer: ObjectRenderer<ArrowObject> = {
  draw(ctx, obj) {
    const g = arrowGeometry(obj);
    ctx.save();
    ctx.globalAlpha *= obj.opacity;
    const color = colorToCss(obj.stroke.color);
    paintWithShadow(
      ctx,
      obj.shadow,
      () => {
        applyStroke(ctx, obj.stroke);
        ctx.beginPath();
        ctx.moveTo(g.start.x, g.start.y);
        if (g.control) ctx.quadraticCurveTo(g.control.x, g.control.y, g.end.x, g.end.y);
        else ctx.lineTo(g.end.x, g.end.y);
        ctx.stroke();
        ctx.setLineDash([]);
        for (const head of g.heads) {
          ctx.beginPath();
          ctx.moveTo(head.left.x, head.left.y);
          ctx.lineTo(head.tip.x, head.tip.y);
          ctx.lineTo(head.right.x, head.right.y);
          if (obj.head === 'triangle') {
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
            // Viền mảnh cùng màu để đầu mũi tên nét như thân.
            ctx.lineWidth = Math.min(obj.stroke.width, 2);
            ctx.lineJoin = 'round';
            ctx.stroke();
          } else {
            ctx.lineJoin = 'round';
            ctx.stroke();
          }
        }
      },
      false,
    );
    ctx.restore();
  },
  bounds(obj) {
    const g = arrowGeometry(obj);
    const points: Point[] = [obj.from, obj.to];
    if (g.control) points.push(quadraticPoint(obj.from, g.control, obj.to, 0.5), g.control);
    for (const head of g.heads) points.push(head.left, head.right);
    return aaPad(boundsOfPoints(points), obj.stroke.width / 2 + shadowPad(obj.shadow));
  },
  hitTest(obj, p, tolerance) {
    const reach = obj.stroke.width / 2 + tolerance;
    const g = arrowGeometry(obj);
    if (!g.control) {
      if (distanceToSegment(p, obj.from, obj.to) <= reach) return true;
    } else {
      let prev = obj.from;
      for (let i = 1; i <= 24; i++) {
        const next = quadraticPoint(obj.from, g.control, obj.to, i / 24);
        if (distanceToSegment(p, prev, next) <= reach) return true;
        prev = next;
      }
    }
    return g.heads.some((h) => pointInPolygon(p, [h.tip, h.left, h.right]));
  },
  frame(obj) {
    const mid = obj.control
      ? quadraticPoint(obj.from, obj.control, obj.to, 0.5)
      : { x: (obj.from.x + obj.to.x) / 2, y: (obj.from.y + obj.to.y) / 2 };
    return { kind: 'points', points: [obj.from, obj.to], control: mid, closed: false };
  },
  translate: (obj, dx, dy) => ({
    ...obj,
    from: translatePoint(obj.from, dx, dy),
    to: translatePoint(obj.to, dx, dy),
    control: obj.control ? translatePoint(obj.control, dx, dy) : undefined,
  }),
  dragHandle(start, handle, p, mods) {
    if (handle === 'control') {
      const straightMid = {
        x: (start.from.x + start.to.x) / 2,
        y: (start.from.y + start.to.y) / 2,
      };
      // Kéo điểm uốn về gần đường thẳng thì mũi tên lại thẳng.
      const straight =
        Math.hypot(p.x - straightMid.x, p.y - straightMid.y) < Math.max(3, start.stroke.width);
      return { ...start, control: straight ? undefined : controlThrough(start.from, p, start.to) };
    }
    // Giữ hình dạng cong khi kéo đầu mút: điểm uốn dời theo cùng tỉ lệ.
    const moveEnd = (from: Point, to: Point): ArrowObject => {
      if (!start.control) return { ...start, from, to };
      const mid = quadraticPoint(start.from, start.control, start.to, 0.5);
      const oldMid = { x: (start.from.x + start.to.x) / 2, y: (start.from.y + start.to.y) / 2 };
      const newMid = {
        x: (from.x + to.x) / 2 + (mid.x - oldMid.x),
        y: (from.y + to.y) / 2 + (mid.y - oldMid.y),
      };
      return { ...start, from, to, control: controlThrough(from, newMid, to) };
    };
    if (handle === 'p0') return moveEnd(mods.shift ? snapAngle(start.to, p) : { ...p }, start.to);
    if (handle === 'p1')
      return moveEnd(start.from, mods.shift ? snapAngle(start.from, p) : { ...p });
    return start;
  },
};

// ---------------------------------------------------------------------------
// Polygon
// ---------------------------------------------------------------------------

export const polygonRenderer: ObjectRenderer<PolygonObject> = {
  draw(ctx, obj) {
    if (obj.points.length < 2) return;
    ctx.save();
    ctx.globalAlpha *= obj.opacity;
    const paint = () => {
      ctx.beginPath();
      obj.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      if (obj.closed) ctx.closePath();
      if (obj.closed && obj.fill) {
        ctx.fillStyle = colorToCss(obj.fill);
        ctx.fill();
      }
      if (obj.stroke && obj.stroke.width > 0) {
        applyStroke(ctx, obj.stroke);
        ctx.stroke();
      }
    };
    paintWithShadow(
      ctx,
      obj.shadow,
      paint,
      obj.closed && obj.fill !== undefined && obj.stroke !== undefined,
    );
    ctx.restore();
  },
  bounds: (obj) =>
    aaPad(boundsOfPoints(obj.points), (obj.stroke?.width ?? 0) / 2 + shadowPad(obj.shadow)),
  hitTest(obj, p, tolerance) {
    if (obj.closed && obj.fill && pointInPolygon(p, obj.points)) return true;
    const reach = (obj.stroke?.width ?? 0) / 2 + tolerance;
    const n = obj.points.length;
    const edges = obj.closed ? n : n - 1;
    for (let i = 0; i < edges; i++) {
      const a = obj.points[i];
      const b = obj.points[(i + 1) % n];
      if (distanceToSegment(p, a, b) <= reach) return true;
    }
    return false;
  },
  frame: (obj) => ({ kind: 'points', points: obj.points, control: null, closed: obj.closed }),
  translate: (obj, dx, dy) => ({
    ...obj,
    points: obj.points.map((p) => translatePoint(p, dx, dy)),
  }),
  dragHandle(start, handle, p, mods) {
    const i = handleIndex(handle);
    if (i < 0 || i >= start.points.length) return start;
    const prev = i > 0 ? start.points[i - 1] : start.closed ? start.points.at(-1) : undefined;
    const target = mods.shift && prev ? snapAngle(prev, p) : { ...p };
    return { ...start, points: start.points.map((q, k) => (k === i ? target : q)) };
  },
};
