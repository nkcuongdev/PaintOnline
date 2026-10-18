import type {
  AnnotationObject,
  ArrowOptions,
  Color,
  ColorsState,
  MagnifierObject,
  OptionGroupId,
  RedactObject,
  RedactOptions,
  ShapeOptions,
  SpotlightObject,
  Stroke,
  TextObject,
  TextOptions,
  ToolOptionsMap,
} from '../../core/types';
import { DEFAULT_TOOL_OPTIONS } from '../../core/options';
import { dashFor, DEFAULT_SHADOW } from './draw';
import { contrastOutline } from './text';

const DEFAULT_BLOCK = DEFAULT_TOOL_OPTIONS.redact.blockSize;
const DEFAULT_BLUR = DEFAULT_TOOL_OPTIONS.redact.blurRadius;

/**
 * Ánh xạ giữa tool options và thuộc tính đối tượng: tạo đối tượng mới theo option hiện tại, và
 * hiển thị/sửa thuộc tính đối tượng đang chọn bằng chính control của Options bar (mục 7.2).
 * Màu viền/chữ = màu chính, màu tô/nền = màu phụ (ADR 0019).
 */

export type StyleGroup = Extract<
  OptionGroupId,
  'shape' | 'arrow' | 'text' | 'highlight' | 'redact' | 'step' | 'spotlight' | 'magnifier'
>;

export function styleGroupOf(obj: AnnotationObject): StyleGroup | null {
  switch (obj.type) {
    case 'rect':
    case 'ellipse':
    case 'line':
    case 'polygon':
      return 'shape';
    case 'arrow':
      return 'arrow';
    case 'text':
      return 'text';
    case 'highlight':
      return 'highlight';
    case 'redact':
      return 'redact';
    case 'step':
      return 'step';
    case 'spotlight':
      return 'spotlight';
    case 'magnifier':
      return 'magnifier';
  }
}

export function makeStroke(color: Color, width: number, dashed: boolean): Stroke {
  return dashed ? { color, width, dash: dashFor(width) } : { color, width };
}

export function textOutline(color: Color, size: number): Stroke {
  return { color: contrastOutline(color), width: Math.max(1, Math.round(size * 0.08 * 10) / 10) };
}

/** Thuộc tính hiện tại của đối tượng dưới dạng option của nhóm tương ứng. */
export function styleOf(obj: AnnotationObject): Partial<ToolOptionsMap[StyleGroup]> {
  switch (obj.type) {
    case 'rect':
    case 'ellipse':
    case 'line':
    case 'polygon': {
      const stroke = obj.stroke;
      const style: Partial<ShapeOptions> = {
        strokeWidth: stroke?.width ?? 0,
        dashed: (stroke?.dash?.length ?? 0) > 0,
        shadow: obj.shadow !== undefined,
      };
      if (obj.type !== 'line') style.fill = obj.fill !== undefined;
      if (obj.type === 'rect') style.cornerRadius = obj.cornerRadius;
      return style;
    }
    case 'arrow':
      return {
        strokeWidth: obj.stroke.width,
        head: obj.head,
        bothEnds: obj.bothEnds,
        dashed: (obj.stroke.dash?.length ?? 0) > 0,
        shadow: obj.shadow !== undefined,
      } satisfies Partial<ArrowOptions>;
    case 'text':
      return {
        family: obj.font.family,
        size: obj.font.size,
        weight: obj.font.weight,
        italic: obj.font.italic,
        align: obj.align,
        background: obj.background !== undefined,
        outline: obj.outline !== undefined,
      } satisfies Partial<TextOptions>;
    case 'highlight':
      return { color: obj.color };
    case 'redact':
      return {
        mode: obj.mode,
        blockSize: obj.mode === 'pixelate' ? obj.strength : DEFAULT_TOOL_OPTIONS.redact.blockSize,
        blurRadius: obj.mode === 'blur' ? obj.strength : DEFAULT_TOOL_OPTIONS.redact.blurRadius,
      } satisfies Partial<RedactOptions>;
    case 'step':
      return { size: obj.radius };
    case 'spotlight':
      return { shape: obj.shape, dim: obj.dim };
    case 'magnifier':
      return { zoom: obj.zoom, shape: obj.shape };
  }
}

/** Áp một bản vá option (đã validate) lên đối tượng; màu phụ dùng khi bật tô/nền. */
export function withStyle(
  obj: AnnotationObject,
  patch: Readonly<Record<string, unknown>>,
  colors: Readonly<ColorsState>,
): AnnotationObject {
  const has = (key: string) => key in patch && patch[key] !== undefined;
  const bool = (key: string) => patch[key] === true;
  const num = (key: string, fallback: number) =>
    typeof patch[key] === 'number' ? patch[key] : fallback;
  const shadow = (current: AnnotationObject['shadow']) =>
    has('shadow') ? (bool('shadow') ? { ...DEFAULT_SHADOW } : undefined) : current;

  switch (obj.type) {
    case 'rect':
    case 'ellipse':
    case 'line':
    case 'polygon': {
      const stroke = obj.stroke ?? { color: colors.primary, width: 0 };
      const width = num('strokeWidth', stroke.width);
      const dashed = has('dashed') ? bool('dashed') : (stroke.dash?.length ?? 0) > 0;
      const nextStroke = makeStroke(stroke.color, width, dashed);
      if (obj.type === 'line') return { ...obj, stroke: nextStroke, shadow: shadow(obj.shadow) };
      const fill = has('fill')
        ? bool('fill')
          ? (obj.fill ?? colors.secondary)
          : undefined
        : obj.fill;
      const base = {
        ...obj,
        stroke: width > 0 ? nextStroke : undefined,
        fill,
        shadow: shadow(obj.shadow),
      };
      if (base.type === 'rect')
        return { ...base, cornerRadius: num('cornerRadius', base.cornerRadius) };
      return base;
    }
    case 'arrow': {
      const width = num('strokeWidth', obj.stroke.width);
      const dashed = has('dashed') ? bool('dashed') : (obj.stroke.dash?.length ?? 0) > 0;
      return {
        ...obj,
        stroke: makeStroke(obj.stroke.color, width, dashed),
        head: has('head') ? (patch.head as ArrowOptions['head']) : obj.head,
        bothEnds: has('bothEnds') ? bool('bothEnds') : obj.bothEnds,
        shadow: shadow(obj.shadow),
      };
    }
    case 'text': {
      const font = {
        family: typeof patch.family === 'string' ? patch.family : obj.font.family,
        size: num('size', obj.font.size),
        weight: has('weight') ? (patch.weight as TextObject['font']['weight']) : obj.font.weight,
        italic: has('italic') ? bool('italic') : obj.font.italic,
      };
      const outlineOn = has('outline') ? bool('outline') : obj.outline !== undefined;
      return {
        ...obj,
        font,
        align: has('align') ? (patch.align as TextObject['align']) : obj.align,
        background: has('background')
          ? bool('background')
            ? (obj.background ?? colors.secondary)
            : undefined
          : obj.background,
        outline: outlineOn ? textOutline(obj.color, font.size) : undefined,
      };
    }
    case 'highlight':
      return typeof patch.color === 'string' ? { ...obj, color: patch.color as Color } : obj;
    case 'redact': {
      const mode = has('mode') ? (patch.mode as RedactObject['mode']) : obj.mode;
      // Đổi chế độ: dùng cường độ của chế độ mới (Editor gửi kèm giá trị option hiện tại).
      let strength = obj.strength;
      if (mode === 'pixelate') {
        strength = num('blockSize', obj.mode === 'pixelate' ? obj.strength : DEFAULT_BLOCK);
      } else if (mode === 'blur') {
        strength = num('blurRadius', obj.mode === 'blur' ? obj.strength : DEFAULT_BLUR);
      }
      return { ...obj, mode, strength };
    }
    case 'step':
      return { ...obj, radius: num('size', obj.radius) };
    case 'spotlight':
      return {
        ...obj,
        shape: has('shape') ? (patch.shape as SpotlightObject['shape']) : obj.shape,
        dim: num('dim', obj.dim),
      };
    case 'magnifier':
      return {
        ...obj,
        zoom: num('zoom', obj.zoom),
        shape: has('shape') ? (patch.shape as MagnifierObject['shape']) : obj.shape,
      };
    default:
      return obj;
  }
}

/** Đổi màu đối tượng: `primary` = viền/chữ, `secondary` = phần tô/nền (nếu đang bật). */
export function withColor(
  obj: AnnotationObject,
  slot: 'primary' | 'secondary',
  color: Color,
): AnnotationObject {
  switch (obj.type) {
    case 'rect':
    case 'ellipse':
    case 'polygon':
      if (slot === 'secondary') return obj.fill ? { ...obj, fill: color } : obj;
      return obj.stroke ? { ...obj, stroke: { ...obj.stroke, color } } : obj;
    case 'line':
    case 'arrow':
      return slot === 'primary' ? { ...obj, stroke: { ...obj.stroke, color } } : obj;
    case 'text':
      if (slot === 'secondary') return obj.background ? { ...obj, background: color } : obj;
      return {
        ...obj,
        color,
        outline: obj.outline ? textOutline(color, obj.font.size) : undefined,
      };
    case 'redact':
    case 'step':
      return slot === 'primary' ? { ...obj, color } : obj;
    case 'magnifier':
      return slot === 'primary' ? { ...obj, stroke: { ...obj.stroke, color } } : obj;
    default:
      return obj;
  }
}
