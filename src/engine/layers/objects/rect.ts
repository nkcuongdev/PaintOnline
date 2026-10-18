import type { EllipseObject, RectObject } from '../../core/types';
import type { Ctx2D } from '../../memory/surfaces';
import { colorToCss } from '../../utils/color';
import { ALL_BOX_HANDLES, dragBox, insideBox, onBoxEdge, translateRect } from './box';
import { aaPad, applyStroke, paintWithShadow, rotateContext, shadowPad } from './draw';
import { rectCenter, rotatedBounds, toLocal } from './geometry';
import type { ObjectRenderer } from './types';

/** Rectangle (kể cả bo góc — `cornerRadius`) và Ellipse: khung xoay được, viền + tô tùy chọn. */

function tracePath(ctx: Ctx2D, obj: RectObject | EllipseObject): void {
  const r = obj.rect;
  ctx.beginPath();
  if (obj.type === 'ellipse') {
    const c = rectCenter(r);
    ctx.ellipse(c.x, c.y, r.width / 2, r.height / 2, 0, 0, Math.PI * 2);
    return;
  }
  const radius = Math.min(obj.cornerRadius, r.width / 2, r.height / 2);
  if (radius > 0) ctx.roundRect(r.x, r.y, r.width, r.height, radius);
  else ctx.rect(r.x, r.y, r.width, r.height);
}

function drawShape(ctx: Ctx2D, obj: RectObject | EllipseObject): void {
  ctx.save();
  ctx.globalAlpha *= obj.opacity;
  rotateContext(ctx, obj.rect, obj.rotation);
  const paint = () => {
    tracePath(ctx, obj);
    if (obj.fill) {
      ctx.fillStyle = colorToCss(obj.fill);
      ctx.fill();
    }
    if (obj.stroke && obj.stroke.width > 0) {
      applyStroke(
        ctx,
        obj.stroke,
        obj.type === 'rect' && obj.cornerRadius === 0 ? 'miter' : 'round',
      );
      ctx.stroke();
    }
  };
  paintWithShadow(ctx, obj.shadow, paint, obj.fill !== undefined && obj.stroke !== undefined);
  ctx.restore();
}

function boundsOf(obj: RectObject | EllipseObject) {
  const half = obj.stroke ? obj.stroke.width / 2 : 0;
  return aaPad(rotatedBounds(obj.rect, obj.rotation, half), shadowPad(obj.shadow));
}

export const rectRenderer: ObjectRenderer<RectObject> = {
  draw: drawShape,
  bounds: boundsOf,
  hitTest(obj, p, tolerance) {
    if (obj.fill)
      return insideBox(p, obj.rect, obj.rotation, tolerance + (obj.stroke?.width ?? 0) / 2);
    return onBoxEdge(p, obj.rect, obj.rotation, (obj.stroke?.width ?? 0) / 2, tolerance);
  },
  frame: (obj) => ({
    kind: 'box',
    rect: obj.rect,
    rotation: obj.rotation,
    handles: ALL_BOX_HANDLES,
  }),
  translate: (obj, dx, dy) => ({ ...obj, rect: translateRect(obj.rect, dx, dy) }),
  dragHandle(start, handle, p, mods) {
    const next = dragBox(start.rect, start.rotation, handle, p, mods);
    return { ...start, rect: next.rect, rotation: next.rotation };
  },
};

export const ellipseRenderer: ObjectRenderer<EllipseObject> = {
  draw: drawShape,
  bounds: boundsOf,
  hitTest(obj, p, tolerance) {
    const r = obj.rect;
    const l = toLocal(p, r, obj.rotation);
    const c = rectCenter(r);
    const rx = Math.max(0.5, r.width / 2);
    const ry = Math.max(0.5, r.height / 2);
    const norm = Math.hypot((l.x - c.x) / rx, (l.y - c.y) / ry);
    const half = (obj.stroke?.width ?? 0) / 2;
    // Khoảng cách xấp xỉ tới viền ellipse.
    const distance = Math.abs(norm - 1) * Math.min(rx, ry);
    if (obj.fill) return norm <= 1 || distance <= half + tolerance;
    return distance <= half + tolerance;
  },
  frame: (obj) => ({
    kind: 'box',
    rect: obj.rect,
    rotation: obj.rotation,
    handles: ALL_BOX_HANDLES,
  }),
  translate: (obj, dx, dy) => ({ ...obj, rect: translateRect(obj.rect, dx, dy) }),
  dragHandle(start, handle, p, mods) {
    const next = dragBox(start.rect, start.rotation, handle, p, mods);
    return { ...start, rect: next.rect, rotation: next.rotation };
  },
};
