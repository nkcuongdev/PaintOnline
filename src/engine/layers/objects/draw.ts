import type { ObjectShadow, Rect, Stroke } from '../../core/types';
import type { Ctx2D } from '../../memory/surfaces';
import { colorToCss } from '../../utils/color';
import { inflateRect } from '../../utils/rect';
import { rectCenter } from './geometry';

/** Bóng đổ mặc định khi bật tùy chọn "Bóng đổ" cho shape/mũi tên. */
export const DEFAULT_SHADOW: ObjectShadow = { color: '#00000059', blur: 8, offsetX: 2, offsetY: 3 };

/** Tỉ lệ của ma trận hiện tại — `shadowBlur`/`shadowOffset` không theo ma trận nên phải tự nhân. */
function currentScale(ctx: Ctx2D): number {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b) || 1;
}

export function applyShadow(ctx: Ctx2D, shadow: ObjectShadow | undefined): void {
  if (!shadow) return;
  const s = currentScale(ctx);
  ctx.shadowColor = colorToCss(shadow.color);
  ctx.shadowBlur = shadow.blur * s;
  ctx.shadowOffsetX = shadow.offsetX * s;
  ctx.shadowOffsetY = shadow.offsetY * s;
}

export function clearShadow(ctx: Ctx2D): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** Phần nới hình bao cho bóng đổ. */
export function shadowPad(shadow: ObjectShadow | undefined): number {
  if (!shadow) return 0;
  return shadow.blur * 2 + Math.max(Math.abs(shadow.offsetX), Math.abs(shadow.offsetY));
}

export function applyStroke(
  ctx: Ctx2D,
  stroke: Readonly<Stroke>,
  join: CanvasLineJoin = 'round',
): void {
  ctx.strokeStyle = colorToCss(stroke.color);
  ctx.lineWidth = stroke.width;
  ctx.lineCap = stroke.cap ?? 'round';
  ctx.lineJoin = join;
  ctx.setLineDash(stroke.dash ?? []);
}

/** Nét đứt theo độ dày nét (dài 3×, khoảng 2×) — đơn vị document nên đúng ở mọi mức zoom. */
export function dashFor(width: number): number[] {
  return [width * 3, width * 2];
}

/** Xoay context quanh tâm hình chữ nhật. */
export function rotateContext(ctx: Ctx2D, rect: Readonly<Rect>, rotation: number): void {
  if (rotation === 0) return;
  const c = rectCenter(rect);
  ctx.translate(c.x, c.y);
  ctx.rotate(rotation);
  ctx.translate(-c.x, -c.y);
}

/**
 * Vẽ một hình có bóng: lượt 1 vẽ kèm bóng, lượt 2 (khi vừa tô vừa viền) vẽ lại không bóng để bóng
 * của nét viền không đè lên phần tô bên trong.
 */
export function paintWithShadow(
  ctx: Ctx2D,
  shadow: ObjectShadow | undefined,
  paint: () => void,
  needsSecondPass: boolean,
): void {
  if (!shadow) {
    paint();
    return;
  }
  ctx.save();
  applyShadow(ctx, shadow);
  paint();
  ctx.restore();
  if (needsSecondPass) paint();
}

/** Nới hình bao 1 px cho khử răng cưa. */
export function aaPad(r: Readonly<Rect>, pad: number): Rect {
  return inflateRect(r, pad + 1);
}
