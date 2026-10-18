import { describe, expect, it } from 'vitest';
import { hudValues, type BrushHudState } from './hud';

const state: BrushHudState = {
  group: 'brush',
  origin: { x: 100, y: 100 },
  startSize: 20,
  startHardness: 0.5,
  dragging: true,
};

describe('HUD chỉnh cọ (mục 7.6)', () => {
  it('kéo ngang: bán kính trên màn hình đi theo con trỏ', () => {
    expect(hudValues(state, { x: 110, y: 100 }, 1).size).toBe(40);
    expect(hudValues(state, { x: 110, y: 100 }, 2).size).toBe(30);
    expect(hudValues(state, { x: 0, y: 100 }, 1).size).toBe(1);
  });

  it('kéo lên: cứng hơn; kẹp trong [0, 1]', () => {
    expect(hudValues(state, { x: 100, y: 0 }, 1).hardness).toBe(1);
    expect(hudValues(state, { x: 100, y: 150 }, 1).hardness).toBeCloseTo(0.25);
    expect(hudValues(state, { x: 100, y: 400 }, 1).hardness).toBe(0);
  });
});
