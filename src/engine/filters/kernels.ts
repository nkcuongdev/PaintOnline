import { blurBoxes } from './spec';

/**
 * Nhân xử lý ảnh dùng chung giữa Worker (bộ lọc — mục 5.8) và Engine (Redact làm mờ — mục 5.4,
 * cần chạy đồng bộ khi ghép ảnh xuất). Hàm thuần trên mảng, không phụ thuộc canvas.
 */

/** Ảnh RGBA không nhân trước (như ImageData), ghi đè tại chỗ. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * RGBA không nhân trước → nhân trước theo thang nguyên (màu × alpha, alpha × 255; 0..65025) để blur
 * không kéo màu của pixel trong suốt vào. Giá trị nguyên + làm tròn sau mỗi lượt + tổng trượt nguyên
 * nên kết quả chính xác, không phụ thuộc cách chia dải (xem trước, áp dụng theo dải).
 */
export function toPremultiplied(image: RgbaImage): Int32Array {
  const d = image.data;
  const out = new Int32Array(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0) continue;
    out[i] = d[i] * a;
    out[i + 1] = d[i + 1] * a;
    out[i + 2] = d[i + 2] * a;
    out[i + 3] = a * 255;
  }
  return out;
}

/** Ghi lại ảnh từ dữ liệu nhân trước. */
export function fromPremultiplied(src: Int32Array, image: RgbaImage): void {
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = src[i + 3] / 255;
    if (a < 0.5) {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 0;
      continue;
    }
    const k = 1 / a;
    d[i] = src[i] * k;
    d[i + 1] = src[i + 1] * k;
    d[i + 2] = src[i + 2] * k;
    d[i + 3] = a;
  }
}

/**
 * Lượt box blur ngang bán kính `r`: tổng trượt theo từng hàng (O(n), không phụ thuộc bán kính). Mép
 * ảnh kéo dài pixel biên.
 */
function boxPassH(src: Int32Array, dst: Int32Array, w: number, h: number, r: number): void {
  const inv = 1 / (2 * r + 1);
  const last = w - 1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    let s0 = 0;
    let s1 = 0;
    let s2 = 0;
    let s3 = 0;
    for (let k = -r; k <= r; k++) {
      const o = row + Math.min(last, Math.max(0, k)) * 4;
      s0 += src[o];
      s1 += src[o + 1];
      s2 += src[o + 2];
      s3 += src[o + 3];
    }
    for (let x = 0; x < w; x++) {
      const out = row + x * 4;
      dst[out] = (s0 * inv + 0.5) | 0;
      dst[out + 1] = (s1 * inv + 0.5) | 0;
      dst[out + 2] = (s2 * inv + 0.5) | 0;
      dst[out + 3] = (s3 * inv + 0.5) | 0;
      const add = row + Math.min(last, x + r + 1) * 4;
      const sub = row + Math.max(0, x - r) * 4;
      s0 += src[add] - src[sub];
      s1 += src[add + 1] - src[sub + 1];
      s2 += src[add + 2] - src[sub + 2];
      s3 += src[add + 3] - src[sub + 3];
    }
  }
}

/**
 * Lượt box blur dọc: giữ tổng trượt của cả một hàng và trượt xuống từng hàng — đọc, ghi đều tuần tự
 * (blur dọc từng cột ghi cách quãng cả hàng, trượt cache ở mỗi pixel: chậm gấp nhiều lần, đo ở GĐ6).
 */
function boxPassV(
  src: Int32Array,
  dst: Int32Array,
  sums: Int32Array,
  w: number,
  h: number,
  r: number,
): void {
  const inv = 1 / (2 * r + 1);
  const stride = w * 4;
  const last = h - 1;
  sums.fill(0);
  for (let k = -r; k <= r; k++) {
    const o = Math.min(last, Math.max(0, k)) * stride;
    for (let i = 0; i < stride; i++) sums[i] += src[o + i];
  }
  for (let y = 0; y < h; y++) {
    const out = y * stride;
    const add = Math.min(last, y + r + 1) * stride;
    const sub = Math.max(0, y - r) * stride;
    for (let i = 0; i < stride; i++) {
      const v = sums[i];
      dst[out + i] = (v * inv + 0.5) | 0;
      sums[i] = v + src[add + i] - src[sub + i];
    }
  }
}

/**
 * Blur xấp xỉ Gauss độ lệch chuẩn `sigma` (3 lượt box blur ngang + dọc — mục 5.8) trên dữ liệu nhân
 * trước, ghi đè `src` và trả về nó.
 */
export function blurPremultiplied(
  src: Int32Array,
  w: number,
  h: number,
  sigma: number,
): Int32Array {
  const radii = blurBoxes(sigma).filter((r) => r > 0);
  if (radii.length === 0) return src;
  const tmp = new Int32Array(src.length);
  const sums = new Int32Array(w * 4);
  for (const r of radii) {
    boxPassH(src, tmp, w, h, r);
    boxPassV(tmp, src, sums, w, h, r);
  }
  return src;
}
