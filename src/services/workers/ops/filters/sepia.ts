import type { FilterStep } from '@/engine/core/types';
import { applyColorMatrix, type FilterImpl } from './types';

type Step = Extract<FilterStep, { id: 'sepia' }>;

/** Ma trận sepia đầy đủ (như `sepia(1)` của CSS). */
const SEPIA = [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131];
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Sepia: nội suy giữa ảnh gốc và ma trận sepia theo `amount`%. */
export const sepia: FilterImpl<Step> = {
  apply: (image, step) => {
    const a = step.amount / 100;
    applyColorMatrix(
      image,
      SEPIA.map((v, i) => (IDENTITY[i] ?? 0) * (1 - a) + v * a),
    );
  },
};
