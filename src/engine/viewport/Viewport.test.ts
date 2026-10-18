import { describe, expect, it, vi } from 'vitest';
import { Viewport } from './Viewport';

function make(docW = 1000, docH = 500, w = 800, h = 600) {
  const vp = new Viewport();
  vp.setDocumentSize(docW, docH);
  vp.setSize(w, h);
  return vp;
}

describe('Viewport', () => {
  it('fit căn giữa và vừa khung', () => {
    const vp = make();
    vp.fit();
    expect(vp.zoom).toBeCloseTo((800 - 48) / 1000);
    const center = vp.docToScreen({ x: 500, y: 250 });
    expect(center.x).toBeCloseTo(400, 0);
    expect(center.y).toBeCloseTo(300, 0);
  });

  it('fitIfLarger giữ 100% với ảnh nhỏ', () => {
    const vp = make(200, 100);
    vp.fitIfLarger();
    expect(vp.zoom).toBe(1);
  });

  it('zoomTo quanh con trỏ giữ điểm document đứng yên', () => {
    const vp = make();
    vp.fit();
    const anchor = { x: 123, y: 321 };
    const before = vp.screenToDoc(anchor);
    vp.zoomTo(3, anchor);
    const after = vp.screenToDoc(anchor);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('resize giữ nguyên điểm document ở tâm', () => {
    const vp = make();
    vp.fit();
    const center = vp.screenToDoc({ x: 400, y: 300 });
    vp.setSize(1200, 900);
    const after = vp.screenToDoc({ x: 600, y: 450 });
    expect(after.x).toBeCloseTo(center.x, 6);
    expect(after.y).toBeCloseTo(center.y, 6);
  });

  it('pan không để document trôi hẳn khỏi khung', () => {
    const vp = make();
    vp.fit();
    vp.panBy(100000, 100000);
    const tl = vp.docToScreen({ x: 0, y: 0 });
    expect(tl.x).toBeLessThanOrEqual(800 - 64);
    expect(tl.y).toBeLessThanOrEqual(600 - 64);
  });

  it('deviceMatrix nhân DPR', () => {
    const vp = make();
    vp.setDpr(2);
    vp.set({ zoom: 1.5, panX: 10, panY: 20 });
    expect(vp.deviceMatrix).toEqual({ a: 3, b: 0, c: 0, d: 3, e: 20, f: 40 });
  });

  it('phát onChange', () => {
    const vp = make();
    const listener = vi.fn();
    vp.onChange(listener);
    vp.zoomStep(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ width: 800, height: 600 }));
  });
});

describe('Viewport insets', () => {
  it('fit chừa vùng bị giao diện nổi che', () => {
    const vp = make(1000, 500, 800, 600);
    vp.setInsets({ top: 100 });
    vp.fit();
    const topLeft = vp.docToScreen({ x: 0, y: 0 });
    const bottom = vp.docToScreen({ x: 0, y: 500 }).y;
    expect(topLeft.y).toBeGreaterThanOrEqual(100 + 24 - 1);
    expect(bottom).toBeLessThanOrEqual(600 - 24 + 1);
  });
});
