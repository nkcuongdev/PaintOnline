import { describe, expect, it } from 'vitest';
import type { ArrowObject, RectObject, TextObject } from '../../core/types';
import {
  boxHandlePosition,
  constrainSquare,
  controlThrough,
  quadraticPoint,
  resizeBox,
  rotateAround,
  rotationFromHandle,
  snapAngle,
} from './geometry';
import { arrowGeometry } from './path';
import { styleGroupOf, styleOf, withColor, withStyle } from './style';
import { layoutText, wrapParagraph } from './textLayout';

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe('hình học đối tượng', () => {
  it('bắt góc 15° giữ nguyên độ dài', () => {
    const p = snapAngle({ x: 0, y: 0 }, { x: 10, y: 1 });
    expect(close(p.y, 0)).toBe(true);
    expect(close(Math.hypot(p.x, p.y), Math.hypot(10, 1))).toBe(true);
    const q = snapAngle({ x: 0, y: 0 }, { x: 10, y: 9 });
    expect(close(Math.atan2(q.y, q.x), Math.PI / 4)).toBe(true);
  });

  it('Shift khi kéo hình: hình vuông theo đúng hướng kéo', () => {
    expect(constrainSquare({ x: 10, y: 10 }, { x: 4, y: 30 })).toEqual({ x: -10, y: 30 });
  });

  it('đổi kích thước khung: góc đối diện đứng yên, kể cả khi khung đang xoay', () => {
    const start = { x: 0, y: 0, width: 100, height: 50 };
    for (const rotation of [0, Math.PI / 6, -1.2]) {
      const anchorBefore = boxHandlePosition(start, rotation, 'nw', 0);
      const dragTo = rotateAround({ x: 160, y: 90 }, { x: 50, y: 25 }, rotation);
      const next = resizeBox(start, rotation, 'se', dragTo, false);
      const anchorAfter = boxHandlePosition(next, rotation, 'nw', 0);
      expect(close(anchorAfter.x, anchorBefore.x) && close(anchorAfter.y, anchorBefore.y)).toBe(
        true,
      );
    }
  });

  it('kéo cạnh chỉ đổi một chiều; Shift giữ tỉ lệ khi kéo góc', () => {
    const start = { x: 0, y: 0, width: 100, height: 50 };
    expect(resizeBox(start, 0, 'e', { x: 140, y: 999 }, false)).toEqual({
      x: 0,
      y: 0,
      width: 140,
      height: 50,
    });
    const ratio = resizeBox(start, 0, 'se', { x: 300, y: 60 }, true);
    expect(ratio.width / ratio.height).toBeCloseTo(2);
    expect(ratio.width).toBe(300);
  });

  it('kéo qua điểm neo thì khung lật thay vì âm', () => {
    const r = resizeBox({ x: 0, y: 0, width: 100, height: 50 }, 0, 'se', { x: -20, y: -10 }, false);
    expect(r).toEqual({ x: -20, y: -10, width: 20, height: 10 });
  });

  it('xoay bằng handle (handle nằm trên tâm), Shift bắt 15°', () => {
    const r = { x: 0, y: 0, width: 100, height: 100 };
    expect(close(rotationFromHandle(r, { x: 50, y: -100 }, false), 0)).toBe(true);
    expect(close(rotationFromHandle(r, { x: 200, y: 50 }, false), Math.PI / 2)).toBe(true);
    expect(close(rotationFromHandle(r, { x: 200, y: 40 }, true), Math.PI / 2)).toBe(true);
  });

  it('điểm uốn mũi tên: đường cong đi qua điểm kéo tại t = 0,5', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 100, y: 0 };
    const mid = { x: 50, y: 40 };
    const c = controlThrough(p0, mid, p1);
    const m = quadraticPoint(p0, c, p1, 0.5);
    expect(close(m.x, 50) && close(m.y, 40)).toBe(true);
  });
});

describe('mũi tên', () => {
  const arrow = (patch: Partial<ArrowObject>): ArrowObject => ({
    id: 'a',
    type: 'arrow',
    rotation: 0,
    opacity: 1,
    from: { x: 0, y: 0 },
    to: { x: 200, y: 0 },
    stroke: { color: '#000000FF', width: 6 },
    head: 'triangle',
    bothEnds: false,
    ...patch,
  });

  it('đầu mũi tên tỉ lệ theo độ dày nét, thân dừng trước đầu', () => {
    const g = arrowGeometry(arrow({}));
    expect(g.heads).toHaveLength(1);
    expect(g.end.x).toBeLessThan(200);
    expect(g.heads[0]?.tip).toEqual({ x: 200, y: 0 });
  });

  it('hai đầu và không đầu', () => {
    expect(arrowGeometry(arrow({ bothEnds: true })).heads).toHaveLength(2);
    expect(arrowGeometry(arrow({ head: 'none' })).heads).toHaveLength(0);
  });

  it('mũi tên ngắn: đầu thu nhỏ để không vượt quá thân', () => {
    const g = arrowGeometry(arrow({ to: { x: 10, y: 0 } }));
    const head = g.heads[0];
    expect(head && head.tip.x - (head.left.x + head.right.x) / 2).toBeLessThanOrEqual(6);
  });
});

describe('bố cục chữ (mục 5.10)', () => {
  // Mỗi ký tự rộng 10 px.
  const measure = (text: string) => text.length * 10;

  it('xuống dòng ở khoảng trắng, bỏ khoảng trắng cuối dòng', () => {
    expect(wrapParagraph('xin chào thế giới', 90, measure)).toEqual(['xin chào', 'thế giới']);
  });

  it('từ dài hơn khung bị ngắt theo ký tự, không cắt giữa dấu tổ hợp', () => {
    expect(wrapParagraph('abcdefghij', 40, measure)).toEqual(['abcd', 'efgh', 'ij']);
    // "ế" viết dạng tổ hợp (e + dấu mũ + dấu sắc) vẫn là một ký tự.
    const lines = wrapParagraph('thế', 20, (t) => [...new Intl.Segmenter().segment(t)].length * 10);
    expect(lines.join('')).toBe('thế');
    expect(lines.every((l) => !/^[̀-ͯ]/.test(l))).toBe(true);
  });

  it('khung chữ: tự giãn khi không có độ rộng, cố định khi có', () => {
    const base: TextObject = {
      id: 't',
      type: 'text',
      rotation: 0,
      opacity: 1,
      origin: { x: 5, y: 7 },
      wrapWidth: null,
      text: 'Một dòng\nhai dòng nữa',
      font: { family: 'Inter Variable', size: 20, weight: 400, italic: false },
      align: 'left',
      lineHeight: 1.25,
      color: '#000000FF',
    };
    const auto = layoutText(base, (_font, text) => measure(text));
    expect(auto.lines).toEqual(['Một dòng', 'hai dòng nữa']);
    expect(auto.box).toEqual({ x: 5, y: 7, width: 120, height: 50 });
    const fixed = layoutText({ ...base, wrapWidth: 60 }, (_font, text) => measure(text));
    expect(fixed.box.width).toBe(60);
    expect(fixed.lines.length).toBeGreaterThan(2);
  });
});

describe('thuộc tính đối tượng ↔ option (Options bar)', () => {
  const rect: RectObject = {
    id: 'r',
    type: 'rect',
    rotation: 0,
    opacity: 1,
    rect: { x: 0, y: 0, width: 10, height: 10 },
    stroke: { color: '#FF0000FF', width: 4 },
    cornerRadius: 0,
  };
  const colors = { primary: '#000000FF', secondary: '#00FF00FF', recent: [] } as const;

  it('đọc thuộc tính theo nhóm option', () => {
    expect(styleGroupOf(rect)).toBe('shape');
    expect(styleOf(rect)).toEqual({
      strokeWidth: 4,
      dashed: false,
      shadow: false,
      fill: false,
      cornerRadius: 0,
    });
  });

  it('bật tô dùng màu phụ, nét đứt theo độ dày, giữ màu viền', () => {
    const next = withStyle(
      rect,
      { fill: true, dashed: true, strokeWidth: 6 },
      { ...colors, recent: [] },
    );
    expect(next.type === 'rect' && next.fill).toBe('#00FF00FF');
    expect(next.type === 'rect' && next.stroke).toEqual({
      color: '#FF0000FF',
      width: 6,
      dash: [18, 12],
    });
  });

  it('đổi màu: chính = viền, phụ = phần tô (chỉ khi đang tô)', () => {
    expect(withColor(rect, 'primary', '#0000FFFF')).toMatchObject({
      stroke: { color: '#0000FFFF' },
    });
    expect(withColor(rect, 'secondary', '#0000FFFF')).toBe(rect);
  });

  it('đối tượng bất biến: áp kiểu trả đối tượng mới', () => {
    const next = withStyle(rect, { strokeWidth: 8 }, { ...colors, recent: [] });
    expect(next).not.toBe(rect);
    expect(rect.stroke?.width).toBe(4);
  });
});
