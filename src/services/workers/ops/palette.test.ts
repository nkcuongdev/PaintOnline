import { describe, expect, it } from 'vitest';
import { extractPalette } from './palette';

/** Ảnh RGBA từ các dải màu đặc (số pixel theo tỉ lệ). */
function bands(colors: [number, number, number, number][], counts: number[]): ImageData {
  const total = counts.reduce((a, b) => a + b, 0);
  const data = new Uint8ClampedArray(total * 4);
  let p = 0;
  colors.forEach((c, i) => {
    for (let n = 0; n < (counts[i] ?? 0); n++, p++) data.set(c, p * 4);
  });
  return { width: total, height: 1, data, colorSpace: 'srgb' };
}

describe('bảng màu thông minh (mục 7.6)', () => {
  it('màu chủ đạo, nhiều điểm ảnh trước, đúng định dạng #RRGGBBAA', () => {
    const image = bands(
      [
        [255, 0, 0, 255],
        [0, 0, 255, 255],
        [0, 200, 0, 255],
      ],
      [500, 300, 100],
    );
    const palette = extractPalette(image, 6);
    expect(palette.slice(0, 3)).toEqual(['#FF0000FF', '#0000FFFF', '#00C800FF']);
    for (const c of palette) expect(c).toMatch(/^#[0-9A-F]{8}$/);
  });

  it('bỏ màu gần trùng và điểm ảnh trong suốt; tối đa `count` màu', () => {
    const image = bands(
      [
        [250, 250, 250, 255],
        [252, 251, 249, 255],
        [0, 0, 0, 0],
        [20, 20, 20, 255],
      ],
      [400, 400, 900, 100],
    );
    const palette = extractPalette(image, 6);
    expect(palette).toHaveLength(2);
    expect(palette[1]).toBe('#141414FF');
    expect(extractPalette(bands([[0, 0, 0, 0]], [10]))).toEqual([]);
  });

  it('ảnh nhiều màu: đúng 6 màu khác nhau', () => {
    const colors: [number, number, number, number][] = [];
    const counts: number[] = [];
    for (let i = 0; i < 12; i++) {
      colors.push([(i * 53) % 256, (i * 97) % 256, (i * 151) % 256, 255]);
      counts.push(20 + i);
    }
    const palette = extractPalette(bands(colors, counts), 6);
    expect(palette).toHaveLength(6);
    expect(new Set(palette).size).toBe(6);
  });
});
