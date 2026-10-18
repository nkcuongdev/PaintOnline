import { describe, expect, it } from 'vitest';
import { colorToCss, formatColor, isColor, normalizeColor, opaqueColor, parseColor } from './color';
import { bresenham, catmullRom } from './geometry';
import {
  alignOutRect,
  containsRect,
  inflateRect,
  intersectRect,
  isEmptyRect,
  roundOutRect,
  unionRect,
} from './rect';

describe('rect', () => {
  const a = { x: 0, y: 0, width: 10, height: 10 };
  const b = { x: 5, y: 5, width: 10, height: 10 };

  it('union / intersect', () => {
    expect(unionRect(a, b)).toEqual({ x: 0, y: 0, width: 15, height: 15 });
    expect(intersectRect(a, b)).toEqual({ x: 5, y: 5, width: 5, height: 5 });
    expect(isEmptyRect(intersectRect(a, { x: 20, y: 20, width: 1, height: 1 }))).toBe(true);
  });

  it('union bỏ qua hình rỗng', () => {
    expect(unionRect({ x: 0, y: 0, width: 0, height: 0 }, b)).toEqual(b);
  });

  it('roundOut bao trọn', () => {
    expect(roundOutRect({ x: 0.5, y: 1.2, width: 2, height: 2.1 })).toEqual({
      x: 0,
      y: 1,
      width: 3,
      height: 3,
    });
  });

  it('alignOut theo lưới 256', () => {
    expect(alignOutRect({ x: 300, y: -10, width: 10, height: 20 }, 256)).toEqual({
      x: 256,
      y: -256,
      width: 256,
      height: 512,
    });
  });

  it('contains / inflate', () => {
    expect(containsRect(inflateRect(a, 1), a)).toBe(true);
    expect(containsRect(a, b)).toBe(false);
  });
});

describe('color', () => {
  it('chuẩn hóa về #RRGGBBAA', () => {
    expect(normalizeColor('#abc')).toBe('#AABBCCFF');
    expect(normalizeColor('#abcd')).toBe('#AABBCCDD');
    expect(normalizeColor('#3b5bdb')).toBe('#3B5BDBFF');
    expect(normalizeColor('3b5bdb')).toBeNull();
    expect(isColor('#12345678')).toBe(true);
  });

  it('parse / format round-trip', () => {
    const c = parseColor('#3B5BDB80');
    expect(c).toEqual({ r: 59, g: 91, b: 219, a: 128 });
    expect(formatColor(c)).toBe('#3B5BDB80');
  });

  it('CSS cho canvas', () => {
    expect(colorToCss('#FF0000FF')).toBe('rgb(255 0 0)');
    expect(colorToCss('#FF000080')).toBe('rgb(255 0 0 / 0.5020)');
    expect(opaqueColor('#11223344')).toBe('#112233FF');
  });
});

describe('bresenham', () => {
  const collect = (x0: number, y0: number, x1: number, y1: number) => {
    const pts: string[] = [];
    bresenham(x0, y0, x1, y1, (x, y) => pts.push(`${x},${y}`));
    return pts;
  };

  it('đoạn ngang gồm cả hai đầu', () => {
    expect(collect(0, 0, 3, 0)).toEqual(['0,0', '1,0', '2,0', '3,0']);
  });

  it('đoạn chéo liền mạch, không có khoảng hở', () => {
    const pts = collect(0, 0, 5, 3).map((p) => p.split(',').map(Number));
    for (let i = 1; i < pts.length; i++) {
      const [x0 = 0, y0 = 0] = pts[i - 1] ?? [];
      const [x1 = 0, y1 = 0] = pts[i] ?? [];
      expect(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))).toBe(1);
    }
    expect(pts.at(-1)).toEqual([5, 3]);
  });

  it('một điểm', () => {
    expect(collect(2, 2, 2, 2)).toEqual(['2,2']);
  });
});

describe('catmullRom', () => {
  it('đi qua p1 tại t=0 và p2 tại t=1', () => {
    const p = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
      { x: 3, y: 1 },
    ] as const;
    const out = { x: 0, y: 0 };
    expect(catmullRom(p[0], p[1], p[2], p[3], 0, out)).toEqual({ x: 1, y: 1 });
    expect(catmullRom(p[0], p[1], p[2], p[3], 1, out)).toEqual({ x: 2, y: 0 });
  });
});
