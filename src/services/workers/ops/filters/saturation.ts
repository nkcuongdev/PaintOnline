import type { FilterStep } from '@/engine/core/types';
import { applyColorMatrix, saturationMatrix, type FilterImpl } from './types';

type Step = Extract<FilterStep, { id: 'saturation' }>;

/** Độ bão hòa: ma trận trộn với độ sáng (Rec. 709), s = 1 + amount/100 (0..2). */
export const saturation: FilterImpl<Step> = {
  apply: (image, step) => {
    applyColorMatrix(image, saturationMatrix(1 + step.amount / 100));
  },
};
