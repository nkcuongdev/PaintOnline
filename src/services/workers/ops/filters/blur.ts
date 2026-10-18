import type { FilterStep } from '@/engine/core/types';
import { blurPremultiplied, fromPremultiplied, toPremultiplied } from '@/engine/filters/kernels';
import type { FilterImpl } from './types';

type Step = Extract<FilterStep, { id: 'blur' }>;

/** Làm mờ (Gauss xấp xỉ), bán kính theo document — thu nhỏ theo tỉ lệ khi xem trước. */
export const blur: FilterImpl<Step> = {
  apply: (image, step, context) => {
    const data = toPremultiplied(image);
    blurPremultiplied(data, image.width, image.height, step.radius * context.scale);
    fromPremultiplied(data, image);
  },
};
