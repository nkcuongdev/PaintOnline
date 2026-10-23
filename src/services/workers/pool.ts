import { releaseProxy, transfer, wrap, type Remote } from 'comlink';
import type {
  Color,
  FilterRequest,
  FloodFillRequest,
  FloodFillResult,
  MaskRequest,
  MaskResult,
  Rect,
  WorkerClient,
} from '@/engine/core/types';
import type { DecodeOptions, EncodeOptions, FillRect, ImageCodec, ZipEntry } from './codec';
import { ZipError } from './ops/zipError';

/** Codec chạy trên main thread — chỉ tải khi Worker không có OffscreenCanvas (WebKit cũ). */
function mainThread(): Promise<ImageCodec> {
  return import('./codec').then((module) => module.mainThreadCodec);
}
import type { ImageWorkerApi } from './image.worker';
import type * as SelectionOps from './ops/selection';

/** Hàm vùng chọn/biến đổi chạy trên main thread — chỉ tải khi Worker không có OffscreenCanvas. */
function selectionOps(): Promise<typeof SelectionOps> {
  return import('./ops/selection');
}

interface Slot {
  worker: Worker;
  api: Remote<ImageWorkerApi>;
  active: Job | null;
  onError: EventListener;
}

interface Job {
  run: (api: Remote<ImageWorkerApi>) => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
  settled: boolean;
}

/** Số Worker: số nhân − 1, trong khoảng 2–4 (mục 5.8). */
export function poolSize(hardwareConcurrency: number | undefined): number {
  return Math.max(2, Math.min(4, (hardwareConcurrency ?? 4) - 1));
}

function abortError(): DOMException {
  return new DOMException('Đã hủy', 'AbortError');
}

/**
 * Pool 2–4 Worker giao tiếp qua comlink (mục 5.8). Worker được tạo lười khi có việc; hàng đợi
 * FIFO khi mọi Worker đều bận. Hủy một tác vụ đang chạy = dừng hẳn Worker đó (Worker không giữ
 * state nên tạo lại an toàn); tác vụ chưa chạy chỉ bị bỏ khỏi hàng đợi.
 */
export class WorkerPool implements WorkerClient, ImageCodec {
  private readonly slots: Slot[] = [];
  private readonly queue: Job[] = [];
  /** Worker không có OffscreenCanvas (WebKit cũ): mã hóa chạy trên main thread (mục 11.4). */
  private workerCanvas = true;
  private disposed = false;

  constructor(
    private readonly size = poolSize(
      typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined,
    ),
    private readonly spawn: () => Worker = () =>
      new Worker(new URL('./image.worker.ts', import.meta.url), {
        type: 'module',
        name: 'paint-image',
      }),
  ) {}

  get concurrency(): number {
    return this.size;
  }

  floodFill(request: FloodFillRequest, signal?: AbortSignal): Promise<FloodFillResult | null> {
    return this.enqueue(
      (api) => api.floodFill(transfer(request, [request.data.buffer])),
      signal,
    ) as Promise<FloodFillResult | null>;
  }

  /** Pipeline filter (mục 5.8): thuần JS trên dữ liệu pixel, không cần canvas. */
  applyFilter(
    request: FilterRequest,
    signal?: AbortSignal,
  ): Promise<Uint8ClampedArray<ArrayBuffer>> {
    return this.enqueue(
      (api) => api.applyFilter(transfer(request, [request.data.buffer])),
      signal,
    ) as Promise<Uint8ClampedArray<ArrayBuffer>>;
  }

  /** Dựng mask vùng chọn (mục 5.7): cần canvas để vẽ hình; không có thì chạy trên main thread. */
  buildMask(request: MaskRequest): Promise<MaskResult | null> {
    const buffers: ArrayBuffer[] = [];
    for (const operand of [request.base, request.operand]) {
      if (operand?.kind === 'mask') buffers.push(operand.mask.data.buffer as ArrayBuffer);
    }
    return this.withCanvas(
      (api) => api.buildMask(transfer(request, buffers)),
      async () => (await selectionOps()).buildMask(request),
    );
  }

  /** Hình bao vùng có pixel của ảnh (Trim). */
  alphaBounds(bitmap: ImageBitmap): Promise<Rect | null> {
    return this.withCanvas(
      (api) => api.alphaBounds(transfer(bitmap, [bitmap])),
      async () => (await selectionOps()).bitmapAlphaBounds(bitmap),
    ).finally(() => {
      bitmap.close();
    });
  }

  /**
   * Nén pixel history cũ (mục 5.6). Chỉ chạy trong Worker có OffscreenCanvas — trên main thread
   * việc đọc pixel sẽ chặn UI, nên khi không có thì từ chối (history giữ nguyên dạng GPU).
   */
  async compressPixels(bitmap: ImageBitmap): Promise<Uint8Array> {
    try {
      this.checkActive();
      if (this.workerCanvas && !(await this.probeWorkerCanvas())) this.workerCanvas = false;
      this.checkActive();
      if (!this.workerCanvas) {
        throw new Error('Worker không có OffscreenCanvas');
      }
      return await (this.enqueue((api) =>
        api.compressPixels(transfer(bitmap, [bitmap])),
      ) as Promise<Uint8Array>);
    } finally {
      bitmap.close();
    }
  }

  encode(bitmap: ImageBitmap, options: EncodeOptions): Promise<Blob> {
    return this.withCanvas(
      (api) => api.encode(transfer(bitmap, [bitmap]), options),
      async () => (await mainThread()).encode(bitmap, options),
    ).finally(() => {
      bitmap.close();
    });
  }

  thumbnail(bitmap: ImageBitmap, maxSide: number): Promise<Blob> {
    return this.withCanvas(
      (api) => api.thumbnail(transfer(bitmap, [bitmap]), maxSide),
      async () => (await mainThread()).thumbnail(bitmap, maxSide),
    ).finally(() => {
      bitmap.close();
    });
  }

  palette(bitmap: ImageBitmap): Promise<Color[]> {
    return this.withCanvas(
      (api) => api.palette(transfer(bitmap, [bitmap])),
      async () => (await mainThread()).palette(bitmap),
    ).finally(() => {
      bitmap.close();
    });
  }

  decode(blob: Blob, options: DecodeOptions, signal?: AbortSignal): Promise<ImageBitmap> {
    return this.enqueue((api) => api.decode(blob, options), signal) as Promise<ImageBitmap>;
  }

  encodeLayer(bitmap: ImageBitmap): Promise<ArrayBuffer> {
    return this.withCanvas(
      (api) => api.encodeLayer(transfer(bitmap, [bitmap])),
      async () => (await mainThread()).encodeLayer(bitmap),
    ).finally(() => {
      bitmap.close();
    });
  }

  decodeLayer(png: ArrayBuffer, signal?: AbortSignal): Promise<ImageData> {
    // PNG do app ghi được giải mã thuần JS (không cần canvas). Buffer được sao chép sang Worker.
    return this.enqueue((api) => api.decodeLayer(png), signal) as Promise<ImageData>;
  }

  fillLayerRects(png: ArrayBuffer, rects: FillRect[]): Promise<ArrayBuffer> {
    return this.enqueue((api) => api.fillLayerRects(png, rects)) as Promise<ArrayBuffer>;
  }

  encodeWebp(bitmap: ImageBitmap, quality: number): Promise<Blob> {
    return this.withCanvas(
      (api) => api.encodeWebp(transfer(bitmap, [bitmap]), quality),
      async () => (await mainThread()).encodeWebp(bitmap, quality),
    ).finally(() => {
      bitmap.close();
    });
  }

  zip(entries: ZipEntry[]): Promise<Uint8Array> {
    return this.enqueue((api) =>
      api.zip(
        transfer(
          entries,
          entries.map((e) => e.data.buffer as ArrayBuffer),
        ),
      ),
    ) as Promise<Uint8Array>;
  }

  async unzip(data: Uint8Array, accept: RegExp): Promise<Map<string, Uint8Array>> {
    const result = (await this.enqueue((api) =>
      api.unzip(transfer(data, [data.buffer as ArrayBuffer]), accept.source),
    )) as Awaited<ReturnType<ImageWorkerApi['unzip']>>;
    if (!result.ok) throw new ZipError(result.code);
    return new Map(Object.entries(result.files));
  }

  /**
   * Việc cần OffscreenCanvas: chạy trong Worker nếu Worker có canvas (kiểm tra một lần, rẻ),
   * nếu không thì chạy trên main thread (mục 11.4).
   */
  private async withCanvas<T>(
    run: (api: Remote<ImageWorkerApi>) => Promise<T>,
    fallback: () => Promise<T>,
  ): Promise<T> {
    this.checkActive();
    if (this.workerCanvas && !(await this.probeWorkerCanvas())) this.workerCanvas = false;
    this.checkActive();
    if (!this.workerCanvas) return fallback();
    return this.enqueue(run) as Promise<T>;
  }

  private canvasProbe: Promise<boolean> | null = null;

  private checkActive(): void {
    if (this.disposed) throw abortError();
  }

  private probeWorkerCanvas(): Promise<boolean> {
    this.canvasProbe ??= (this.enqueue((api) => api.hasCanvas()) as Promise<boolean>).catch(
      () => false,
    );
    return this.canvasProbe;
  }

  /** Dừng mọi Worker (đóng app, test). */
  dispose(): void {
    this.disposed = true;
    for (const job of this.queue.splice(0)) this.settle(job, false, abortError());
    for (const slot of [...this.slots]) {
      if (slot.active) this.settle(slot.active, false, abortError());
      this.destroy(slot);
    }
  }

  private enqueue(run: Job['run'], signal?: AbortSignal): Promise<unknown> {
    if (this.disposed || signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const job: Job = { run, resolve, reject, signal, settled: false };
      job.onAbort = () => {
        const index = this.queue.indexOf(job);
        if (index >= 0) this.queue.splice(index, 1);
        const slot = this.slots.find((s) => s.active === job);
        this.settle(job, false, abortError());
        if (slot) this.destroy(slot);
        // One navigation can abort many layer decodes. Drain all abort listeners
        // before replacing slots, so queued jobs in the same batch never spawn.
        queueMicrotask(() => {
          this.pump();
        });
      };
      signal?.addEventListener('abort', job.onAbort, { once: true });
      this.queue.push(job);
      this.pump();
    });
  }

  private pump(): void {
    while (!this.disposed && this.queue.length > 0) {
      let slot: Slot | null;
      try {
        slot = this.freeSlot();
      } catch (error) {
        const job = this.queue.shift();
        if (job) this.settle(job, false, error);
        continue;
      }
      if (!slot) return;
      const job = this.queue.shift();
      if (job) this.start(slot, job);
    }
  }

  private freeSlot(): Slot | null {
    const free = this.slots.find((s) => !s.active);
    if (free) return free;
    if (this.slots.length >= this.size) return null;
    const worker = this.spawn();
    const slot: Slot = {
      worker,
      api: wrap<ImageWorkerApi>(worker),
      active: null,
      onError: (event) => {
        event.preventDefault();
        if (slot.active) this.settle(slot.active, false, new Error('Image worker failed'));
        this.destroy(slot);
        this.pump();
      },
    };
    worker.addEventListener('error', slot.onError);
    worker.addEventListener('messageerror', slot.onError);
    this.slots.push(slot);
    return slot;
  }

  private start(slot: Slot, job: Job): void {
    slot.active = job;
    const finish = (ok: boolean, value: unknown) => {
      if (job.settled) return;
      this.settle(job, ok, value);
      slot.active = null;
      this.pump();
    };
    // Comlink may also throw synchronously (serialization/postMessage failures).
    try {
      job.run(slot.api).then(
        (value) => {
          finish(true, value);
        },
        (error: unknown) => {
          finish(false, error);
        },
      );
    } catch (error) {
      finish(false, error);
    }
  }

  private settle(job: Job, ok: boolean, value: unknown): void {
    if (job.settled) return;
    job.settled = true;
    if (job.onAbort) job.signal?.removeEventListener('abort', job.onAbort);
    if (ok) job.resolve(value);
    else job.reject(value);
  }

  private destroy(slot: Slot): void {
    const index = this.slots.indexOf(slot);
    if (index < 0) return;
    this.slots.splice(index, 1);
    slot.worker.removeEventListener('error', slot.onError);
    slot.worker.removeEventListener('messageerror', slot.onError);
    slot.active = null;
    try {
      slot.api[releaseProxy]();
    } catch {
      // A crashed endpoint may no longer accept Comlink's release message.
    } finally {
      slot.worker.terminate();
    }
  }
}

let shared: WorkerPool | null = null;

/** Pool dùng chung cho cả app (một tab chỉ cần một pool). */
export function sharedWorkerPool(): WorkerPool {
  shared ??= new WorkerPool();
  return shared;
}
