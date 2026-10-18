import type { FilterStep } from '@/engine/core/types';

/** Ảnh RGBA không nhân trước (như ImageData) — filter ghi đè tại chỗ. */
export interface FilterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Vị trí dữ liệu trong document và tỉ lệ (xem trước trên bản thu nhỏ). */
export interface FilterContext {
  originX: number;
  originY: number;
  scale: number;
}

/**
 * Một filter (mục 5.8): hàm thuần trên ảnh. Filter theo từng kênh trả bảng tra 256 phần tử (LUT) —
 * các LUT liền nhau được gộp thành một lượt; filter khác ghi đè ảnh tại chỗ.
 */
export interface FilterImpl<S extends FilterStep = FilterStep> {
  lut?: (step: S) => Uint8ClampedArray;
  apply?: (image: FilterImage, step: S, context: FilterContext) => void;
}

/** Bảng tra 256 phần tử từ một hàm (kẹp và làm tròn về 0..255). */
export function buildLut(fn: (value: number) => number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.round(fn(v));
  return lut;
}

/** Áp LUT cho 3 kênh màu (alpha giữ nguyên). */
export function applyLut(image: FilterImage, lut: Uint8ClampedArray): void {
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i] ?? 0] ?? 0;
    d[i + 1] = lut[d[i + 1] ?? 0] ?? 0;
    d[i + 2] = lut[d[i + 2] ?? 0] ?? 0;
  }
}

/** Gộp hai LUT: kết quả = second(first(v)). */
export function composeLut(first: Uint8ClampedArray, second: Uint8ClampedArray): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = second[first[v] ?? 0] ?? 0;
  return lut;
}

/**
 * Ma trận màu 3×3 (hàng: r', g', b') trên giá trị 0..255 — độ bão hòa, đen trắng, sepia (cùng
 * công thức với bộ lọc CSS, hệ số độ sáng Rec. 709).
 */
export function applyColorMatrix(image: FilterImage, m: readonly number[]): void {
  const [m0 = 0, m1 = 0, m2 = 0, m3 = 0, m4 = 0, m5 = 0, m6 = 0, m7 = 0, m8 = 0] = m;
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i] ?? 0;
    const g = d[i + 1] ?? 0;
    const b = d[i + 2] ?? 0;
    d[i] = Math.round(m0 * r + m1 * g + m2 * b);
    d[i + 1] = Math.round(m3 * r + m4 * g + m5 * b);
    d[i + 2] = Math.round(m6 * r + m7 * g + m8 * b);
  }
}

/** Hệ số độ sáng Rec. 709 (như bộ lọc CSS). */
export const LUMA_R = 0.2126;
export const LUMA_G = 0.7152;
export const LUMA_B = 0.0722;

/** Ma trận độ bão hòa `s` (0 = đen trắng, 1 = giữ nguyên, 2 = gấp đôi). */
export function saturationMatrix(s: number): number[] {
  return [
    LUMA_R + (1 - LUMA_R) * s,
    LUMA_G - LUMA_G * s,
    LUMA_B - LUMA_B * s,
    LUMA_R - LUMA_R * s,
    LUMA_G + (1 - LUMA_G) * s,
    LUMA_B - LUMA_B * s,
    LUMA_R - LUMA_R * s,
    LUMA_G - LUMA_G * s,
    LUMA_B + (1 - LUMA_B) * s,
  ];
}
