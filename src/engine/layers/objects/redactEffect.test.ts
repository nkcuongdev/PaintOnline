import { describe, expect, it } from 'vitest';
import type { RgbaImage } from '../../filters/kernels';
import {
  blurImage,
  pixelateBlocks,
  REDACT_MAX_BLOCK,
  REDACT_MIN_BLOCK,
  REDACT_MIN_BLUR,
  redactHalo,
  redactStrength,
} from './redactEffect';

function image(width: number, height: number, fill: (x: number, y: number) => number[]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(fill(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

const px = (img: RgbaImage, x: number, y: number) =>
  Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

describe('Redact khảm (mục 5.4: khối lớn ≥ 12 px)', () => {
  it('chia đều vùng thành ô ≥ cỡ ô, mỗi ô là màu trung bình', () => {
    // 30 × 12, ô 12: floor(30 / 12) = 2 ô ngang rộng 15, 1 ô dọc cao 12.
    const img = image(30, 12, (x) => [x < 15 ? 0 : 200, x < 15 ? 30 : 100, x, 255]);
    pixelateBlocks(img, 12);
    // Ô trái: x 0..14 → B trung bình 7; ô phải: x 15..29 → 22.
    expect(px(img, 0, 0)).toEqual([0, 30, 7, 255]);
    expect(px(img, 14, 11)).toEqual([0, 30, 7, 255]);
    expect(px(img, 15, 0)).toEqual([200, 100, 22, 255]);
    expect(px(img, 29, 11)).toEqual([200, 100, 22, 255]);
  });

  it('không có dải hẹp ở mép: vùng 25 px với ô 12 thành 2 ô 12–13 px', () => {
    const img = image(25, 5, (x) => [x * 10, 0, 0, 255]);
    pixelateBlocks(img, 12);
    const row = Array.from({ length: 25 }, (_, x) => px(img, x, 0)[0]);
    expect(new Set(row.slice(0, 13)).size).toBe(1);
    expect(new Set(row.slice(13)).size).toBe(1);
    expect(row[0]).not.toBe(row[24]);
  });

  it('vùng nhỏ hơn cỡ ô: một ô duy nhất', () => {
    const img = image(5, 3, (x, y) => [x * 50, y * 100, 0, 255]);
    pixelateBlocks(img, 16);
    expect(
      new Set(Array.from({ length: 15 }, (_, i) => px(img, i % 5, Math.floor(i / 5)).join(',')))
        .size,
    ).toBe(1);
  });

  it('trung bình nhân trước theo alpha: pixel trong suốt không làm tối màu', () => {
    const img = image(12, 12, (x) => (x < 6 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
    pixelateBlocks(img, 12);
    expect(px(img, 11, 11)).toEqual([255, 0, 0, 128]);
  });

  it('cường độ kẹp theo chế độ; chỉ làm mờ cần phần đệm', () => {
    expect(redactStrength({ mode: 'pixelate', strength: 3 })).toBe(REDACT_MIN_BLOCK);
    expect(redactStrength({ mode: 'pixelate', strength: 500 })).toBe(REDACT_MAX_BLOCK);
    expect(redactStrength({ mode: 'blur', strength: 1 })).toBe(REDACT_MIN_BLUR);
    expect(redactStrength({ mode: 'solid', strength: 20 })).toBe(0);
    expect(redactHalo({ mode: 'pixelate', strength: 16 })).toBe(0);
    expect(redactHalo({ mode: 'blur', strength: 10 })).toBeGreaterThan(10);
  });
});

describe('Redact làm mờ', () => {
  it('xóa chi tiết tần số cao (ô bàn cờ 1 px thành gần xám đều)', () => {
    const img = image(40, 40, (x, y) => ((x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
    blurImage(img, 6);
    for (const [x, y] of [
      [20, 20],
      [5, 30],
      [33, 8],
    ] as const) {
      const [r = 0] = px(img, x, y);
      expect(Math.abs(r - 127.5)).toBeLessThan(4);
    }
  });
});
