import { expect, it, vi } from 'vitest';
import { decodeLayerBounded } from './layerDecode';

it('shares two slots across callers; queued abort never decodes, rejection releases its slot', async () => {
  const releases: (() => void)[] = [];
  let active = 0;
  let peak = 0;
  const decodeLayer = vi.fn(() => {
    active++;
    peak = Math.max(peak, active);
    return new Promise<ImageData>((resolve) => {
      releases.push(() => {
        active--;
        resolve({ width: 1, height: 1 } as ImageData);
      });
    });
  });
  const codec = { decodeLayer };
  const first = decodeLayerBounded(codec, new ArrayBuffer(0));
  const second = decodeLayerBounded(codec, new ArrayBuffer(0));
  const controller = new AbortController();
  const aborted = decodeLayerBounded(codec, new ArrayBuffer(0), controller.signal);
  const rejected = expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
  const fourth = decodeLayerBounded(codec, new ArrayBuffer(0));
  await Promise.resolve();
  expect(decodeLayer).toHaveBeenCalledTimes(2);
  controller.abort();
  await rejected;
  releases.shift()!();
  await first;
  await Promise.resolve();
  expect(decodeLayer).toHaveBeenCalledTimes(3);
  releases.shift()!();
  releases.shift()!();
  await Promise.all([second, fourth]);
  expect(peak).toBe(2);
  expect(active).toBe(0);
  await expect(
    decodeLayerBounded(
      { decodeLayer: () => Promise.reject(new Error('decode failed')) },
      new ArrayBuffer(0),
    ),
  ).rejects.toThrow('decode failed');
  const final = decodeLayerBounded(codec, new ArrayBuffer(0));
  await Promise.resolve();
  releases.shift()!();
  await final;
});
