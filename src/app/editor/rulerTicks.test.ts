import { describe, expect, it } from 'vitest';
import { rulerTicks } from './rulerTicks';

describe('thước đo (mục 2, P2)', () => {
  it('vạch có số cách nhau ≥ 56 px màn hình theo bước "đẹp"', () => {
    const ticks = rulerTicks(600, 1, 0);
    const majors = ticks.filter((t) => t.major);
    expect(majors.map((t) => t.value).slice(0, 4)).toEqual([0, 100, 200, 300]);
    expect(ticks.some((t) => !t.major && t.value === 20)).toBe(true);
  });

  it('theo zoom và pan: giá trị 0 ở vị trí pan', () => {
    const ticks = rulerTicks(800, 0.5, 120);
    const zero = ticks.find((t) => t.value === 0);
    expect(zero?.pos).toBe(120);
    const step = ticks.filter((t) => t.major).map((t) => t.value);
    expect(step[1] - step[0]).toBe(200);
    expect(ticks.every((t) => t.pos >= 0 && t.pos <= 800)).toBe(true);
  });

  it('không có kích thước thì không có vạch', () => {
    expect(rulerTicks(0, 1, 0)).toEqual([]);
  });
});
