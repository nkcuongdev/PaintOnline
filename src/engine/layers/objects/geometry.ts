import type { Point, Rect } from '../../core/types';

/**
 * Hình học dùng chung cho đối tượng vector: xoay quanh tâm, khung chọn có xoay, kéo handle, bắt
 * góc 15°, khoảng cách tới đoạn thẳng. Hàm thuần — có unit test (objects.test.ts).
 */

/** Bước bắt góc khi giữ Shift (mục 2: shape "snap góc 15°"). */
export const ANGLE_SNAP = Math.PI / 12;

export function rectCenter(r: Readonly<Rect>): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** Xoay điểm `p` quanh `c` một góc `angle` (radian). */
export function rotateAround(p: Readonly<Point>, c: Readonly<Point>, angle: number): Point {
  if (angle === 0) return { x: p.x, y: p.y };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/** Hình chữ nhật chuẩn hóa (cạnh dương) từ hai góc đối diện. */
export function rectFromPoints(a: Readonly<Point>, b: Readonly<Point>): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/** Kéo từ `a` tới `b`, giữ Shift = hình vuông (cạnh theo chiều dài hơn), giữ đúng hướng kéo. */
export function constrainSquare(a: Readonly<Point>, b: Readonly<Point>): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: a.x + Math.sign(dx || 1) * side, y: a.y + Math.sign(dy || 1) * side };
}

/** Bắt góc của đoạn a → b về bội số 15° (giữ nguyên độ dài). */
export function snapAngle(a: Readonly<Point>, b: Readonly<Point>, step = ANGLE_SNAP): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: b.x, y: b.y };
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: a.x + Math.cos(angle) * length, y: a.y + Math.sin(angle) * length };
}

export function snapRotation(angle: number, step = ANGLE_SNAP): number {
  return Math.round(angle / step) * step;
}

/** Chuẩn hóa góc về (−π, π]. */
export function normalizeAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a <= -Math.PI) a += Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  return a;
}

/** Khoảng cách từ điểm tới đoạn thẳng a–b. */
export function distanceToSegment(
  p: Readonly<Point>,
  a: Readonly<Point>,
  b: Readonly<Point>,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** Điểm trên đường cong Bézier bậc hai tại t. */
export function quadraticPoint(
  p0: Readonly<Point>,
  c: Readonly<Point>,
  p1: Readonly<Point>,
  t: number,
): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  };
}

/** Điểm điều khiển để đường cong đi qua `mid` tại t = 0,5. */
export function controlThrough(
  p0: Readonly<Point>,
  mid: Readonly<Point>,
  p1: Readonly<Point>,
): Point {
  return { x: 2 * mid.x - (p0.x + p1.x) / 2, y: 2 * mid.y - (p0.y + p1.y) / 2 };
}

/** Điểm có nằm trong đa giác (even–odd). */
export function pointInPolygon(p: Readonly<Point>, points: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Hình bao của một tập điểm. */
export function boundsOfPoints(points: readonly Point[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (minX === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Bốn góc của hình chữ nhật xoay quanh tâm. */
export function rotatedCorners(r: Readonly<Rect>, rotation: number): Point[] {
  const c = rectCenter(r);
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ].map((p) => rotateAround(p, c, rotation));
}

/** Hình bao (trục thẳng) của hình chữ nhật xoay, nới thêm `pad` mỗi phía trước khi xoay. */
export function rotatedBounds(r: Readonly<Rect>, rotation: number, pad = 0): Rect {
  const inflated = {
    x: r.x - pad,
    y: r.y - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  };
  return boundsOfPoints(rotatedCorners(inflated, rotation));
}

/** Điểm `p` (document) trong hệ tọa độ chưa xoay của hình chữ nhật xoay. */
export function toLocal(p: Readonly<Point>, r: Readonly<Rect>, rotation: number): Point {
  return rotateAround(p, rectCenter(r), -rotation);
}

// ---------------------------------------------------------------------------
// Handle của khung chọn
// ---------------------------------------------------------------------------

export type BoxHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

export const BOX_RESIZE_HANDLES: readonly BoxHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
];

/** Vị trí (chưa xoay) của handle theo tỉ lệ khung: x, y ∈ {0, 0,5, 1}. */
const HANDLE_FACTORS: Readonly<Record<Exclude<BoxHandle, 'rotate'>, readonly [number, number]>> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
};

/** Vị trí handle trong document (đã xoay). `rotateOffset`: khoảng cách handle xoay phía trên. */
export function boxHandlePosition(
  r: Readonly<Rect>,
  rotation: number,
  handle: BoxHandle,
  rotateOffset: number,
): Point {
  const c = rectCenter(r);
  if (handle === 'rotate') {
    return rotateAround({ x: c.x, y: r.y - rotateOffset }, c, rotation);
  }
  const [fx, fy] = HANDLE_FACTORS[handle];
  return rotateAround({ x: r.x + r.width * fx, y: r.y + r.height * fy }, c, rotation);
}

/**
 * Kéo một handle đổi kích thước của hình chữ nhật xoay tới `p` (document). Cạnh/góc đối diện
 * đứng yên trong không gian document. `keepRatio` giữ tỉ lệ khung ban đầu (Shift).
 * `minSize` chặn khung bị thu về 0.
 */
export function resizeBox(
  start: Readonly<Rect>,
  rotation: number,
  handle: Exclude<BoxHandle, 'rotate'>,
  p: Readonly<Point>,
  keepRatio: boolean,
  minSize = 1,
): Rect {
  const c = rectCenter(start);
  const local = rotateAround(p, c, -rotation);
  const [fx, fy] = HANDLE_FACTORS[handle];
  // Điểm neo (đối diện handle) trong hệ chưa xoay.
  const ax = start.x + start.width * (1 - fx);
  const ay = start.y + start.height * (1 - fy);
  const movesX = fx !== 0.5;
  const movesY = fy !== 0.5;

  let x0 = movesX ? Math.min(ax, local.x) : start.x;
  let x1 = movesX ? Math.max(ax, local.x) : start.x + start.width;
  let y0 = movesY ? Math.min(ay, local.y) : start.y;
  let y1 = movesY ? Math.max(ay, local.y) : start.y + start.height;

  if (keepRatio && movesX && movesY && start.width > 0 && start.height > 0) {
    const ratio = start.width / start.height;
    let w = x1 - x0;
    let h = y1 - y0;
    if (w / h > ratio) h = w / ratio;
    else w = h * ratio;
    // Mở rộng ra phía handle, neo đứng yên.
    x0 = local.x < ax ? ax - w : ax;
    x1 = x0 + w;
    y0 = local.y < ay ? ay - h : ay;
    y1 = y0 + h;
  }
  if (x1 - x0 < minSize) {
    if (movesX && local.x < ax) x0 = x1 - minSize;
    else x1 = x0 + minSize;
  }
  if (y1 - y0 < minSize) {
    if (movesY && local.y < ay) y0 = y1 - minSize;
    else y1 = y0 + minSize;
  }

  // Hình mới trong hệ chưa xoay (quanh tâm cũ) → đặt lại theo tâm mới để neo không trôi.
  const localCenter = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const worldCenter = rotateAround(localCenter, c, rotation);
  const w = x1 - x0;
  const h = y1 - y0;
  return { x: worldCenter.x - w / 2, y: worldCenter.y - h / 2, width: w, height: h };
}

/** Góc xoay khi kéo handle xoay tới `p` (handle nằm phía trên tâm). */
export function rotationFromHandle(r: Readonly<Rect>, p: Readonly<Point>, snap: boolean): number {
  const c = rectCenter(r);
  const angle = normalizeAngle(Math.atan2(p.y - c.y, p.x - c.x) + Math.PI / 2);
  return snap ? normalizeAngle(snapRotation(angle)) : angle;
}

/** Hai hình chữ nhật có giao nhau không (dùng cho chọn bằng khung kéo). */
export function rectsOverlap(a: Readonly<Rect>, b: Readonly<Rect>): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
