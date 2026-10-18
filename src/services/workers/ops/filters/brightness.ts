import type { FilterStep } from '@/engine/core/types';
import { buildLut, type FilterImpl } from './types';

type Step = Extract<FilterStep, { id: 'brightness' }>;

/** Độ sáng: cộng thêm `amount`% của 255 vào mỗi kênh màu (LUT). */
export const brightness: FilterImpl<Step> = {
  lut: (step) => {
    const offset = (255 * step.amount) / 100;
    return buildLut((v) => v + offset);
  },
};
