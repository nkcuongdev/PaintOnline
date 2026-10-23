import { expect, it, vi } from 'vitest';
import { WorkerPool } from './pool';
import { encodePng } from './ops/png';

it('A12: a real startup crash rejects the active job and queued PNG decode recovers in a new worker', async () => {
  const workers: Worker[] = [];
  const terminate: ReturnType<typeof vi.spyOn>[] = [];
  const pool = new WorkerPool(1, () => {
    const worker = new Worker(
      workers.length === 0
        ? new URL('./testing/crash.worker.ts', import.meta.url)
        : new URL('./image.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workers.push(worker);
    terminate.push(vi.spyOn(worker, 'terminate'));
    return worker;
  });
  const png = encodePng(new Uint8Array([10, 20, 30, 255]), 1, 1).slice().buffer;
  try {
    const crashed = pool.decodeLayer(png.slice(0));
    const next = pool.decodeLayer(png.slice(0));
    await expect(crashed).rejects.toThrow('Image worker failed');
    expect([...(await next).data]).toEqual([10, 20, 30, 255]);
    expect(workers).toHaveLength(2);
    expect(terminate[0]).toHaveBeenCalledOnce();
  } finally {
    pool.dispose();
    expect(terminate[1]).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  }
});
