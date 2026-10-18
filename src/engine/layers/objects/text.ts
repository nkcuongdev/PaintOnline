import type { TextObject } from '../../core/types';
import { colorToCss, parseColor } from '../../utils/color';
import { dragBox, insideBox } from './box';
import { aaPad, rotateContext } from './draw';
import { rotatedBounds } from './geometry';
import { fontCss, layoutText, type TextLayout } from './textLayout';
import type { ObjectEnv, ObjectRenderer } from './types';

/**
 * Chữ (mục 5.10): vẽ bằng `fillText` (không bao giờ render HTML từ dữ liệu người dùng — mục 10.2),
 * tự xuống dòng theo độ rộng khung, căn trái/giữa/phải, nền và viền chữ tùy chọn.
 */

/** Bố cục được nhớ theo đối tượng (đối tượng bất biến) và "thế hệ font" (đổi khi font tải xong). */
const layoutCache = new WeakMap<TextObject, { epoch: number; layout: TextLayout }>();
let fontEpoch = 0;

/** Gọi khi một font web vừa tải xong: mọi bố cục cũ đo bằng font dự phòng, phải đo lại. */
export function invalidateTextLayouts(): void {
  fontEpoch++;
}

export function textLayout(obj: TextObject, env: ObjectEnv): TextLayout {
  const cached = layoutCache.get(obj);
  if (cached?.epoch === fontEpoch) return cached.layout;
  env.ensureFont(obj.font, obj.text);
  const layout = layoutText(obj, env.measure);
  layoutCache.set(obj, { epoch: fontEpoch, layout });
  return layout;
}

/** Độ dày viền chữ theo cỡ chữ. */
export function outlineWidth(obj: Readonly<TextObject>): number {
  return obj.outline ? obj.outline.width : 0;
}

/** Màu viền tương phản với màu chữ (chữ tối → viền trắng, chữ sáng → viền đen). */
export function contrastOutline(color: TextObject['color']): TextObject['color'] {
  const { r, g, b } = parseColor(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? '#000000FF' : '#FFFFFFFF';
}

export const textRenderer: ObjectRenderer<TextObject> = {
  draw(ctx, obj, env) {
    const layout = textLayout(obj, env);
    const { box, padding } = layout;
    ctx.save();
    ctx.globalAlpha *= obj.opacity;
    rotateContext(ctx, box, obj.rotation);
    if (obj.background) {
      ctx.fillStyle = colorToCss(obj.background);
      ctx.beginPath();
      ctx.roundRect(
        box.x - padding,
        box.y - padding,
        box.width + padding * 2,
        box.height + padding * 2,
        Math.min(8, padding),
      );
      ctx.fill();
    }
    ctx.font = fontCss(obj.font);
    ctx.textBaseline = 'middle';
    ctx.textAlign = obj.align;
    const x =
      obj.align === 'left'
        ? box.x
        : obj.align === 'center'
          ? box.x + box.width / 2
          : box.x + box.width;
    const fill = colorToCss(obj.color);
    layout.lines.forEach((line, i) => {
      if (line === '') return;
      const y = box.y + layout.advance * (i + 0.5);
      if (obj.outline && obj.outline.width > 0) {
        ctx.strokeStyle = colorToCss(obj.outline.color);
        ctx.lineWidth = obj.outline.width * 2;
        ctx.lineJoin = 'round';
        ctx.strokeText(line, x, y);
      }
      ctx.fillStyle = fill;
      ctx.fillText(line, x, y);
    });
    ctx.restore();
  },
  bounds(obj, env) {
    const layout = textLayout(obj, env);
    // Nới cho phần nền, viền chữ và nét chữ nghiêng/dấu tiếng Việt vượt khung dòng.
    const pad =
      Math.max(obj.background ? layout.padding : 0, obj.font.size * 0.25) + outlineWidth(obj);
    return aaPad(rotatedBounds(layout.box, obj.rotation, pad), 0);
  },
  hitTest(obj, p, tolerance, env) {
    const layout = textLayout(obj, env);
    return insideBox(
      p,
      layout.box,
      obj.rotation,
      tolerance + (obj.background ? layout.padding : 0),
    );
  },
  frame(obj, env) {
    const layout = textLayout(obj, env);
    return { kind: 'box', rect: layout.box, rotation: obj.rotation, handles: ['w', 'e', 'rotate'] };
  },
  translate: (obj, dx, dy) => ({ ...obj, origin: { x: obj.origin.x + dx, y: obj.origin.y + dy } }),
  dragHandle(start, handle, p, mods, env) {
    const layout = textLayout(start, env);
    const next = dragBox(layout.box, start.rotation, handle, p, { shift: false });
    if (handle === 'rotate') {
      return { ...start, rotation: dragBox(layout.box, start.rotation, handle, p, mods).rotation };
    }
    // Kéo cạnh trái/phải: đặt độ rộng khung xuống dòng.
    return {
      ...start,
      origin: { x: next.rect.x, y: next.rect.y },
      wrapWidth: Math.max(start.font.size, next.rect.width),
    };
  },
};
