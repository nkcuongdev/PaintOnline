import type { Editor } from '@/engine/core/Editor';
import type {
  AnnotationObject,
  ArrowOptions,
  Color,
  ShapeOptions,
  TextOptions,
  ToolId,
} from '@/engine/core/types';

/**
 * Kiểu nhanh (preset style — mục 2, GĐ7) cho mũi tên, khung và chữ: một click đặt option + màu cho
 * tool, và áp luôn cho đối tượng đang chọn (một bước history). Màu viền/chữ là màu chính, phần tô/nền
 * là màu phụ (ADR 0019) nên preset đặt cả hai màu.
 */

export type PresetKind = 'arrow' | 'frame' | 'text';

interface PresetBase {
  id: string;
  /** Khóa trong `t.presets`. */
  label: string;
  primary: Color;
  secondary?: Color;
}

export type StylePreset =
  | (PresetBase & { kind: 'arrow'; group: 'arrow'; options: Partial<ArrowOptions> })
  | (PresetBase & { kind: 'frame'; group: 'shape'; options: Partial<ShapeOptions> })
  | (PresetBase & { kind: 'text'; group: 'text'; options: Partial<TextOptions> });

export const STYLE_PRESETS: Readonly<Record<PresetKind, readonly StylePreset[]>> = {
  arrow: [
    {
      id: 'arrow-bold',
      kind: 'arrow',
      group: 'arrow',
      label: 'arrowBold',
      primary: '#E03131FF',
      options: { strokeWidth: 6, head: 'triangle', bothEnds: false, dashed: false, shadow: true },
    },
    {
      id: 'arrow-thin',
      kind: 'arrow',
      group: 'arrow',
      label: 'arrowThin',
      primary: '#1E293BFF',
      options: { strokeWidth: 3, head: 'open', bothEnds: false, dashed: false, shadow: false },
    },
    {
      id: 'arrow-dashed',
      kind: 'arrow',
      group: 'arrow',
      label: 'arrowDashed',
      primary: '#1C7ED6FF',
      options: { strokeWidth: 4, head: 'triangle', bothEnds: false, dashed: true, shadow: false },
    },
    {
      id: 'arrow-double',
      kind: 'arrow',
      group: 'arrow',
      label: 'arrowDouble',
      primary: '#F08C00FF',
      options: { strokeWidth: 5, head: 'triangle', bothEnds: true, dashed: false, shadow: false },
    },
  ],
  frame: [
    {
      id: 'frame-red',
      kind: 'frame',
      group: 'shape',
      label: 'frameRed',
      primary: '#E03131FF',
      options: { strokeWidth: 4, fill: false, cornerRadius: 0, dashed: false, shadow: false },
    },
    {
      id: 'frame-rounded',
      kind: 'frame',
      group: 'shape',
      label: 'frameRounded',
      primary: '#1C7ED6FF',
      options: { strokeWidth: 4, fill: false, cornerRadius: 12, dashed: false, shadow: true },
    },
    {
      id: 'frame-dashed',
      kind: 'frame',
      group: 'shape',
      label: 'frameDashed',
      primary: '#F08C00FF',
      options: { strokeWidth: 3, fill: false, cornerRadius: 6, dashed: true, shadow: false },
    },
    {
      id: 'frame-tint',
      kind: 'frame',
      group: 'shape',
      label: 'frameTint',
      primary: '#E03131FF',
      secondary: '#E0313133',
      options: { strokeWidth: 3, fill: true, cornerRadius: 8, dashed: false, shadow: false },
    },
  ],
  text: [
    {
      id: 'text-callout',
      kind: 'text',
      group: 'text',
      label: 'textCallout',
      primary: '#E03131FF',
      options: { size: 32, weight: 700, background: false, outline: true },
    },
    {
      id: 'text-label',
      kind: 'text',
      group: 'text',
      label: 'textLabel',
      primary: '#FFFFFFFF',
      secondary: '#E03131FF',
      options: { size: 28, weight: 600, background: true, outline: false },
    },
    {
      id: 'text-note',
      kind: 'text',
      group: 'text',
      label: 'textNote',
      primary: '#1E293BFF',
      secondary: '#FFF3BFFF',
      options: { size: 24, weight: 400, background: true, outline: false },
    },
    {
      id: 'text-title',
      kind: 'text',
      group: 'text',
      label: 'textTitle',
      primary: '#111827FF',
      options: { size: 48, weight: 700, background: false, outline: false },
    },
  ],
};

/** Preset áp dụng cho tool đang chọn (Arrow, Rectangle/Ellipse, Text). */
export function presetKindForTool(tool: ToolId): PresetKind | null {
  if (tool === 'arrow') return 'arrow';
  if (tool === 'rect' || tool === 'ellipse') return 'frame';
  if (tool === 'text') return 'text';
  return null;
}

/** Preset áp dụng cho các đối tượng đang chọn (cùng một loại). */
export function presetKindForObjects(objects: readonly AnnotationObject[]): PresetKind | null {
  if (objects.length === 0) return null;
  const first = objects[0];
  if (!objects.every((o) => o.type === first.type)) return null;
  if (first.type === 'arrow') return 'arrow';
  if (first.type === 'rect' || first.type === 'ellipse') return 'frame';
  if (first.type === 'text') return 'text';
  return null;
}

/** Áp preset: option của nhóm + màu cho tool, và cho đối tượng đang chọn (một bước history). */
export function applyStylePreset(editor: Editor, preset: StylePreset): void {
  const colors = { primary: preset.primary, secondary: preset.secondary };
  switch (preset.kind) {
    case 'arrow':
      editor.objects.applyPreset('arrow', preset.options, colors);
      break;
    case 'frame':
      editor.objects.applyPreset('shape', preset.options, colors);
      break;
    case 'text':
      editor.objects.applyPreset('text', preset.options, colors);
      break;
  }
}
