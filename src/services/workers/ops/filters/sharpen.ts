import type { FilterStep } from '@/engine/core/types';
import { blurPremultiplied, toPremultiplied } from '@/engine/filters/kernels';
import type { FilterImpl } from './types';

type Step = Extract<FilterStep, { id: 'sharpen' }>;

/**
 * Làm sắc nét = unsharp mask (mục 5.8): màu + amount × (màu − màu đã blur). Blur tính trên dữ liệu
 * nhân trước nên mép vùng trong suốt không bị viền tối; alpha giữ nguyên.
 */
export const sharpen: FilterImpl<Step> = {
  apply: (image, step, context) => {
    const blurred = blurPremultiplied(
      toPremultiplied(image),
      image.width,
      image.height,
      step.radius * context.scale,
    );
    const k = step.amount / 100;
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      // Màu đã blur (bỏ nhân trước): (màu × alpha) / alpha.
      const ba = blurred[i + 3];
      if (ba <= 0) continue;
      const u = 255 / ba;
      for (let c = 0; c < 3; c++) {
        const v = d[i + c];
        d[i + c] = v + k * (v - blurred[i + c] * u);
      }
    }
  },
};
