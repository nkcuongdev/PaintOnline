import type { HighlightObject, RedactObject, Rect } from '../../core/types';
import { colorToCss, opaqueColor } from '../../utils/color';
import { ALL_BOX_HANDLES, dragBox, insideBox, RESIZE_ONLY_HANDLES, translateRect } from './box';
import { aaPad, rotateContext } from './draw';
import { rotatedBounds } from './geometry';
import type { ObjectRenderer } from './types';

/**
 * Highlight: tô màu bằng `multiply` (mục 2) — chữ bên dưới vẫn đọc được.
 * Redact (mục 5.4): luôn đục hoàn toàn, căn ra ngoài theo pixel nguyên và không xoay, nên ảnh xuất ra
 * không còn chứa bất kỳ pixel gốc nào trong vùng che. Khảm/làm mờ vẽ ảnh nền đã xử lý do Compositor
 * đưa vào (`extra.backdrop`, cũng đục); thiếu ảnh đó thì tô kín — không bao giờ để lộ nền.
 */

export const highlightRenderer: ObjectRenderer<HighlightObject> = {
  draw(ctx, obj) {
    ctx.save();
    ctx.globalAlpha *= obj.opacity;
    ctx.globalCompositeOperation = 'multiply';
    rotateContext(ctx, obj.rect, obj.rotation);
    ctx.fillStyle = colorToCss(obj.color);
    ctx.fillRect(obj.rect.x, obj.rect.y, obj.rect.width, obj.rect.height);
    ctx.restore();
  },
  bounds: (obj) => aaPad(rotatedBounds(obj.rect, obj.rotation), 0),
  hitTest: (obj, p, tolerance) => insideBox(p, obj.rect, obj.rotation, tolerance),
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

/** Vùng che thực tế: làm tròn RA NGOÀI về pixel nguyên để mép không còn pixel gốc bán phần. */
export function redactPixelRect(obj: Readonly<RedactObject>): Rect {
  const x = Math.floor(obj.rect.x);
  const y = Math.floor(obj.rect.y);
  return {
    x,
    y,
    width: Math.ceil(obj.rect.x + obj.rect.width) - x,
    height: Math.ceil(obj.rect.y + obj.rect.height) - y,
  };
}

export const redactRenderer: ObjectRenderer<RedactObject> = {
  draw(ctx, obj, _env, extra) {
    const r = redactPixelRect(obj);
    ctx.save();
    // An toàn tuyệt đối: bỏ qua opacity, luôn source-over, màu luôn đục.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const backdrop = obj.mode === 'solid' ? null : extra?.backdrop;
    if (backdrop) {
      const b = backdrop.rect;
      ctx.drawImage(backdrop.image, 0, 0, b.width, b.height, b.x, b.y, b.width, b.height);
    } else {
      ctx.fillStyle = colorToCss(opaqueColor(obj.color));
      ctx.fillRect(r.x, r.y, r.width, r.height);
    }
    ctx.restore();
  },
  bounds: (obj) => aaPad(redactPixelRect(obj), 0),
  hitTest: (obj, p, tolerance) => insideBox(p, redactPixelRect(obj), 0, tolerance),
  frame: (obj) => ({ kind: 'box', rect: obj.rect, rotation: 0, handles: RESIZE_ONLY_HANDLES }),
  translate: (obj, dx, dy) => ({ ...obj, rect: translateRect(obj.rect, dx, dy) }),
  dragHandle(start, handle, p, mods) {
    const next = dragBox(start.rect, 0, handle, p, mods);
    return { ...start, rect: next.rect, rotation: 0 };
  },
};
