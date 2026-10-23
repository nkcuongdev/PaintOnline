import { afterEach, expect, it, vi } from 'vitest';
import { createTestEditor } from '@/engine/testing/helpers';
import type { Editor } from '@/engine/core/Editor';
import type { OpenProject } from '@/app/editor/session';
import {
  clearInternalClip,
  copySelection,
  pasteFromEvent,
  pasteFromMenu,
  trackClipboardFreshness,
} from '@/app/editor/clipboard';
import { mainThreadCodec } from '@/services/workers/codec';
import { WorkerPool } from '@/services/workers/pool';
import { encodePng } from '@/services/workers/ops/png';
import { buildProjectFile, readProjectFile } from './projectFile';
import { decodeImage } from './importImage';
import { useUiStore } from '@/stores/ui';
import { t } from '@/i18n';

const editors: Editor[] = [];
const pools: WorkerPool[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  clearInternalClip();
  for (const e of editors.splice(0)) e.dispose();
  for (const p of pools.splice(0)) p.dispose();
});

function solid(r: number, g: number, b: number) {
  const image = new ImageData(8, 8);
  for (let i = 0; i < image.data.length; i += 4) image.data.set([r, g, b, 255], i);
  return image;
}

it('A05: after blur, same-size clipboard replaces copied pixels; fresh internal paste keeps its origin', async () => {
  const editor = createTestEditor(32, 32);
  editors.push(editor);
  const red = await createImageBitmap(solid(255, 0, 0));
  const blue = await createImageBitmap(solid(0, 0, 255));
  const png = await mainThreadCodec.encode(await createImageBitmap(blue), { type: 'image/png' });
  vi.spyOn(editor.selection, 'copy').mockReturnValue({
    bitmap: Promise.resolve(red),
    png: Promise.resolve(png),
    rect: { x: 3, y: 5, width: 8, height: 8 },
  });
  // Observe the bitmap passed into the real paste, before the decoded bitmap is closed.
  const paste = vi.spyOn(editor.selection, 'paste');
  const project = { editor, name: 'isolated clipboard' } as OpenProject;
  const off = trackClipboardFreshness();
  try {
    copySelection(project, 'copy');
    await Promise.resolve();
    expect(await pasteFromEvent(project, null)).toBe(true);
    expect(paste.mock.calls.at(-1)?.[1]).toEqual({ x: 3, y: 5 });
    editor.selection.cancel();
    window.dispatchEvent(new Event('blur'));
    const data = new DataTransfer();
    data.items.add(new File([png], 'new.png', { type: 'image/png' }));
    expect(await pasteFromEvent(project, data)).toBe(true);
    editor.prepareForOutput();
    const pixels = editor.readPixels();
    expect([...pixels.data].filter((_, i) => i % 4 === 2).some((b) => b === 255)).toBe(true);
    expect(paste.mock.calls.at(-1)?.[1]).toBeNull();
    const read = vi
      .fn()
      .mockResolvedValue([{ types: ['image/png'], getType: () => Promise.resolve(png) }]);
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ read } as unknown as Clipboard);
    expect(await pasteFromMenu(project)).toBe(true);
    expect(paste.mock.calls.at(-1)?.[1]).toBeNull();
    expect(editor.prepareForOutput()).toBe(true);
    expect([...editor.readPixels().data].filter((_, i) => i % 4 === 2).some((b) => b === 255)).toBe(
      true,
    );
    read.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    useUiStore.setState({ toasts: [] });
    expect(await pasteFromMenu(project)).toBe(true);
    expect(paste.mock.calls.at(-1)?.[1]).toEqual({ x: 3, y: 5 });
    expect(
      useUiStore
        .getState()
        .toasts.some((toast) => toast.message === t.actions.pasteInternalFallback),
    ).toBe(true);
    editor.selection.cancel();
    expect(await pasteFromEvent(project, null)).toBe(false);
  } finally {
    off();
    blue.close();
  }
});

async function jpeg(orientation: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'red';
  ctx.fillRect(0, 0, 100, 100);
  ctx.fillStyle = 'blue';
  ctx.fillRect(100, 0, 100, 100);
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => {
      resolve(b!);
    }, 'image/jpeg');
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const exif = Uint8Array.from([
    255,
    225,
    0,
    34,
    69,
    120,
    105,
    102,
    0,
    0,
    73,
    73,
    42,
    0,
    8,
    0,
    0,
    0,
    1,
    0,
    18,
    1,
    3,
    0,
    1,
    0,
    0,
    0,
    orientation,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
  const oriented = new Uint8Array(bytes.length + exif.length);
  oriented.set(bytes.subarray(0, 2));
  oriented.set(exif, 2);
  oriented.set(bytes.subarray(2), 2 + exif.length);
  return new Blob([oriented], { type: 'image/jpeg' });
}

it.each([1, 3, 6, 8])(
  'A09: EXIF %i retains oriented dimensions in worker, fallback and native decode',
  async (orientation) => {
    const blob = await jpeg(orientation);
    const native = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    expect([native.width, native.height]).toEqual(orientation >= 5 ? [100, 200] : [200, 100]);
    native.close();
    const pool = new WorkerPool(1);
    pools.push(pool);
    for (const decoder of [null, pool, { decode: () => Promise.reject(new Error('fallback')) }]) {
      for (const maxSide of [100, 300]) {
        const result = await decodeImage(blob, { maxSide, maxPixels: 90_000 }, decoder);
        try {
          const expected = maxSide === 100 ? [100, 50] : [200, 100];
          if (orientation >= 5) expected.reverse();
          expect([result.width, result.height]).toEqual(expected);
          expect(result.scaled).toBe(maxSide === 100);
        } finally {
          result.bitmap.close();
        }
      }
    }
  },
);

it('A11: an editable backup at the 200-layer limit, including thumbnail, imports exactly', async () => {
  const editor = createTestEditor(1, 1);
  editors.push(editor);
  const png = encodePng(new Uint8Array([10, 20, 30, 255]), 1, 1).slice().buffer;
  const layers = Array.from({ length: 200 }, (_, i) => ({
    id: `r${i}`,
    kind: 'raster' as const,
    name: `L${i}`,
    visible: true,
    locked: false,
    alphaLocked: false,
    opacity: 1,
    blendMode: 'normal' as const,
    contentRev: 1,
    bounds: { x: 0, y: 0, width: 1, height: 1 },
  }));
  const bundle = {
    meta: { name: 'isolated limit', mode: 'paint' as const },
    document: {
      ...editor.serialize()!,
      projectId: 'isolated',
      schemaVersion: 1 as const,
      viewport: editor.view,
      activeLayerId: 'r0',
      layers,
    },
    layers: layers.map((l) => ({
      layerId: l.id,
      png: png.slice(0),
      bounds: l.bounds,
      contentRev: 1,
    })),
    thumbnail: { type: 'image/png' as const, data: png.slice(0) },
  };
  const file = await buildProjectFile(bundle, mainThreadCodec, {
    appVersion: 'test',
    bakeRedactions: false,
  });
  const restored = await readProjectFile(file, mainThreadCodec);
  expect(restored.document.layers).toEqual(layers);
  expect(restored.layers).toHaveLength(200);
  expect(restored.thumbnail?.data).toEqual(png);
  expect([...(await mainThreadCodec.decodeLayer(restored.layers[199].png)).data]).toEqual([
    10, 20, 30, 255,
  ]);
});
