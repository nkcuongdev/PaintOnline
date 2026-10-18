import type { Point, Rect } from '../../core/types';
import { resizeBox, rotationFromHandle, toLocal, type BoxHandle } from './geometry';
import type { DragModifiers, HandleId } from './types';

/** Thao tác dùng chung cho đối tượng dạng khung (rect, ellipse, highlight, redact, text). */

export const ALL_BOX_HANDLES: readonly BoxHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
  'rotate',
];

export const RESIZE_ONLY_HANDLES: readonly BoxHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
];

/** Điểm có nằm trong khung xoay (nới `tolerance`). */
export function insideBox(
  p: Readonly<Point>,
  rect: Readonly<Rect>,
  rotation: number,
  tolerance: number,
): boolean {
  const l = toLocal(p, rect, rotation);
  return (
    l.x >= rect.x - tolerance &&
    l.x <= rect.x + rect.width + tolerance &&
    l.y >= rect.y - tolerance &&
    l.y <= rect.y + rect.height + tolerance
  );
}

/** Điểm có nằm trên viền khung xoay (độ dày `half` mỗi phía, nới `tolerance`). */
export function onBoxEdge(
  p: Readonly<Point>,
  rect: Readonly<Rect>,
  rotation: number,
  half: number,
  tolerance: number,
): boolean {
  const reach = half + tolerance;
  if (!insideBox(p, rect, rotation, reach)) return false;
  const l = toLocal(p, rect, rotation);
  const inner = {
    x: rect.x + reach,
    y: rect.y + reach,
    width: rect.width - reach * 2,
    height: rect.height - reach * 2,
  };
  if (inner.width <= 0 || inner.height <= 0) return true;
  return !(
    l.x > inner.x &&
    l.x < inner.x + inner.width &&
    l.y > inner.y &&
    l.y < inner.y + inner.height
  );
}

/** Kết quả kéo handle của khung: hình mới và góc xoay mới. */
export function dragBox(
  rect: Readonly<Rect>,
  rotation: number,
  handle: HandleId,
  p: Readonly<Point>,
  mods: DragModifiers,
): { rect: Rect; rotation: number } {
  if (handle === 'rotate')
    return { rect: { ...rect }, rotation: rotationFromHandle(rect, p, mods.shift) };
  if (handle === 'control' || handle.startsWith('p')) return { rect: { ...rect }, rotation };
  return {
    rect: resizeBox(rect, rotation, handle as Exclude<BoxHandle, 'rotate'>, p, mods.shift),
    rotation,
  };
}

export function translateRect(r: Readonly<Rect>, dx: number, dy: number): Rect {
  return { x: r.x + dx, y: r.y + dy, width: r.width, height: r.height };
}
