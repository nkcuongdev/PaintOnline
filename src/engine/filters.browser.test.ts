import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyFilter } from '@/services/workers/ops/filters/pipeline';
import { inlineWorkerClient } from '@/services/workers/inline';
import type { Editor } from './core/Editor';
import type { FilterStep, NoticeCode, WorkerClient } from './core/types';
import { createTestEditor, diffPixels, hashPixels, pixelAt } from './testing/helpers';

/**
 * Điều chỉnh và bộ lọc GĐ6 (mục 2, 5.8): áp dụng full-res theo dải trong Worker (ở đây chạy trực
 * tiếp cùng hàm thuần), giới hạn trong vùng chọn, undo chính xác, hủy giữa chừng, xem trước trên
 * màn hình (không đổi document), so sánh trước/sau; tool Gradient — trên canvas thật của 3 engine.
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

function pattern(width: number, height: number): ImageData {
  const image = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      image.data[i] = (x * 7 + 13) & 255;
      image.data[i + 1] = (y * 11 + 5) & 255;
      image.data[i + 2] = (x * 3 + y * 5) & 255;
      image.data[i + 3] = 255;
    }
  }
  return image;
}

function patternEditor(width = 120, height = 90, workers: WorkerClient = inlineWorkerClient) {
  const editor = track(createTestEditor(width, height, { workers }));
  editor.createDocument({
    width,
    height,
    background: { kind: 'transparent' },
    layers: [{ kind: 'raster', name: 'Nền', image: pattern(width, height) }],
  });
  return editor;
}

/** Kết quả kỳ vọng: chạy hàm thuần của Worker trên cả ảnh một lần. */
function expected(image: ImageData, steps: FilterStep[]): ImageData {
  const out = applyFilter({
    width: image.width,
    height: image.height,
    data: image.data.slice(),
    originX: 0,
    originY: 0,
    scale: 1,
    core: { x: 0, y: 0, width: image.width, height: image.height },
    steps,
    lockAlpha: false,
  });
  return new ImageData(out, image.width, image.height);
}

function notices(editor: Editor): NoticeCode[] {
  const codes: NoticeCode[] = [];
  editor.on('notice', ({ code }) => codes.push(code));
  return codes;
}

function mountEditor(editor: Editor, width: number, height: number, zoom = 1): void {
  const host = document.createElement('div');
  host.style.width = `${String(width)}px`;
  host.style.height = `${String(height)}px`;
  document.body.append(host);
  editor.mount(host);
  editor.viewport.setDpr(1);
  editor.viewport.setSize(width, height);
  editor.viewport.set({ zoom, panX: 0, panY: 0 });
}

function display(editor: Editor, x: number, y: number): [number, number, number, number] {
  editor.flush();
  const ctx = editor.displayCanvas?.getContext('2d');
  if (!ctx) throw new Error('chưa mount');
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 0];
}

async function waitPreview(editor: Editor, count: number): Promise<void> {
  await vi.waitFor(
    () => {
      if (editor.filters.previewStats.previews < count) throw new Error('chưa xem trước');
    },
    { timeout: 3000, interval: 5 },
  );
}

describe('Áp dụng filter (mục 5.8)', () => {
  it('Brightness cả layer: đúng từng pixel; một bước history; undo/redo chính xác', async () => {
    const editor = patternEditor();
    const before = editor.readPixels();
    const steps: FilterStep[] = [{ id: 'brightness', amount: 20 }];
    expect(editor.filters.begin(steps, 'history.brightnessContrast')).toBe(true);
    expect(await editor.filters.apply()).toBe(true);
    expect(editor.filters.isOpen).toBe(false);
    const after = editor.readPixels();
    expect(diffPixels(after, expected(before, steps))).toBe(0);
    expect(pixelAt(after, 0, 0)).toEqual([64, 56, 51, 255]);
    expect(editor.historySummary().undoLabel).toBe('history.brightnessContrast');
    expect(editor.undo()).toBe(true);
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(before));
    expect(editor.redo()).toBe(true);
    expect(diffPixels(editor.readPixels(), expected(before, steps))).toBe(0);
  });

  it('chỉ tác động trong vùng chọn; ngoài vùng chọn giữ nguyên từng pixel', async () => {
    const editor = patternEditor();
    const before = editor.readPixels();
    editor.selection.select({ kind: 'rect', rect: { x: 30, y: 20, width: 40, height: 30 } });
    const steps: FilterStep[] = [{ id: 'invert' }];
    expect(await editor.filters.run(steps)).toBe(true);
    const after = editor.readPixels();
    const inverted = expected(before, steps);
    for (const [x, y] of [
      [30, 20],
      [69, 49],
      [50, 35],
    ] as const) {
      expect(pixelAt(after, x, y)).toEqual(pixelAt(inverted, x, y));
    }
    for (const [x, y] of [
      [29, 20],
      [70, 49],
      [50, 50],
      [0, 0],
    ] as const) {
      expect(pixelAt(after, x, y)).toEqual(pixelAt(before, x, y));
    }
    editor.undo();
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(before));
  });

  it('blur theo nhiều dải song song = chạy cả ảnh một lần', async () => {
    // 1800 × 1300 ≈ 2,3 MP: hai dải (mỗi dải ~2 MP) có phần đệm.
    const editor = patternEditor(1800, 1300);
    const before = editor.readPixels();
    const steps: FilterStep[] = [{ id: 'blur', radius: 3 }];
    const progress: number[] = [];
    editor.on('filterChanged', (s) => {
      if (s?.phase === 'applying') progress.push(s.progress);
    });
    expect(await editor.filters.run(steps)).toBe(true);
    expect(diffPixels(editor.readPixels(), expected(before, steps))).toBe(0);
    expect(progress.at(-1)).toBe(1);
    expect(progress.some((p) => p > 0 && p < 1)).toBe(true);
  });

  it('layer khóa trong suốt: blur giữ nguyên alpha', async () => {
    const W = 40;
    const image = new ImageData(W, W);
    for (let y = 10; y < 30; y++) {
      for (let x = 10; x < 30; x++) image.data.set([200, 30, 30, 255], (y * W + x) * 4);
    }
    const editor = track(createTestEditor(W, W, { workers: inlineWorkerClient }));
    editor.createDocument({
      width: W,
      height: W,
      background: { kind: 'transparent' },
      layers: [{ kind: 'raster', name: 'Nền', image }],
    });
    const id = editor.document?.activeLayerId ?? '';
    editor.layers.setProps(id, { alphaLocked: true });
    expect(await editor.filters.run([{ id: 'blur', radius: 2 }])).toBe(true);
    const after = editor.readPixels();
    for (let i = 3; i < after.data.length; i += 4) expect(after.data[i]).toBe(image.data[i]);
  });

  it('hủy giữa chừng: layer và history giữ nguyên, quay lại xem trước', async () => {
    const slow: WorkerClient = {
      ...inlineWorkerClient,
      applyFilter: (request, signal) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            resolve(applyFilter(request));
          }, 40);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('Đã hủy', 'AbortError'));
          });
        }),
    };
    const editor = patternEditor(120, 90, slow);
    const before = editor.readPixels();
    const steps = editor.historySummary().steps;
    expect(editor.filters.begin([{ id: 'grayscale' }])).toBe(true);
    const applying = editor.filters.apply();
    expect(editor.filters.state?.phase).toBe('applying');
    // Đang chạy nền: khóa undo và thao tác vẽ.
    expect(editor.undo()).toBe(false);
    editor.filters.cancel();
    expect(await applying).toBe(false);
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(before));
    expect(editor.historySummary().steps).toBe(steps);
    expect(editor.filters.state?.phase).toBe('preview');
    editor.filters.cancel();
    expect(editor.filters.isOpen).toBe(false);
  });

  it('layer chú thích: từ chối có thông báo; tham số trung tính: không tạo bước history', async () => {
    const editor = patternEditor();
    const codes = notices(editor);
    editor.layers.add('vector');
    expect(editor.filters.begin([{ id: 'invert' }])).toBe(false);
    expect(codes).toContain('filter.notRaster');
    editor.layers.setActive(editor.document?.layers[0]?.id ?? '');
    const steps = editor.historySummary().steps;
    expect(editor.filters.begin([{ id: 'brightness', amount: 0 }])).toBe(true);
    expect(await editor.filters.apply()).toBe(false);
    expect(editor.filters.isOpen).toBe(false);
    expect(editor.historySummary().steps).toBe(steps);
  });

  it('khi bảng mở: undo bị chặn, Esc đóng, Enter áp dụng; trả hết bộ nhớ tạm', async () => {
    const editor = patternEditor();
    const temp = editor.memory.usage().byCategory.temp;
    editor.filters.begin([{ id: 'sepia', amount: 100 }]);
    await waitPreview(editor, 1);
    expect(editor.undo()).toBe(false);
    editor.keyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(editor.filters.isOpen).toBe(false);
    expect(editor.memory.usage().byCategory.temp).toBe(temp);
    editor.filters.begin([{ id: 'sepia', amount: 100 }]);
    editor.keyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
    await vi.waitFor(() => {
      if (editor.filters.isOpen) throw new Error('đang áp dụng');
    });
    expect(editor.historySummary().steps).toBe(1);
    expect(editor.memory.usage().byCategory.temp).toBe(temp);
  });
});

describe('Xem trước (mục 5.8, 7.3)', () => {
  it('màn hình hiện ảnh đã lọc, document chưa đổi; giữ so sánh hiện ảnh gốc; Hủy bỏ hết', async () => {
    const editor = patternEditor();
    mountEditor(editor, 120, 90);
    const before = editor.readPixels();
    const original = display(editor, 10, 10);
    expect(original).toEqual(pixelAt(before, 10, 10));
    editor.filters.begin([{ id: 'invert' }]);
    await waitPreview(editor, 1);
    const [r, g, b] = pixelAt(before, 10, 10);
    expect(display(editor, 10, 10)).toEqual([255 - r, 255 - g, 255 - b, 255]);
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(before));
    editor.filters.compare(true);
    expect(display(editor, 10, 10)).toEqual(original);
    editor.filters.compare(false);
    expect(display(editor, 10, 10)).toEqual([255 - r, 255 - g, 255 - b, 255]);
    // Kéo slider: chỉ bản mới nhất được hiện.
    editor.filters.update([{ id: 'brightness', amount: 10 }]);
    editor.filters.update([{ id: 'brightness', amount: -100 }]);
    await vi.waitFor(() => {
      if (display(editor, 10, 10)[0] !== 0) throw new Error('chưa cập nhật');
    });
    editor.filters.cancel();
    expect(display(editor, 10, 10)).toEqual(original);
    expect(editor.historySummary().steps).toBe(0);
  });

  it('xem trước có vùng chọn: chỉ bên trong đổi', async () => {
    const editor = patternEditor();
    mountEditor(editor, 120, 90);
    const before = editor.readPixels();
    editor.selection.select({ kind: 'rect', rect: { x: 0, y: 0, width: 50, height: 90 } });
    editor.filters.begin([{ id: 'invert' }]);
    await waitPreview(editor, 1);
    const [r, g, b] = pixelAt(before, 10, 10);
    expect(display(editor, 10, 10)).toEqual([255 - r, 255 - g, 255 - b, 255]);
    expect(display(editor, 80, 10)).toEqual(pixelAt(before, 80, 10));
  });

  it('ảnh lớn đang thu nhỏ: xem trước trên bản ≤ 1 MP', async () => {
    const editor = patternEditor(3000, 2000);
    mountEditor(editor, 600, 400, 0.2);
    editor.filters.begin([{ id: 'grayscale' }]);
    await waitPreview(editor, 1);
    // Màn hình xám: ba kênh bằng nhau (sai số nội suy của bản thu nhỏ).
    const [r, g, b] = display(editor, 300, 200);
    expect(Math.abs(r - g)).toBeLessThanOrEqual(2);
    expect(Math.abs(g - b)).toBeLessThanOrEqual(2);
    editor.filters.cancel();
  });
});

describe('Gradient (mục 2 — P2)', () => {
  function whiteEditor(): Editor {
    const editor = track(createTestEditor(100, 40, { workers: inlineWorkerClient }));
    editor.createDocument({
      width: 100,
      height: 40,
      background: { kind: 'color', color: '#FFFFFFFF' },
      layers: [{ kind: 'raster', name: 'Nền' }],
    });
    editor.tools.setActive('gradient');
    editor.colors.setPrimary('#000000FF');
    editor.colors.setSecondary('#FFFFFFFF');
    return editor;
  }

  function dragAcross(editor: Editor, x0: number, x1: number, y = 20): void {
    editor.dispatchPointer('down', { x: x0, y });
    editor.dispatchPointer('move', { x: (x0 + x1) / 2, y });
    editor.dispatchPointer('move', { x: x1, y });
    editor.dispatchPointer('up', { x: x1, y });
  }

  it('thẳng: màu chính → màu phụ theo hướng kéo; một bước history, undo được', () => {
    const editor = whiteEditor();
    const before = editor.readPixels();
    dragAcross(editor, 0, 100);
    const after = editor.readPixels();
    expect(pixelAt(after, 0, 20)[0]).toBeLessThan(8);
    expect(pixelAt(after, 99, 5)[0]).toBeGreaterThan(247);
    expect(Math.abs(pixelAt(after, 50, 30)[0] - 128)).toBeLessThan(6);
    expect(editor.historySummary().undoLabel).toBe('history.gradient');
    editor.undo();
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(before));
  });

  it('bị giới hạn trong vùng chọn; click không kéo thì không tô', () => {
    const editor = whiteEditor();
    editor.selection.select({ kind: 'rect', rect: { x: 40, y: 0, width: 20, height: 40 } });
    editor.tools.setActive('gradient');
    dragAcross(editor, 40, 60);
    const after = editor.readPixels();
    expect(pixelAt(after, 41, 20)[0]).toBeLessThan(20);
    expect(pixelAt(after, 30, 20)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(after, 70, 20)).toEqual([255, 255, 255, 255]);
    const steps = editor.historySummary().steps;
    editor.dispatchPointer('down', { x: 50, y: 20 });
    editor.dispatchPointer('up', { x: 50, y: 20 });
    expect(editor.historySummary().steps).toBe(steps);
  });

  it('tỏa tròn tới trong suốt: tâm đậm, ngoài bán kính trong suốt', () => {
    const editor = track(createTestEditor(100, 100, { workers: inlineWorkerClient }));
    editor.tools.setActive('gradient');
    editor.options.set('gradient', { kind: 'radial', toTransparent: true });
    editor.colors.setPrimary('#FF0000FF');
    editor.dispatchPointer('down', { x: 50, y: 50 });
    editor.dispatchPointer('move', { x: 70, y: 50 });
    editor.dispatchPointer('up', { x: 80, y: 50 });
    const after = editor.readPixels();
    // Tâm pixel (50,5; 50,5) cách tâm gradient 0,7 px trên bán kính 20 px.
    const center = pixelAt(after, 50, 50);
    expect(center.slice(0, 3)).toEqual([255, 0, 0]);
    expect(center[3]).toBeGreaterThan(240);
    expect(pixelAt(after, 60, 50)[3]).toBeLessThan(140);
    expect(pixelAt(after, 95, 95)[3]).toBe(0);
  });
});
