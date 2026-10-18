import type { FilterStep } from '@/engine/core/types';
import { buildLut, type FilterImpl } from './types';

type Step = Extract<FilterStep, { id: 'invert' }>;

/** Đảo màu (LUT): 255 − v, alpha giữ nguyên. */
export const invert: FilterImpl<Step> = {
  lut: () => buildLut((v) => 255 - v),
};
