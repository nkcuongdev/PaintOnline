import { afterEach, describe, expect, it } from 'vitest';
import { inlineWorkerClient } from '@/services/workers/inline';
import { Editor, type PointerInit } from './core/Editor';
import type { EditorEvents, Point, ToolId } from './core/types';
import { TIER_BUDGETS } from './memory/MemoryBudget';
import {
  createTestEditor,
  drawStroke,
  hashPixels,
  pixelAt,
  TEST_PLATFORM,
} from './testing/helpers';

/**
 * Nghiệm thu GĐ2 trên canvas thật (Chromium, Firefox, WebKit): đối tượng chú thích, tô loang,
 * lấy màu, preset cọ, chọn layer đích — và "mỗi tool có undo", "ảnh export không chứa pixel gốc
 * dưới vùng Redact" (mục 9).
 */

const editors: Editor[] = [];
function track(editor: Editor): Editor {
  editors.push(editor);
  return editor;
}

afterEach(() => {
  for (const e of editors.splice(0)) e.dispose();
});

/** Kéo con trỏ từ a tới b qua vài bước (tọa độ document). */
function drag(editor: Editor, a: Point, b: Point, init: Partial<PointerInit> = {}): void {
  editor.dispatchPointer('down', { ...a, ...init });
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    editor.dispatchPointer('move', { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ...init });
  }
  editor.dispatchPointer('up', { ...b, ...init });
}

function click(editor: Editor, p: Point, init: Partial<PointerInit> = {}): void {
  editor.dispatchPointer('down', { ...p, ...init });
  editor.dispatchPointer('up', { ...p, ...init });
}

/** Canvas DOM cho dữ liệu test (WebKit của Playwright trên Windows chưa có OffscreenCanvas). */
function testCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Ảnh nhiễu ngẫu nhiên (mô phỏng ảnh chụp màn hình có thông tin nhạy cảm). */
function noiseImage(width: number, height: number): HTMLCanvasElement {
  const canvas = testCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d');
  const data = new ImageData(width, height);
  let seed = 12345;
  for (let i = 0; i < data.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    data.data[i] = seed & 0xff;
    data.data[i + 1] = (seed >>> 8) & 0xff;
    data.data[i + 2] = (seed >>> 16) & 0xff;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function editorWithImage(width: number, height: number): Editor {
  const editor = track(
    new Editor({
      memory: TIER_BUDGETS.desktop,
      platform: TEST_PLATFORM,
      workers: inlineWorkerClient,
      layerName: (kind, n) => `${kind} ${String(n)}`,
    }),
  );
  const image = noiseImage(width, height);
  editor.createDocument({
    width,
    height,
    background: { kind: 'transparent' },
    layers: [{ kind: 'raster', name: 'Nền', image }],
  });
  return editor;
}

async function decode(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  const canvas = testCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function events<K extends keyof EditorEvents>(editor: Editor, name: K): EditorEvents[K][] {
  const list: EditorEvents[K][] = [];
  editor.on(name, (payload) => list.push(payload));
  return list;
}

const objectsOf = (editor: Editor) =>
  editor.document?.layers.flatMap((l) => (l.kind === 'vector' ? l.objects : [])) ?? [];

describe('Nghiệm thu GĐ2: Redact (tô kín) — ảnh export không chứa pixel gốc', () => {
  it('mọi pixel trong vùng che (kể cả mép tọa độ lẻ) là màu che; ngoài vùng giữ nguyên', async () => {
    const W = 240;
    const H = 160;
    const editor = editorWithImage(W, H);
    const original = editor.readPixels();
    editor.tools.setActive('redact');
    drag(editor, { x: 40.3, y: 30.7 }, { x: 150.6, y: 101.2 });
    expect(objectsOf(editor)).toHaveLength(1);

    const exported = await decode(await editor.exportImage({ type: 'image/png' }));
    let inside = 0;
    for (let y = 30; y < 102; y++) {
      for (let x = 40; x < 151; x++) {
        expect(pixelAt(exported, x, y), `pixel (${String(x)}, ${String(y)})`).toEqual([
          0, 0, 0, 255,
        ]);
        inside++;
      }
    }
    expect(inside).toBe(111 * 72);
    // Ngoài vùng che: ảnh gốc giữ nguyên.
    expect(pixelAt(exported, 39, 50)).toEqual(pixelAt(original, 39, 50));
    expect(pixelAt(exported, 151, 50)).toEqual(pixelAt(original, 151, 50));
  });

  it('vẫn che kín sau khi di chuyển và đổi kích thước bằng handle', async () => {
    const editor = editorWithImage(200, 120);
    editor.tools.setActive('redact');
    drag(editor, { x: 20, y: 20 }, { x: 80, y: 60 });
    editor.tools.setActive('select');
    drag(editor, { x: 50, y: 40 }, { x: 70.5, y: 45.5 }); // di chuyển 20.5, 5.5
    const moved = objectsOf(editor)[0];
    expect(moved?.type === 'redact' && moved.rect.x).toBeCloseTo(40.5);
    const exported = await decode(await editor.exportImage());
    for (let y = 25; y < 66; y++) {
      for (let x = 40; x < 101; x++) expect(pixelAt(exported, x, y)).toEqual([0, 0, 0, 255]);
    }
  });
});

describe('Nghiệm thu GĐ2: mỗi tool có undo', () => {
  const cases: { tool: ToolId; act: (editor: Editor) => void }[] = [
    { tool: 'rect', act: (e) => drag(e, { x: 20, y: 20 }, { x: 90, y: 70 }) },
    { tool: 'ellipse', act: (e) => drag(e, { x: 30, y: 30 }, { x: 120, y: 90 }) },
    { tool: 'line', act: (e) => drag(e, { x: 10, y: 100 }, { x: 150, y: 20 }) },
    { tool: 'arrow', act: (e) => drag(e, { x: 160, y: 120 }, { x: 40, y: 30 }) },
    {
      tool: 'polygon',
      act: (e) => {
        click(e, { x: 20, y: 20 });
        click(e, { x: 120, y: 30 });
        click(e, { x: 80, y: 110 });
        click(e, { x: 20, y: 20 }); // click đỉnh đầu: khép kín
      },
    },
    { tool: 'highlight', act: (e) => drag(e, { x: 10, y: 40 }, { x: 170, y: 70 }) },
    { tool: 'redact', act: (e) => drag(e, { x: 60, y: 60 }, { x: 110, y: 90 }) },
    {
      tool: 'text',
      act: (e) => {
        click(e, { x: 30, y: 60 });
        e.text.update('Chú thích');
        e.text.commit('Chú thích');
      },
    },
    {
      tool: 'pencil',
      act: (e) =>
        drawStroke(e, [
          { x: 5, y: 5 },
          { x: 150, y: 110 },
        ]),
    },
    {
      tool: 'brush',
      act: (e) =>
        drawStroke(e, [
          { x: 10, y: 120 },
          { x: 170, y: 10 },
        ]),
    },
    {
      tool: 'eraser',
      act: (e) =>
        drawStroke(e, [
          { x: 0, y: 60 },
          { x: 180, y: 60 },
        ]),
    },
  ];

  for (const { tool, act } of cases) {
    it(`${tool}: thao tác → undo khôi phục đúng từng pixel → redo tái tạo`, () => {
      const editor = editorWithImage(180, 130);
      const before = hashPixels(editor.readPixels());
      editor.tools.setActive(tool);
      act(editor);
      const after = hashPixels(editor.readPixels());
      expect(after, 'thao tác phải đổi ảnh').not.toBe(before);
      const steps = editor.historySummary().steps;
      expect(steps).toBe(1);
      expect(editor.undo()).toBe(true);
      expect(hashPixels(editor.readPixels())).toBe(before);
      expect(editor.redo()).toBe(true);
      expect(hashPixels(editor.readPixels())).toBe(after);
    });
  }

  it('bucket (Worker): tô vùng kín, undo/redo đúng từng pixel', async () => {
    const editor = track(createTestEditor(120, 90, { workers: inlineWorkerClient }));
    editor.tools.setActive('pencil');
    // Khung vuông khép kín bằng bút chì.
    drawStroke(editor, [
      { x: 20, y: 20 },
      { x: 80, y: 20 },
      { x: 80, y: 70 },
      { x: 20, y: 70 },
      { x: 20, y: 20 },
    ]);
    const before = hashPixels(editor.readPixels());
    editor.colors.setPrimary('#E03131FF');
    editor.tools.setActive('bucket');
    click(editor, { x: 50, y: 45 });
    expect(editor.busy).toBe(true);
    await expect.poll(() => editor.historySummary().steps).toBe(2);
    expect(editor.busy).toBe(false);
    const filled = editor.readPixels();
    expect(pixelAt(filled, 50, 45)).toEqual([224, 49, 49, 255]);
    expect(pixelAt(filled, 10, 10)).toEqual([0, 0, 0, 0]);
    expect(editor.undo()).toBe(true);
    expect(hashPixels(editor.readPixels())).toBe(before);
    expect(editor.redo()).toBe(true);
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(filled));
  });

  it('bucket: kết quả bị bỏ nếu document đổi trong lúc Worker chạy', async () => {
    let release: () => void = () => undefined;
    const slow = {
      ...inlineWorkerClient,
      floodFill: async (request: Parameters<typeof inlineWorkerClient.floodFill>[0]) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return inlineWorkerClient.floodFill(request);
      },
    };
    const editor = track(createTestEditor(60, 40, { workers: slow }));
    editor.tools.setActive('bucket');
    click(editor, { x: 10, y: 10 });
    editor.tools.setActive('pencil');
    drawStroke(editor, [
      { x: 1, y: 1 },
      { x: 5, y: 5 },
    ]);
    release();
    await expect.poll(() => editor.busy).toBe(false);
    expect(editor.historySummary().undoLabel).toBe('history.pencil');
  });
});

describe('Highlight (multiply) và chữ', () => {
  it('highlight trộn multiply với ảnh bên dưới', () => {
    const editor = track(
      createTestEditor(100, 60, { background: { kind: 'color', color: '#FFFFFFFF' } }),
    );
    editor.tools.setActive('pencil');
    editor.colors.setPrimary('#000000FF');
    drawStroke(editor, [
      { x: 0, y: 30 },
      { x: 99, y: 30 },
    ]);
    editor.tools.setActive('highlight');
    drag(editor, { x: 10, y: 20 }, { x: 90, y: 40 });
    const px = editor.readPixels();
    expect(pixelAt(px, 50, 25)).toEqual([255, 228, 92, 255]); // vàng trên nền trắng
    expect(pixelAt(px, 50, 30)).toEqual([0, 0, 0, 255]); // nét đen vẫn đen (đọc được chữ)
  });

  it('chữ tiếng Việt có dấu được vẽ, sửa lại được, chữ rỗng thì xóa', () => {
    const editor = track(
      createTestEditor(320, 120, { background: { kind: 'color', color: '#FFFFFFFF' } }),
    );
    const edits = events(editor, 'textEditChanged');
    editor.tools.setActive('text');
    click(editor, { x: 20, y: 60 });
    expect(edits.at(-1)?.objectId).toBeNull();
    const text = 'Đường đi khó — Ưu tiên';
    editor.text.update(text);
    editor.text.commit(text);
    const obj = objectsOf(editor)[0];
    expect(obj?.type === 'text' && obj.text).toBe(text);
    const px = editor.readPixels({ x: 15, y: 30, width: 280, height: 60 });
    let dark = 0;
    for (let i = 0; i < px.data.length; i += 4) if ((px.data[i] ?? 255) < 128) dark++;
    expect(dark).toBeGreaterThan(50);

    // Sửa lại chữ đã có (double-click bằng tool Select tương đương editSelectedText).
    editor.tools.setActive('select');
    editor.objects.select([obj?.id ?? '']);
    expect(editor.editSelectedText()).toBe(true);
    editor.text.commit('');
    expect(objectsOf(editor)).toHaveLength(0);
    expect(editor.undo()).toBe(true);
    expect(objectsOf(editor)).toHaveLength(1);
  });
});

describe('Chọn và sửa đối tượng (tool Select)', () => {
  it('kéo để di chuyển, kéo handle để đổi kích thước, phím mũi tên gộp thành một bước', () => {
    const editor = track(createTestEditor(300, 200));
    editor.tools.setActive('rect');
    drag(editor, { x: 50, y: 50 }, { x: 150, y: 100 });
    const id = editor.objects.selection[0] ?? '';
    expect(id).not.toBe('');

    editor.tools.setActive('select');
    // Bám vào cạnh trái (tránh handle ở giữa cạnh) rồi kéo.
    drag(editor, { x: 50, y: 62 }, { x: 70, y: 72 });
    let obj = editor.objects.get(id);
    expect(obj?.type === 'rect' && obj.rect).toEqual({ x: 70, y: 60, width: 100, height: 50 });

    // Handle góc dưới phải (đối tượng đang chọn): kéo ra xa.
    drag(editor, { x: 170, y: 110 }, { x: 200, y: 150 });
    obj = editor.objects.get(id);
    expect(obj?.type === 'rect' && obj.rect).toEqual({ x: 70, y: 60, width: 130, height: 90 });

    const steps = editor.historySummary().steps;
    for (let i = 0; i < 5; i++) editor.objects.nudge(1, 0);
    expect(editor.historySummary().steps).toBe(steps + 1);
    obj = editor.objects.get(id);
    expect(obj?.type === 'rect' && obj.rect.x).toBe(75);

    expect(editor.objects.deleteSelected()).toBe(true);
    expect(editor.objects.get(id)).toBeNull();
  });

  it('kéo khung để chọn nhiều; đổi kiểu qua Options bar áp cho mọi đối tượng chọn', () => {
    const editor = track(createTestEditor(300, 200));
    editor.tools.setActive('rect');
    drag(editor, { x: 10, y: 10 }, { x: 60, y: 60 });
    drag(editor, { x: 100, y: 10 }, { x: 160, y: 60 });
    editor.tools.setActive('select');
    drag(editor, { x: 0, y: 0 }, { x: 200, y: 100 });
    expect(editor.objects.selection).toHaveLength(2);
    editor.objects.applyStyle('shape', { strokeWidth: 12 });
    expect(objectsOf(editor).every((o) => o.type === 'rect' && o.stroke?.width === 12)).toBe(true);
    expect(editor.options.get('shape').strokeWidth).toBe(12);
  });
});

describe('Màu, cọ, layer đích', () => {
  it('eyedropper lấy mẫu ảnh đã ghép; Shift = màu phụ; chỉ ghi "gần đây" khi thả chuột', () => {
    const editor = track(
      createTestEditor(80, 60, { background: { kind: 'color', color: '#3B5BDBFF' } }),
    );
    editor.tools.setActive('eyedropper');
    editor.dispatchPointer('down', { x: 10, y: 10 });
    expect(editor.colors.primary).toBe('#3B5BDBFF');
    expect(editor.colors.recent).toEqual([]);
    editor.dispatchPointer('up', { x: 10, y: 10 });
    expect(editor.colors.recent[0]).toBe('#3B5BDBFF');
    click(editor, { x: 20, y: 20 }, { shiftKey: true });
    expect(editor.colors.secondary).toBe('#3B5BDBFF');
  });

  it('preset marker/thư pháp và áp lực bút cho nét khác nhau', () => {
    /** Vẽ một nét thẳng; trả ảnh kết quả. */
    const stroke = (
      preset: 'round' | 'marker' | 'calligraphy',
      from: Point,
      to: Point,
      pointerType: 'mouse' | 'pen' = 'mouse',
      pressure = 0.5,
    ) => {
      const editor = track(createTestEditor(200, 200));
      editor.tools.setActive('brush');
      editor.options.set('brush', { preset, size: 20 });
      editor.dispatchPointer('down', { ...from, pointerType, pressure });
      for (let i = 1; i <= 15; i++) {
        const t = i / 15;
        editor.dispatchPointer('move', {
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
          pointerType,
          pressure,
        });
      }
      editor.dispatchPointer('up', { ...to, pointerType, pressure });
      return editor.readPixels();
    };
    const coverage = (img: ImageData) => {
      let n = 0;
      for (let i = 3; i < img.data.length; i += 4) if ((img.data[i] ?? 0) > 0) n++;
      return n;
    };
    const a = { x: 30, y: 100 };
    const b = { x: 170, y: 100 };
    // Marker đầu vuông: phủ góc mà đầu tròn không chạm tới.
    expect(pixelAt(stroke('round', a, b), 22, 92)[3]).toBe(0);
    expect(pixelAt(stroke('marker', a, b), 22, 92)[3]).toBe(255);
    // Thư pháp: ngòi dẹt nghiêng 45° — nét dày/mảnh theo hướng kéo.
    const across = coverage(stroke('calligraphy', { x: 40, y: 40 }, { x: 160, y: 160 }));
    const along = coverage(stroke('calligraphy', { x: 40, y: 160 }, { x: 160, y: 40 }));
    expect(Math.max(across, along)).toBeGreaterThan(Math.min(across, along) * 2);
    // Áp lực bút đổi cỡ nét; chuột luôn bỏ qua áp lực.
    const light = coverage(stroke('round', a, b, 'pen', 0.1));
    const heavy = coverage(stroke('round', a, b, 'pen', 1));
    expect(light).toBeLessThan(heavy * 0.6);
    expect(hashPixels(stroke('round', a, b, 'mouse', 0.1))).toBe(hashPixels(stroke('round', a, b)));
  });

  it('làm mượt dây kéo: đầu cọ đi sau con trỏ nên nét ngắn hơn', () => {
    const length = (smoothing: number) => {
      const editor = track(createTestEditor(300, 60));
      editor.tools.setActive('brush');
      editor.options.set('brush', { size: 4, smoothing });
      drawStroke(editor, [
        { x: 10, y: 30 },
        { x: 290, y: 30 },
      ]);
      const px = editor.readPixels();
      let right = 0;
      for (let x = 0; x < 300; x++) if (pixelAt(px, x, 30)[3] > 0) right = x;
      return right;
    };
    expect(length(60)).toBeLessThan(length(0) - 40);
  });

  it('tool pixel trên layer chú thích: hỏi người dùng, rồi vẽ trên layer mới', () => {
    const editor = track(createTestEditor(100, 80));
    editor.tools.setActive('rect');
    drag(editor, { x: 10, y: 10 }, { x: 50, y: 50 });
    expect(editor.document?.activeLayer.kind).toBe('vector');
    const asks = events(editor, 'paintTargetRequired');
    editor.tools.setActive('brush');
    drawStroke(editor, [
      { x: 60, y: 60 },
      { x: 90, y: 70 },
    ]);
    expect(asks).toHaveLength(1);
    expect(asks[0]).toMatchObject({ kind: 'draw', choices: ['new-layer', 'rasterize'] });
    expect(editor.historySummary().steps).toBe(1);

    expect(editor.layers.choosePaintTarget('draw', 'new-layer', true)).toBe(true);
    expect(editor.document?.layers.map((l) => l.kind)).toEqual(['raster', 'vector', 'raster']);
    drawStroke(editor, [
      { x: 60, y: 60 },
      { x: 90, y: 70 },
    ]);
    expect(editor.historySummary().undoLabel).toBe('history.brush');
    // Đã nhớ lựa chọn: lần sau trên layer chú thích khác không hỏi nữa.
    expect(editor.layers.paintPolicy.draw).toBe('new-layer');
  });

  it('rasterize layer chú thích: ảnh không đổi, undo trả lại đối tượng sửa được', () => {
    const editor = track(
      createTestEditor(120, 80, { background: { kind: 'color', color: '#FFFFFFFF' } }),
    );
    editor.tools.setActive('ellipse');
    drag(editor, { x: 10, y: 10 }, { x: 100, y: 70 });
    const before = editor.readPixels();
    expect(editor.layers.choosePaintTarget('modify', 'rasterize', false)).toBe(true);
    expect(editor.document?.activeLayer.kind).toBe('raster');
    // Vẽ lên layer trong suốt rồi ghép khác vẽ thẳng lên nền chỉ ở sai số làm tròn 8 bit của mép.
    expect(maxChannelDiff(editor.readPixels(), before)).toBeLessThanOrEqual(2);
    editor.undo();
    expect(editor.document?.activeLayer.kind).toBe('vector');
    expect(objectsOf(editor)).toHaveLength(1);
    editor.redo();
    expect(maxChannelDiff(editor.readPixels(), before)).toBeLessThanOrEqual(2);
  });
});

function maxChannelDiff(a: ImageData, b: ImageData): number {
  let max = 0;
  for (let i = 0; i < a.data.length; i++) {
    max = Math.max(max, Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0)));
  }
  return max;
}
