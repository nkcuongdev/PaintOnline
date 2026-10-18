import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from './core/Editor';
import type { DocumentLayerSpec } from './core/Document';
import { BLEND_MODES, type BlendMode, type DocumentBackground } from './core/types';
import { compareImages, referenceComposite } from './testing/blend';
import { createTestEditor, drawStroke, seededRandom } from './testing/helpers';

/**
 * Nghiệm thu GĐ4 (mục 9): visual test 16 blend mode khớp ảnh chuẩn; Below/Above cache và mipmap
 * không đổi kết quả hiển thị (cache chỉ tăng tốc — mục 5.2).
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

/** Ảnh nền đục: R theo x, G theo y, B theo đường chéo — phủ đều dải 0..255. */
function backdropImage(size: number): ImageData {
  const image = new ImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      image.data[i] = Math.round((x / (size - 1)) * 255);
      image.data[i + 1] = Math.round((y / (size - 1)) * 255);
      image.data[i + 2] = Math.round((((x + y) % size) / (size - 1)) * 255);
      image.data[i + 3] = 255;
    }
  }
  return image;
}

/** Ảnh nguồn đục, hướng khác với nền để mọi tổ hợp (Cb, Cs) đều xuất hiện. */
function sourceImage(size: number): ImageData {
  const image = new ImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      image.data[i] = Math.round((y / (size - 1)) * 255);
      image.data[i + 1] = Math.round(((size - 1 - x) / (size - 1)) * 255);
      image.data[i + 2] = (x * 37 + y * 11) % 256;
      image.data[i + 3] = 255;
    }
  }
  return image;
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

function readDisplay(editor: Editor, x: number, y: number, w: number, h: number): ImageData {
  editor.flush();
  const ctx = editor.displayCanvas?.getContext('2d');
  if (!ctx) throw new Error('chưa mount');
  return ctx.getImageData(x, y, w, h);
}

const SIZE = 64;
/** Sai số cho phép so với công thức W3C: lượng tử 8 bit + premultiplied của canvas. */
const MAX_DIFF = 6;
const MEAN_DIFF = 1;

describe('vẽ cọ trong khung Làm đẹp', () => {
  it.each(['transparent', 'color'] as const)(
    '%s: vùng bẩn trong ảnh không dựng lại gradient và bóng; khớp lần vẽ toàn màn hình',
    (kind) => {
      const editor = track(
        createTestEditor(400, 240, {
          background: kind === 'color' ? { kind, color: '#FFFFFFFF' } : { kind },
        }),
      );
      editor.beautify.set({ padding: 64, background: 'sunset', radius: 12, shadow: true });
      mountEditor(editor, 520, 360);
      editor.viewport.set({ zoom: 1, panX: 64, panY: 64 });
      editor.flush();
      const ctx = editor.displayCanvas?.getContext('2d');
      if (!ctx) throw new Error('chưa mount');
      const gradient = vi.spyOn(ctx, 'createLinearGradient');
      try {
        editor.tools.setActive('brush');
        editor.options.set('brush', { size: 8, hardness: 1, flow: 1 });
        editor.dispatchPointer('down', { x: 80, y: 80 });
        editor.dispatchPointer('move', { x: 100, y: 84 });
        editor.dispatchPointer('move', { x: 120, y: 88 });
        editor.flush();
        gradient.mockClear();
        editor.dispatchPointer('move', { x: 180, y: 100 });
        const partial = readDisplay(editor, 0, 0, 520, 360);
        expect(gradient).not.toHaveBeenCalled();
        editor.setRenderCacheOptions({});
        const full = readDisplay(editor, 0, 0, 520, 360);
        expect(gradient).toHaveBeenCalled();
        expect(compareImages(partial, full).max).toBeLessThanOrEqual(1);
        editor.dispatchPointer('up', { x: 180, y: 100 });
        // Mép bo góc vẫn phải vẽ lại nền/bóng, kể cả khi nét chạm ra ngoài ảnh.
        gradient.mockClear();
        drawStroke(editor, [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ]);
        const corner = readDisplay(editor, 0, 0, 520, 360);
        expect(gradient).toHaveBeenCalled();
        editor.setRenderCacheOptions({});
        const cornerDiff = compareImages(corner, readDisplay(editor, 0, 0, 520, 360));
        // WebKit/Linux có thể lượng tử hóa mép clip bo góc lệch 2/255 giữa vùng bẩn và
        // lần vẽ toàn màn hình. Giới hạn cả sai số cực đại lẫn trung bình để bắt lệch ảnh.
        expect(cornerDiff.max).toBeLessThanOrEqual(2);
        expect(cornerDiff.mean).toBeLessThan(0.01);
      } finally {
        gradient.mockRestore();
      }
    },
  );
});

function blendDocument(mode: BlendMode, background: DocumentBackground): Editor {
  const editor = track(createTestEditor(1, 1));
  editor.createDocument({
    width: SIZE,
    height: SIZE,
    background,
    layers: [
      { kind: 'raster', name: 'Nền', image: backdropImage(SIZE) },
      { kind: 'raster', name: 'Trên', image: sourceImage(SIZE), blendMode: mode, opacity: 0.8 },
    ],
  });
  return editor;
}

describe('Nghiệm thu GĐ4: 16 blend mode khớp ảnh chuẩn (W3C Compositing Level 1)', () => {
  const expected = new Map<BlendMode, ImageData>();
  for (const mode of BLEND_MODES) {
    expected.set(mode, referenceComposite(backdropImage(SIZE), sourceImage(SIZE), mode, 0.8));
  }

  it.each(BLEND_MODES)('%s: ảnh ghép (export) và màn hình khớp ảnh chuẩn', (mode) => {
    const editor = blendDocument(mode, { kind: 'transparent' });
    const actual = editor.readPixels();
    const reference = expected.get(mode);
    expect(reference).toBeDefined();
    if (!reference) return;
    const diff = compareImages(actual, reference);
    expect(diff.max, `${mode}: sai khác lớn nhất ${String(diff.max)}`).toBeLessThanOrEqual(
      MAX_DIFF,
    );
    expect(diff.mean, `${mode}: sai khác trung bình`).toBeLessThanOrEqual(MEAN_DIFF);

    // Màn hình (ô caro + ghép riêng document) cho đúng ảnh như export.
    mountEditor(editor, SIZE, SIZE);
    const screen = compareImages(readDisplay(editor, 0, 0, SIZE, SIZE), actual);
    expect(screen.max).toBeLessThanOrEqual(1);
  });

  it('blend mode của layer chú thích ghép cả nhóm (isolated), khớp ảnh chuẩn', () => {
    const editor = track(createTestEditor(1, 1));
    editor.createDocument({
      width: SIZE,
      height: SIZE,
      background: { kind: 'transparent' },
      layers: [
        { kind: 'raster', name: 'Nền', image: backdropImage(SIZE) },
        {
          kind: 'vector',
          name: 'Chú thích',
          blendMode: 'difference',
          opacity: 0.8,
          objects: [
            {
              id: 'r',
              type: 'rect',
              rect: { x: 0, y: 0, width: SIZE, height: SIZE },
              fill: '#3366CCFF',
              cornerRadius: 0,
              rotation: 0,
              opacity: 1,
            },
          ],
        },
      ],
    });
    const solid = new ImageData(SIZE, SIZE);
    for (let i = 0; i < solid.data.length; i += 4) solid.data.set([0x33, 0x66, 0xcc, 255], i);
    const reference = referenceComposite(backdropImage(SIZE), solid, 'difference', 0.8);
    const diff = compareImages(editor.readPixels(), reference);
    expect(diff.max).toBeLessThanOrEqual(MAX_DIFF);
  });

  it('opacity của layer chú thích: chỗ hai hình chồng nhau không đậm hơn; Highlight vẫn trộn với ảnh dưới', () => {
    const editor = track(createTestEditor(1, 1));
    const base = new ImageData(60, 20);
    for (let i = 0; i < base.data.length; i += 4) base.data.set([200, 220, 240, 255], i);
    editor.createDocument({
      width: 60,
      height: 20,
      background: { kind: 'transparent' },
      layers: [
        { kind: 'raster', name: 'Nền', image: base },
        {
          kind: 'vector',
          name: 'Chú thích',
          opacity: 0.5,
          objects: [
            {
              id: 'a',
              type: 'rect',
              rect: { x: 0, y: 0, width: 40, height: 10 },
              fill: '#000000FF',
              cornerRadius: 0,
              rotation: 0,
              opacity: 1,
            },
            {
              id: 'b',
              type: 'rect',
              rect: { x: 20, y: 0, width: 40, height: 10 },
              fill: '#000000FF',
              cornerRadius: 0,
              rotation: 0,
              opacity: 1,
            },
            {
              id: 'h',
              type: 'highlight',
              rect: { x: 0, y: 10, width: 60, height: 10 },
              color: '#FFFF00FF',
              rotation: 0,
              opacity: 1,
            },
          ],
        },
      ],
    });
    const pixels = editor.readPixels();
    const at = (x: number, y: number) => [
      ...pixels.data.slice((y * 60 + x) * 4, (y * 60 + x) * 4 + 4),
    ];
    // Chỉ hình a, chồng a+b, chỉ hình b: cùng màu (opacity của cả layer, không cộng dồn).
    expect(at(10, 5)).toEqual(at(30, 5));
    expect(at(50, 5)).toEqual(at(30, 5));
    expect(at(10, 5)[0]).toBeGreaterThan(90);
    expect(at(10, 5)[0]).toBeLessThan(110);
    // Highlight multiply vàng trên nền xanh nhạt, opacity 50%: kênh xanh dương giảm một nửa.
    const [r, g, b] = at(30, 15);
    expect(r).toBeGreaterThanOrEqual(198);
    expect(g).toBeGreaterThanOrEqual(218);
    expect(b).toBeGreaterThan(110);
    expect(b).toBeLessThan(130);
  });
});

/** Document nhiều layer có nội dung ngẫu nhiên, blend/opacity khác nhau. */
function stackDocument(
  layers: number,
  activeIndex: number,
  size: { width: number; height: number },
  background: DocumentBackground = { kind: 'color', color: '#FFFFFFFF' },
  options: { aboveModes?: BlendMode[]; vectorAt?: number } = {},
): Editor {
  const random = seededRandom(layers * 1000 + activeIndex);
  const specs: DocumentLayerSpec[] = [];
  for (let i = 0; i < layers; i++) {
    if (i === options.vectorAt) {
      specs.push({
        kind: 'vector',
        name: `Chú thích ${String(i)}`,
        objects: [
          {
            id: `rect-${String(i)}`,
            type: 'rect',
            rect: { x: 10, y: 10, width: size.width / 2, height: size.height / 3 },
            stroke: { color: '#E03131FF', width: 6 },
            cornerRadius: 8,
            rotation: 0,
            opacity: 1,
          },
        ],
      });
      continue;
    }
    const image = new ImageData(size.width, size.height);
    const hue = Math.floor(random() * 255);
    for (let y = 0; y < size.height; y++) {
      for (let x = 0; x < size.width; x++) {
        const k = (y * size.width + x) * 4;
        const on = ((x >> 4) + (y >> 4) + i) % 3 !== 0;
        image.data.set(
          on
            ? [(hue + x) % 256, (y * 3) % 256, (hue * 7 + i * 40) % 256, 90 + i * 20]
            : [0, 0, 0, 0],
          k,
        );
      }
    }
    const above = i > activeIndex;
    const mode = above
      ? (options.aboveModes?.[(i - activeIndex - 1) % options.aboveModes.length] ?? 'normal')
      : (BLEND_MODES[(i * 5) % BLEND_MODES.length] ?? 'normal');
    specs.push({
      kind: 'raster',
      name: `Lớp ${String(i)}`,
      image,
      blendMode: mode,
      opacity: 0.6 + (i % 4) * 0.1,
    });
  }
  const editor = track(createTestEditor(1, 1));
  editor.createDocument({
    ...size,
    background,
    layers: specs,
    activeLayerId: undefined,
  });
  const doc = editor.document;
  const active = doc?.layers[activeIndex];
  if (active) editor.layers.setActive(active.id);
  return editor;
}

let lastCachedStats: Editor['renderCacheStats'] | null = null;

/** Vẽ một lần có cache, một lần trực tiếp; thống kê cache của lần có cache ở `lastCachedStats`. */
function displayWithAndWithoutCache(editor: Editor, w: number, h: number): [ImageData, ImageData] {
  editor.setRenderCacheOptions({ caches: true, mipmaps: true });
  const cached = readDisplay(editor, 0, 0, w, h);
  lastCachedStats = editor.renderCacheStats;
  editor.setRenderCacheOptions({ caches: false, mipmaps: false });
  const direct = readDisplay(editor, 0, 0, w, h);
  editor.setRenderCacheOptions({ caches: true, mipmaps: true });
  return [cached, direct];
}

describe('Below/Above cache (mục 5.2)', () => {
  it('ảnh hiển thị có cache giống hệt vẽ trực tiếp; cache chỉ dựng lại khi cần', () => {
    const W = 300;
    const H = 200;
    const editor = stackDocument(7, 3, { width: W, height: H });
    mountEditor(editor, W, H);
    const [cached, direct] = displayWithAndWithoutCache(editor, W, H);
    expect(lastCachedStats).toMatchObject({ below: true, above: true });
    expect(compareImages(cached, direct).max).toBeLessThanOrEqual(2);

    // Vẽ trên layer hoạt động: cache không đổi, kết quả vẫn khớp.
    editor.tools.setActive('brush');
    editor.options.set('brush', { preset: 'soft', size: 40, opacity: 0.8 });
    editor.colors.setPrimary('#2F9E44CC');
    drawStroke(editor, [
      { x: 20, y: 20 },
      { x: 280, y: 180 },
    ]);
    const [afterStroke, afterStrokeDirect] = displayWithAndWithoutCache(editor, W, H);
    expect(compareImages(afterStroke, afterStrokeDirect).max).toBeLessThanOrEqual(2);
    expect(compareImages(afterStroke, cached).max).toBeGreaterThan(10);

    // Đổi thuộc tính một layer phía dưới, ẩn một layer phía trên, đổi layer hoạt động, undo.
    const doc = editor.document;
    const below = doc?.layers[1];
    const above = doc?.layers[5];
    if (!below || !above || !doc) throw new Error('thiếu layer');
    editor.layers.setProps(below.id, { opacity: 0.3 });
    editor.layers.setProps(above.id, { visible: false });
    let [c, d] = displayWithAndWithoutCache(editor, W, H);
    expect(compareImages(c, d).max).toBeLessThanOrEqual(2);
    editor.layers.setActive(doc.layers[5]?.id ?? '');
    [c, d] = displayWithAndWithoutCache(editor, W, H);
    expect(compareImages(c, d).max).toBeLessThanOrEqual(2);
    editor.undo();
    editor.undo();
    [c, d] = displayWithAndWithoutCache(editor, W, H);
    expect(compareImages(c, d).max).toBeLessThanOrEqual(2);
  });

  it('layer phía trên có blend khác normal: bỏ Above cache, vẫn đúng', () => {
    const W = 200;
    const H = 120;
    const editor = stackDocument(
      6,
      1,
      { width: W, height: H },
      { kind: 'transparent' },
      {
        aboveModes: ['normal', 'multiply'],
      },
    );
    mountEditor(editor, W, H);
    const [cached, direct] = displayWithAndWithoutCache(editor, W, H);
    expect(lastCachedStats).toMatchObject({ below: false, above: false });
    expect(compareImages(cached, direct).max).toBeLessThanOrEqual(2);
  });

  it('dải có layer chú thích: dùng cache khi thu nhỏ, vẽ trực tiếp khi phóng to (nét vector sắc)', () => {
    const W = 200;
    const H = 120;
    const editor = stackDocument(5, 4, { width: W, height: H }, undefined, { vectorAt: 2 });
    mountEditor(editor, W, H, 1);
    const [cached, direct] = displayWithAndWithoutCache(editor, W, H);
    expect(lastCachedStats?.below).toBe(true);
    expect(compareImages(cached, direct).max).toBeLessThanOrEqual(8);
    editor.viewport.set({ zoom: 2, panX: 0, panY: 0 });
    readDisplay(editor, 0, 0, W, H);
    expect(editor.renderCacheStats.below).toBe(false);
  });

  it('cache bị MemoryBudget thu hồi thì vẽ trực tiếp, dựng lại lười', () => {
    const W = 160;
    const H = 100;
    const editor = stackDocument(6, 3, { width: W, height: H });
    mountEditor(editor, W, H);
    const before = readDisplay(editor, 0, 0, W, H);
    expect(editor.memory.usedBy('cache')).toBeGreaterThan(0);
    editor.memory.reclaim(1, 'layer', true);
    expect(editor.memory.usedBy('cache')).toBe(0);
    editor.viewport.panBy(0, 0);
    editor.setRenderCacheOptions({});
    const after = readDisplay(editor, 0, 0, W, H);
    expect(compareImages(before, after).max).toBe(0);
    expect(editor.memory.usedBy('cache')).toBeGreaterThan(0);
  });
});

describe('Dựng cache dần lúc rảnh', () => {
  it('vùng cần dựng lớn: frame đầu vẽ trực tiếp (không khựng), cache dựng xong lúc rảnh cho cùng ảnh', async () => {
    const W = 2048;
    const H = 1536;
    const editor = stackDocument(6, 3, { width: W, height: H });
    mountEditor(editor, 512, 384, 0.25);
    const first = readDisplay(editor, 0, 0, 512, 384);
    expect(editor.renderCacheStats.below).toBe(false);
    await vi.waitFor(
      () => {
        editor.flush();
        expect(editor.renderCacheStats).toMatchObject({ below: true, above: true });
      },
      { timeout: 10_000, interval: 50 },
    );
    const warmed = readDisplay(editor, 0, 0, 512, 384);
    expect(compareImages(first, warmed).max).toBeLessThanOrEqual(2);
    // Đổi layer hoạt động: cache dựng lại dần, ảnh vẫn đúng ngay frame đầu.
    const doc = editor.document;
    editor.layers.setActive(doc?.layers[2]?.id ?? '');
    const switched = readDisplay(editor, 0, 0, 512, 384);
    editor.setRenderCacheOptions({ caches: false });
    const direct = readDisplay(editor, 0, 0, 512, 384);
    expect(compareImages(switched, direct).max).toBeLessThanOrEqual(2);
  }, 20_000);
});

describe('Mipmap ½, ¼ (mục 5.2)', () => {
  it('ảnh > 4K thu nhỏ dưới 50% dùng mipmap; ảnh gần giống đường trực tiếp; trả bộ nhớ khi phóng lại', () => {
    const W = 4096;
    const H = 2304;
    const editor = track(
      createTestEditor(W, H, { background: { kind: 'color', color: '#FFFFFFFF' } }),
    );
    editor.tools.setActive('brush');
    editor.options.set('brush', { preset: 'round', size: 120, opacity: 1 });
    editor.colors.setPrimary('#1C7ED6FF');
    drawStroke(editor, [
      { x: 200, y: 200 },
      { x: 3800, y: 2100 },
      { x: 300, y: 2000 },
    ]);
    mountEditor(editor, 512, 288, 0.125);
    editor.setRenderCacheOptions({ mipmaps: true });
    const mip = readDisplay(editor, 0, 0, 512, 288);
    expect(editor.renderCacheStats.mipLevel).toBe(2);
    expect(editor.memory.usedBy('cache')).toBeGreaterThan(0);
    editor.setRenderCacheOptions({ mipmaps: false });
    const direct = readDisplay(editor, 0, 0, 512, 288);
    const diff = compareImages(mip, direct);
    expect(diff.mean).toBeLessThan(4);

    // Vẽ thêm khi đang thu nhỏ: mipmap cập nhật đúng vùng vừa vẽ.
    editor.setRenderCacheOptions({ mipmaps: true });
    readDisplay(editor, 0, 0, 512, 288);
    editor.colors.setPrimary('#E03131FF');
    drawStroke(editor, [
      { x: 3800, y: 200 },
      { x: 2000, y: 1200 },
    ]);
    const mip2 = readDisplay(editor, 0, 0, 512, 288);
    editor.setRenderCacheOptions({ mipmaps: false });
    const direct2 = readDisplay(editor, 0, 0, 512, 288);
    expect(compareImages(mip2, direct2).mean).toBeLessThan(4);
    // Giữa nét đỏ (2900, 700) → màn hình (362, 87).
    expect(mip2.data[(87 * 512 + 362) * 4]).toBeGreaterThan(150);

    editor.setRenderCacheOptions({ mipmaps: true });
    editor.viewport.set({ zoom: 1, panX: 0, panY: 0 });
    readDisplay(editor, 0, 0, 10, 10);
    expect(editor.renderCacheStats.mipLevel).toBe(0);
    expect(editor.memory.usedBy('cache')).toBe(0);
  }, 30_000);
});
