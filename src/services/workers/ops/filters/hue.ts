import type { FilterStep } from '@/engine/core/types';
import type { FilterImpl } from './types';

type Step = Extract<FilterStep, { id: 'hue' }>;

/**
 * Xoay sắc độ trong HSV (giữ độ bão hòa và độ sáng V): đỏ xoay 120° thành xanh lá đúng. Màu xám
 * không đổi. Vòng lặp không có phép chia dư; pixel liền nhau cùng màu dùng lại kết quả trước (ảnh
 * chụp màn hình, vùng phẳng).
 */
export const hue: FilterImpl<Step> = {
  apply: (image, step) => {
    const shift = (((step.degrees % 360) + 360) % 360) / 60;
    const d = image.data;
    let lr = -1;
    let lg = -1;
    let lb = -1;
    let or = 0;
    let og = 0;
    let ob = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const r = d[i] ?? 0;
      const g = d[i + 1] ?? 0;
      const b = d[i + 2] ?? 0;
      if (r === lr && g === lg && b === lb) {
        d[i] = or;
        d[i + 1] = og;
        d[i + 2] = ob;
        continue;
      }
      lr = r;
      lg = g;
      lb = b;
      const max = r > g ? (r > b ? r : b) : g > b ? g : b;
      const min = r < g ? (r < b ? r : b) : g < b ? g : b;
      const c = max - min;
      if (c === 0) {
        or = r;
        og = g;
        ob = b;
        continue;
      }
      // Sắc độ 0..6 (mỗi đơn vị 60°), cộng phần xoay rồi đưa về [0, 6).
      let h = max === r ? (g - b) / c : max === g ? (b - r) / c + 2 : (r - g) / c + 4;
      h += shift;
      if (h < 0) h += 6;
      else if (h >= 6) h -= 6;
      if (h >= 6) h -= 6;
      const sector = Math.floor(h);
      const f = h - sector;
      const rise = c * f + min;
      const fall = c * (1 - f) + min;
      // Sáu cung sắc độ: kênh lớn nhất = V, nhỏ nhất = min, kênh còn lại tăng/giảm tuyến tính.
      switch (sector) {
        case 0:
          or = max;
          og = rise;
          ob = min;
          break;
        case 1:
          or = fall;
          og = max;
          ob = min;
          break;
        case 2:
          or = min;
          og = max;
          ob = rise;
          break;
        case 3:
          or = min;
          og = fall;
          ob = max;
          break;
        case 4:
          or = rise;
          og = min;
          ob = max;
          break;
        default:
          or = max;
          og = min;
          ob = fall;
      }
      d[i] = or;
      d[i + 1] = og;
      d[i + 2] = ob;
    }
  },
};
