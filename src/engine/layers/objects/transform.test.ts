import { describe, expect, it } from 'vitest';
import type { ArrowObject, RectObject, TextObject } from '../../core/types';
import { rotatedCorners } from './geometry';
import { textLayout } from './text';
import { transformObject } from './transform';
import type { ObjectEnv } from './types';

/** Đo chữ giả: mỗi ký tự rộng 10 px (đủ để kiểm tra vị trí khung chữ). */
const env: ObjectEnv = {
  measure: (_font, text) => text.length * 10,
  ensureFont: () => undefined,
};

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** Tập góc của hình (bỏ thứ tự) — so hình sau biến đổi với hình gốc đã biến đổi điểm. */
function cornerSet(points: { x: number; y: number }[]): string[] {
  return points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).sort();
}

const rect: RectObject = {
  id: 'r',
  type: 'rect',
  rotation: 0.3,
  opacity: 1,
  rect: { x: 10, y: 20, width: 40, height: 10 },
  stroke: { color: '#000000FF', width: 4 },
  cornerRadius: 6,
};

describe('biến đổi đối tượng theo ảnh (GĐ5)', () => {
  it('xoay ảnh 90°: hình chữ nhật xoay đúng chỗ (đổi rộng/cao, giữ góc)', () => {
    const H = 100;
    const m = { a: 0, b: 1, c: -1, d: 0, e: H, f: 0 };
    const next = transformObject(rect, m, env) as RectObject;
    const expected = rotatedCorners(rect.rect, rect.rotation).map((p) => ({
      x: H - p.y,
      y: p.x,
    }));
    expect(cornerSet(rotatedCorners(next.rect, next.rotation))).toEqual(cornerSet(expected));
    expect(next.stroke?.width).toBe(4);
  });

  it('lật ngang: góc xoay đảo dấu, hình đối xứng qua trục', () => {
    const W = 200;
    const m = { a: -1, b: 0, c: 0, d: 1, e: W, f: 0 };
    const next = transformObject(rect, m, env) as RectObject;
    expect(near(next.rotation, -0.3)).toBe(true);
    const expected = rotatedCorners(rect.rect, rect.rotation).map((p) => ({ x: W - p.x, y: p.y }));
    expect(cornerSet(rotatedCorners(next.rect, next.rotation))).toEqual(cornerSet(expected));
  });

  it('co giãn ảnh: điểm theo ma trận, nét và bo góc theo tỉ lệ', () => {
    const m = { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 };
    const next = transformObject(rect, m, env) as RectObject;
    expect(next.rect).toEqual({ x: 20, y: 40, width: 80, height: 20 });
    expect(next.stroke?.width).toBe(8);
    expect(next.cornerRadius).toBe(12);
    const arrow: ArrowObject = {
      id: 'a',
      type: 'arrow',
      rotation: 0,
      opacity: 1,
      from: { x: 1, y: 2 },
      to: { x: 3, y: 4 },
      control: { x: 5, y: 6 },
      stroke: { color: '#000000FF', width: 3 },
      head: 'triangle',
      bothEnds: false,
    };
    const moved = transformObject(arrow, { a: 1, b: 0, c: 0, d: 1, e: -1, f: -2 }, env);
    expect(moved).toMatchObject({
      from: { x: 0, y: 0 },
      to: { x: 2, y: 2 },
      control: { x: 4, y: 4 },
    });
  });

  it('chữ không bị lật: tâm khung theo ma trận, xoay thêm góc của phép xoay', () => {
    const text: TextObject = {
      id: 't',
      type: 'text',
      rotation: 0,
      opacity: 1,
      origin: { x: 10, y: 10 },
      wrapWidth: null,
      text: 'Xin chào',
      font: { family: 'Inter Variable', size: 20, weight: 400, italic: false },
      align: 'left',
      lineHeight: 1.25,
      color: '#000000FF',
    };
    const box = textLayout(text, env).box;
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const H = 100;
    const rotated = transformObject(
      text,
      { a: 0, b: 1, c: -1, d: 0, e: H, f: 0 },
      env,
    ) as TextObject;
    expect(near(rotated.rotation, Math.PI / 2)).toBe(true);
    const box2 = textLayout(rotated, env).box;
    expect(near(box2.x + box2.width / 2, H - center.y)).toBe(true);
    expect(near(box2.y + box2.height / 2, center.x)).toBe(true);
    const flipped = transformObject(
      text,
      { a: -1, b: 0, c: 0, d: 1, e: 200, f: 0 },
      env,
    ) as TextObject;
    expect(flipped.rotation).toBe(0);
    expect(flipped.font.size).toBe(20);
  });
});
