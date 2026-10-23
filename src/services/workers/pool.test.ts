import { afterEach, expect, it, vi } from 'vitest';
import type * as Comlink from 'comlink';
const mock = vi.hoisted(() => ({ run: vi.fn(), release: vi.fn() }));
vi.mock('comlink', async (original) => {
  const actual = await original<typeof Comlink>();
  return {
    ...actual,
    wrap: () => ({ decodeLayer: mock.run, [actual.releaseProxy]: mock.release }),
  };
});
import { WorkerPool } from './pool';

class FakeWorker extends EventTarget {
  terminate = vi.fn();
}
const pools: WorkerPool[] = [];
afterEach(() => {
  for (const p of pools.splice(0)) p.dispose();
  vi.restoreAllMocks();
  mock.run.mockReset();
  mock.release.mockReset();
});
function setup() {
  const workers: FakeWorker[] = [];
  const pool = new WorkerPool(1, () => {
    const w = new FakeWorker();
    workers.push(w);
    return w as unknown as Worker;
  });
  pools.push(pool);
  return { pool, workers };
}

it('A12: synchronous dispatch failure settles once and the next job succeeds', async () => {
  mock.run
    .mockImplementationOnce(() => {
      throw new Error('postMessage failure');
    })
    .mockResolvedValueOnce('ok');
  const { pool } = setup();
  await expect(pool.decodeLayer(new ArrayBuffer(0))).rejects.toThrow('postMessage failure');
  expect(await pool.decodeLayer(new ArrayBuffer(0))).toBe('ok');
});

it('A12: cancelling a batch drains abort listeners before spawning any replacement worker', async () => {
  mock.run.mockReturnValue(new Promise(() => undefined));
  const { pool, workers } = setup();
  const parent = new AbortController();
  const controllers = Array.from({ length: 12 }, () => new AbortController());
  const jobs = controllers.map((controller) => {
    parent.signal.addEventListener(
      'abort',
      () => {
        controller.abort();
      },
      { once: true },
    );
    return observe(pool.decodeLayer(new ArrayBuffer(0), controller.signal));
  });
  parent.abort();
  await drain();
  for (const settled of jobs) expect(settled).toHaveBeenCalledOnce();
  expect(workers).toHaveLength(1);
  expect(workers[0].terminate).toHaveBeenCalledOnce();
});

it('A12: disposed pool refuses bitmap operations and closes untransferred inputs', async () => {
  const { pool } = setup();
  pool.dispose();
  const calls = [
    (b: ImageBitmap) => pool.encodeLayer(b),
    (b: ImageBitmap) => pool.encode(b, { type: 'image/png' }),
    (b: ImageBitmap) => pool.thumbnail(b, 8),
    (b: ImageBitmap) => pool.palette(b),
    (b: ImageBitmap) => pool.compressPixels(b),
    (b: ImageBitmap) => pool.alphaBounds(b),
    (b: ImageBitmap) => pool.encodeWebp(b, 0.8),
  ];
  for (const call of calls) {
    const close = vi.fn();
    await expect(call({ close } as unknown as ImageBitmap)).rejects.toHaveProperty(
      'name',
      'AbortError',
    );
    expect(close).toHaveBeenCalledOnce();
  }
  expect(mock.run).not.toHaveBeenCalled();
});
function pending() {
  let resolve!: (image: ImageData) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<ImageData>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function observe(promise: Promise<unknown>) {
  const settled = vi.fn();
  void promise.then(
    (v) => {
      settled('resolved', v);
    },
    (e: unknown) => {
      settled('rejected', e);
    },
  );
  return settled;
}
async function drain() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

it.each(['error', 'messageerror'])(
  'A12: %s settles active job, removes listeners and recovers queued work',
  async (event) => {
    const first = pending();
    mock.run.mockReturnValueOnce(first.promise).mockResolvedValueOnce('next');
    const { pool, workers } = setup();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const active = observe(pool.decodeLayer(new ArrayBuffer(0), controller.signal));
    const queued = observe(pool.decodeLayer(new ArrayBuffer(0)));
    workers[0].dispatchEvent(new Event(event));
    await drain();
    expect(active).toHaveBeenCalledOnce();
    expect(active.mock.calls[0]?.[0]).toBe('rejected');
    expect(queued).toHaveBeenCalledWith('resolved', 'next');
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    first.resolve('late' as unknown as ImageData);
    await drain();
    expect(active).toHaveBeenCalledOnce();
  },
);

it('A12: dispose rejects active and queued jobs exactly once and rejects future work', async () => {
  const first = pending();
  mock.run.mockReturnValue(first.promise);
  const { pool, workers } = setup();
  const a = observe(pool.decodeLayer(new ArrayBuffer(0)));
  const b = observe(pool.decodeLayer(new ArrayBuffer(0)));
  pool.dispose();
  pool.dispose();
  await drain();
  expect(a).toHaveBeenCalledWith('rejected', expect.objectContaining({ name: 'AbortError' }));
  expect(b).toHaveBeenCalledWith('rejected', expect.objectContaining({ name: 'AbortError' }));
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  const c = observe(pool.decodeLayer(new ArrayBuffer(0)));
  await drain();
  expect(c).toHaveBeenCalledWith('rejected', expect.objectContaining({ name: 'AbortError' }));
  first.resolve('late' as unknown as ImageData);
  await drain();
  expect(a).toHaveBeenCalledOnce();
});

it('A12: spawn failure rejects every attempted job and a later spawn can recover', async () => {
  let fail = true;
  const pool = new WorkerPool(1, () => {
    if (fail) throw new Error('spawn failed');
    return new FakeWorker() as unknown as Worker;
  });
  pools.push(pool);
  const a = observe(pool.decodeLayer(new ArrayBuffer(0)));
  await drain();
  expect(a).toHaveBeenCalledWith('rejected', expect.objectContaining({ message: 'spawn failed' }));
  fail = false;
  mock.run.mockResolvedValue('recovered');
  expect(await pool.decodeLayer(new ArrayBuffer(0))).toBe('recovered');
  expect(mock.run).toHaveBeenCalledOnce();
});

it('A12: pre-abort, queued abort, active abort, success and task rejection settle without retained abort listeners', async () => {
  const { pool } = setup();
  const first = pending();
  mock.run
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce('ok')
    .mockRejectedValueOnce(new Error('operation failed'));
  const pre = new AbortController();
  pre.abort();
  await expect(pool.decodeLayer(new ArrayBuffer(0), pre.signal)).rejects.toHaveProperty(
    'name',
    'AbortError',
  );
  const active = new AbortController();
  const queued = new AbortController();
  const removeActive = vi.spyOn(active.signal, 'removeEventListener');
  const removeQueued = vi.spyOn(queued.signal, 'removeEventListener');
  const a = observe(pool.decodeLayer(new ArrayBuffer(0), active.signal));
  const b = observe(pool.decodeLayer(new ArrayBuffer(0), queued.signal));
  queued.abort();
  active.abort();
  await drain();
  expect(a).toHaveBeenCalledOnce();
  expect(b).toHaveBeenCalledOnce();
  expect(removeActive).toHaveBeenCalledWith('abort', expect.any(Function));
  expect(removeQueued).toHaveBeenCalledWith('abort', expect.any(Function));
  const success = new AbortController();
  const removeSuccess = vi.spyOn(success.signal, 'removeEventListener');
  expect(await pool.decodeLayer(new ArrayBuffer(0), success.signal)).toBe('ok');
  expect(removeSuccess).toHaveBeenCalledWith('abort', expect.any(Function));
  await expect(pool.decodeLayer(new ArrayBuffer(0))).rejects.toThrow('operation failed');
});
