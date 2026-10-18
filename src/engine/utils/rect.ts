import type { Rect } from '../core/types';

/** Phép toán trên hình chữ nhật trục thẳng, tọa độ document (số thực). */

export const EMPTY_RECT: Readonly<Rect> = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });

export function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

export function isEmptyRect(r: Readonly<Rect>): boolean {
  return !(r.width > 0 && r.height > 0);
}

export function rectRight(r: Readonly<Rect>): number {
  return r.x + r.width;
}

export function rectBottom(r: Readonly<Rect>): number {
  return r.y + r.height;
}

/** Hợp hai hình; hình rỗng bị bỏ qua. */
export function unionRect(a: Readonly<Rect>, b: Readonly<Rect>): Rect {
  if (isEmptyRect(a)) return { ...b };
  if (isEmptyRect(b)) return { ...a };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(rectRight(a), rectRight(b)) - x,
    height: Math.max(rectBottom(a), rectBottom(b)) - y,
  };
}

/** Giao hai hình; không giao nhau → EMPTY_RECT. */
export function intersectRect(a: Readonly<Rect>, b: Readonly<Rect>): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(rectRight(a), rectRight(b)) - x;
  const height = Math.min(rectBottom(a), rectBottom(b)) - y;
  if (width <= 0 || height <= 0) return { ...EMPTY_RECT };
  return { x, y, width, height };
}

export function rectsIntersect(a: Readonly<Rect>, b: Readonly<Rect>): boolean {
  return !isEmptyRect(intersectRect(a, b));
}

export function containsRect(outer: Readonly<Rect>, inner: Readonly<Rect>): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    rectRight(inner) <= rectRight(outer) &&
    rectBottom(inner) <= rectBottom(outer)
  );
}

export function rectEquals(a: Readonly<Rect>, b: Readonly<Rect>): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Nới mỗi cạnh thêm `amount`. */
export function inflateRect(r: Readonly<Rect>, amount: number): Rect {
  return {
    x: r.x - amount,
    y: r.y - amount,
    width: r.width + amount * 2,
    height: r.height + amount * 2,
  };
}

/** Làm tròn ra ngoài về pixel nguyên (bao trọn hình gốc). */
export function roundOutRect(r: Readonly<Rect>): Rect {
  const x = Math.floor(r.x);
  const y = Math.floor(r.y);
  return { x, y, width: Math.ceil(rectRight(r)) - x, height: Math.ceil(rectBottom(r)) - y };
}

/** Căn ra ngoài theo lưới `grid` px (vd. 256 cho surface của layer). */
export function alignOutRect(r: Readonly<Rect>, grid: number): Rect {
  const x = Math.floor(r.x / grid) * grid;
  const y = Math.floor(r.y / grid) * grid;
  return {
    x,
    y,
    width: Math.ceil(rectRight(r) / grid) * grid - x,
    height: Math.ceil(rectBottom(r) / grid) * grid - y,
  };
}

/** Hình bao một điểm tròn bán kính `radius`. */
export function rectAroundPoint(x: number, y: number, radius: number): Rect {
  return { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 };
}

export function rectArea(r: Readonly<Rect>): number {
  return isEmptyRect(r) ? 0 : r.width * r.height;
}
