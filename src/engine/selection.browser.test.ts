import { afterEach, describe, expect, it, vi } from 'vitest';
import { inlineWorkerClient } from '@/services/workers/inline';
import type { Editor } from './core/Editor';
import type { RectObject } from './core/types';
import { createTestEditor, diffPixels, drawStroke, hashPixels, pixelAt } from './testing/helpers';

/**
 * Selection và biến đổi ảnh GĐ5 (mục 5.7, 2): vùng chọn cắt nét vẽ, pixel nổi (di chuyển, nhân
 * bản, co giãn, xoay), copy-paste giữ vị trí, cắt/xóa/tô, Magic Wand, crop/trim/resize/canvas
 * size/xoay/lật — trên canvas thật của 3 engine. Nghiệm thu: copy-paste giữ đúng vị trí; biến đổi
 * rồi undo khôi phục chính xác.
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

/** Ảnh mẫu: mỗi pixel một màu (đục) — so sánh vị trí từng pixel được. */
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

function patternEditor(width = 120, height = 90): Editor {
  const editor = track(createTestEditor(width, height, { workers: inlineWorkerClient }));
  editor.createDocument({
    width,
    height,
    background: { kind: 'transparent' },
    layers: [{ kind: 'raster', name: 'Nền', image: pattern(width, height) }],
  });
  return editor;
}

function crop(image: ImageData, x: number, y: number, width: number, height: number): ImageData {
  const out = new ImageData(width, height);
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * image.width + x) * 4;
    out.data.set(image.data.subarray(from, from + width * 4), row * width * 4);
  }
  return out;
}

function drag(
  editor: Editor,
  from: { x: number; y: number },
  to: { x: number; y: number },
  alt = false,
): void {
  editor.dispatchPointer('down', { ...from, altKey: alt });
  editor.dispatchPointer('move', { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, altKey: alt });
  editor.dispatchPointer('move', { ...to, altKey: alt });
  editor.dispatchPointer('up', { ...to, altKey: alt });
}

describe('Vùng chọn cắt thao tác vẽ (mục 5.5, 5.7)', () => {
  it('nét cọ, tẩy, tô loang chỉ tác động bên trong vùng chọn', async () => {
    const editor = track(createTestEditor(100, 80, { workers: inlineWorkerClient }));
    editor.selection.select({ kind: 'rect', rect: { x: 20, y: 20, width: 40, height: 30 } });
    editor.tools.setActive('brush');
    editor.options.set('brush', { preset: 'round', size: 10, opacity: 1 });
    editor.colors.setPrimary('#000000FF');
    drawStroke(editor, [
      { x: 0, y: 40 },
      { x: 100, y: 40 },
    ]);
    let image = editor.readPixels();
    expect(pixelAt(image, 40, 40)[3]).toBe(255);
    expect(pixelAt(image, 10, 40)[3]).toBe(0);
    expect(pixelAt(image, 70, 40)[3]).toBe(0);

    // Tô loang trên layer trống với vùng chọn ellipse: chỉ trong ellipse.
    editor.selection.select({ kind: 'ellipse', rect: { x: 0, y: 0, width: 40, height: 20 } });
    editor.tools.setActive('bucket');
    editor.colors.setPrimary('#FF0000FF');
    editor.dispatchPointer('down', { x: 20, y: 10 });
    editor.dispatchPointer('up', { x: 20, y: 10 });
    await vi.waitFor(() => {
      expect(pixelAt(editor.readPixels(), 20, 10)).toEqual([255, 0, 0, 255]);
    });
    image = editor.readPixels();
    expect(pixelAt(image, 1, 1)[3]).toBe(0);
    expect(pixelAt(image, 60, 10)[3]).toBe(0);
  });

  it('Lasso: đa giác tự do; Ctrl+A, bỏ chọn, đảo vùng chọn', async () => {
    const editor = patternEditor();
    editor.tools.setActive('lasso');
    editor.dispatchPointer('down', { x: 10, y: 10 });
    for (const p of [
      { x: 60, y: 10 },
      { x: 60, y: 60 },
      { x: 10, y: 60 },
    ]) {
      editor.dispatchPointer('move', p);
    }
    editor.dispatchPointer('up', { x: 10, y: 60 });
    expect(editor.selection.summary).toMatchObject({
      shape: 'polygon',
      bounds: { x: 10, y: 10, width: 50, height: 50 },
    });
    expect(editor.selection.contains({ x: 30, y: 30 })).toBe(true);
    expect(editor.selection.contains({ x: 80, y: 30 })).toBe(false);

    editor.selection.invert();
    await vi.waitFor(() => {
      expect(editor.selection.summary?.shape).toBe('mask');
    });
    expect(editor.selection.contains({ x: 30, y: 30 })).toBe(false);
    expect(editor.selection.contains({ x: 80, y: 30 })).toBe(true);
    editor.selection.selectAll();
    expect(editor.selection.summary?.bounds).toEqual({ x: 0, y: 0, width: 120, height: 90 });
    editor.selection.deselect();
    expect(editor.selection.summary).toBeNull();
  });

  it('kết hợp: Shift thêm, Alt bớt, Shift+Alt giao (marquee)', async () => {
    const editor = patternEditor();
    editor.tools.setActive('marquee-rect');
    drag(editor, { x: 0, y: 0 }, { x: 40, y: 40 });
    expect(editor.selection.summary?.shape).toBe('rect');
    editor.dispatchPointer('down', { x: 30, y: 30, shiftKey: true });
    editor.dispatchPointer('move', { x: 60, y: 60, shiftKey: true });
    editor.dispatchPointer('up', { x: 60, y: 60, shiftKey: true });
    await vi.waitFor(() => {
      expect(editor.selection.summary).toMatchObject({
        shape: 'mask',
        bounds: { x: 0, y: 0, width: 60, height: 60 },
      });
    });
    expect(editor.selection.contains({ x: 50, y: 50 })).toBe(true);
    expect(editor.selection.contains({ x: 50, y: 10 })).toBe(false);
    // Bớt một dải ở giữa (Alt, bắt đầu ngoài vùng chọn).
    editor.dispatchPointer('down', { x: 70, y: 20, altKey: true });
    editor.dispatchPointer('move', { x: 0, y: 25, altKey: true });
    editor.dispatchPointer('up', { x: 0, y: 25, altKey: true });
    await vi.waitFor(() => {
      expect(editor.selection.contains({ x: 10, y: 22 })).toBe(false);
    });
    expect(editor.selection.contains({ x: 10, y: 10 })).toBe(true);
  });
});

describe('Magic Wand (mục 2)', () => {
  it('chọn vùng cùng màu, thêm/bớt bằng phím bổ trợ, có viền marching ants', async () => {
    const editor = track(createTestEditor(80, 40, { workers: inlineWorkerClient }));
    const image = new ImageData(80, 40);
    for (let i = 0; i < 80 * 40; i++) {
      const x = i % 80;
      image.data.set(x < 30 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
    }
    editor.createDocument({
      width: 80,
      height: 40,
      background: { kind: 'transparent' },
      layers: [{ kind: 'raster', name: 'Nền', image }],
    });
    editor.tools.setActive('wand');
    editor.options.set('selection', { tolerance: 0.1, contiguous: true });
    editor.dispatchPointer('down', { x: 5, y: 5 });
    editor.dispatchPointer('up', { x: 5, y: 5 });
    await vi.waitFor(() => {
      expect(editor.selection.summary).toMatchObject({
        shape: 'mask',
        bounds: { x: 0, y: 0, width: 30, height: 40 },
      });
    });
    editor.dispatchPointer('down', { x: 60, y: 5, shiftKey: true });
    editor.dispatchPointer('up', { x: 60, y: 5, shiftKey: true });
    await vi.waitFor(() => {
      expect(editor.selection.summary?.bounds).toEqual({ x: 0, y: 0, width: 80, height: 40 });
    });
    editor.dispatchPointer('down', { x: 5, y: 5, altKey: true });
    editor.dispatchPointer('up', { x: 5, y: 5, altKey: true });
    await vi.waitFor(() => {
      expect(editor.selection.summary?.bounds).toEqual({ x: 30, y: 0, width: 50, height: 40 });
    });
    // Xóa vùng chọn mask: chỉ phần xanh biến mất.
    editor.selection.deleteContent();
    const after = editor.readPixels();
    expect(pixelAt(after, 10, 10)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(after, 50, 10)[3]).toBe(0);
  });
});

describe('Pixel nổi: di chuyển, nhân bản, biến đổi — undo khôi phục chính xác (nghiệm thu GĐ5)', () => {
  it('kéo vùng chọn di chuyển pixel; một bước history; undo/redo đúng từng pixel', () => {
    const editor = patternEditor();
    const original = editor.readPixels();
    const steps = editor.historySummary().steps;
    editor.selection.select({ kind: 'rect', rect: { x: 10, y: 10, width: 30, height: 20 } });
    editor.tools.setActive('marquee-rect');
    drag(editor, { x: 20, y: 15 }, { x: 70, y: 55 });
    expect(editor.selection.isFloating).toBe(true);
    // Chưa commit: document chưa đổi.
    expect(editor.historySummary().steps).toBe(steps);
    expect(editor.selection.commit()).toBe(true);
    expect(editor.historySummary().steps).toBe(steps + 1);
    expect(editor.historySummary().undoLabel).toBe('history.moveSelection');
    const moved = editor.readPixels();
    expect(diffPixels(crop(moved, 60, 50, 30, 20), crop(original, 10, 10, 30, 20))).toBe(0);
    expect(pixelAt(moved, 15, 15)[3]).toBe(0);
    expect(editor.selection.summary?.bounds).toEqual({ x: 60, y: 50, width: 30, height: 20 });
    editor.undo();
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(original));
    editor.redo();
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(moved));
  });

  it('Alt + kéo nhân bản; Esc/Ctrl+Z khi đang nổi thì bỏ, không tạo bước history', () => {
    const editor = patternEditor();
    const original = editor.readPixels();
    editor.selection.select({ kind: 'rect', rect: { x: 0, y: 0, width: 20, height: 20 } });
    editor.tools.setActive('marquee-rect');
    drag(editor, { x: 5, y: 5 }, { x: 55, y: 45 }, true);
    editor.selection.commit();
    const image = editor.readPixels();
    expect(diffPixels(crop(image, 0, 0, 20, 20), crop(original, 0, 0, 20, 20))).toBe(0);
    expect(diffPixels(crop(image, 50, 40, 20, 20), crop(original, 0, 0, 20, 20))).toBe(0);
    expect(editor.historySummary().undoLabel).toBe('history.duplicateSelection');

    const steps = editor.historySummary().steps;
    drag(editor, { x: 55, y: 45 }, { x: 90, y: 60 });
    expect(editor.selection.isFloating).toBe(true);
    expect(editor.undo()).toBe(true);
    expect(editor.selection.isFloating).toBe(false);
    expect(editor.historySummary().steps).toBe(steps);
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(image));
  });

  it('co giãn bằng handle và xoay 90° — commit rồi undo khôi phục chính xác', () => {
    const editor = patternEditor();
    const original = editor.readPixels();
    editor.selection.select({ kind: 'rect', rect: { x: 20, y: 10, width: 40, height: 30 } });
    editor.tools.setActive('marquee-rect');
    expect(editor.selection.transform()).toBe(true);
    // Viewport chưa gắn: zoom 1, pan 0 — handle "se" nằm ở góc dưới phải.
    drag(editor, { x: 60, y: 40 }, { x: 90, y: 70 });
    expect(editor.selection.summary?.bounds).toEqual({ x: 20, y: 10, width: 70, height: 60 });
    editor.selection.commit();
    expect(editor.historySummary().undoLabel).toBe('history.transformSelection');
    expect(hashPixels(editor.readPixels())).not.toBe(hashPixels(original));
    editor.undo();
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(original));

    // Xoay 90° theo chiều kim đồng hồ: chép nguyên pixel.
    editor.selection.select({ kind: 'rect', rect: { x: 0, y: 0, width: 40, height: 20 } });
    expect(editor.selection.rotate(1)).toBe(true);
    editor.selection.commit();
    const rotated = editor.readPixels();
    // Khung 40×20 xoay quanh tâm (20, 10) → khung 20×40 tại (10, −10); pixel (x, y) cũ → (29 − y, x − 10).
    for (const [x, y] of [
      [0, 0],
      [5, 19],
      [39, 9],
      [25, 12],
    ] as const) {
      const nx = 29 - y;
      const ny = x - 10;
      if (ny < 0) continue;
      expect(pixelAt(rotated, nx, ny)).toEqual(pixelAt(original, x, y));
    }
    editor.undo();
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(original));
  });
});

describe('Clipboard: copy, cắt, dán giữ đúng vị trí (nghiệm thu GĐ5)', () => {
  it('copy rồi dán: layer mới, đúng vị trí, đúng từng pixel; một bước history', async () => {
    const editor = patternEditor();
    const original = editor.readPixels();
    const source = editor.document?.layers[0];
    editor.selection.select({ kind: 'ellipse', rect: { x: 30, y: 20, width: 40, height: 30 } });
    const capture = editor.selection.copy();
    if (!capture || !source) throw new Error('không copy được');
    expect(capture.rect).toEqual({ x: 30, y: 20, width: 40, height: 30 });
    const bitmap = await capture.bitmap;
    const png = await capture.png;
    expect(png.type).toBe('image/png');
    expect(editor.selection.paste(bitmap, { x: capture.rect.x, y: capture.rect.y })).toBe(true);
    expect(editor.selection.commit()).toBe(true);
    bitmap.close();
    expect(editor.document?.layers).toHaveLength(2);
    expect(editor.historySummary().undoLabel).toBe('history.paste');
    // Ẩn layer gốc: phần thấy được đúng là phần ellipse của ảnh gốc, tại đúng chỗ.
    editor.layers.setProps(source.id, { visible: false });
    const pasted = editor.readPixels();
    expect(pixelAt(pasted, 50, 35)).toEqual(pixelAt(original, 50, 35));
    expect(pixelAt(pasted, 31, 21)[3]).toBe(0);
    expect(pixelAt(pasted, 10, 10)[3]).toBe(0);
    editor.undo();
    editor.undo();
    expect(editor.document?.layers).toHaveLength(1);
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(original));
  });

  it('dán ảnh ngoài: giữa khung nhìn, layer mới trên layer hoạt động', async () => {
    const editor = patternEditor(100, 100);
    const bitmap = await createImageBitmap(pattern(20, 10));
    expect(editor.selection.paste(bitmap)).toBe(true);
    bitmap.close();
    expect(editor.selection.summary).toMatchObject({
      floating: true,
      bounds: { x: 40, y: 45, width: 20, height: 10 },
    });
    editor.selection.commit();
    const layers = editor.document?.layers ?? [];
    expect(layers).toHaveLength(2);
    expect(editor.document?.activeLayerId).toBe(layers[1]?.id);
  });

  it('cắt: copy rồi xóa pixel (một bước); xóa và tô vùng chọn', () => {
    const editor = patternEditor();
    const original = editor.readPixels();
    editor.selection.select({ kind: 'rect', rect: { x: 0, y: 0, width: 10, height: 10 } });
    expect(editor.selection.cut()).not.toBeNull();
    expect(pixelAt(editor.readPixels(), 5, 5)[3]).toBe(0);
    expect(editor.historySummary().undoLabel).toBe('history.cut');
    editor.undo();
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(original));

    editor.colors.setPrimary('#00FF00FF');
    editor.selection.select({ kind: 'ellipse', rect: { x: 40, y: 40, width: 20, height: 20 } });
    expect(editor.selection.fill()).toBe(true);
    let image = editor.readPixels();
    expect(pixelAt(image, 50, 50)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(image, 41, 41)).toEqual(pixelAt(original, 41, 41));
    expect(editor.selection.deleteContent()).toBe(true);
    image = editor.readPixels();
    expect(pixelAt(image, 50, 50)[3]).toBe(0);
    expect(pixelAt(image, 41, 41)).toEqual(pixelAt(original, 41, 41));
  });

  it('vùng chọn làm mềm biên (feather): mask trong Worker, mép bán trong suốt', async () => {
    const editor = patternEditor();
    editor.options.set('selection', { feather: 6 });
    editor.selection.select({ kind: 'rect', rect: { x: 30, y: 30, width: 40, height: 30 } });
    await vi.waitFor(() => {
      expect(editor.selection.summary?.shape).toBe('mask');
    });
    editor.selection.deleteContent();
    const image = editor.readPixels();
    expect(pixelAt(image, 50, 45)[3]).toBe(0);
    const edge = pixelAt(image, 30, 45)[3];
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
    expect(pixelAt(image, 5, 5)[3]).toBe(255);
  });
});

describe('Biến đổi ảnh: crop, trim, resize, canvas size, xoay, lật (mục 2)', () => {
  it('crop: kích thước mới, nội dung dời, đối tượng chú thích dời theo; undo/redo chính xác', async () => {
    const editor = patternEditor();
    const original = editor.readPixels();
    editor.layers.add('vector');
    editor.tools.setActive('rect');
    drawStroke(editor, [
      { x: 30, y: 40 },
      { x: 60, y: 70 },
    ]);
    const vector = editor.document?.layers[1];
    const before = vector?.kind === 'vector' ? (vector.objects[0] as RectObject) : null;
    expect(before?.rect).toMatchObject({ x: 30, y: 40 });
    const withShape = editor.readPixels();
    expect(await editor.image.crop({ x: 10, y: 20, width: 50, height: 40 })).toBe(true);
    const doc = editor.document;
    expect(doc?.width).toBe(50);
    expect(doc?.height).toBe(40);
    const after = doc?.layers[1];
    const moved = after?.kind === 'vector' ? (after.objects[0] as RectObject) : null;
    expect(moved?.rect).toMatchObject({ x: 20, y: 20 });
    expect(diffPixels(editor.readPixels(), crop(withShape, 10, 20, 50, 40))).toBe(0);
    expect(editor.historySummary().undoLabel).toBe('history.crop');
    editor.undo();
    expect(editor.document?.width).toBe(120);
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(withShape));
    editor.redo();
    expect(editor.document?.width).toBe(50);
    editor.undo();
    editor.undo();
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(original));
  });

  it('crop theo vùng chọn và Trim vùng trong suốt', async () => {
    const editor = patternEditor();
    editor.selection.select({ kind: 'ellipse', rect: { x: 20, y: 10, width: 60, height: 40 } });
    expect(await editor.image.cropToSelection()).toBe(true);
    expect([editor.document?.width, editor.document?.height]).toEqual([60, 40]);
    expect(editor.selection.summary).toBeNull();

    const sparse = track(createTestEditor(100, 80, { workers: inlineWorkerClient }));
    sparse.tools.setActive('pencil');
    drawStroke(sparse, [
      { x: 30.5, y: 20.5 },
      { x: 69.5, y: 44.5 },
    ]);
    expect(await sparse.image.trim()).toBe(true);
    expect([sparse.document?.width, sparse.document?.height]).toEqual([40, 25]);
    expect(await sparse.image.trim()).toBe(false);
  });

  it('resize: mượt và giữ điểm ảnh (×2 = khối 2×2 đúng màu); undo chính xác', async () => {
    const editor = patternEditor(40, 30);
    const original = editor.readPixels();
    expect(await editor.image.resize(80, 60, 'pixelated')).toBe(true);
    const big = editor.readPixels();
    expect([big.width, big.height]).toEqual([80, 60]);
    for (const [x, y] of [
      [0, 0],
      [13, 7],
      [39, 29],
    ] as const) {
      const px = pixelAt(original, x, y);
      expect(pixelAt(big, x * 2, y * 2)).toEqual(px);
      expect(pixelAt(big, x * 2 + 1, y * 2 + 1)).toEqual(px);
    }
    editor.undo();
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(original));
    expect(await editor.image.resize(20, 15, 'smooth')).toBe(true);
    expect([editor.document?.width, editor.document?.height]).toEqual([20, 15]);
    expect(pixelAt(editor.readPixels(), 10, 7)[3]).toBe(255);
    editor.undo();
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(original));
  });

  it('canvas size: neo giữa — nội dung dời, vùng mới trong suốt', async () => {
    const editor = patternEditor(40, 30);
    const original = editor.readPixels();
    expect(await editor.image.canvasSize(60, 40, 'center')).toBe(true);
    const image = editor.readPixels();
    expect(diffPixels(crop(image, 10, 5, 40, 30), original)).toBe(0);
    expect(pixelAt(image, 2, 2)[3]).toBe(0);
    expect(await editor.image.canvasSize(30, 30, 'nw')).toBe(true);
    expect(diffPixels(editor.readPixels(), crop(image, 0, 0, 30, 30))).toBe(0);
  });

  it('xoay 90° đúng từng pixel; xoay 4 lần và lật 2 lần trở về ảnh gốc', async () => {
    const editor = patternEditor(30, 20);
    const original = editor.readPixels();
    expect(await editor.image.rotate(90)).toBe(true);
    const rotated = editor.readPixels();
    expect([rotated.width, rotated.height]).toEqual([20, 30]);
    for (let y = 0; y < 20; y += 3) {
      for (let x = 0; x < 30; x += 4) {
        expect(pixelAt(rotated, 19 - y, x)).toEqual(pixelAt(original, x, y));
      }
    }
    await editor.image.rotate(90);
    await editor.image.rotate(180);
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(original));
    await editor.image.flip('horizontal');
    expect(pixelAt(editor.readPixels(), 29, 0)).toEqual(pixelAt(original, 0, 0));
    await editor.image.flip('horizontal');
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(original));
    await editor.image.rotate(270);
    expect(pixelAt(editor.readPixels(), 0, 29)).toEqual(pixelAt(original, 0, 0));
  });

  it('xoay/lật chỉ layer hoạt động; layer khác giữ nguyên', async () => {
    const editor = patternEditor(40, 40);
    const base = editor.readPixels();
    editor.layers.add('raster');
    editor.tools.setActive('pencil');
    editor.colors.setPrimary('#FF0000FF');
    drawStroke(editor, [
      { x: 2.5, y: 2.5 },
      { x: 2.5, y: 2.5 },
    ]);
    expect(await editor.image.flip('horizontal', 'layer')).toBe(true);
    const image = editor.readPixels();
    expect(pixelAt(image, 37, 2)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(image, 2, 2)).toEqual(pixelAt(base, 2, 2));
    expect(editor.historySummary().undoLabel).toBe('history.flipLayer');
  });

  it('xuất chỉ vùng chọn: kích thước hình bao, ngoài ellipse trong suốt', async () => {
    const editor = patternEditor();
    editor.selection.select({ kind: 'ellipse', rect: { x: 10, y: 10, width: 40, height: 20 } });
    const blob = await editor.exportImage({ selectionOnly: true });
    const bitmap = await createImageBitmap(blob);
    expect([bitmap.width, bitmap.height]).toEqual([40, 20]);
    bitmap.close();
  });
});

describe('Biến đổi ảnh và bộ nhớ (mục 5.11, ADR 0025)', () => {
  /** Document `n` layer phủ kín (ảnh mẫu) với ngân sách tổng `totalBytes`. */
  function fullLayers(width: number, height: number, n: number, totalBytes: number): Editor {
    const editor = track(
      createTestEditor(width, height, { workers: inlineWorkerClient, memory: { totalBytes } }),
    );
    const ok = editor.createDocument({
      width,
      height,
      background: { kind: 'transparent' },
      layers: Array.from({ length: n }, (_, i) => ({
        kind: 'raster' as const,
        name: `L${String(i)}`,
        image: pattern(width, height),
        opacity: i === 0 ? 1 : 0.5,
      })),
    });
    expect(ok).toBe(true);
    return editor;
  }

  it('xoay cả ảnh khi layer đã chiếm > 1/2 phần dành cho layer: dựng trong phần tạm, vẫn đủ tổng', async () => {
    const layerBytes = 256 * 256 * 4;
    // Tổng 1,25 MB: phần layer 768 KB, 2 layer phủ kín 512 KB (67%). Xoay cần thêm 512 KB: vượt
    // phần layer nhưng vẫn trong tổng ngân sách.
    const editor = fullLayers(256, 256, 2, 1.25 * 1024 * 1024);
    const before = editor.readPixels();
    expect(editor.memory.usedBy('layer')).toBe(2 * layerBytes);
    expect(await editor.image.rotate(90)).toBe(true);
    expect(editor.memory.usedBy('temp')).toBeLessThan(layerBytes);
    editor.undo();
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(before));
  });

  it('vượt tổng ngân sách: từ chối có thông báo, ảnh và layer giữ nguyên', async () => {
    // Tổng 900 KB: phần layer 540 KB đủ cho 2 layer (512 KB); xoay cần thêm 512 KB — vượt tổng.
    const editor = fullLayers(256, 256, 2, 900 * 1024);
    const notices: string[] = [];
    editor.on('notice', ({ code }) => notices.push(code));
    const before = editor.readPixels();
    const temp = editor.memory.usedBy('temp');
    expect(await editor.image.rotate(90)).toBe(false);
    expect(notices.some((c) => c.startsWith('memory.'))).toBe(true);
    expect(editor.document?.layers).toHaveLength(2);
    expect(hashPixels(editor.readPixels())).toBe(hashPixels(before));
    expect(editor.memory.usedBy('temp')).toBe(temp);
  });

  it('layer lớn được nén theo dải sau khi cắt xén; undo đúng từng pixel', async () => {
    // 2048 px rộng → 512 hàng mỗi dải 4 MB: layer 1100 hàng nén thành 3 dải.
    const editor = fullLayers(2048, 1100, 1, 1.5 * 1024 ** 3);
    const before = editor.readPixels();
    const layerBytes = editor.memory.usedBy('layer');
    expect(await editor.image.crop({ x: 100, y: 100, width: 300, height: 200 })).toBe(true);
    // Layer cũ (snapshot cho undo) được nén lúc rảnh: bộ nhớ layer giảm về cỡ layer mới.
    await vi.waitFor(
      () => {
        expect(editor.memory.usedBy('layer')).toBeLessThan(layerBytes / 2);
      },
      { timeout: 15_000, interval: 100 },
    );
    editor.undo();
    expect(diffPixels(editor.readPixels(), before)).toBe(0);
  }, 30_000);
});
