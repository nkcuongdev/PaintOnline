import type { Color } from '@/engine/core/types';
import { bitmapToImageData } from './encode';

/**
 * Bảng màu thông minh (mục 7.6): trích các màu chủ đạo của ảnh vừa import để làm bảng màu project.
 * Median cut trên ảnh đã thu nhỏ (≤ 64 × 64): chia hộp màu có nhiều điểm ảnh nhất theo kênh trải
 * rộng nhất, lấy màu trung bình của mỗi hộp, bỏ màu gần trùng. Hàm thuần — test được với ảnh nhỏ.
 */

export const PALETTE_SIZE = 6;
/** Cạnh lớn nhất của ảnh mẫu. */
export const SAMPLE_SIDE = 64;
/** Hai màu cách nhau (khoảng cách RGB) dưới mức này coi là trùng. */
const MIN_DISTANCE = 28;
/** Màu chủ đạo phải chiếm ít nhất chừng này phần điểm ảnh của ảnh mẫu. */
const MIN_SHARE = 0.03;

type Rgb = [number, number, number];

interface Box {
  pixels: Rgb[];
}

function range(pixels: readonly Rgb[], channel: 0 | 1 | 2): number {
  let min = 255;
  let max = 0;
  for (const p of pixels) {
    const v = p[channel];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min;
}

function widestChannel(pixels: readonly Rgb[]): 0 | 1 | 2 {
  const r = range(pixels, 0);
  const g = range(pixels, 1);
  const b = range(pixels, 2);
  return r >= g && r >= b ? 0 : g >= b ? 1 : 2;
}

function average(pixels: readonly Rgb[]): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const p of pixels) {
    r += p[0];
    g += p[1];
    b += p[2];
  }
  const n = Math.max(1, pixels.length);
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function distance(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function hex(rgb: Rgb): Color {
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}FF`.toUpperCase() as Color;
}

/** Màu chủ đạo (nhiều điểm ảnh trước), tối đa `count` màu; bỏ điểm ảnh gần trong suốt. */
export function extractPalette(image: ImageData, count = PALETTE_SIZE): Color[] {
  const pixels: Rgb[] = [];
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    if ((d[i + 3] ?? 0) < 128) continue;
    pixels.push([d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0]);
  }
  if (pixels.length === 0) return [];

  // Chia nhiều hộp hơn số màu cần để còn chỗ bỏ màu gần trùng.
  const target = count * 3;
  const boxes: Box[] = [{ pixels }];
  while (boxes.length < target) {
    let index = -1;
    let best = 0;
    boxes.forEach((box, i) => {
      if (box.pixels.length < 2) return;
      const spread = range(box.pixels, widestChannel(box.pixels)) * box.pixels.length;
      if (spread > best) {
        best = spread;
        index = i;
      }
    });
    // Không hộp nào chia tiếp được (mọi hộp chỉ còn một màu).
    if (index < 0) break;
    const box = boxes[index];
    const channel = widestChannel(box.pixels);
    const sorted = [...box.pixels].sort((a, b) => a[channel] - b[channel]);
    const mid = sorted.length >> 1;
    boxes.splice(index, 1, { pixels: sorted.slice(0, mid) }, { pixels: sorted.slice(mid) });
  }

  // Gộp các hộp có màu gần nhau (một màu lớn có thể bị chia thành nhiều hộp) rồi xếp theo số điểm
  // ảnh — màu chủ đạo đứng trước.
  const clusters: { rgb: Rgb; weight: number }[] = [];
  for (const box of boxes) {
    const rgb = average(box.pixels);
    const weight = box.pixels.length;
    const near = clusters.find((c) => distance(c.rgb, rgb) < MIN_DISTANCE);
    if (!near) {
      clusters.push({ rgb, weight });
      continue;
    }
    const total = near.weight + weight;
    near.rgb = [0, 1, 2].map((k) =>
      Math.round(((near.rgb[k] ?? 0) * near.weight + (rgb[k] ?? 0) * weight) / total),
    ) as Rgb;
    near.weight = total;
  }
  clusters.sort((a, b) => b.weight - a.weight);
  // Màu chiếm quá ít điểm ảnh (viền khử răng cưa, chi tiết nhỏ) không phải màu chủ đạo.
  const minWeight = pixels.length * MIN_SHARE;
  const dominant = clusters.filter((c, i) => i === 0 || c.weight >= minWeight);
  return dominant.slice(0, count).map((c) => hex(c.rgb));
}

/** Bảng màu từ bitmap (đã thu nhỏ ≤ SAMPLE_SIDE ở main thread); bitmap bị đóng. */
export function paletteOfBitmap(bitmap: ImageBitmap): Color[] {
  return extractPalette(bitmapToImageData(bitmap));
}
