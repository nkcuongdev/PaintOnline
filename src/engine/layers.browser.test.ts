import { afterEach, describe, expect, it, vi } from 'vitest';
import { inlineWorkerClient } from '@/services/workers/inline';
import type { Editor } from './core/Editor';
import type { NoticeCode, WorkerClient } from './core/types';
import { compareImages } from './testing/blend';
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
 * Hệ thống layer GĐ4 (mục 5.4, 5.6, 5.11): thao tác panel Layers, Merge/Flatten, nén history, áp
 * lực bộ nhớ — trên canvas thật của 3 engine.
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

function notices(editor: Editor): NoticeCode[] {
  const list: NoticeCode[] = [];
  editor.on('notice', ({ code }) => list.push(code));
  return list;
}

function layerNames(editor: Editor): string[] {
  return editor.document?.layers.map((l) => l.name) ?? [];
}

function activeId(editor: Editor): string {
  return editor.document?.activeLayerId ?? '';
}

/** Vẽ một nét ngẫu nhiên trên mỗi layer (đặt layer hoạt động trước). */
function paintEveryLayer(editor: Editor, seed: number): void {
  const random = seededRandom(seed);
  const doc = editor.document;
  if (!doc) return;
  for (const layer of doc.layers) {
    if (layer.kind !== 'raster') continue;
    editor.layers.setActive(layer.id);
    editor.tools.setActive('brush');
    editor.options.set('brush', { preset: 'round', size: 30, opacity: 0.9 });
    editor.colors.setPrimary(
      `#${Math.floor(random() * 0xffffff)
        .toString(16)
        .padStart(6, '0')}CC`,
    );
    drawStroke(editor, [
      { x: random() * doc.width, y: random() * doc.height },
      { x: random() * doc.width, y: random() * doc.height },
      { x: random() * doc.width, y: random() * doc.height },
    ]);
  }
}

function threeLayerEditor(width = 200, height = 120): Editor {
  const editor = track(
    createTestEditor(width, height, { background: { kind: 'color', color: '#FFFFFFFF' } }),
  );
  editor.layers.add('raster');
  editor.layers.add('raster');
  paintEveryLayer(editor, 7);
  return editor;
}

describe('Panel Layers: thêm, nhân bản, xóa, đổi thứ tự, thuộc tính — mỗi thao tác một bước undo', () => {
  it('thêm layer đặt trên layer hoạt động, tên không trùng; layer trống chưa tốn bộ nhớ', () => {
    const editor = track(createTestEditor(100, 100));
    const before = editor.memory.usedBy('layer');
    const id = editor.layers.add('raster');
    expect(id).not.toBeNull();
    expect(layerNames(editor)).toEqual(['Lớp 1', 'Lớp 2']);
    expect(activeId(editor)).toBe(id);
    expect(editor.memory.usedBy('layer')).toBe(before);
    editor.layers.add('vector');
    expect(layerNames(editor)).toEqual(['Lớp 1', 'Lớp 2', 'Chú thích 1']);
    expect(editor.historySummary().undoLabel).toBe('history.addAnnotationLayer');
    editor.undo();
    editor.undo();
    expect(layerNames(editor)).toEqual(['Lớp 1']);
  });

  it('nhân bản giữ đúng từng pixel và thuộc tính; undo/redo', () => {
    const editor = threeLayerEditor();
    const doc = editor.document;
    const source = doc?.layers[1];
    if (!doc || !source) throw new Error('thiếu layer');
    editor.layers.setProps(source.id, { blendMode: 'multiply', opacity: 0.5 });
    const composite = editor.readPixels();
    const copyId = editor.layers.duplicate(source.id);
    expect(copyId).not.toBeNull();
    const copy = editor.document?.getLayer(copyId ?? '');
    expect(copy).toMatchObject({ name: 'Lớp 2 (bản sao)', blendMode: 'multiply', opacity: 0.5 });
    expect(editor.document?.indexOfLayer(copyId ?? '')).toBe(2);
    // Nội dung bản sao giống hệt: ẩn bản gốc thì ảnh ghép giống lúc chưa nhân bản.
    editor.layers.setProps(source.id, { visible: false });
    expect(diffPixels(editor.readPixels(), composite)).toBe(0);
    editor.undo();
    editor.undo();
    expect(diffPixels(editor.readPixels(), composite)).toBe(0);
    expect(editor.document?.layers).toHaveLength(3);
    editor.redo();
    expect(editor.document?.layers).toHaveLength(4);
    expect(editor.document?.getLayer(copyId ?? '')?.kind).toBe('raster');
  });

  it('xóa layer: chọn layer bên dưới; undo trả lại đúng vị trí và pixel; không xóa layer cuối', () => {
    const editor = threeLayerEditor();
    const doc = editor.document;
    if (!doc) throw new Error('no doc');
    const middle = doc.layers[1];
    if (!middle) throw new Error('thiếu layer');
    const before = hashPixels(editor.readPixels());
    editor.layers.setActive(middle.id);
    expect(editor.layers.remove(middle.id)).toBe(true);
    expect(activeId(editor)).toBe(editor.document?.layers[0]?.id);
    expect(hashPixels(editor.readPixels())).not.toBe(before);
    editor.undo();
    expect(editor.document?.layers[1]?.id).toBe(middle.id);
    expect(activeId(editor)).toBe(middle.id);
    expect(hashPixels(editor.readPixels())).toBe(before);

    const single = track(createTestEditor(20, 20));
    const only = single.document?.layers[0];
    expect(single.layers.remove(only?.id ?? '')).toBe(false);
  });

  it('đổi thứ tự (kéo thả) đổi ảnh ghép; undo về như cũ', () => {
    const editor = threeLayerEditor();
    const doc = editor.document;
    const top = doc?.layers[2];
    if (!top || !doc) throw new Error('thiếu layer');
    const before = hashPixels(editor.readPixels());
    const order = doc.layers.map((l) => l.id);
    expect(editor.layers.move(top.id, 0)).toBe(true);
    expect(editor.document?.layers.map((l) => l.id)).toEqual([order[2], order[0], order[1]]);
    expect(hashPixels(editor.readPixels())).not.toBe(before);
    editor.undo();
    expect(editor.document?.layers.map((l) => l.id)).toEqual(order);
    expect(hashPixels(editor.readPixels())).toBe(before);
    expect(editor.layers.move(top.id, 2)).toBe(false);
  });

  it('kéo slider opacity liên tục gộp thành một bước; đổi tên, ẩn/hiện, blend là các bước riêng', () => {
    const editor = threeLayerEditor();
    const id = activeId(editor);
    const steps = editor.historySummary().steps;
    for (const opacity of [0.9, 0.8, 0.7, 0.6, 0.5]) editor.layers.setProps(id, { opacity });
    expect(editor.historySummary().steps).toBe(steps + 1);
    expect(editor.document?.getLayer(id)?.opacity).toBe(0.5);
    editor.layers.setProps(id, { name: '  Bầu trời  ' });
    editor.layers.setProps(id, { visible: false });
    editor.layers.setProps(id, { blendMode: 'screen' });
    expect(editor.document?.getLayer(id)).toMatchObject({
      name: 'Bầu trời',
      visible: false,
      blendMode: 'screen',
    });
    expect(editor.historySummary().steps).toBe(steps + 4);
    expect(editor.layers.setProps(id, { name: '   ' })).toBe(false);
    for (let i = 0; i < 4; i++) editor.undo();
    expect(editor.document?.getLayer(id)).toMatchObject({
      name: 'Lớp 3',
      visible: true,
      blendMode: 'normal',
      opacity: 1,
    });
  });

  it('layer khóa: không đổi opacity/blend/khóa trong suốt, không gộp; vẫn đổi tên, ẩn và mở khóa được', () => {
    const editor = threeLayerEditor();
    const codes = notices(editor);
    const id = activeId(editor);
    editor.layers.setProps(id, { locked: true });
    expect(editor.layers.setProps(id, { opacity: 0.2 })).toBe(false);
    expect(editor.layers.setProps(id, { blendMode: 'multiply' })).toBe(false);
    expect(editor.layers.mergeDown(id)).toBe(false);
    expect(codes).toContain('layer.locked');
    expect(editor.layers.setProps(id, { name: 'Khóa' })).toBe(true);
    expect(editor.layers.setProps(id, { visible: false })).toBe(true);
    expect(editor.layers.setProps(id, { locked: false })).toBe(true);
    expect(editor.layers.setProps(id, { opacity: 0.2 })).toBe(true);
  });
});

describe('Merge Down, Merge Visible, Flatten, Rasterize', () => {
  it('Merge Down: backdrop-dependent blend above unrelated layers is refused without changing pixels or history', () => {
    const editor = threeLayerEditor();
    const doc = editor.document;
    const top = doc?.layers[2];
    const middle = doc?.layers[1];
    if (!doc || !top || !middle) throw new Error('thiếu layer');
    editor.layers.setProps(top.id, { opacity: 0.6, blendMode: 'multiply' });
    const before = editor.readPixels();
    const beforeHash = hashPixels(before);
    const history = editor.historySummary();
    const emitted = notices(editor);
    expect(editor.layers.canMergeDown(top.id)).toBe(true);
    expect(editor.layers.mergeDown(top.id)).toBe(false);
    expect(emitted).toEqual(['layer.mergeBackdrop']);
    expect(editor.document?.layers).toHaveLength(3);
    expect(editor.historySummary()).toEqual(history);
    expect(editor.document?.getLayer(top.id)).toMatchObject({
      opacity: 0.6,
      blendMode: 'multiply',
    });
    expect(hashPixels(editor.readPixels())).toBe(beforeHash);
  });

  it('Merge Down normal lên layer đục cho đúng ảnh ghép', () => {
    const editor = track(
      createTestEditor(120, 80, { background: { kind: 'color', color: '#FFFFFFFF' } }),
    );
    editor.tools.setActive('bucket');
    const base = editor.document?.layers[0];
    if (!base) throw new Error('no layer');
    // Layer dưới đục: tô kín bằng pencil dày.
    editor.tools.setActive('brush');
    editor.options.set('brush', { preset: 'round', size: 200, opacity: 1 });
    editor.colors.setPrimary('#74C0FCFF');
    drawStroke(editor, [
      { x: 60, y: 40 },
      { x: 61, y: 40 },
    ]);
    editor.layers.add('raster');
    paintEveryLayer(editor, 3);
    const top = editor.document?.layers[1];
    if (!top) throw new Error('no top');
    editor.layers.setProps(top.id, { opacity: 0.7 });
    const before = editor.readPixels();
    editor.layers.mergeDown(top.id);
    expect(compareImages(editor.readPixels(), before).max).toBeLessThanOrEqual(1);
  });

  it('Merge Down layer chú thích lên layer ảnh: đối tượng thành pixel; hai layer chú thích thường thì gộp đối tượng', () => {
    const editor = threeLayerEditor();
    const raster = editor.document?.layers[2];
    if (!raster) throw new Error('no layer');
    editor.layers.setActive(raster.id);
    editor.layers.add('vector');
    editor.tools.setActive('rect');
    editor.dispatchPointer('down', { x: 20, y: 20 });
    editor.dispatchPointer('move', { x: 80, y: 60 });
    editor.dispatchPointer('up', { x: 80, y: 60 });
    editor.layers.add('vector');
    editor.tools.setActive('arrow');
    editor.dispatchPointer('down', { x: 100, y: 100 });
    editor.dispatchPointer('move', { x: 150, y: 30 });
    editor.dispatchPointer('up', { x: 150, y: 30 });
    const doc = editor.document;
    if (!doc) throw new Error('no doc');
    const before = editor.readPixels();
    const upper = doc.layers.at(-1);
    const lower = doc.layers.at(-2);
    if (!upper || !lower) throw new Error('thiếu layer');
    // Hai layer chú thích: gộp đối tượng, vẫn sửa được.
    expect(editor.layers.mergeDown(upper.id)).toBe(true);
    const merged = editor.document?.getLayer(lower.id);
    expect(merged?.kind).toBe('vector');
    expect(merged?.kind === 'vector' ? merged.objects.length : 0).toBe(2);
    expect(diffPixels(editor.readPixels(), before)).toBe(0);
    // Layer chú thích xuống layer ảnh: thành pixel.
    expect(editor.layers.mergeDown(lower.id)).toBe(true);
    expect(editor.document?.layers.every((l) => l.kind === 'raster')).toBe(true);
    // Ghép lên pixel bán trong suốt: chỉ sai số làm tròn 8 bit (source-over có tính kết hợp).
    expect(compareImages(editor.readPixels(), before).max).toBeLessThanOrEqual(2);
    editor.undo();
    editor.undo();
    expect(editor.document?.layers.filter((l) => l.kind === 'vector')).toHaveLength(2);
    expect(diffPixels(editor.readPixels(), before)).toBe(0);
  });

  it('Merge Visible: gộp layer đang hiện thành một layer ở vị trí layer hiện thấp nhất, giữ layer ẩn', () => {
    const editor = threeLayerEditor();
    editor.layers.add('raster');
    paintEveryLayer(editor, 11);
    const doc = editor.document;
    const hidden = doc?.layers[1];
    if (!doc || !hidden) throw new Error('no doc');
    editor.layers.setProps(hidden.id, { visible: false });
    editor.layers.setProps(doc.layers[3]?.id ?? '', { blendMode: 'difference' });
    const before = editor.readPixels();
    expect(editor.layers.canMergeVisible()).toBe(true);
    expect(editor.layers.mergeVisible()).toBe(true);
    const layers = editor.document?.layers ?? [];
    expect(layers.map((l) => l.visible)).toEqual([true, false]);
    expect(layers[1]?.id).toBe(hidden.id);
    expect(activeId(editor)).toBe(layers[0]?.id);
    expect(compareImages(editor.readPixels(), before).max).toBeLessThanOrEqual(1);
    editor.undo();
    expect(editor.document?.layers).toHaveLength(4);
    expect(diffPixels(editor.readPixels(), before)).toBe(0);
  });

  it('Flatten: một layer nền, bỏ layer ẩn; ảnh không đổi; undo trả lại tất cả', () => {
    const editor = threeLayerEditor();
    editor.layers.add('vector');
    editor.tools.setActive('rect');
    editor.dispatchPointer('down', { x: 10, y: 10 });
    editor.dispatchPointer('up', { x: 90, y: 70 });
    const doc = editor.document;
    if (!doc) throw new Error('no doc');
    editor.layers.setProps(doc.layers[0]?.id ?? '', { visible: false });
    const before = editor.readPixels();
    expect(editor.layers.flatten()).toBe(true);
    expect(editor.document?.layers.map((l) => [l.name, l.kind])).toEqual([['Nền', 'raster']]);
    expect(compareImages(editor.readPixels(), before).max).toBeLessThanOrEqual(1);
    expect(editor.layers.canFlatten()).toBe(false);
    editor.undo();
    expect(editor.document?.layers).toHaveLength(4);
    expect(diffPixels(editor.readPixels(), before)).toBe(0);
  });

  it('Rasterize từ panel: ảnh không đổi, có undo', () => {
    const editor = track(createTestEditor(100, 80));
    editor.layers.add('vector');
    editor.tools.setActive('ellipse');
    editor.dispatchPointer('down', { x: 10, y: 10 });
    editor.dispatchPointer('up', { x: 90, y: 70 });
    const id = activeId(editor);
    const before = editor.readPixels();
    expect(editor.layers.rasterize(id)).toBe(true);
    expect(editor.document?.activeLayer.kind).toBe('raster');
    expect(diffPixels(editor.readPixels(), before)).toBe(0);
    editor.undo();
    expect(editor.document?.activeLayer.kind).toBe('vector');
  });

  it('thumbnail layer đúng tỉ lệ document; layer ẩn vẫn có thumbnail', async () => {
    const editor = threeLayerEditor(400, 200);
    const id = activeId(editor);
    editor.layers.setProps(id, { visible: false });
    const bitmap = await editor.layers.thumbnail(id, 80);
    expect(bitmap).not.toBeNull();
    expect([bitmap?.width, bitmap?.height]).toEqual([80, 40]);
    bitmap?.close();
    expect(editor.memory.usedBy('temp')).toBeLessThan(400 * 200 * 4 * 2);
  });

  it('tẩy trên layer khóa trong suốt tô màu phụ, không đổi alpha', () => {
    const editor = track(createTestEditor(100, 60));
    editor.tools.setActive('brush');
    editor.options.set('brush', { preset: 'round', size: 20, opacity: 1 });
    editor.colors.setPrimary('#000000FF');
    drawStroke(editor, [
      { x: 10, y: 30 },
      { x: 90, y: 30 },
    ]);
    editor.layers.setProps(activeId(editor), { alphaLocked: true });
    editor.colors.setSecondary('#FF0000FF');
    editor.tools.setActive('eraser');
    editor.options.set('eraser', { size: 40, hardness: 1, opacity: 1 });
    drawStroke(editor, [
      { x: 50, y: 5 },
      { x: 50, y: 55 },
    ]);
    const pixels = editor.readPixels();
    expect(pixelAt(pixels, 50, 30)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(pixels, 50, 5)[3]).toBe(0);
    expect(pixelAt(pixels, 10, 30)).toEqual([0, 0, 0, 255]);
  });
});

describe('Panel History: nhảy về bước bất kỳ', () => {
  it('goTo khôi phục đúng ảnh của từng bước, cả lùi lẫn tiến', () => {
    const editor = track(createTestEditor(200, 150));
    const random = seededRandom(42);
    const states = [hashPixels(editor.readPixels())];
    for (let i = 0; i < 12; i++) {
      const steps = editor.historySummary().steps;
      randomStroke(editor, random, 200, 150);
      if (editor.historySummary().steps > steps) states.push(hashPixels(editor.readPixels()));
    }
    const total = states.length - 1;
    expect(editor.historySummary().entries).toHaveLength(total);
    for (const position of [3, 0, total, 1, Math.floor(total / 2)]) {
      expect(editor.historyGoTo(position)).toBe(true);
      expect(editor.historySummary().position).toBe(position);
      expect(hashPixels(editor.readPixels())).toBe(states[position]);
    }
    expect(editor.historyGoTo(Math.floor(total / 2))).toBe(false);
  });
});

/** Worker nén chạy ngay trên main thread (cùng hàm thuần với Worker thật). */
const compressingWorkers: WorkerClient = inlineWorkerClient;

describe('Nén history cũ (mục 5.6) — đúng từng pixel', () => {
  it('bước cũ hơn 10 bước được nén; undo/redo qua bước đã nén vẫn đúng từng pixel', async () => {
    const editor = track(createTestEditor(300, 200, { workers: compressingWorkers }));
    const random = seededRandom(99);
    const states = [hashPixels(editor.readPixels())];
    while (states.length < 19) {
      const steps = editor.historySummary().steps;
      randomStroke(editor, random, 300, 200);
      if (editor.historySummary().steps > steps) states.push(hashPixels(editor.readPixels()));
    }
    const raw = editor.memory.usedBy('history');
    // Bước cũ được nén lúc rảnh: bộ nhớ history giảm.
    await vi.waitFor(
      () => {
        expect(editor.memory.usedBy('history')).toBeLessThan(raw * 0.7);
      },
      { timeout: 10_000, interval: 100 },
    );
    for (let k = states.length - 1; k > 0; k--) {
      expect(editor.undo()).toBe(true);
      expect(hashPixels(editor.readPixels())).toBe(states[k - 1]);
    }
    for (let k = 1; k < states.length; k++) {
      expect(editor.redo()).toBe(true);
      expect(hashPixels(editor.readPixels())).toBe(states[k]);
    }
  }, 30_000);

  it('layer đã xóa được nén (trả bộ nhớ layer); undo khôi phục đúng từng pixel', async () => {
    const editor = track(createTestEditor(512, 512, { workers: compressingWorkers }));
    editor.layers.add('raster');
    paintEveryLayer(editor, 5);
    const before = editor.readPixels();
    const id = activeId(editor);
    const layerBytes = editor.memory.usedBy('layer');
    editor.layers.remove(id);
    await vi.waitFor(
      () => {
        expect(editor.memory.usedBy('layer')).toBeLessThan(layerBytes);
      },
      { timeout: 10_000, interval: 100 },
    );
    editor.undo();
    expect(diffPixels(editor.readPixels(), before)).toBe(0);
    expect(editor.memory.usedBy('layer')).toBe(layerBytes);
  }, 30_000);
});

describe('Nghiệm thu GĐ4: áp lực bộ nhớ (ngân sách giả lập nhỏ)', () => {
  it('cache bị thu hồi trước; thao tác tạo mới bị từ chối có thông báo; không mất layer nào', async () => {
    const W = 512;
    const H = 512;
    const layerBytes = W * H * 4; // 1 MB
    // Tổng 12 MB: layer tối đa 7,2 MB (7 layer đầy), history 3 MB.
    const editor = track(
      createTestEditor(W, H, {
        background: { kind: 'color', color: '#FFFFFFFF' },
        memory: { totalBytes: 12 * layerBytes },
      }),
    );
    const codes = notices(editor);
    const host = document.createElement('div');
    host.style.width = '256px';
    host.style.height = '256px';
    document.body.append(host);
    editor.mount(host);
    editor.viewport.setDpr(1);
    editor.viewport.setSize(256, 256);
    editor.viewport.set({ zoom: 0.5, panX: 0, panY: 0 });

    // 4 layer phủ kín, layer hoạt động ở giữa → Below + Above cache (2 MB).
    for (let i = 0; i < 3; i++) editor.layers.add('raster');
    const fill = (seed: number) => {
      editor.tools.setActive('brush');
      editor.options.set('brush', { preset: 'round', size: 900, opacity: 0.5 });
      editor.colors.setPrimary(`#${(seed * 0x3a2f1d).toString(16).slice(-6).padStart(6, '0')}FF`);
      drawStroke(editor, [
        { x: 256, y: 256 },
        { x: 257, y: 256 },
      ]);
    };
    for (const layer of editor.document?.layers ?? []) {
      editor.layers.setActive(layer.id);
      fill(layer.name.length + 3);
    }
    editor.layers.add('raster');
    fill(9);
    const middle = editor.document?.layers[2];
    if (!middle) throw new Error('no layer');
    editor.layers.setActive(middle.id);
    editor.flush();
    expect(editor.renderCacheStats).toMatchObject({ below: true, above: true });
    expect(editor.memory.usedBy('cache')).toBeGreaterThanOrEqual(2 * layerBytes);
    const pixels = hashPixels(editor.readPixels());
    const ids = editor.document?.layers.map((l) => l.id) ?? [];

    // Nhân bản tới khi bị từ chối: cache bị thu hồi trước, rồi mới từ chối.
    let refused = false;
    for (let i = 0; i < 10 && !refused; i++) {
      const count = editor.document?.layers.length ?? 0;
      const copy = editor.layers.duplicate(activeId(editor));
      if (copy === null) {
        refused = true;
        expect(editor.document?.layers).toHaveLength(count);
      }
    }
    expect(refused).toBe(true);
    // Cảnh báo sớm (90% phần của layer) phát sau lượt cấp phát — microtask.
    await Promise.resolve();
    expect(codes.some((c) => c === 'memory.layersFull' || c === 'memory.refused')).toBe(true);
    expect(codes).toContain('memory.layersHigh');
    expect(editor.memory.usedBy('cache')).toBe(0);
    expect(editor.memory.usedBytes).toBeLessThanOrEqual(editor.memory.totalBytes);

    // Không mất layer nào: các layer cũ còn nguyên, ẩn các bản sao thì ảnh như trước.
    const layers = editor.document?.layers ?? [];
    for (const id of ids) expect(layers.some((l) => l.id === id)).toBe(true);
    for (const layer of layers) {
      if (!ids.includes(layer.id)) editor.layers.setProps(layer.id, { visible: false });
    }
    expect(hashPixels(editor.readPixels())).toBe(pixels);

    // Flatten (tạo layer kích thước document) cũng bị từ chối an toàn nếu không đủ chỗ, hoặc
    // thành công — không bao giờ làm hỏng document.
    const countBefore = editor.document?.layers.length ?? 0;
    const flattened = editor.layers.flatten();
    expect(editor.document?.layers.length).toBe(flattened ? 1 : countBefore);
    // Renderer vẫn vẽ được (đường trực tiếp khi cache không cấp phát được).
    editor.flush();
    expect(editor.displayCanvas?.getContext('2d')?.getImageData(10, 10, 1, 1).data[3]).toBe(255);
  });
});
