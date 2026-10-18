import type { Editor } from '@/engine/core/Editor';
import type { FilterId, FilterStep } from '@/engine/core/types';
import { defaultStep } from '@/engine/filters/spec';
import { useUiStore } from '@/stores/ui';

/**
 * Các bảng điều chỉnh (mục 2, 7.3): mỗi bảng là một pipeline filter với slider sinh từ đặc tả tham
 * số của Engine. Đen trắng và Đảo màu không có tham số nên áp dụng ngay (vẫn có tiến trình, Hủy).
 */
export type AdjustmentKind =
  | 'brightnessContrast'
  | 'hueSaturation'
  | 'grayscale'
  | 'invert'
  | 'sepia'
  | 'blur'
  | 'sharpen'
  | 'pixelate';

export interface AdjustmentDef {
  filters: readonly FilterId[];
  /** Áp dụng ngay, không qua bảng xem trước. */
  immediate: boolean;
  /** Khóa history của bước khi áp dụng. */
  historyLabel: string;
}

export const ADJUSTMENTS: Readonly<Record<AdjustmentKind, AdjustmentDef>> = {
  brightnessContrast: {
    filters: ['brightness', 'contrast'],
    immediate: false,
    historyLabel: 'history.brightnessContrast',
  },
  hueSaturation: {
    filters: ['hue', 'saturation'],
    immediate: false,
    historyLabel: 'history.hueSaturation',
  },
  grayscale: { filters: ['grayscale'], immediate: true, historyLabel: 'history.grayscale' },
  invert: { filters: ['invert'], immediate: true, historyLabel: 'history.invert' },
  sepia: { filters: ['sepia'], immediate: false, historyLabel: 'history.sepia' },
  blur: { filters: ['blur'], immediate: false, historyLabel: 'history.blur' },
  sharpen: { filters: ['sharpen'], immediate: false, historyLabel: 'history.sharpen' },
  pixelate: { filters: ['pixelate'], immediate: false, historyLabel: 'history.pixelate' },
};

export const ADJUST_GROUP: readonly AdjustmentKind[] = [
  'brightnessContrast',
  'hueSaturation',
  'grayscale',
  'sepia',
  'invert',
];
export const FILTER_GROUP: readonly AdjustmentKind[] = ['blur', 'sharpen', 'pixelate'];

export function defaultSteps(kind: AdjustmentKind): FilterStep[] {
  return ADJUSTMENTS[kind].filters.map(defaultStep);
}

/** Mở bảng điều chỉnh (hoặc áp dụng ngay với Đen trắng, Đảo màu). Trả false nếu Engine từ chối. */
export function openAdjustment(editor: Editor, kind: AdjustmentKind): boolean {
  const def = ADJUSTMENTS[kind];
  const steps = defaultSteps(kind);
  if (def.immediate) {
    const done = editor.filters.run(steps, def.historyLabel);
    // Phiên đã mở (đang chạy nền): bảng hiện tiến trình và nút Dừng.
    if (editor.filters.isOpen) useUiStore.getState().setAdjustment(kind);
    void done;
    return editor.filters.isOpen;
  }
  if (!editor.filters.begin(steps, def.historyLabel)) return false;
  useUiStore.getState().setAdjustment(kind);
  return true;
}
