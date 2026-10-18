import type { FilterStep } from '@/engine/core/types';
import { buildLut, type FilterImpl } from './types';

type Step = Extract<FilterStep, { id: 'contrast' }>;

/**
 * Tương phản (LUT): kéo giãn quanh mức giữa 128 với hệ số f = 259(C + 255) / (255(259 − C)),
 * C = amount × 2,55 — −100 thành xám đều, +100 gần như chỉ còn đen/trắng.
 */
export const contrast: FilterImpl<Step> = {
  lut: (step) => {
    const c = step.amount * 2.55;
    const f = (259 * (c + 255)) / (255 * (259 - c));
    return buildLut((v) => f * (v - 128) + 128);
  },
};
