import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLEND_MODES, type RedactObject } from './core/types';
import type { Editor } from './core/Editor';
import { SurfaceAllocationError } from './memory/surfaces';
import { createTestEditor, diffPixels, pixelAt } from './testing/helpers';
import { mainThreadCodec } from '@/services/workers/codec';
import { buildProjectFile, readProjectFile } from '@/services/io/projectFile';
import { documentSpecFromRecord } from '@/services/storage/restore';
import type { ProjectBundle } from '@/services/storage/projectRepo';

const editors: Editor[] = [];
function editor() {
  const e = createTestEditor(64, 64, { background: { kind: 'color', color: '#FFFFFFFF' } });
  editors.push(e);
  return e;
}
const redact: RedactObject = {
  id: 'cover',
  type: 'redact',
  rotation: 0,
  opacity: 1,
  rect: { x: 8, y: 8, width: 48, height: 40 },
  mode: 'solid',
  strength: 12,
  color: '#000000FF',
};
async function redDraft(e: Editor) {
  const image = new ImageData(8, 8);
  for (let i = 0; i < image.data.length; i += 4) image.data.set([255, 0, 0, 255], i);
  const bitmap = await createImageBitmap(image);
  expect(e.selection.paste(bitmap, { x: 16, y: 16 })).toBe(true);
  bitmap.close();
}
async function bundle(e: Editor): Promise<ProjectBundle> {
  const data = e.serialize();
  if (!data) throw new Error('no document');
  const layers = await Promise.all(
    e.captureLayers(new Map()).map(async (c) => ({
      layerId: c.layerId,
      contentRev: c.contentRev,
      bounds: c.bounds,
      png: await mainThreadCodec.encodeLayer(await c.bitmap),
    })),
  );
  return {
    meta: { name: 'Synthetic sharing test', mode: 'paint' },
    document: { ...data, schemaVersion: 1, projectId: e.document!.id, viewport: e.view },
    layers,
    // A stale sensitive thumbnail must never be copied to the sharing file.
    thumbnail: {
      type: 'image/png',
      data: new TextEncoder().encode('HIDDEN-THUMBNAIL-SECRET').buffer,
    },
  };
}
async function restore(b: ProjectBundle) {
  const images = new Map(
    await Promise.all(
      b.layers.map(async (l) => [l.layerId, await mainThreadCodec.decodeLayer(l.png)] as const),
    ),
  );
  const e = editor();
  expect(e.createDocument(documentSpecFromRecord(b.document, images))).toBe(true);
  return e;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const e of editors.splice(0)) e.dispose();
  document.body.replaceChildren();
});

describe('A01/A08 — sharing copy and protective redaction', () => {
  it('drops same/other-layer text, hidden raster/vector data and stale thumbnails; editable original survives', async () => {
    const e = editor();
    await redDraft(e);
    expect(e.prepareForOutput()).toBe(true);
    e.layers.add('vector');
    e.tools.setActive('text');
    e.dispatchPointer('down', { x: 9, y: 12 });
    e.dispatchPointer('up', { x: 9, y: 12 });
    e.text.update('SECRET-SAME-LAYER');
    expect(e.prepareForOutput()).toBe(true);
    const vector = e.document!.activeLayer;
    if (vector.kind !== 'vector') throw new Error('no vector');
    vector.objects = [...vector.objects, redact];
    e.layers.add('vector');
    e.tools.setActive('text');
    e.dispatchPointer('down', { x: 10, y: 15 });
    e.dispatchPointer('up', { x: 10, y: 15 });
    e.text.update('SECRET-OTHER-LAYER');
    expect(e.prepareForOutput()).toBe(true);
    // A second covering layer covers text on a different layer too.
    e.layers.add('vector');
    const top = e.document!.activeLayer;
    if (top.kind !== 'vector') throw new Error('no vector');
    top.objects = [{ ...redact, id: 'top-cover' }];
    e.layers.add('vector');
    const hidden = e.document!.activeLayer;
    hidden.visible = false;
    hidden.name = 'HIDDEN-LAYER-SECRET';
    if (hidden.kind === 'vector') hidden.objects = [{ ...redact, id: 'hidden-object-secret' }];
    await redDraft(e);
    expect(e.prepareForOutput()).toBe(true);
    e.document!.activeLayer.visible = false;
    const original = e.serialize();
    const before = e.readPixels();
    const source = await bundle(e);
    const file = await buildProjectFile(source, mainThreadCodec, {
      appVersion: 'test',
      bakeRedactions: true,
    });
    const entries = await mainThreadCodec.unzip(new Uint8Array(await file.arrayBuffer()), /.*/);
    expect([...entries.keys()].sort()).toEqual([
      'layers/shared-composite.png',
      'manifest.json',
      'thumbnail.png',
    ]);
    const manifest = new TextDecoder().decode(entries.get('manifest.json'));
    expect(manifest).not.toMatch(/SECRET|hidden-object|"objects"|"redact"/);
    expect(new TextDecoder().decode(entries.get('thumbnail.png'))).not.toContain(
      'HIDDEN-THUMBNAIL',
    );
    const imported = await readProjectFile(file, mainThreadCodec);
    expect(imported.document.layers).toHaveLength(1);
    const copy = await restore(imported);
    expect(diffPixels(copy.readPixels(), before)).toBe(0);
    expect(pixelAt(copy.readPixels(), 20, 20)).toEqual([0, 0, 0, 255]);
    expect(e.serialize()).toEqual(original);
    expect(source.document).toEqual({
      ...original,
      schemaVersion: 1,
      projectId: e.document!.id,
      viewport: e.view,
    });
    // No redact object remains to remove; the only layer is already opaque in the protected region.
    expect(imported.document.layers.every((l) => l.kind === 'raster')).toBe(true);
  });

  it('fails closed for missing/invalid visible PNG, without changing the source', async () => {
    const e = editor();
    await redDraft(e);
    e.prepareForOutput();
    const source = await bundle(e);
    const original = e.serialize();
    await expect(
      buildProjectFile({ ...source, layers: [] }, mainThreadCodec, {
        appVersion: 'test',
        bakeRedactions: true,
      }),
    ).rejects.toThrow();
    await expect(
      buildProjectFile(
        { ...source, layers: source.layers.map((l) => ({ ...l, png: new ArrayBuffer(2) })) },
        mainThreadCodec,
        { appVersion: 'test', bakeRedactions: true },
      ),
    ).rejects.toThrow();
    expect(e.serialize()).toEqual(original);
  });

  it.each(BLEND_MODES)(
    'solid redaction stays opaque for %s at layer opacity 0/0.5/1 (render, PNG, merged)',
    async (blendMode) => {
      const e = editor();
      e.layers.add('vector');
      const layer = e.document!.activeLayer;
      if (layer.kind !== 'vector') throw new Error('no vector');
      layer.objects = [redact];
      for (const opacity of [0, 0.5, 1]) {
        e.layers.setProps(layer.id, { opacity, blendMode });
        expect(pixelAt(e.readPixels(), 20, 20)).toEqual([0, 0, 0, 255]);
        const png = await e.exportImage();
        const image = await mainThreadCodec.decodeLayer(await png.arrayBuffer());
        expect(pixelAt(image, 20, 20)).toEqual([0, 0, 0, 255]);
      }
      expect(e.layers.rasterize(layer.id)).toBe(false);
      expect(e.layers.mergeDown(layer.id)).toBe(false);
      expect(e.layers.mergeVisible()).toBe(true);
      expect(pixelAt(e.readPixels(), 20, 20)).toEqual([0, 0, 0, 255]);
      expect(e.undo()).toBe(true);
      expect(e.redo()).toBe(true);
      expect(pixelAt(e.readPixels(), 20, 20)).toEqual([0, 0, 0, 255]);
    },
  );

  it('hidden redaction is hidden; opacity zero protects; sharing with all layers hidden keeps only background', async () => {
    const e = editor();
    e.layers.add('vector');
    const layer = e.document!.activeLayer;
    if (layer.kind !== 'vector') throw new Error('no vector');
    layer.objects = [redact];
    layer.opacity = 0;
    expect(pixelAt(e.readPixels(), 20, 20)).toEqual([0, 0, 0, 255]);
    layer.visible = false;
    expect(pixelAt(e.readPixels(), 20, 20)).toEqual([255, 255, 255, 255]);
    e.document!.layers.forEach((l) => {
      l.visible = false;
    });
    const original = e.serialize();
    const file = await buildProjectFile(await bundle(e), mainThreadCodec, {
      appVersion: 'test',
      bakeRedactions: true,
    });
    const imported = await readProjectFile(file, mainThreadCodec);
    expect(imported.document.layers).toHaveLength(1);
    expect(pixelAt((await restore(imported)).readPixels(), 20, 20)).toEqual([255, 255, 255, 255]);
    expect(e.serialize()).toEqual(original);
  });

  it('cached preview agrees with export when a zero-opacity redaction is above/below the active layer', async () => {
    const e = editor();
    const base = e.document!.activeLayerId;
    const id = e.layers.add('vector')!;
    const cover = e.document!.activeLayer;
    if (cover.kind !== 'vector') throw new Error('no vector');
    cover.objects = [redact];
    e.layers.setProps(id, { opacity: 0, blendMode: 'screen' });
    const host = document.createElement('div');
    host.style.width = '64px';
    host.style.height = '64px';
    document.body.append(host);
    e.mount(host);
    e.viewport.setDpr(1);
    e.viewport.setSize(64, 64);
    e.viewport.set({ zoom: 1, panX: 0, panY: 0 });
    for (const active of [base, e.layers.add('raster')!]) {
      e.layers.setActive(active);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });
      e.flush();
      expect([...e.displayCanvas!.getContext('2d')!.getImageData(20, 20, 1, 1).data]).toEqual([
        0, 0, 0, 255,
      ]);
      expect(
        pixelAt(
          await mainThreadCodec.decodeLayer(await (await e.exportImage()).arrayBuffer()),
          20,
          20,
        ),
      ).toEqual([0, 0, 0, 255]);
    }
  });

  it('sharing preserves only the visible rendered magnifier and its protected source pixels', async () => {
    const e = editor();
    await redDraft(e);
    e.prepareForOutput();
    e.layers.add('vector');
    const layer = e.document!.activeLayer;
    if (layer.kind !== 'vector') throw new Error('no vector');
    layer.objects = [
      redact,
      {
        id: 'magnifier-source-secret',
        type: 'magnifier',
        rotation: 0,
        opacity: 1,
        source: { x: 16, y: 16, width: 8, height: 8 },
        target: { x: 54, y: 54 },
        zoom: 2,
        shape: 'rect',
        stroke: { color: '#000000FF', width: 1 },
      },
    ];
    const before = e.readPixels();
    const original = e.serialize();
    const file = await buildProjectFile(await bundle(e), mainThreadCodec, {
      appVersion: 'test',
      bakeRedactions: true,
    });
    const imported = await readProjectFile(file, mainThreadCodec);
    expect(JSON.stringify(imported.document)).not.toMatch(/magnifier|secret|"objects"/);
    expect(diffPixels((await restore(imported)).readPixels(), before)).toBe(0);
    expect(e.serialize()).toEqual(original);
  });
});

describe('A03 — drafts at output boundaries', () => {
  it('move selection → Copy commits only on success; allocation failure keeps original and moved draft', async () => {
    const e = editor();
    await redDraft(e);
    e.prepareForOutput();
    expect(e.selection.transform()).toBe(true);
    expect(e.selection.nudge(8, 0)).toBe(true);
    const original = e.serialize();
    const pixels = [...e.readPixels().data];
    const reserve = e.memory.reserve.bind(e.memory);
    const failure = vi.spyOn(e.memory, 'reserve').mockImplementation((bytes, category) => {
      if (category === 'history') throw new SurfaceAllocationError(64, 64);
      reserve(bytes, category);
    });
    expect(e.selection.copy(true)).toBeNull();
    expect(e.selection.isFloating).toBe(true);
    expect(e.serialize()).toEqual(original);
    expect([...e.readPixels().data]).toEqual(pixels);
    failure.mockRestore();
    const capture = e.selection.copy(true);
    expect(capture).not.toBeNull();
    (await capture!.bitmap).close();
    const png = await mainThreadCodec.decodeLayer(await (await capture!.png).arrayBuffer());
    expect(pixelAt(png, 4, 4)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(e.readPixels(), 18, 20)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(e.readPixels(), 28, 20)).toEqual([255, 0, 0, 255]);
  });
  it('PNG and copy apply floating pixels and preserve them after serialize/restore', async () => {
    const e = editor();
    await redDraft(e);
    const png = await e.exportImage();
    expect(e.selection.isFloating).toBe(false);
    expect(pixelAt(await mainThreadCodec.decodeLayer(await png.arrayBuffer()), 20, 20)).toEqual([
      255, 0, 0, 255,
    ]);
    expect(pixelAt((await restore(await bundle(e))).readPixels(), 20, 20)).toEqual([
      255, 0, 0, 255,
    ]);
    await redDraft(e);
    const copy = e.selection.copy(true);
    expect(copy).not.toBeNull();
    (await copy!.bitmap).close();
    expect(
      pixelAt(await mainThreadCodec.decodeLayer(await (await copy!.png).arrayBuffer()), 4, 4),
    ).toEqual([255, 0, 0, 255]);
  });

  it('allocation refusal keeps pasted draft, revision and memory; outputs fail, then retry works', async () => {
    const e = editor();
    await redDraft(e);
    const original = e.serialize();
    const bytes = e.memory.usage().usedBytes;
    const spy = vi.spyOn(e.memory, 'reserve').mockImplementation(() => {
      throw new SurfaceAllocationError(64, 64);
    });
    expect(e.prepareForOutput()).toBe(false);
    expect(e.selection.isFloating).toBe(true);
    expect(e.serialize()).toEqual(original);
    await expect(e.exportImage()).rejects.toThrow('Unapplied draft');
    expect(e.selection.copy()).toBeNull();
    expect(e.memory.usage().usedBytes).toBe(bytes);
    spy.mockRestore();
    expect(e.prepareForOutput()).toBe(true);
    expect(pixelAt(e.readPixels(), 20, 20)).toEqual([255, 0, 0, 255]);
  });

  it('does not settle a gesture mid-stroke; its draft becomes exportable on pointer-up', async () => {
    const e = editor();
    e.tools.setActive('brush');
    e.dispatchPointer('down', { x: 15, y: 15 });
    e.dispatchPointer('move', { x: 30, y: 15 });
    expect(e.hasPendingDraft).toBe(true);
    expect(e.prepareForOutput()).toBe(false);
    await expect(e.exportImage()).rejects.toThrow();
    expect(e.isGestureActive).toBe(true);
    e.dispatchPointer('up', { x: 30, y: 15 });
    expect(e.prepareForOutput()).toBe(true);
  });

  it('commits text before output; refused text commit keeps the session for retry', () => {
    const e = editor();
    e.tools.setActive('text');
    e.dispatchPointer('down', { x: 8, y: 8 });
    e.dispatchPointer('up', { x: 8, y: 8 });
    e.text.update('DRAFT-TEXT');
    expect(e.hasPendingDraft).toBe(true);
    const failure = vi.spyOn(e, 'execute').mockImplementation(() => {
      throw new SurfaceAllocationError(64, 64);
    });
    expect(e.prepareForOutput()).toBe(false);
    expect(e.text.current?.object.text).toBe('DRAFT-TEXT');
    failure.mockRestore();
    expect(e.prepareForOutput()).toBe(true);
    expect(JSON.stringify(e.serialize())).toContain('DRAFT-TEXT');
  });
});
