import { describe, expect, it, vi } from 'vitest';
import { decodeLayerImages } from './restore';
import type { DocumentRecord, LayerBlobRecord } from './schema';

function fixture(count: number, side: number) {
  const layers = Array.from({ length: count }, (_, i) => ({
    id: `layer-${i}`,
    name: 'test',
    kind: 'raster' as const,
    visible: true,
    locked: false,
    alphaLocked: false,
    opacity: 1,
    blendMode: 'normal' as const,
    contentRev: 1,
    bounds: { x: 0, y: 0, width: side, height: side },
  }));
  const document: DocumentRecord = {
    schemaVersion: 1,
    projectId: 'test',
    rev: 1,
    width: side,
    height: side,
    background: { kind: 'transparent' },
    activeLayerId: 'layer-0',
    palette: [],
    viewport: { zoom: 1, panX: 0, panY: 0 },
    layers,
  };
  const blobs = new Map<string, LayerBlobRecord>();
  for (const layer of layers) {
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    png.set([73, 72, 68, 82], 12);
    const view = new DataView(png.buffer);
    view.setUint32(16, side);
    view.setUint32(20, side);
    blobs.set(layer.id, {
      projectId: 'test',
      layerId: layer.id,
      png: png.buffer,
      bounds: layer.bounds,
      contentRev: 1,
      updatedAt: 0,
    });
  }
  return { document, blobs };
}

describe('R02 pre-decode admission', () => {
  it.each([
    [1, 9000],
    [200, 2048],
  ])('rejects %i layers of side %i before codec allocation', async (count, side) => {
    const decodeLayer = vi.fn().mockResolvedValue({ width: side, height: side });
    await expect(decodeLayerImages(fixture(count, side), { decodeLayer })).rejects.toThrow();
    expect(decodeLayer).not.toHaveBeenCalled();
  });

  it('checks actual PNG dimensions before invoking the decoder', async () => {
    const loaded = fixture(1, 8);
    new DataView(loaded.blobs.get('layer-0')!.png).setUint32(16, 16384);
    const decodeLayer = vi.fn().mockResolvedValue({ width: 8, height: 8 });
    expect((await decodeLayerImages(loaded, { decodeLayer })).failed).toBe(1);
    expect(decodeLayer).not.toHaveBeenCalled();
  });

  it('bounds concurrent decodes and drains them on abort without starting more', async () => {
    const controller = new AbortController();
    let active = 0;
    let peak = 0;
    const decodeLayer = vi.fn((_png: ArrayBuffer, signal?: AbortSignal) => {
      active++;
      peak = Math.max(peak, active);
      return new Promise<ImageData>((_resolve, reject) => {
        signal?.addEventListener(
          'abort',
          () => {
            active--;
            reject(new Error('abort'));
          },
          { once: true },
        );
      });
    });
    const work = decodeLayerImages(fixture(12, 8), { decodeLayer }, 1000, controller.signal);
    await vi.waitFor(() => expect(decodeLayer.mock.calls.length).toBeGreaterThan(0));
    expect(peak).toBeLessThanOrEqual(2);
    controller.abort();
    await work;
    expect(active).toBe(0);
    expect(decodeLayer.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
