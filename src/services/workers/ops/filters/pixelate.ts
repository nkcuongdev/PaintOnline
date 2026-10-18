import type { FilterStep } from '@/engine/core/types';
import type { FilterImpl } from './types';

type Step = Extract<FilterStep, { id: 'pixelate' }>;

/** Chỉ số ô (theo lưới document) của từng cột/hàng dữ liệu (tâm pixel). */
function blockIndex(count: number, origin: number, scale: number, size: number): Int32Array {
  const out = new Int32Array(count);
  for (let i = 0; i < count; i++) out[i] = Math.floor((origin + (i + 0.5) / scale) / size);
  return out;
}

/**
 * Khảm: mỗi ô `size` × `size` (lưới căn theo gốc document, nên chia dải hay xem trước một vùng vẫn
 * cùng kết quả) thành màu trung bình — trung bình nhân trước theo alpha để pixel trong suốt không
 * làm tối màu.
 */
export const pixelate: FilterImpl<Step> = {
  apply: (image, step, context) => {
    const { width: w, height: h, data: d } = image;
    if (w === 0 || h === 0) return;
    const cols = blockIndex(w, context.originX, context.scale, step.size);
    const rows = blockIndex(h, context.originY, context.scale, step.size);
    const bx0 = cols[0];
    const by0 = rows[0];
    const nbx = (cols[w - 1] ?? 0) - bx0 + 1;
    const nby = (rows[h - 1] ?? 0) - by0 + 1;
    // Mỗi ô: tổng r·a, g·a, b·a, a và số pixel.
    const sums = new Float64Array(nbx * nby * 5);
    for (let y = 0; y < h; y++) {
      const rowBlock = ((rows[y] ?? 0) - by0) * nbx;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const o = (rowBlock + (cols[x] ?? 0) - bx0) * 5;
        const a = d[i + 3] ?? 0;
        sums[o] = (sums[o] ?? 0) + (d[i] ?? 0) * a;
        sums[o + 1] = (sums[o + 1] ?? 0) + (d[i + 1] ?? 0) * a;
        sums[o + 2] = (sums[o + 2] ?? 0) + (d[i + 2] ?? 0) * a;
        sums[o + 3] = (sums[o + 3] ?? 0) + a;
        sums[o + 4] = (sums[o + 4] ?? 0) + 1;
      }
    }
    for (let y = 0; y < h; y++) {
      const rowBlock = ((rows[y] ?? 0) - by0) * nbx;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const o = (rowBlock + (cols[x] ?? 0) - bx0) * 5;
        const alpha = sums[o + 3] ?? 0;
        if (alpha <= 0) {
          d[i] = 0;
          d[i + 1] = 0;
          d[i + 2] = 0;
          d[i + 3] = 0;
          continue;
        }
        d[i] = (sums[o] ?? 0) / alpha;
        d[i + 1] = (sums[o + 1] ?? 0) / alpha;
        d[i + 2] = (sums[o + 2] ?? 0) / alpha;
        d[i + 3] = alpha / (sums[o + 4] ?? 1);
      }
    }
  },
};
