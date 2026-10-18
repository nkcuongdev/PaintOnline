import type { Rect } from '@/engine/core/types';
import { blurImage, pixelateBlocks } from '@/engine/layers/objects/redactEffect';
import { fillRgba } from './png';

/**
 * Nướng vùng che vào pixel layer khi xuất .paint "Áp dụng vĩnh viễn vùng che" (mục 10.2): pixel gốc
 * dưới mọi Redact bị thay hẳn — tô kín bằng màu, khảm hoặc làm mờ đúng kiểu đã chọn (GĐ7 chỉ tô kín
 * mọi kiểu). Chạy trong Worker trên ảnh RGBA không nhân trước của từng layer.
 */
export interface RedactBake {
  /** Phần vùng che nằm trong layer (tọa độ trong ảnh layer). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Màu đục [r, g, b, a] (tô kín, và lót cho khảm/làm mờ chỗ layer trong suốt). */
  rgba: [number, number, number, number];
  mode?: 'solid' | 'pixelate' | 'blur';
  /** Cỡ ô khảm hoặc độ lệch chuẩn làm mờ (đã kẹp theo `redactStrength`). */
  strength?: number;
  /** Phần nền đọc thêm quanh vùng che khi làm mờ (`redactHalo`). */
  halo?: number;
  /** Cả vùng che (tọa độ layer, có thể vượt ra ngoài ảnh layer) — lưới khảm căn theo góc vùng này. */
  full?: Rect;
}

interface Image {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Chép vùng `r` (có thể vượt ngoài ảnh — phần ngoài là trong suốt) ra ảnh mới. */
function crop(image: Image, r: Rect): Image {
  const out: Image = {
    width: r.width,
    height: r.height,
    data: new Uint8ClampedArray(r.width * r.height * 4),
  };
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(image.width, r.x + r.width);
  const y1 = Math.min(image.height, r.y + r.height);
  for (let y = y0; y < y1; y++) {
    const src = (y * image.width + x0) * 4;
    const dst = ((y - r.y) * r.width + (x0 - r.x)) * 4;
    out.data.set(image.data.subarray(src, src + (x1 - x0) * 4), dst);
  }
  return out;
}

/** Ghi phần `target` (tọa độ ảnh) của `patch` (đặt tại `origin`) trở lại ảnh. */
function paste(image: Image, patch: Image, origin: Rect, target: Rect): void {
  for (let y = target.y; y < target.y + target.height; y++) {
    const src = ((y - origin.y) * patch.width + (target.x - origin.x)) * 4;
    const dst = (y * image.width + target.x) * 4;
    image.data.set(patch.data.subarray(src, src + target.width * 4), dst);
  }
}

function clip(image: Image, r: Rect): Rect | null {
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(image.width, r.x + r.width);
  const y1 = Math.min(image.height, r.y + r.height);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}

export function bakeRedactions(image: Image, bakes: readonly RedactBake[]): void {
  for (const bake of bakes) {
    const target = clip(image, bake);
    if (!target) continue;
    const strength = bake.strength ?? 0;
    if (bake.mode === 'pixelate' && strength > 0) {
      const full = bake.full ?? target;
      const patch = crop(image, full);
      pixelateBlocks(patch, strength);
      paste(image, patch, full, target);
    } else if (bake.mode === 'blur' && strength > 0) {
      const halo = Math.ceil(bake.halo ?? 0);
      const area = {
        x: target.x - halo,
        y: target.y - halo,
        width: target.width + halo * 2,
        height: target.height + halo * 2,
      };
      const patch = crop(image, area);
      blurImage(patch, strength);
      paste(image, patch, area, target);
    } else {
      fillRgba(image, [{ ...target, rgba: bake.rgba }]);
    }
  }
}
