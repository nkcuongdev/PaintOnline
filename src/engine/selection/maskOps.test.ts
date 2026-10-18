import { describe, expect, it } from 'vitest';
import type { MaskData, Rect, SelectionShape } from '../core/types';
import {
  alphaBoundsOf,
  buildMaskData,
  combineMasks,
  featherMask,
  maskAt,
  simplifyRing,
  traceMask,
  trimMask,
} from './maskOps';
import { polygonArea, shapeContains, transformShape } from './shape';

function rectMask(r: Rect, value = 255): MaskData {
  return { bounds: { ...r }, data: new Uint8Array(r.width * r.height).fill(value) };
}

/** Vẽ hình bằng kiểm tra tâm pixel (thay canvas trong Node). */
function rasterize(shape: SelectionShape, bounds: Rect): Uint8Array {
  const out = new Uint8Array(bounds.width * bounds.height);
  for (let y = 0; y < bounds.height; y++) {
    for (let x = 0; x < bounds.width; x++) {
      const p = { x: bounds.x + x + 0.5, y: bounds.y + y + 0.5 };
      if (shapeContains(shape, p)) out[y * bounds.width + x] = 255;
    }
  }
  return out;
}

describe('maskOps — kết hợp vùng chọn (mục 5.7)', () => {
  it('thêm, bớt, giao theo hình bao đúng', () => {
    const a = rectMask({ x: 0, y: 0, width: 10, height: 10 });
    const b = rectMask({ x: 5, y: 5, width: 10, height: 10 });
    const add = combineMasks(a, b, 'add');
    expect(add.bounds).toEqual({ x: 0, y: 0, width: 15, height: 15 });
    expect(maskAt(add, 12, 12)).toBe(255);
    expect(maskAt(add, 12, 2)).toBe(0);
    const sub = combineMasks(a, b, 'subtract');
    expect(maskAt(sub, 2, 2)).toBe(255);
    expect(maskAt(sub, 7, 7)).toBe(0);
    const inter = combineMasks(a, b, 'intersect');
    expect(inter.bounds).toEqual({ x: 5, y: 5, width: 5, height: 5 });
    expect(
      trimMask(combineMasks(a, rectMask({ x: 50, y: 50, width: 2, height: 2 }), 'intersect')),
    ).toBeNull();
  });

  it('cắt sát nội dung và theo khung document', () => {
    const mask = buildMaskData(
      {
        docWidth: 20,
        docHeight: 20,
        base: null,
        operand: {
          kind: 'shape',
          shape: { kind: 'rect', rect: { x: -5, y: 3, width: 10, height: 4 } },
        },
        mode: 'replace',
        feather: 0,
        antiAlias: true,
      },
      rasterize,
    );
    expect(mask?.bounds).toEqual({ x: 0, y: 3, width: 5, height: 4 });
  });

  it('feather: biên mềm dần, giữa vẫn chọn hết', () => {
    const soft = featherMask(rectMask({ x: 10, y: 10, width: 20, height: 20 }), 6);
    expect(soft.bounds.x).toBeLessThan(10);
    expect(maskAt(soft, 20, 20)).toBe(255);
    const edge = maskAt(soft, 10, 20);
    expect(edge).toBeGreaterThan(64);
    expect(edge).toBeLessThan(192);
    expect(maskAt(soft, 3, 20)).toBe(0);
  });
});

describe('maskOps — viền marching squares', () => {
  it('hình chữ nhật cho một đường khép kín bao quanh, đã đơn giản hóa', () => {
    const outline = traceMask(rectMask({ x: 2, y: 3, width: 6, height: 4 }));
    expect(outline).toHaveLength(1);
    const ring = outline[0] ?? new Float32Array();
    const xs = ring.filter((_, i) => i % 2 === 0);
    const ys = ring.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeCloseTo(2, 0);
    expect(Math.max(...xs)).toBeCloseTo(8, 0);
    expect(Math.min(...ys)).toBeCloseTo(3, 0);
    expect(Math.max(...ys)).toBeCloseTo(7, 0);
    // Cạnh thẳng được gộp: còn khoảng 4–8 đỉnh.
    expect(ring.length / 2).toBeLessThanOrEqual(8);
  });

  it('hai vùng tách rời và vùng có lỗ cho nhiều đường', () => {
    const mask = rectMask({ x: 0, y: 0, width: 20, height: 10 }, 0);
    for (let y = 2; y < 8; y++) {
      for (let x = 2; x < 6; x++) mask.data[y * 20 + x] = 255;
      for (let x = 10; x < 18; x++) mask.data[y * 20 + x] = 255;
    }
    // Lỗ giữa khối thứ hai.
    mask.data[5 * 20 + 13] = 0;
    mask.data[5 * 20 + 14] = 0;
    expect(traceMask(mask)).toHaveLength(3);
  });

  it('đơn giản hóa giữ đỉnh góc', () => {
    const ring = simplifyRing([0, 0, 1, 0, 2, 0, 2, 1, 2, 2, 1, 2, 0, 2, 0, 1], 0.1);
    expect(ring.length / 2).toBe(4);
  });
});

describe('shape — hình học vùng chọn', () => {
  it('đa giác nonzero; biến đổi giữ loại khi chỉ dời/co giãn', () => {
    const square: SelectionShape = {
      kind: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    };
    expect(shapeContains(square, { x: 5, y: 5 })).toBe(true);
    expect(shapeContains(square, { x: 15, y: 5 })).toBe(false);
    expect(polygonArea(square.kind === 'polygon' ? square.points : [])).toBe(100);
    const moved = transformShape(
      { kind: 'ellipse', rect: { x: 0, y: 0, width: 10, height: 4 } },
      { a: 2, b: 0, c: 0, d: 1, e: 5, f: 1 },
    );
    expect(moved).toEqual({ kind: 'ellipse', rect: { x: 5, y: 1, width: 20, height: 4 } });
    const rotated = transformShape(
      { kind: 'rect', rect: { x: 0, y: 0, width: 10, height: 4 } },
      { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 },
    );
    expect(rotated.kind).toBe('polygon');
  });

  it('hình bao alpha (Trim)', () => {
    const rgba = new Uint8ClampedArray(10 * 6 * 4);
    rgba[(2 * 10 + 3) * 4 + 3] = 10;
    rgba[(4 * 10 + 7) * 4 + 3] = 255;
    expect(alphaBoundsOf(rgba, 10, 6)).toEqual({ x: 3, y: 2, width: 5, height: 3 });
    expect(alphaBoundsOf(new Uint8ClampedArray(16), 2, 2)).toBeNull();
  });
});
