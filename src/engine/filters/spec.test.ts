import { describe, expect, it } from 'vitest';
import {
  blurBoxes,
  defaultStep,
  filterHalo,
  FILTER_IDS,
  isIdentityPipeline,
  isIdentityStep,
  normalizeStep,
} from './spec';

describe('đặc tả filter', () => {
  it('3 hộp xấp xỉ Gauss: σ = 1 → một hộp 3 × 3; σ lớn → bán kính tăng đều', () => {
    expect(blurBoxes(1)).toEqual([0, 0, 1]);
    expect(blurBoxes(0)).toEqual([0, 0, 0]);
    const big = blurBoxes(10);
    expect(big.length).toBe(3);
    // Phương sai của 3 hộp ≈ σ²: Σ ((2r + 1)² − 1) / 12.
    const variance = big.reduce((s, r) => s + ((2 * r + 1) ** 2 - 1) / 12, 0);
    expect(Math.abs(variance - 100)).toBeLessThan(10);
  });

  it('phần đệm: tổng bán kính hộp (blur, sharpen), cạnh ô (pixelate), thu nhỏ theo tỉ lệ', () => {
    expect(filterHalo([{ id: 'brightness', amount: 40 }])).toBe(0);
    expect(filterHalo([{ id: 'blur', radius: 1 }])).toBe(1);
    expect(filterHalo([{ id: 'pixelate', size: 12 }])).toBe(12);
    expect(filterHalo([{ id: 'pixelate', size: 12 }], 0.25)).toBe(3);
    expect(filterHalo([{ id: 'blur', radius: 10 }], 0.5)).toBe(
      blurBoxes(5).reduce((a, b) => a + b, 0),
    );
  });

  it('kẹp tham số, mặc định, bước không đổi ảnh', () => {
    expect(normalizeStep({ id: 'brightness', amount: 500 })).toEqual({
      id: 'brightness',
      amount: 100,
    });
    expect(normalizeStep({ id: 'blur', radius: Number.NaN })).toEqual({ id: 'blur', radius: 4 });
    for (const id of FILTER_IDS) expect(normalizeStep(defaultStep(id))).toEqual(defaultStep(id));
    expect(isIdentityStep({ id: 'hue', degrees: 0 })).toBe(true);
    expect(isIdentityStep({ id: 'invert' })).toBe(false);
    expect(isIdentityStep({ id: 'sharpen', amount: 0, radius: 2 })).toBe(true);
    expect(
      isIdentityPipeline([
        { id: 'brightness', amount: 0 },
        { id: 'contrast', amount: 0 },
      ]),
    ).toBe(true);
  });
});
