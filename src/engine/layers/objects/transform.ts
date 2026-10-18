import type { AnnotationObject, ObjectShadow, Point, Rect, Stroke } from '../../core/types';
import { applyMatrix, type Matrix } from '../../viewport/transform';
import { normalizeAngle, rectCenter } from './geometry';
import { REDACT_MIN_BLOCK, REDACT_MIN_BLUR } from './redactEffect';
import { textLayout } from './text';
import type { ObjectEnv } from './types';

/**
 * Áp phép biến đổi toàn ảnh (cắt xén, Canvas size, Resize, xoay 90°, lật — mục 2, GĐ5) cho đối
 * tượng chú thích: đối tượng vẫn sửa được sau khi biến đổi. Chỉ hỗ trợ ma trận "trục thẳng": dời,
 * co giãn theo trục, xoay bội số 90° và lật (b = c = 0 hoặc a = d = 0).
 *
 * - Hình theo khung (chữ nhật, ellipse, Highlight, Redact, Spotlight, vùng nguồn Magnifier): tâm
 *   theo ma trận; xoay 90° thì đổi chiều rộng/cao (khung w × h xoay 90° chính là khung h × w), lật
 *   thì đảo góc xoay.
 * - Chữ không bị lật/kéo méo: vị trí theo tâm khung, cỡ chữ theo tỉ lệ diện tích, xoay thêm góc
 *   của phép xoay.
 * - Độ dày nét, bóng, bo góc, bán kính số thứ tự co giãn theo √|det|.
 */
export function transformObject(
  obj: AnnotationObject,
  m: Matrix,
  env: ObjectEnv,
): AnnotationObject {
  const det = m.a * m.d - m.b * m.c;
  const s = Math.sqrt(Math.abs(det));
  const swap = Math.abs(m.a) < 1e-9 && Math.abs(m.d) < 1e-9;
  const mirrored = det < 0;
  const turn = mirrored ? 0 : Math.atan2(m.b, m.a);
  const point = (p: Readonly<Point>): Point => applyMatrix(m, p);
  const rotation = (angle: number) => normalizeAngle(mirrored ? -angle : angle);
  const box = (r: Readonly<Rect>): Rect => {
    const c = point(rectCenter(r));
    const w = swap ? r.height * Math.abs(m.c) : r.width * Math.abs(m.a);
    const h = swap ? r.width * Math.abs(m.b) : r.height * Math.abs(m.d);
    return { x: c.x - w / 2, y: c.y - h / 2, width: w, height: h };
  };
  const stroke = (st: Stroke | undefined): Stroke | undefined =>
    st ? { ...st, width: st.width * s, dash: st.dash?.map((d) => d * s) } : undefined;
  const shadow = (sh: ObjectShadow | undefined): ObjectShadow | undefined =>
    sh ? { ...sh, blur: sh.blur * s, offsetX: sh.offsetX * s, offsetY: sh.offsetY * s } : undefined;
  const base = { shadow: shadow(obj.shadow) };

  switch (obj.type) {
    case 'rect':
      return {
        ...obj,
        ...base,
        rect: box(obj.rect),
        rotation: rotation(obj.rotation),
        stroke: stroke(obj.stroke),
        cornerRadius: obj.cornerRadius * s,
      };
    case 'ellipse':
      return {
        ...obj,
        ...base,
        rect: box(obj.rect),
        rotation: rotation(obj.rotation),
        stroke: stroke(obj.stroke),
      };
    case 'highlight':
    case 'spotlight':
      return { ...obj, ...base, rect: box(obj.rect), rotation: rotation(obj.rotation) };
    case 'redact':
      return {
        ...obj,
        ...base,
        rect: box(obj.rect),
        rotation: rotation(obj.rotation),
        // Khối pixelate không nhỏ hơn 12 px (mục 5.4: che an toàn), làm mờ không nhẹ hơn mức tối thiểu.
        strength:
          obj.mode === 'pixelate'
            ? Math.max(REDACT_MIN_BLOCK, obj.strength * s)
            : obj.mode === 'blur'
              ? Math.max(REDACT_MIN_BLUR, obj.strength * s)
              : obj.strength * s,
      };
    case 'line':
      return {
        ...obj,
        ...base,
        from: point(obj.from),
        to: point(obj.to),
        stroke: { ...obj.stroke, width: obj.stroke.width * s },
      };
    case 'arrow':
      return {
        ...obj,
        ...base,
        from: point(obj.from),
        to: point(obj.to),
        control: obj.control ? point(obj.control) : undefined,
        stroke: {
          ...obj.stroke,
          width: obj.stroke.width * s,
          dash: obj.stroke.dash?.map((d) => d * s),
        },
      };
    case 'polygon':
      return { ...obj, ...base, points: obj.points.map(point), stroke: stroke(obj.stroke) };
    case 'step':
      return { ...obj, ...base, center: point(obj.center), radius: obj.radius * s };
    case 'magnifier':
      return {
        ...obj,
        ...base,
        source: box(obj.source),
        target: point(obj.target),
        stroke: { ...obj.stroke, width: obj.stroke.width * s },
      };
    case 'text': {
      const layout = textLayout(obj, env);
      const center = rectCenter(layout.box);
      // Gốc chữ so với tâm khung (hệ chưa xoay) co giãn cùng cỡ chữ.
      const offset = { x: obj.origin.x - center.x, y: obj.origin.y - center.y };
      const c = point(center);
      return {
        ...obj,
        ...base,
        origin: { x: c.x + offset.x * s, y: c.y + offset.y * s },
        wrapWidth: obj.wrapWidth === null ? null : obj.wrapWidth * s,
        font: { ...obj.font, size: obj.font.size * s },
        outline: stroke(obj.outline),
        rotation: normalizeAngle(rotation(obj.rotation) + turn),
      };
    }
  }
}
