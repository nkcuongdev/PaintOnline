import type { FilterStep } from '@/engine/core/types';
import { applyColorMatrix, saturationMatrix, type FilterImpl } from './types';

type Step = Extract<FilterStep, { id: 'grayscale' }>;

/** Đen trắng: mỗi kênh = độ sáng Rec. 709 (0,2126 R + 0,7152 G + 0,0722 B). */
export const grayscale: FilterImpl<Step> = {
  apply: (image) => {
    applyColorMatrix(image, saturationMatrix(0));
  },
};
