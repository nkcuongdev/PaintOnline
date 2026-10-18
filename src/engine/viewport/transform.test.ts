import { describe, expect, it } from 'vitest';
import {
  applyMatrix,
  centered,
  clampZoom,
  docToScreen,
  fillZoom,
  fitZoom,
  invert,
  MAX_ZOOM,
  MIN_ZOOM,
  multiply,
  normalizeWheelDelta,
  screenToDoc,
  stepZoom,
  transformRect,
  viewMatrix,
  wheelZoomFactor,
  zoomAt,
  type Matrix,
} from './transform';

const view = { zoom: 2, panX: 100, panY: 50 };

describe('docToScreen / screenToDoc', () => {
  it('x_screen = x_doc · zoom + pan', () => {
    expect(docToScreen(view, { x: 10, y: 20 })).toEqual({ x: 120, y: 90 });
  });

  it('x_doc = (x_screen − pan) / zoom, giữ số thực', () => {
    expect(screenToDoc(view, { x: 121, y: 91 })).toEqual({ x: 10.5, y: 20.5 });
  });

  it('round-trip chính xác', () => {
    const p = { x: 123.456, y: -7.89 };
    const back = screenToDoc(view, docToScreen(view, p));
    expect(back.x).toBeCloseTo(p.x, 10);
    expect(back.y).toBeCloseTo(p.y, 10);
  });

  it('khớp với ma trận viewMatrix', () => {
    const p = { x: 3, y: 4 };
    expect(applyMatrix(viewMatrix(view), p)).toEqual(docToScreen(view, p));
  });
});

describe('ma trận', () => {
  const m: Matrix = { a: 2, b: 0.5, c: -0.3, d: 1.5, e: 10, f: -4 };

  it('invert(m) · m = I', () => {
    const r = multiply(invert(m), m);
    expect(r.a).toBeCloseTo(1);
    expect(r.b).toBeCloseTo(0);
    expect(r.c).toBeCloseTo(0);
    expect(r.d).toBeCloseTo(1);
    expect(r.e).toBeCloseTo(0);
    expect(r.f).toBeCloseTo(0);
  });

  it('ma trận suy biến ném lỗi', () => {
    expect(() => invert({ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 })).toThrow();
  });

  it('transformRect cho hình bao', () => {
    expect(transformRect(viewMatrix(view), { x: 0, y: 0, width: 10, height: 5 })).toEqual({
      x: 100,
      y: 50,
      width: 20,
      height: 10,
    });
  });
});

describe('zoomAt', () => {
  it('giữ điểm document dưới con trỏ đứng yên', () => {
    const anchor = { x: 400, y: 300 };
    const before = screenToDoc(view, anchor);
    const next = zoomAt(view, anchor, 5.5);
    const after = screenToDoc(next, anchor);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(next.zoom).toBe(5.5);
  });

  it('kẹp trong 1%–6400%', () => {
    expect(zoomAt(view, { x: 0, y: 0 }, 1000).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(view, { x: 0, y: 0 }, 0).zoom).toBe(MIN_ZOOM);
    expect(clampZoom(0.5)).toBe(0.5);
  });
});

describe('fit / fill / centered', () => {
  const doc = { width: 1920, height: 1080 };
  const vp = { width: 1000, height: 800 };

  it('fit vừa trọn theo cạnh hạn chế, trừ lề', () => {
    expect(fitZoom(doc, vp, 20)).toBeCloseTo(960 / 1920);
  });

  it('fill phủ kín', () => {
    expect(fillZoom(doc, vp)).toBeCloseTo(800 / 1080);
  });

  it('centered căn giữa', () => {
    const v = centered({ width: 100, height: 50 }, { width: 300, height: 200 }, 1);
    expect(v).toEqual({ zoom: 1, panX: 100, panY: 75 });
  });
});

describe('stepZoom', () => {
  it('nhảy tới mức chuẩn kế tiếp', () => {
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1, -1)).toBe(0.6667);
    expect(stepZoom(1.2, 1)).toBe(1.5);
    expect(stepZoom(1.2, -1)).toBe(1);
  });

  it('dừng ở biên', () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });
});

describe('wheel', () => {
  it('một nấc chuột (100 px) = ×1,1', () => {
    expect(wheelZoomFactor(-100)).toBeCloseTo(1.1);
    expect(wheelZoomFactor(100)).toBeCloseTo(1 / 1.1);
  });

  it('chuẩn hóa deltaMode dòng/trang', () => {
    expect(normalizeWheelDelta(3, 1, 800)).toBe(99);
    expect(normalizeWheelDelta(1, 2, 800)).toBe(800);
    expect(normalizeWheelDelta(42, 0, 800)).toBe(42);
  });
});
