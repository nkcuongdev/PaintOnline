import type { Point } from '../core/types';

export function distance(a: Readonly<Point>, b: Readonly<Point>): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Đoạn thẳng Bresenham giữa hai điểm nguyên (bao gồm hai đầu) — Pencil (mục 5.5).
 * Gọi `plot(x, y)` cho từng pixel, không cấp phát mảng.
 */
export function bresenham(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  plot: (x: number, y: number) => void,
): void {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(x, y);
    if (x === x1 && y === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * Điểm trên spline Catmull-Rom (đồng đều) giữa p1 và p2 tại t ∈ [0, 1] — làm mượt nét (mục 5.5).
 */
export function catmullRom(
  p0: Readonly<Point>,
  p1: Readonly<Point>,
  p2: Readonly<Point>,
  p3: Readonly<Point>,
  t: number,
  out: Point,
): Point {
  const t2 = t * t;
  const t3 = t2 * t;
  out.x =
    0.5 *
    (2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  out.y =
    0.5 *
    (2 * p1.y +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  return out;
}
