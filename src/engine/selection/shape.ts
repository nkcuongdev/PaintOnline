import type { Point, Rect, SelectionShape } from '../core/types';
import type { Ctx2D } from '../memory/surfaces';
import { boundsOfPoints } from '../layers/objects/geometry';
import { applyMatrix, type Matrix } from '../viewport/transform';

/**
 * Hình học của vùng chọn dạng path (mục 5.7): chữ nhật, ellipse, đa giác Lasso. Tô, cắt nét vẽ và
 * marching ants đều dùng path — không cần mask raster cho các hình này.
 */

/** Số đoạn xấp xỉ ellipse khi cần đa giác (viền khi biến đổi, chứa điểm sau khi xoay). */
const ELLIPSE_SEGMENTS = 96;

/** Hình bao (document, số thực). */
export function shapeBounds(shape: SelectionShape): Rect {
  switch (shape.kind) {
    case 'rect':
    case 'ellipse':
      return { ...shape.rect };
    case 'polygon':
      return boundsOfPoints(shape.points);
  }
}

/** Thêm path của hình vào context (đã đặt ma trận document → đích). */
export function traceShape(ctx: Ctx2D, shape: SelectionShape): void {
  switch (shape.kind) {
    case 'rect': {
      const r = shape.rect;
      ctx.rect(r.x, r.y, r.width, r.height);
      return;
    }
    case 'ellipse': {
      const r = shape.rect;
      ctx.moveTo(r.x + r.width, r.y + r.height / 2);
      ctx.ellipse(
        r.x + r.width / 2,
        r.y + r.height / 2,
        r.width / 2,
        r.height / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.closePath();
      return;
    }
    case 'polygon': {
      if (shape.points.length === 0) return;
      const [first, ...rest] = shape.points;
      ctx.moveTo(first.x, first.y);
      for (const p of rest) ctx.lineTo(p.x, p.y);
      ctx.closePath();
    }
  }
}

/** Điểm (document) có nằm trong hình không — quy tắc nonzero cho đa giác tự cắt. */
export function shapeContains(shape: SelectionShape, p: Readonly<Point>): boolean {
  switch (shape.kind) {
    case 'rect': {
      const r = shape.rect;
      return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
    }
    case 'ellipse': {
      const r = shape.rect;
      const rx = r.width / 2;
      const ry = r.height / 2;
      if (rx <= 0 || ry <= 0) return false;
      const dx = (p.x - (r.x + rx)) / rx;
      const dy = (p.y - (r.y + ry)) / ry;
      return dx * dx + dy * dy <= 1;
    }
    case 'polygon':
      return windingNumber(shape.points, p) !== 0;
  }
}

function windingNumber(points: readonly Point[], p: Readonly<Point>): number {
  let winding = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const cross = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
    if (a.y <= p.y) {
      if (b.y > p.y && cross > 0) winding++;
    } else if (b.y <= p.y && cross < 0) {
      winding--;
    }
  }
  return winding;
}

/** Đường viền khép kín của hình (document) — marching ants, biến đổi hình. */
export function shapeOutline(shape: SelectionShape): Point[] {
  switch (shape.kind) {
    case 'rect': {
      const r = shape.rect;
      return [
        { x: r.x, y: r.y },
        { x: r.x + r.width, y: r.y },
        { x: r.x + r.width, y: r.y + r.height },
        { x: r.x, y: r.y + r.height },
      ];
    }
    case 'ellipse': {
      const r = shape.rect;
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const out: Point[] = [];
      for (let i = 0; i < ELLIPSE_SEGMENTS; i++) {
        const a = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
        out.push({ x: cx + (Math.cos(a) * r.width) / 2, y: cy + (Math.sin(a) * r.height) / 2 });
      }
      return out;
    }
    case 'polygon':
      return shape.points.map((p) => ({ x: p.x, y: p.y }));
  }
}

/**
 * Hình sau phép biến đổi affine (di chuyển, co giãn, xoay vùng chọn nổi). Chữ nhật/ellipse giữ
 * nguyên loại khi phép biến đổi chỉ dời và co giãn theo trục; còn lại thành đa giác.
 */
export function transformShape(shape: SelectionShape, m: Matrix): SelectionShape {
  const axisAligned = Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9;
  if (axisAligned && shape.kind !== 'polygon') {
    const r = shape.rect;
    const a = applyMatrix(m, { x: r.x, y: r.y });
    const b = applyMatrix(m, { x: r.x + r.width, y: r.y + r.height });
    const rect = {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    };
    return { kind: shape.kind, rect };
  }
  return { kind: 'polygon', points: shapeOutline(shape).map((p) => applyMatrix(m, p)) };
}

/** Dời hình (cắt xén/đổi khung document). */
export function translateShape(shape: SelectionShape, dx: number, dy: number): SelectionShape {
  return transformShape(shape, { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy });
}

/** Bỏ các điểm Lasso quá sát nhau (< `minDistance` px document). */
export function simplifyLasso(points: readonly Point[], minDistance: number): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < minDistance) continue;
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

/** Diện tích (giá trị tuyệt đối, công thức shoelace) — bỏ Lasso gần như không có diện tích. */
export function polygonArea(points: readonly Point[]): number {
  let sum = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}
