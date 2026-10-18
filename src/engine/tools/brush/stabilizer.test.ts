import { describe, expect, it } from 'vitest';
import { pressureOpacity, pressureSize } from './BrushStroke';
import { LazyRope } from './stabilizer';

describe('bộ làm mượt dây kéo (mục 5.5)', () => {
  it('rung nhỏ hơn độ dài dây không làm đầu cọ di chuyển', () => {
    const rope = new LazyRope({ x: 0, y: 0 }, 20);
    expect(rope.pull({ x: 10, y: 5 })).toBe(false);
    expect(rope.pull({ x: -8, y: 12 })).toBe(false);
    expect(rope.tip).toEqual({ x: 0, y: 0 });
  });

  it('kéo căng dây: đầu cọ đi theo, luôn cách con trỏ đúng độ dài dây', () => {
    const rope = new LazyRope({ x: 0, y: 0 }, 20);
    expect(rope.pull({ x: 50, y: 0 })).toBe(true);
    expect(rope.tip).toEqual({ x: 30, y: 0 });
    rope.pull({ x: 30, y: 60 });
    expect(Math.hypot(30 - rope.tip.x, 60 - rope.tip.y)).toBeCloseTo(20);
  });

  it('độ dài 0 = tắt làm mượt (đầu cọ trùng con trỏ)', () => {
    const rope = new LazyRope({ x: 0, y: 0 }, 0);
    rope.pull({ x: 3, y: 4 });
    expect(rope.tip).toEqual({ x: 3, y: 4 });
  });
});

describe('đường cong áp lực bút', () => {
  it('kích thước tối thiểu 20%, tối đa 100%; độ đậm tối thiểu 5%', () => {
    expect(pressureSize(0)).toBeCloseTo(0.2);
    expect(pressureSize(1)).toBe(1);
    expect(pressureSize(2)).toBe(1);
    expect(pressureOpacity(0)).toBe(0.05);
    expect(pressureOpacity(0.5)).toBe(0.5);
  });
});
