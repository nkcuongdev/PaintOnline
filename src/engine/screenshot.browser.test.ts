import { afterEach, describe, expect, it, vi } from 'vitest';
import { inlineWorkerClient } from '@/services/workers/inline';
import { Editor, type PointerInit } from './core/Editor';
import type { AnnotationObject, Point, Rect } from './core/types';
import { redactPixelRect } from './layers/objects/annotate';
import { blurImage, redactHalo } from './layers/objects/redactEffect';
import { TIER_BUDGETS } from './memory/MemoryBudget';
import { drawStroke, pixelAt, TEST_PLATFORM } from './testing/helpers';

/**
 * Nghiệm thu GĐ7 (Screenshot Editor) trên canvas thật của 3 engine: "test pixel cho cả 3 chế độ
 * Redact" (tô kín, khảm, làm mờ — ảnh xuất không chứa pixel gốc trong vùng che), cache ảnh nền cập
 * nhật khi nền đổi (cả trên màn hình), Spotlight, Step badge đánh số lại, Magnifier, khung Làm đẹp.
 */

const editors: Editor[] = [];
function track(editor: Editor): Editor {
  editors.push(editor);
  return editor;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const e of editors.splice(0)) e.dispose();
  document.body.replaceChildren();
});

function drag(editor: Editor, a: Point, b: Point, init: Partial<PointerInit> = {}): void {
  editor.dispatchPointer('down', { ...a, ...init });
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    editor.dispatchPointer('move', { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ...init });
  }
  editor.dispatchPointer('up', { ...b, ...init });
}

function click(editor: Editor, p: Point): void {
  editor.dispatchPointer('down', p);
  editor.dispatchPointer('up', p);
}

/** Ảnh nhiễu (mô phỏng ảnh chụp màn hình có thông tin nhạy cảm), đục hoàn toàn. */
function noise(width: number, height: number, seed = 12345): ImageData {
  const data = new ImageData(width, height);
  let s = seed;
  for (let i = 0; i < data.data.length; i += 4) {
    s = (s * 1103515245 + 12345) >>> 0;
    data.data[i] = s & 0xff;
    data.data[i + 1] = (s >>> 8) & 0xff;
    data.data[i + 2] = (s >>> 16) & 0xff;
    data.data[i + 3] = 255;
  }
  return data;
}

function editorWith(
  width: number,
  height: number,
  image: ImageData = noise(width, height),
  background: 'transparent' | 'white' = 'transparent',
): Editor {
  const editor = track(
    new Editor({
      memory: TIER_BUDGETS.desktop,
      platform: TEST_PLATFORM,
      workers: inlineWorkerClient,
      layerName: (kind, n) => `${kind} ${String(n)}`,
    }),
  );
  editor.createDocument({
    width,
    height,
    background:
      background === 'white' ? { kind: 'color', color: '#FFFFFFFF' } : { kind: 'transparent' },
    layers: [{ kind: 'raster', name: 'Nền', image }],
  });
  return editor;
}

async function decode(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

const objectsOf = (editor: Editor): AnnotationObject[] =>
  editor.document?.layers.flatMap((l) => (l.kind === 'vector' ? l.objects : [])) ?? [];

function crop(image: ImageData, r: Rect): ImageData {
  const out = new ImageData(r.width, r.height);
  for (let y = 0; y < r.height; y++) {
    const from = ((r.y + y) * image.width + r.x) * 4;
    out.data.set(image.data.subarray(from, from + r.width * 4), y * r.width * 4);
  }
  return out;
}

/**
 * Khảm kỳ vọng tính độc lập: ô chia đều (số ô = ⌊cạnh / cỡ ô⌋, ranh giới làm tròn), mỗi ô là
 * trung bình (ảnh đục) — ghi qua Uint8ClampedArray như canvas.
 */
function expectedPixelate(src: ImageData, size: number): Uint8ClampedArray {
  const { width: w, height: h } = src;
  const edges = (len: number) => {
    const n = Math.max(1, Math.floor(len / size));
    return Array.from({ length: n + 1 }, (_, i) => Math.round((i * len) / n));
  };
  const xs = edges(w);
  const ys = edges(h);
  const out = new Uint8ClampedArray(src.data.length);
  for (let by = 0; by + 1 < ys.length; by++) {
    for (let bx = 0; bx + 1 < xs.length; bx++) {
      const sum = [0, 0, 0];
      const [x0, x1] = [xs[bx] ?? 0, xs[bx + 1] ?? 0];
      const [y0, y1] = [ys[by] ?? 0, ys[by + 1] ?? 0];
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          for (let c = 0; c < 3; c++) sum[c] = (sum[c] ?? 0) + (src.data[(y * w + x) * 4 + c] ?? 0);
        }
      }
      const count = (x1 - x0) * (y1 - y0);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          out[i] = (sum[0] ?? 0) / count;
          out[i + 1] = (sum[1] ?? 0) / count;
          out[i + 2] = (sum[2] ?? 0) / count;
          out[i + 3] = 255;
        }
      }
    }
  }
  return out;
}

const W = 240;
const H = 160;
/** Tọa độ lẻ: vùng che làm tròn ra ngoài thành x 40..150, y 30..101 (111 × 72). */
const A = { x: 40.3, y: 30.7 };
const B = { x: 150.6, y: 101.2 };
const PIXEL_RECT = { x: 40, y: 30, width: 111, height: 72 };

function redactWith(
  editor: Editor,
  mode: 'solid' | 'pixelate' | 'blur',
  strength: { blockSize?: number; blurRadius?: number } = {},
): void {
  editor.options.set('redact', { mode, ...strength });
  editor.tools.setActive('redact');
  drag(editor, A, B);
}

function expectOutsideUnchanged(exported: ImageData, original: ImageData): void {
  for (const [x, y] of [
    [39, 50],
    [151, 50],
    [90, 29],
    [90, 102],
    [0, 0],
    [W - 1, H - 1],
  ] as const) {
    expect(pixelAt(exported, x, y), `ngoài vùng che (${String(x)}, ${String(y)})`).toEqual(
      pixelAt(original, x, y),
    );
  }
}

describe('Nghiệm thu GĐ7: test pixel cho cả 3 chế độ Redact', () => {
  it('Tô kín: mọi pixel trong vùng che là màu che', async () => {
    const editor = editorWith(W, H);
    const original = editor.readPixels();
    redactWith(editor, 'solid');
    const exported = await decode(await editor.exportImage({ type: 'image/png' }));
    for (let y = 30; y < 102; y++) {
      for (let x = 40; x < 151; x++) expect(pixelAt(exported, x, y)).toEqual([0, 0, 0, 255]);
    }
    expectOutsideUnchanged(exported, original);
  });

  it('Khảm 16 px: đúng từng pixel trung bình từng ô; không còn pixel gốc', async () => {
    const editor = editorWith(W, H);
    const original = editor.readPixels();
    redactWith(editor, 'pixelate', { blockSize: 16 });
    const object = objectsOf(editor)[0];
    expect(object?.type === 'redact' && [object.mode, object.strength]).toEqual(['pixelate', 16]);
    expect(object?.type === 'redact' && redactPixelRect(object)).toEqual(PIXEL_RECT);

    const exported = await decode(await editor.exportImage({ type: 'image/png' }));
    const expected = expectedPixelate(crop(original, PIXEL_RECT), 16);
    const actual = crop(exported, PIXEL_RECT);
    let same = 0;
    for (let i = 0; i < actual.data.length; i += 4) {
      expect(Array.from(actual.data.subarray(i, i + 4))).toEqual(
        Array.from(expected.subarray(i, i + 4)),
      );
    }
    const origRegion = crop(original, PIXEL_RECT);
    for (let i = 0; i < actual.data.length; i += 4) {
      if (
        actual.data[i] === origRegion.data[i] &&
        actual.data[i + 1] === origRegion.data[i + 1] &&
        actual.data[i + 2] === origRegion.data[i + 2]
      ) {
        same++;
      }
    }
    // Nhiễu ngẫu nhiên: gần như không pixel nào trùng giá trị trung bình của ô.
    expect(same / (PIXEL_RECT.width * PIXEL_RECT.height)).toBeLessThan(0.01);
    expectOutsideUnchanged(exported, original);
    // Ảnh trên màn hình, export và đọc pixel cùng một đường ghép.
    expect(Array.from(crop(editor.readPixels(), PIXEL_RECT).data)).toEqual(Array.from(actual.data));
  });

  it('Làm mờ: bằng đúng blur của nền (gồm phần đệm ngoài vùng che); chi tiết bị xóa', async () => {
    const editor = editorWith(W, H);
    const original = editor.readPixels();
    redactWith(editor, 'blur', { blurRadius: 8 });
    const object = objectsOf(editor)[0];
    if (object?.type !== 'redact') throw new Error('thiếu Redact');
    const halo = redactHalo(object);
    const read = {
      x: Math.max(0, PIXEL_RECT.x - halo),
      y: Math.max(0, PIXEL_RECT.y - halo),
      width: 0,
      height: 0,
    };
    read.width = Math.min(W, PIXEL_RECT.x + PIXEL_RECT.width + halo) - read.x;
    read.height = Math.min(H, PIXEL_RECT.y + PIXEL_RECT.height + halo) - read.y;
    const blurred = crop(original, read);
    blurImage(blurred, 8);
    const expected = crop(blurred, {
      x: PIXEL_RECT.x - read.x,
      y: PIXEL_RECT.y - read.y,
      width: PIXEL_RECT.width,
      height: PIXEL_RECT.height,
    });

    const exported = await decode(await editor.exportImage({ type: 'image/png' }));
    const actual = crop(exported, PIXEL_RECT);
    expect(Array.from(actual.data)).toEqual(Array.from(expected.data));
    // Nhiễu 0..255 bị làm mờ thành gần màu trung bình: khác ảnh gốc rất xa.
    const origRegion = crop(original, PIXEL_RECT);
    let diff = 0;
    for (let i = 0; i < actual.data.length; i++) {
      if (i % 4 !== 3) diff += Math.abs((actual.data[i] ?? 0) - (origRegion.data[i] ?? 0));
    }
    expect(diff / (PIXEL_RECT.width * PIXEL_RECT.height * 3)).toBeGreaterThan(40);
    expectOutsideUnchanged(exported, original);
  });

  it('Khảm che cả đối tượng đứng trước trong cùng layer (mũi tên đi qua vẫn bị khảm)', async () => {
    const editor = editorWith(W, H);
    editor.tools.setActive('arrow');
    drag(editor, { x: 20, y: 60 }, { x: 200, y: 70 });
    redactWith(editor, 'pixelate', { blockSize: 24 });
    const exported = await decode(await editor.exportImage({ type: 'image/png' }));
    // Mỗi ô (≥ 24 px) đồng màu — mũi tên trong vùng che không còn nét.
    const region = crop(exported, PIXEL_RECT);
    const first = pixelAt(region, 0, 0);
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 24; x++) expect(pixelAt(region, x, y)).toEqual(first);
    }
  });
});

describe('Ảnh nền của Redact theo nền bên dưới (mục 5.4: cache tới khi nền đổi)', () => {
  it('vẽ lên layer ảnh dưới vùng khảm: ô đổi; undo trả lại đúng', () => {
    const editor = editorWith(W, H);
    redactWith(editor, 'pixelate', { blockSize: 16 });
    const before = editor.readPixels();
    const base = editor.document?.layers[0];
    if (!base) throw new Error('thiếu layer');
    editor.layers.setActive(base.id);
    editor.colors.setPrimary('#FFFFFFFF');
    editor.options.set('brush', { size: 6, opacity: 1, hardness: 1 });
    editor.tools.setActive('brush');
    drawStroke(editor, [
      { x: 43, y: 33 },
      { x: 46, y: 36 },
    ]);
    const after = editor.readPixels();
    // Ô đầu tiên (x 40..58, y 30..47) đổi ở cả góc xa nét vẽ.
    expect(pixelAt(after, 57, 47)).not.toEqual(pixelAt(before, 57, 47));
    expect(editor.undo()).toBe(true);
    expect(pixelAt(editor.readPixels(), 57, 47)).toEqual(pixelAt(before, 57, 47));
  });

  it('màn hình vẽ lại cả ô khảm khi nền đổi ở một góc của ô', () => {
    const editor = editorWith(W, H);
    const host = document.createElement('div');
    host.style.width = `${String(W)}px`;
    host.style.height = `${String(H)}px`;
    document.body.append(host);
    editor.mount(host);
    editor.viewport.setDpr(1);
    editor.viewport.setSize(W, H);
    editor.viewport.set({ zoom: 1, panX: 0, panY: 0 });
    redactWith(editor, 'pixelate', { blockSize: 16 });
    const screen = (x: number, y: number) => {
      editor.flush();
      const ctx = editor.displayCanvas?.getContext('2d');
      if (!ctx) throw new Error('chưa mount');
      return Array.from(ctx.getImageData(x, y, 1, 1).data);
    };
    const before = screen(57, 47);
    expect(before).toEqual(pixelAt(editor.readPixels(), 57, 47));
    const base = editor.document?.layers[0];
    if (!base) throw new Error('thiếu layer');
    editor.layers.setActive(base.id);
    editor.colors.setPrimary('#FFFFFFFF');
    // Tô một ô 4 × 4 ở góc ô khảm: lệnh chỉ báo vùng 4 × 4 (không có nét xem trước nào làm bẩn
    // vùng rộng hơn) — màn hình phải tự vẽ lại cả ô khảm phụ thuộc vùng đó.
    editor.selection.select({ kind: 'rect', rect: { x: 41, y: 31, width: 4, height: 4 } });
    screen(0, 0);
    expect(editor.selection.fill()).toBe(true);
    const after = screen(57, 47);
    expect(after).not.toEqual(before);
    expect(after).toEqual(pixelAt(editor.readPixels(), 57, 47));
  });

  it('kéo vùng làm mờ lớn: màn hình vẫn che (bản nháp); thả tay khớp đúng ảnh xuất', () => {
    const editor = editorWith(400, 300);
    const host = document.createElement('div');
    host.style.width = '400px';
    host.style.height = '300px';
    document.body.append(host);
    editor.mount(host);
    editor.viewport.setDpr(1);
    editor.viewport.setSize(400, 300);
    editor.viewport.set({ zoom: 1, panX: 0, panY: 0 });
    const original = editor.readPixels();
    editor.options.set('redact', { mode: 'blur', blurRadius: 12 });
    editor.tools.setActive('redact');
    drag(editor, { x: 40, y: 30 }, { x: 340, y: 250 });
    editor.tools.setActive('select');
    const screen = (x: number, y: number) => {
      editor.flush();
      const ctx = editor.displayCanvas?.getContext('2d');
      if (!ctx) throw new Error('chưa mount');
      return Array.from(ctx.getImageData(x, y, 1, 1).data);
    };
    editor.dispatchPointer('down', { x: 190, y: 140 });
    editor.dispatchPointer('move', { x: 200, y: 150 });
    // Đang kéo: vùng che đã dời 10 px, vẫn đục và khác pixel gốc.
    for (const [x, y] of [
      [60, 50],
      [200, 150],
      [340, 250],
    ] as const) {
      const p = screen(x, y);
      expect(p[3]).toBe(255);
      expect(p.slice(0, 3)).not.toEqual(pixelAt(original, x, y).slice(0, 3));
    }
    editor.dispatchPointer('up', { x: 200, y: 150 });
    const exact = editor.readPixels();
    for (const [x, y] of [
      [60, 50],
      [200, 150],
      [345, 255],
    ] as const) {
      expect(screen(x, y)).toEqual(pixelAt(exact, x, y));
    }
  });

  it('chặn Rasterize riêng layer có vùng che; Merge Visible giữ nguyên ảnh đã khảm', () => {
    const editor = editorWith(W, H);
    redactWith(editor, 'pixelate', { blockSize: 20 });
    const before = editor.readPixels();
    const vector = editor.document?.layers[1];
    if (vector?.kind !== 'vector') throw new Error('thiếu layer chú thích');
    expect(editor.layers.rasterize(vector.id)).toBe(false);
    expect(Array.from(editor.readPixels().data)).toEqual(Array.from(before.data));
    expect(editor.layers.mergeVisible()).toBe(true);
    expect(Array.from(editor.readPixels().data)).toEqual(Array.from(before.data));
  });
});

describe('Spotlight, Step badge, Magnifier', () => {
  it('Spotlight làm tối phần ngoài vùng sáng; hai Spotlight gộp (vùng sáng không bị tối chồng)', async () => {
    const editor = editorWith(W, H);
    const original = editor.readPixels();
    editor.options.set('spotlight', { shape: 'rect', dim: 0.6 });
    editor.tools.setActive('spotlight');
    drag(editor, { x: 20, y: 20 }, { x: 80, y: 80 });
    drag(editor, { x: 150, y: 40 }, { x: 220, y: 120 });
    const exported = await decode(await editor.exportImage({ type: 'image/png' }));
    expect(pixelAt(exported, 50, 50)).toEqual(pixelAt(original, 50, 50));
    expect(pixelAt(exported, 180, 80)).toEqual(pixelAt(original, 180, 80));
    const [r, g, b] = pixelAt(original, 120, 140);
    const dimmed = pixelAt(exported, 120, 140);
    expect(Math.abs((dimmed[0] ?? 0) - r * 0.4)).toBeLessThanOrEqual(1.5);
    expect(Math.abs((dimmed[1] ?? 0) - g * 0.4)).toBeLessThanOrEqual(1.5);
    expect(Math.abs((dimmed[2] ?? 0) - b * 0.4)).toBeLessThanOrEqual(1.5);
  });

  it('Step: số tăng theo thứ tự, xóa số giữa thì đánh lại', () => {
    const editor = editorWith(W, H);
    editor.tools.setActive('step');
    click(editor, { x: 30, y: 30 });
    click(editor, { x: 80, y: 30 });
    click(editor, { x: 130, y: 30 });
    const labels = (): string[] => {
      const texts: string[] = [];
      const record = (proto: { fillText: (text: string, x: number, y: number) => void }) =>
        vi.spyOn(proto, 'fillText').mockImplementation((text: string) => {
          texts.push(text);
        });
      const spies = [record(CanvasRenderingContext2D.prototype)];
      if (typeof OffscreenCanvasRenderingContext2D !== 'undefined') {
        spies.push(record(OffscreenCanvasRenderingContext2D.prototype));
      }
      editor.readPixels();
      for (const spy of spies) spy.mockRestore();
      return texts;
    };
    expect(labels()).toEqual(['1', '2', '3']);
    const middle = objectsOf(editor)[1];
    if (!middle) throw new Error('thiếu Step');
    editor.objects.select([middle.id]);
    expect(editor.objects.deleteSelected()).toBe(true);
    expect(labels()).toEqual(['1', '2']);
    expect(editor.undo()).toBe(true);
    expect(labels()).toEqual(['1', '2', '3']);
  });

  it('Magnifier: bản phóng to hiện nội dung vùng nguồn', async () => {
    const image = new ImageData(300, 200);
    for (let i = 0; i < image.data.length; i += 4) image.data.set([255, 255, 255, 255], i);
    for (let y = 20; y < 40; y++) {
      for (let x = 20; x < 40; x++) image.data.set([220, 20, 30, 255], (y * 300 + x) * 4);
    }
    const editor = editorWith(300, 200, image);
    editor.options.set('magnifier', { zoom: 2, shape: 'rect' });
    editor.tools.setActive('magnifier');
    drag(editor, { x: 15, y: 15 }, { x: 45, y: 45 });
    const object = objectsOf(editor)[0];
    if (object?.type !== 'magnifier') throw new Error('thiếu Magnifier');
    const exported = await decode(await editor.exportImage({ type: 'image/png' }));
    const center = pixelAt(exported, Math.round(object.target.x), Math.round(object.target.y));
    expect(center[0]).toBeGreaterThan(200);
    expect(center[1]).toBeLessThan(60);
    // Góc bản phóng to (ứng với nền trắng ở góc vùng nguồn) vẫn trắng.
    const corner = pixelAt(
      exported,
      Math.round(object.target.x - 26),
      Math.round(object.target.y - 26),
    );
    expect(corner).toEqual([255, 255, 255, 255]);
  });
});

describe('Làm đẹp ảnh (padding, nền, bo góc, bóng)', () => {
  it('ảnh xuất gồm khung; bo góc để lộ nền; tắt/undo về ảnh gốc', async () => {
    const editor = editorWith(100, 60);
    const original = editor.readPixels();
    expect(
      editor.beautify.set({ padding: 20, background: 'white', radius: 10, shadow: false }),
    ).toBe(true);
    const framed = await decode(await editor.exportImage({ type: 'image/png', beautify: true }));
    expect([framed.width, framed.height]).toEqual([140, 100]);
    expect(pixelAt(framed, 0, 0)).toEqual([255, 255, 255, 255]);
    // Góc ảnh nằm ngoài cung bo góc: là nền, không phải pixel ảnh.
    expect(pixelAt(framed, 20, 20)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(framed, 70, 50)).toEqual(pixelAt(original, 50, 30));
    // Không yêu cầu khung (Export bỏ chọn): ảnh gốc.
    const plain = await decode(await editor.exportImage({ type: 'image/png' }));
    expect([plain.width, plain.height]).toEqual([100, 60]);
    expect(editor.undo()).toBe(true);
    expect(editor.beautify.settings).toBeNull();
    const undone = await decode(await editor.exportImage({ type: 'image/png', beautify: true }));
    expect([undone.width, undone.height]).toEqual([100, 60]);
  });

  it('bóng đổ làm tối nền ngay dưới ảnh; nền trong suốt giữ alpha 0 ở góc', async () => {
    const editor = editorWith(100, 60);
    editor.beautify.set({ padding: 30, background: 'white', radius: 0, shadow: true });
    const framed = await decode(await editor.exportImage({ type: 'image/png', beautify: true }));
    const below = pixelAt(framed, 80, 30 + 60 + 8);
    expect(below[0]).toBeLessThan(250);
    editor.beautify.set({ background: 'transparent', shadow: false });
    const clear = await decode(await editor.exportImage({ type: 'image/png', beautify: true }));
    expect(pixelAt(clear, 2, 2)[3]).toBe(0);
  });

  it('màn hình vẽ khung quanh ảnh; Fit tính cả khung', () => {
    const editor = editorWith(100, 60);
    const host = document.createElement('div');
    host.style.width = '300px';
    host.style.height = '200px';
    document.body.append(host);
    editor.mount(host);
    editor.viewport.setDpr(1);
    editor.viewport.setSize(300, 200);
    editor.beautify.set({ padding: 40, background: 'night', radius: 0, shadow: false });
    editor.viewport.fit();
    // Khung 180 × 140 vừa khung nhìn 300 × 200 (chừa lề 24 px) → zoom (200 − 48) / 140.
    expect(editor.viewport.zoom).toBeCloseTo((200 - 48) / 140, 5);
    editor.viewport.set({ zoom: 1, panX: 60, panY: 50 });
    editor.flush();
    const ctx = editor.displayCanvas?.getContext('2d');
    if (!ctx) throw new Error('chưa mount');
    // (30, 20) trên màn hình = (−30, −30) của document: trong khung nền tối.
    const [r = 0, g = 0, b = 0, a = 0] = Array.from(ctx.getImageData(30, 20, 1, 1).data);
    expect(a).toBe(255);
    expect(Math.max(r, g, b)).toBeLessThan(90);
    // Ngoài khung: trong suốt (nền vùng làm việc của UI).
    expect(ctx.getImageData(5, 5, 1, 1).data[3]).toBe(0);
  });
});
