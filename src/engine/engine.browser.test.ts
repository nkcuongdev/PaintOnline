import { afterEach, describe, expect, it } from 'vitest';
import type { Editor } from './core/Editor';
import type { NoticeCode } from './core/types';
import { PaintCommand } from './history/commands/PaintCommand';
import { GrowableSurface } from './memory/GrowableSurface';
import { MemoryBudget, TIER_BUDGETS } from './memory/MemoryBudget';
import {
  createTestEditor,
  diffPixels,
  drawStroke,
  hashPixels,
  pixelAt,
  randomStroke,
  seededRandom,
} from './testing/helpers';

/**
 * Test engine trên canvas thật (Vitest browser mode, Chromium/Firefox/WebKit) — mục 11.1.
 */

const editors: Editor[] = [];
function track(editor: Editor): Editor {
  editors.push(editor);
  return editor;
}

afterEach(() => {
  for (const e of editors.splice(0)) e.dispose();
  document.body.replaceChildren();
});

describe('Nghiệm thu GĐ1: 100 nét vẽ rồi undo/redo đúng từng pixel', () => {
  it('undo từng bước khôi phục chính xác mọi trạng thái trung gian, redo tái tạo chính xác', () => {
    // 600×400: nét vẽ băng qua nhiều tile 256 và tràn ra ngoài khung document.
    const W = 600;
    const H = 400;
    const editor = track(createTestEditor(W, H));
    const random = seededRandom(20261017);

    // states[k] = ảnh sau bước history thứ k.
    const states: string[] = [hashPixels(editor.readPixels())];
    const initial = editor.readPixels();
    for (let i = 0; i < 100; i++) {
      const before = editor.historySummary().steps;
      randomStroke(editor, random, W, H);
      const hash = hashPixels(editor.readPixels());
      if (editor.historySummary().steps > before) {
        states.push(hash);
      } else {
        // Nét không tạo bước history (vd. tẩy trên layer trống) thì không được đổi pixel.
        expect(hash).toBe(states.at(-1));
      }
    }
    const final = editor.readPixels();
    expect(editor.historySummary().steps).toBe(states.length - 1);
    expect(states.length - 1).toBeGreaterThan(80);

    for (let k = states.length - 1; k > 0; k--) {
      expect(editor.undo()).toBe(true);
      expect(hashPixels(editor.readPixels()), `undo về trạng thái ${String(k - 1)}`).toBe(
        states[k - 1],
      );
    }
    expect(editor.canUndo).toBe(false);
    expect(diffPixels(editor.readPixels(), initial)).toBe(0);

    for (let k = 1; k < states.length; k++) {
      expect(editor.redo()).toBe(true);
      expect(hashPixels(editor.readPixels()), `redo tới trạng thái ${String(k)}`).toBe(states[k]);
    }
    expect(diffPixels(editor.readPixels(), final)).toBe(0);
  }, 60_000);

  it('50 vòng undo/redo với pixel bán trong suốt không làm lệch màu (alpha nhân trước — mục 10.1)', () => {
    const editor = track(createTestEditor(300, 300));
    editor.tools.setActive('brush');
    editor.options.set('brush', { preset: 'soft', size: 80, opacity: 0.37, flow: 0.4 });
    editor.colors.setPrimary('#3B5BDB80');
    drawStroke(editor, [
      { x: 20, y: 20 },
      { x: 150, y: 200 },
      { x: 280, y: 40 },
    ]);
    const after = editor.readPixels();
    editor.undo();
    const before = editor.readPixels();
    for (let i = 0; i < 50; i++) {
      editor.redo();
      expect(diffPixels(editor.readPixels(), after)).toBe(0);
      editor.undo();
      expect(diffPixels(editor.readPixels(), before)).toBe(0);
    }
  });
});

describe('Brush, Eraser, Pencil', () => {
  it('opacity áp dụng cho cả nét: chỗ nét tự chồng không bị đậm dần', () => {
    const editor = track(createTestEditor(200, 200));
    editor.tools.setActive('brush');
    editor.options.set('brush', { preset: 'round', size: 20, opacity: 0.5 });
    editor.colors.setPrimary('#000000FF');
    // Nét tự cắt nhau tại (100, 100).
    drawStroke(editor, [
      { x: 20, y: 20 },
      { x: 180, y: 180 },
      { x: 180, y: 20 },
      { x: 20, y: 180 },
    ]);
    const px = editor.readPixels();
    const [, , , crossing] = pixelAt(px, 100, 100);
    const [, , , single] = pixelAt(px, 60, 60);
    expect(single).toBeGreaterThanOrEqual(126);
    expect(single).toBeLessThanOrEqual(129);
    expect(crossing).toBe(single);
  });

  it('nét mềm có mép mờ dần, nét cứng có mép rõ', () => {
    const editor = track(createTestEditor(200, 100));
    editor.tools.setActive('brush');
    editor.options.set('brush', { preset: 'soft', size: 40, opacity: 1, flow: 1 });
    drawStroke(editor, [
      { x: 30, y: 50 },
      { x: 170, y: 50 },
    ]);
    const px = editor.readPixels();
    const center = pixelAt(px, 100, 50)[3];
    const edge = pixelAt(px, 100, 66)[3];
    expect(center).toBeGreaterThan(200);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(center);
  });

  it('Eraser tẩy về trong suốt; tẩy trên layer trống không tạo bước history', () => {
    const editor = track(createTestEditor(200, 200));
    editor.tools.setActive('eraser');
    drawStroke(editor, [
      { x: 10, y: 10 },
      { x: 190, y: 190 },
    ]);
    expect(editor.canUndo).toBe(false);

    editor.tools.setActive('brush');
    editor.options.set('brush', { preset: 'round', size: 60, opacity: 1 });
    drawStroke(editor, [
      { x: 20, y: 100 },
      { x: 180, y: 100 },
    ]);
    expect(pixelAt(editor.readPixels(), 100, 100)[3]).toBe(255);

    editor.tools.setActive('eraser');
    editor.options.set('eraser', { size: 30, opacity: 1, hardness: 1 });
    drawStroke(editor, [
      { x: 100, y: 60 },
      { x: 100, y: 140 },
    ]);
    expect(pixelAt(editor.readPixels(), 100, 100)[3]).toBe(0);
    editor.undo();
    expect(pixelAt(editor.readPixels(), 100, 100)[3]).toBe(255);
  });

  it('Pencil vẽ đúng pixel nguyên, không khử răng cưa', () => {
    const editor = track(createTestEditor(20, 10));
    editor.tools.setActive('pencil');
    editor.colors.setPrimary('#FF0000FF');
    drawStroke(editor, [
      { x: 2.7, y: 3.2 },
      { x: 9.9, y: 3.9 },
    ]);
    const px = editor.readPixels();
    for (let x = 2; x <= 9; x++) expect(pixelAt(px, x, 3)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(px, 1, 3)[3]).toBe(0);
    expect(pixelAt(px, 10, 3)[3]).toBe(0);
    for (let x = 0; x < 20; x++) {
      expect(pixelAt(px, x, 2)[3]).toBe(0);
      expect(pixelAt(px, x, 4)[3]).toBe(0);
    }
  });

  it('Pixel ngoài khung document bị cắt, nét tràn biên vẫn vẽ phần bên trong', () => {
    const editor = track(createTestEditor(100, 100));
    editor.tools.setActive('brush');
    editor.options.set('brush', { preset: 'round', size: 10, opacity: 1 });
    drawStroke(editor, [
      { x: -50, y: 50 },
      { x: 150, y: 50 },
    ]);
    const px = editor.readPixels();
    expect(pixelAt(px, 0, 50)[3]).toBe(255);
    expect(pixelAt(px, 99, 50)[3]).toBe(255);
    const layer = editor.document?.activeLayer;
    expect(layer?.kind === 'raster' ? layer.bounds : null).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
  });

  it('Layer bị khóa: không vẽ, phát thông báo', () => {
    const editor = track(createTestEditor(100, 100));
    const notices: NoticeCode[] = [];
    editor.on('notice', ({ code }) => notices.push(code));
    const layer = editor.document?.activeLayer;
    if (layer) layer.locked = true;
    drawStroke(editor, [
      { x: 10, y: 10 },
      { x: 90, y: 90 },
    ]);
    expect(notices).toEqual(['layer.locked']);
    expect(editor.canUndo).toBe(false);
  });

  it('Opacity của nét lấy từ kênh alpha của màu', () => {
    const editor = track(createTestEditor(50, 50));
    editor.tools.setActive('brush');
    editor.options.set('brush', { preset: 'round', size: 20, opacity: 1 });
    editor.colors.setPrimary('#00FF0080');
    drawStroke(editor, [
      { x: 10, y: 25 },
      { x: 40, y: 25 },
    ]);
    const [, g, , a] = pixelAt(editor.readPixels(), 25, 25);
    expect(g).toBe(255);
    expect(a).toBeGreaterThanOrEqual(127);
    expect(a).toBeLessThanOrEqual(129);
  });
});

describe('MemoryBudget và GrowableSurface', () => {
  it('surface nở theo lưới 256, chỉ phủ vùng có nội dung, giải phóng trả lại ngân sách', () => {
    const budget = new MemoryBudget(TIER_BUDGETS.desktop);
    const surface = new GrowableSurface(budget, { x: 0, y: 0, width: 1000, height: 600 });
    expect(surface.isEmpty).toBe(true);
    surface.ensure({ x: 300, y: 10, width: 20, height: 20 });
    expect(surface.bounds).toEqual({ x: 256, y: 0, width: 256, height: 256 });
    expect(budget.usedBy('layer')).toBe(256 * 256 * 4);
    surface.ensure({ x: 900, y: 500, width: 200, height: 200 });
    // Cắt theo khung document: không vượt 1000 × 600.
    expect(surface.bounds).toEqual({ x: 256, y: 0, width: 744, height: 600 });
    expect(budget.usedBy('layer')).toBe(744 * 600 * 4);
    surface.release();
    expect(budget.usedBy('layer')).toBe(0);
    expect(budget.liveSurfaces).toBe(0);
  });

  it('nở surface giữ nguyên nội dung cũ', () => {
    const budget = new MemoryBudget(TIER_BUDGETS.desktop);
    const surface = new GrowableSurface(budget, { x: 0, y: 0, width: 1000, height: 1000 });
    surface.ensure({ x: 10, y: 10, width: 1, height: 1 });
    surface.write(
      { x: 10, y: 10, width: 1, height: 1 },
      new ImageData(new Uint8ClampedArray([1, 2, 3, 255]), 1, 1),
    );
    surface.ensure({ x: 800, y: 800, width: 10, height: 10 });
    expect([...(surface.read({ x: 10, y: 10, width: 1, height: 1 })?.data ?? [])]).toEqual([
      1, 2, 3, 255,
    ]);
    surface.release();
  });

  it('vượt ngân sách: từ chối thao tác có thông báo, không hỏng dữ liệu', () => {
    // Ngân sách 2 MB: layer ≤ 1,2 MB → surface 512×512 (1 MB) vừa, 1024² thì không.
    const editor = track(createTestEditor(2000, 2000, { memory: { totalBytes: 2 * 1024 ** 2 } }));
    const notices: NoticeCode[] = [];
    editor.on('notice', ({ code }) => notices.push(code));
    editor.tools.setActive('brush');
    editor.options.set('brush', { size: 10 });
    drawStroke(editor, [
      { x: 10, y: 10 },
      { x: 1900, y: 1900 },
    ]);
    expect(notices).toContain('memory.refused');
    expect(editor.canUndo).toBe(false);
    // Nét bị từ chối không để lại dữ liệu history nào (kho tile đã được trả lại).
    expect(editor.memory.usedBy('history')).toBe(0);
  });

  it('stroke buffer dùng chung giữa các nét, giải phóng khi đổi document', () => {
    const editor = track(createTestEditor(800, 600));
    editor.tools.setActive('brush');
    drawStroke(editor, [
      { x: 10, y: 10 },
      { x: 700, y: 500 },
    ]);
    const afterFirst = editor.memory.usedBy('temp');
    expect(afterFirst).toBeGreaterThan(0);
    const live = editor.memory.liveSurfaces;
    drawStroke(editor, [
      { x: 20, y: 20 },
      { x: 600, y: 400 },
    ]);
    // Nét sau dùng lại buffer, không cấp phát canvas mới.
    expect(editor.memory.usedBy('temp')).toBe(afterFirst);
    expect(editor.memory.liveSurfaces).toBe(live + 1); // +1: kho tile của nét thứ hai
    editor.createDocument({
      width: 100,
      height: 100,
      background: { kind: 'transparent' },
      layers: [{ kind: 'raster', name: 'x' }],
    });
    expect(editor.memory.usedBy('temp')).toBe(0);
    expect(editor.memory.usedBy('history')).toBe(0);
  });

  it('document vượt giới hạn tier bị từ chối', () => {
    const editor = track(createTestEditor(10, 10));
    const notices: NoticeCode[] = [];
    editor.on('notice', ({ code }) => notices.push(code));
    const ok = editor.createDocument({
      width: 9000,
      height: 100,
      background: { kind: 'transparent' },
      layers: [{ kind: 'raster', name: 'x' }],
    });
    expect(ok).toBe(false);
    expect(notices).toEqual(['document.tooLarge']);
    expect(editor.document?.width).toBe(10);
  });

  it('PaintCommand chỉ giữ tile bị chạm', () => {
    const editor = track(createTestEditor(1024, 1024));
    let captured: PaintCommand | null = null;
    const original = editor.execute.bind(editor);
    editor.execute = (command) => {
      if (command instanceof PaintCommand) captured = command;
      original(command);
    };
    editor.tools.setActive('brush');
    editor.options.set('brush', { preset: 'round', size: 4 });
    drawStroke(editor, [
      { x: 100, y: 100 },
      { x: 120, y: 110 },
    ]);
    expect(captured).not.toBeNull();
    expect((captured as unknown as PaintCommand).tileCount).toBe(1);
  });
});

describe('Renderer và export', () => {
  it('mount vào DOM, vẽ document đúng vị trí trên display canvas', () => {
    const host = document.createElement('div');
    host.style.width = '400px';
    host.style.height = '300px';
    document.body.append(host);
    const editor = track(
      createTestEditor(200, 100, { background: { kind: 'color', color: '#FFFFFFFF' } }),
    );
    editor.mount(host);
    editor.viewport.setDpr(1);
    editor.viewport.setSize(400, 300);
    editor.viewport.set({ zoom: 1, panX: 100, panY: 100 });
    editor.tools.setActive('brush');
    editor.options.set('brush', { preset: 'round', size: 30, opacity: 1 });
    editor.colors.setPrimary('#FF0000FF');
    drawStroke(editor, [
      { x: 50, y: 50 },
      { x: 150, y: 50 },
    ]);
    editor.flush();
    const canvas = editor.displayCanvas;
    expect(canvas).not.toBeNull();
    const ctx = canvas?.getContext('2d');
    // Document (100, 50) → màn hình (200, 150): đỏ. Document (100, 90) → (200, 190): nền trắng.
    expect([...(ctx?.getImageData(200, 150, 1, 1).data ?? [])]).toEqual([255, 0, 0, 255]);
    expect([...(ctx?.getImageData(200, 190, 1, 1).data ?? [])]).toEqual([255, 255, 255, 255]);
    // Ngoài document: trong suốt (vùng làm việc do CSS vẽ).
    expect(ctx?.getImageData(20, 20, 1, 1).data[3]).toBe(0);
  });

  it('export PNG đúng kích thước và nội dung, scale 0,5×', async () => {
    const editor = track(
      createTestEditor(120, 80, { background: { kind: 'color', color: '#FFFFFFFF' } }),
    );
    editor.tools.setActive('pencil');
    editor.colors.setPrimary('#0000FFFF');
    drawStroke(editor, [
      { x: 0, y: 0 },
      { x: 119, y: 0 },
    ]);
    const tempBefore = editor.memory.usedBy('temp');
    const blob = await editor.exportImage({ type: 'image/png' });
    expect(blob.type).toBe('image/png');
    const bitmap = await createImageBitmap(blob);
    expect([bitmap.width, bitmap.height]).toEqual([120, 80]);
    bitmap.close();

    const half = await createImageBitmap(await editor.exportImage({ scale: 0.5 }));
    expect([half.width, half.height]).toEqual([60, 40]);
    half.close();
    // Bề mặt tạm của export đã được trả lại (chỉ còn stroke buffer dùng chung).
    expect(editor.memory.usedBy('temp')).toBe(tempBefore);
  });
});
