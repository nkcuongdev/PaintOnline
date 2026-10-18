import type { StepObject, TextFont } from '../../core/types';
import { colorToCss } from '../../utils/color';
import { dragBox } from './box';
import { aaPad, paintWithShadow, shadowPad } from './draw';
import { rectCenter, type BoxHandle } from './geometry';
import { contrastOutline } from './text';
import { fontCss } from './textLayout';
import type { ObjectRenderer } from './types';

/**
 * Số thứ tự tự tăng ①②③ (Step badge — mục 2, GĐ7): hình tròn màu chính, viền trắng, số ở giữa.
 * Số không lưu trong đối tượng mà do Compositor tính theo thứ tự các Step trong layer — xóa một
 * Step thì các số sau tự đánh lại.
 */

export const STEP_MIN_RADIUS = 8;
export const STEP_MAX_RADIUS = 80;

const CORNER_HANDLES: readonly BoxHandle[] = ['nw', 'ne', 'se', 'sw'];

function stepFont(radius: number, digits: number): TextFont {
  const scale = digits >= 3 ? 0.78 : digits === 2 ? 0.98 : 1.18;
  return { family: 'Inter Variable', size: radius * scale, weight: 700, italic: false };
}

function boxOf(obj: StepObject) {
  const r = obj.radius;
  return { x: obj.center.x - r, y: obj.center.y - r, width: r * 2, height: r * 2 };
}

export const stepRenderer: ObjectRenderer<StepObject> = {
  draw(ctx, obj, env, extra) {
    const { center, radius } = obj;
    const ring = Math.max(1, radius * 0.12);
    ctx.save();
    ctx.globalAlpha *= obj.opacity;
    paintWithShadow(
      ctx,
      obj.shadow,
      () => {
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = colorToCss(obj.color);
        ctx.fill();
      },
      false,
    );
    // Viền trắng phía trong mép: số đọc rõ trên mọi nền ảnh.
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius - ring / 2, 0, Math.PI * 2);
    ctx.lineWidth = ring;
    ctx.strokeStyle = '#ffffff';
    ctx.setLineDash([]);
    ctx.stroke();
    const label = String(extra?.stepNumber ?? 1);
    const font = stepFont(radius, label.length);
    env.ensureFont(font, label);
    ctx.font = fontCss(font);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colorToCss(contrastOutline(obj.color));
    // Chữ số Inter nằm hơi cao so với `middle`: hạ 4% bán kính để cân giữa hình tròn.
    ctx.fillText(label, center.x, center.y + radius * 0.04);
    ctx.restore();
  },
  bounds: (obj) => aaPad(boxOf(obj), shadowPad(obj.shadow)),
  hitTest: (obj, p, tolerance) =>
    Math.hypot(p.x - obj.center.x, p.y - obj.center.y) <= obj.radius + tolerance,
  frame: (obj) => ({ kind: 'box', rect: boxOf(obj), rotation: 0, handles: CORNER_HANDLES }),
  translate: (obj, dx, dy) => ({ ...obj, center: { x: obj.center.x + dx, y: obj.center.y + dy } }),
  dragHandle(start, handle, p) {
    // Luôn giữ hình vuông (Shift) để bán kính đổi đều.
    const next = dragBox(boxOf(start), 0, handle, p, { shift: true });
    const radius = Math.min(
      STEP_MAX_RADIUS,
      Math.max(STEP_MIN_RADIUS, Math.min(next.rect.width, next.rect.height) / 2),
    );
    const c = rectCenter(next.rect);
    return { ...start, center: c, radius };
  },
};
