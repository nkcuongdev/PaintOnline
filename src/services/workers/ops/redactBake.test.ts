import { describe, expect, it } from 'vitest';
import { blurImage, pixelateBlocks } from '@/engine/layers/objects/redactEffect';
import { bakeRedactions } from './redactBake';

/** Ảnh nhiễu xác định (mỗi pixel khác nhau) — dễ phát hiện pixel gốc còn sót. */
function noise(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  let seed = 7;
  for (let i = 0; i < data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    data[i] = seed & 255;
    data[i + 1] = (seed >> 8) & 255;
    data[i + 2] = (seed >> 16) & 255;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

function region(image: ReturnType<typeof noise>, x: number, y: number, w: number, h: number) {
  const out = noise(w, h);
  for (let yy = 0; yy < h; yy++) {
    const src = ((y + yy) * image.width + x) * 4;
    out.data.set(image.data.subarray(src, src + w * 4), yy * w * 4);
  }
  return out;
}

describe('nướng vùng che vào layer khi xuất .paint (mục 10.2)', () => {
  it('tô kín: mọi pixel trong vùng là màu che, ngoài vùng giữ nguyên', () => {
    const image = noise(40, 30);
    const before = image.data.slice();
    bakeRedactions(image, [{ x: 5, y: 4, width: 10, height: 8, rgba: [0, 0, 0, 255] }]);
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 40; x++) {
        const i = (y * 40 + x) * 4;
        const inside = x >= 5 && x < 15 && y >= 4 && y < 12;
        const px = [...image.data.subarray(i, i + 4)];
        expect(px).toEqual(inside ? [0, 0, 0, 255] : [...before.subarray(i, i + 4)]);
      }
    }
  });

  it('khảm: đúng bằng khảm của vùng (lưới căn theo góc vùng che), không còn pixel gốc', () => {
    const image = noise(64, 48);
    const original = region(image, 8, 6, 36, 24);
    const expected = region(image, 8, 6, 36, 24);
    pixelateBlocks(expected, 12);
    bakeRedactions(image, [
      {
        x: 8,
        y: 6,
        width: 36,
        height: 24,
        rgba: [0, 0, 0, 255],
        mode: 'pixelate',
        strength: 12,
        full: { x: 8, y: 6, width: 36, height: 24 },
      },
    ]);
    const baked = region(image, 8, 6, 36, 24);
    expect([...baked.data]).toEqual([...expected.data]);
    let same = 0;
    for (let i = 0; i < baked.data.length; i += 4) {
      if (
        baked.data[i] === original.data[i] &&
        baked.data[i + 1] === original.data[i + 1] &&
        baked.data[i + 2] === original.data[i + 2]
      ) {
        same++;
      }
    }
    expect(same / (baked.data.length / 4)).toBeLessThan(0.01);
  });

  it('làm mờ: bằng làm mờ của vùng gồm phần đệm, ngoài vùng giữ nguyên', () => {
    const image = noise(80, 60);
    const before = image.data.slice();
    const halo = 6;
    const expected = region(image, 20 - halo, 15 - halo, 30 + halo * 2, 20 + halo * 2);
    blurImage(expected, 4);
    bakeRedactions(image, [
      {
        x: 20,
        y: 15,
        width: 30,
        height: 20,
        rgba: [0, 0, 0, 255],
        mode: 'blur',
        strength: 4,
        halo,
      },
    ]);
    for (let y = 0; y < 60; y++) {
      for (let x = 0; x < 80; x++) {
        const i = (y * 80 + x) * 4;
        const inside = x >= 20 && x < 50 && y >= 15 && y < 35;
        const px = [...image.data.subarray(i, i + 4)];
        if (inside) {
          const j = ((y - 15 + halo) * (30 + halo * 2) + (x - 20 + halo)) * 4;
          expect(px).toEqual([...expected.data.subarray(j, j + 4)]);
        } else {
          expect(px).toEqual([...before.subarray(i, i + 4)]);
        }
      }
    }
  });

  it('vùng che vượt ra ngoài layer: chỉ ghi phần trong ảnh, lưới khảm vẫn căn theo cả vùng', () => {
    const image = noise(30, 30);
    bakeRedactions(image, [
      {
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        rgba: [0, 0, 0, 255],
        mode: 'pixelate',
        strength: 12,
        full: { x: -14, y: -14, width: 24, height: 24 },
      },
    ]);
    // Ô khảm 12 × 12 bắt đầu từ (-14, -14): pixel (0..9) thuộc ô thứ hai → cùng một màu.
    const first = [...image.data.subarray(0, 4)];
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const i = (y * 30 + x) * 4;
        expect([...image.data.subarray(i, i + 4)]).toEqual(first);
      }
    }
  });
});
