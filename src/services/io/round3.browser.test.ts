import { afterEach, expect, it, vi } from 'vitest';
import { createTestEditor } from '@/engine/testing/helpers';
import { mainThreadCodec } from '@/services/workers/codec';
import { readProjectFile, PAINT_FORMAT } from './projectFile';
import { decodeImage, ImportError } from './importImage';
import { MAX_MANIFEST_BYTES } from './decodeBudget';
import { measureSharing } from '../../../tests/bench/round3';
import { WorkerPool } from '@/services/workers/pool';

afterEach(() => {
  vi.restoreAllMocks();
});

it('round3 benchmark sharing harness validates flattened data/pixels on a tiny safe fixture', async () => {
  const editor = createTestEditor(64, 64);
  try {
    expect((await measureSharing(editor)).safeManifest).toBe(true);
  } finally {
    editor.dispose();
  }
});

it('R02: compressed input size rejects before arrayBuffer, and invalid manifest never inflates layer entries', async () => {
  const file = new Blob(['small']);
  Object.defineProperty(file, 'size', { value: 1024 ** 3 });
  const read = vi.spyOn(file, 'arrayBuffer');
  await expect(readProjectFile(file, mainThreadCodec)).rejects.toMatchObject({ reason: 'archive' });
  expect(read).not.toHaveBeenCalled();
  const bad = await archive((doc) => {
    doc.width = 9000;
  });
  const unpack = vi.spyOn(mainThreadCodec, 'unzip');
  await expect(readProjectFile(bad, mainThreadCodec)).rejects.toThrow();
  expect(unpack).toHaveBeenCalledOnce();
  expect(unpack.mock.calls[0]?.[1].source).toBe('^manifest\\.json$');
});

it('R02: per-operation inflated-byte limit reaches native and worker ZIP paths; next job still succeeds', async () => {
  const pool = new WorkerPool(1);
  try {
    for (const codec of [mainThreadCodec, pool]) {
      const bytes = await mainThreadCodec.zip([
        { path: 'layers/a.png', data: new Uint8Array(1024), level: 6 },
      ]);
      await expect(async () => codec.unzip(bytes.slice(), /./, 256)).rejects.toMatchObject({
        code: 'tooLarge',
      });
      expect((await codec.unzip(bytes.slice(), /./, 2048)).get('layers/a.png')?.length).toBe(1024);
    }
  } finally {
    pool.dispose();
  }
});

async function archive(change: (doc: Record<string, unknown>) => void, thumbnail?: Uint8Array) {
  const editor = createTestEditor(8, 8);
  const document = {
    ...editor.serialize()!,
    schemaVersion: 1,
    projectId: 'fixture',
    viewport: editor.view,
  };
  editor.dispose();
  change(document);
  return new Blob([
    (await mainThreadCodec.zip([
      {
        path: 'manifest.json',
        level: 6,
        data: new TextEncoder().encode(
          JSON.stringify({ format: PAINT_FORMAT, formatVersion: 1, document }),
        ),
      },
      ...(thumbnail ? [{ path: 'thumbnail.png', level: 0 as const, data: thumbnail }] : []),
    ])) as Uint8Array<ArrayBuffer>,
  ]);
}

function header(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

it('R02: .paint tier, aggregate pixels, geometry and thumbnail are rejected before any decoder call', async () => {
  const decode = vi.spyOn(mainThreadCodec, 'decodeLayer');
  for (const change of [
    (doc: Record<string, unknown>) => {
      doc.width = 9000;
    },
    (doc: Record<string, unknown>) => {
      doc.width = 2048;
      doc.height = 2048;
      doc.layers = Array.from({ length: 200 }, (_, i) => ({
        id: `r${i}`,
        kind: 'raster',
        name: 'compressed',
        bounds: { x: 0, y: 0, width: 2048, height: 2048 },
        visible: true,
        locked: false,
        alphaLocked: false,
        opacity: 1,
        blendMode: 'normal',
        contentRev: 0,
      }));
    },
    (doc: Record<string, unknown>) => {
      doc.layers = [
        {
          id: 'vector',
          kind: 'vector',
          name: 'bad geometry',
          visible: true,
          locked: false,
          alphaLocked: false,
          opacity: 1,
          blendMode: 'normal',
          contentRev: 0,
          objects: [
            {
              id: 'huge',
              type: 'rect',
              rotation: 0,
              opacity: 1,
              rect: { x: 0, y: 0, width: 1e100, height: 1e100 },
              cornerRadius: 0,
            },
          ],
        },
      ];
    },
  ])
    await expect(readProjectFile(await archive(change), mainThreadCodec)).rejects.toThrow();
  await expect(
    readProjectFile(await archive(() => undefined, header(16384, 16384)), mainThreadCodec),
  ).rejects.toThrow();
  expect(decode).not.toHaveBeenCalled();
  // A rejected import leaves the engine usable.
  const live = createTestEditor(32, 32);
  expect(live.layers.add()).not.toBeNull();
  live.dispose();
});

it('R02: compressed oversized manifest stops in bounded ZIP extraction before JSON/decode', async () => {
  const data = new Uint8Array(MAX_MANIFEST_BYTES + 1).fill(32);
  const zipped = await mainThreadCodec.zip([{ path: 'manifest.json', data, level: 6 }]);
  const decode = vi.spyOn(mainThreadCodec, 'decodeLayer');
  await expect(
    readProjectFile(new Blob([zipped as Uint8Array<ArrayBuffer>]), mainThreadCodec),
  ).rejects.toMatchObject({ code: 'tooLarge' });
  expect(decode).not.toHaveBeenCalled();
});

it('R02: SVG is checked before native raster allocation, and admitted SVG uses a bounded viewport', async () => {
  const bitmap = vi.spyOn(globalThis, 'createImageBitmap');
  const limits = { maxSide: 64, maxPixels: 4096 };
  await expect(
    decodeImage(
      new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="100000" height="100000"/>']),
      limits,
    ),
  ).rejects.toBeInstanceOf(ImportError);
  expect(bitmap).not.toHaveBeenCalled();
  const decoded = await decodeImage(
    new Blob([
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 64"><rect width="128" height="64" fill="red"/></svg>',
    ]),
    limits,
  );
  expect([decoded.width, decoded.height]).toEqual([64, 32]);
  expect(decoded.scaled).toBe(true);
  decoded.bitmap.close();
});
