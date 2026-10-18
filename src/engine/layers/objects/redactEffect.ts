import type { RedactObject } from '../../core/types';
import {
  blurPremultiplied,
  fromPremultiplied,
  toPremultiplied,
  type RgbaImage,
} from '../../filters/kernels';
import { blurBoxes } from '../../filters/spec';

/**
 * Hiệu ứng của Redact chế độ khảm và làm mờ (mục 5.4): hàm thuần trên pixel của nền bên dưới.
 * Engine chạy đồng bộ khi ghép (màn hình, export, copy) nên ảnh xuất luôn đã "nướng" hiệu ứng.
 */

/** Ô khảm nhỏ nhất (mục 5.4: "pixelate khối lớn ≥ 12 px") và lớn nhất. */
export const REDACT_MIN_BLOCK = 12;
export const REDACT_MAX_BLOCK = 64;
/** Độ lệch chuẩn của làm mờ (px document). */
export const REDACT_MIN_BLUR = 4;
export const REDACT_MAX_BLUR = 40;

/** Cường độ hợp lệ theo chế độ: cỡ ô khảm hoặc độ lệch chuẩn làm mờ. */
export function redactStrength(obj: Pick<RedactObject, 'mode' | 'strength'>): number {
  if (obj.mode === 'pixelate') {
    return Math.min(REDACT_MAX_BLOCK, Math.max(REDACT_MIN_BLOCK, Math.round(obj.strength)));
  }
  if (obj.mode === 'blur')
    return Math.min(REDACT_MAX_BLUR, Math.max(REDACT_MIN_BLUR, obj.strength));
  return 0;
}

/** Phần nền cần đọc quanh vùng che để làm mờ đúng như khi làm mờ cả ảnh. */
export function redactHalo(obj: Pick<RedactObject, 'mode' | 'strength'>): number {
  if (obj.mode !== 'blur') return 0;
  return blurBoxes(redactStrength(obj)).reduce((sum, r) => sum + r, 0);
}

/** Ranh giới `n` ô chia đều đoạn [0, length): ô thứ i là [edges[i], edges[i + 1]). */
function blockEdges(length: number, size: number): Int32Array {
  // floor: mọi ô rộng ≥ size (trừ khi cả đoạn ngắn hơn size) — không có dải hẹp ở mép làm lộ chi
  // tiết như khi cắt lưới cố định.
  const n = Math.max(1, Math.floor(length / size));
  const edges = new Int32Array(n + 1);
  for (let i = 0; i <= n; i++) edges[i] = Math.round((i * length) / n);
  return edges;
}

/**
 * Khảm: chia ảnh thành các ô đều nhau (≥ `size` px, căn theo góc vùng che) và thay mỗi ô bằng màu
 * trung bình (trung bình nhân trước theo alpha — pixel trong suốt không làm tối màu).
 */
export function pixelateBlocks(image: RgbaImage, size: number): void {
  const { width: w, height: h, data: d } = image;
  if (w === 0 || h === 0) return;
  const xs = blockEdges(w, size);
  const ys = blockEdges(h, size);
  for (let by = 0; by + 1 < ys.length; by++) {
    const y0 = ys[by] ?? 0;
    const y1 = ys[by + 1] ?? 0;
    for (let bx = 0; bx + 1 < xs.length; bx++) {
      const x0 = xs[bx] ?? 0;
      const x1 = xs[bx + 1] ?? 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          const alpha = d[i + 3] ?? 0;
          r += (d[i] ?? 0) * alpha;
          g += (d[i + 1] ?? 0) * alpha;
          b += (d[i + 2] ?? 0) * alpha;
          a += alpha;
        }
      }
      const count = (x1 - x0) * (y1 - y0);
      const outA = count > 0 ? a / count : 0;
      const outR = a > 0 ? r / a : 0;
      const outG = a > 0 ? g / a : 0;
      const outB = a > 0 ? b / a : 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          d[i] = outR;
          d[i + 1] = outG;
          d[i + 2] = outB;
          d[i + 3] = outA;
        }
      }
    }
  }
}

/** Làm mờ (3 lượt box blur xấp xỉ Gauss — cùng nhân với bộ lọc Làm mờ của GĐ6). */
export function blurImage(image: RgbaImage, sigma: number): void {
  const data = toPremultiplied(image);
  blurPremultiplied(data, image.width, image.height, sigma);
  fromPremultiplied(data, image);
}
