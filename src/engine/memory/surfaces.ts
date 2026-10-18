import type { SurfaceCategory } from '../core/types';
import { MemoryBudgetError, surfaceBytes, type MemoryBudget } from './MemoryBudget';

/**
 * Nơi duy nhất trong ứng dụng được tạo canvas (quy tắc 13.1.5). Mọi surface đi qua
 * MemoryBudget và được giải phóng bằng `release()` — đặt width = height = 0 vì Safari giữ
 * bộ nhớ canvas lâu nếu chỉ bỏ tham chiếu (mục 5.2).
 */

export type Canvas = OffscreenCanvas | HTMLCanvasElement;
export type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export class SurfaceAllocationError extends Error {
  constructor(width: number, height: number) {
    super(`Trình duyệt từ chối tạo canvas ${String(width)}×${String(height)}`);
    this.name = 'SurfaceAllocationError';
  }
}

export interface SurfaceOptions {
  /** Canvas DOM (display/overlay) thay vì OffscreenCanvas. */
  dom?: boolean;
  /** Chỉ dùng cho scratch đọc pixel (tile history) — cờ này ép render bằng CPU. */
  willReadFrequently?: boolean;
  /** Gợi ý giảm độ trễ hiển thị trên Chromium (mục 10.4). */
  desynchronized?: boolean;
}

function newCanvas(dom: boolean): Canvas {
  if (!dom && typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(1, 1);
  return document.createElement('canvas');
}

export class Surface {
  private w: number;
  private h: number;
  private isReleased = false;

  constructor(
    private readonly budget: MemoryBudget,
    readonly canvas: Canvas,
    readonly ctx: Ctx2D,
    width: number,
    height: number,
    private cat: SurfaceCategory,
  ) {
    this.w = width;
    this.h = height;
  }

  get category(): SurfaceCategory {
    return this.cat;
  }

  /** Chuyển bộ nhớ của surface sang hạng mục khác (không kiểm tra phần của hạng mục đích). */
  recategorize(category: SurfaceCategory): void {
    if (this.isReleased || category === this.cat) return;
    this.budget.transfer(this.bytes, this.cat, category);
    this.cat = category;
  }

  get width(): number {
    return this.w;
  }

  get height(): number {
    return this.h;
  }

  get bytes(): number {
    return surfaceBytes(this.w, this.h);
  }

  get released(): boolean {
    return this.isReleased;
  }

  /** Đổi kích thước (xóa nội dung). Giữ chỗ phần tăng thêm trước khi cấp phát. */
  resize(width: number, height: number): void {
    if (this.isReleased) throw new Error('Surface đã được giải phóng');
    const w = Math.max(1, Math.ceil(width));
    const h = Math.max(1, Math.ceil(height));
    if (w === this.w && h === this.h) return;
    const delta = surfaceBytes(w, h) - this.bytes;
    if (delta > 0) this.budget.reserve(delta, this.category);
    else this.budget.release(-delta, this.category);
    this.canvas.width = w;
    this.canvas.height = h;
    this.w = w;
    this.h = h;
  }

  clear(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  release(): void {
    if (this.isReleased) return;
    this.isReleased = true;
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.budget.release(this.bytes, this.category);
    this.budget.trackSurface(-1);
  }
}

function tryAllocate(
  w: number,
  h: number,
  options: SurfaceOptions,
): { canvas: Canvas; ctx: Ctx2D } | null {
  let canvas: Canvas | null = null;
  try {
    canvas = newCanvas(options.dom === true);
    canvas.width = w;
    canvas.height = h;
    const attrs: CanvasRenderingContext2DSettings = {
      willReadFrequently: options.willReadFrequently === true,
      desynchronized: options.desynchronized === true,
    };
    // Hợp kiểu OffscreenCanvas | HTMLCanvasElement làm getContext trả về union rộng hơn thực tế.
    const context: unknown = canvas.getContext('2d', attrs);
    const ctx = context as Ctx2D | null;
    if (ctx) return { canvas, ctx };
  } catch {
    // Trình duyệt từ chối: xử lý như getContext trả null.
  }
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }
  return null;
}

/**
 * Tạo surface đã được tính vào ngân sách. Ném MemoryBudgetError nếu vượt ngân sách,
 * SurfaceAllocationError nếu trình duyệt từ chối (getContext trả null — Safari làm vậy khi vượt
 * giới hạn canvas). Lỗi cấp phát thực tế được coi như hết ngân sách: chạy chuỗi thu hồi, thử lại
 * một lần rồi mới từ chối (mục 5.11).
 */
export function createSurface(
  budget: MemoryBudget,
  width: number,
  height: number,
  category: SurfaceCategory,
  options: SurfaceOptions = {},
): Surface {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  const bytes = surfaceBytes(w, h);
  budget.reserve(bytes, category);

  let allocated = tryAllocate(w, h, options);
  if (!allocated) {
    budget.reclaim(bytes, category, true);
    allocated = tryAllocate(w, h, options);
  }
  if (!allocated) {
    budget.release(bytes, category);
    throw new SurfaceAllocationError(w, h);
  }
  budget.trackSurface(1);
  return new Surface(budget, allocated.canvas, allocated.ctx, w, h, category);
}

export function isAllocationError(
  error: unknown,
): error is MemoryBudgetError | SurfaceAllocationError {
  return error instanceof MemoryBudgetError || error instanceof SurfaceAllocationError;
}

/**
 * Pool surface tạm (scratch) tái sử dụng giữa các frame và thao tác — tránh cấp phát canvas
 * trong vòng lặp nóng (mục 11.3).
 */
export class ScratchPool {
  private readonly free: Surface[] = [];
  private readonly inUse = new Set<Surface>();

  constructor(
    private readonly budget: MemoryBudget,
    private readonly options: SurfaceOptions = {},
    private readonly maxFree = 2,
  ) {}

  /** Lấy surface ≥ w × h; nội dung không xác định — người dùng tự xóa vùng cần dùng. */
  acquire(width: number, height: number): Surface {
    const w = Math.max(1, Math.ceil(width));
    const h = Math.max(1, Math.ceil(height));
    let best = -1;
    for (let i = 0; i < this.free.length; i++) {
      const s = this.free[i];
      if (s.width >= w && s.height >= h) {
        const bestSurface = best >= 0 ? this.free[best] : undefined;
        if (!bestSurface || s.bytes < bestSurface.bytes) best = i;
      }
    }
    let surface: Surface;
    if (best >= 0) {
      surface = this.free.splice(best, 1)[0];
    } else {
      // Làm tròn lên bội số 64 để tái sử dụng được cho vùng bẩn có kích thước dao động.
      const rw = Math.ceil(w / 64) * 64;
      const rh = Math.ceil(h / 64) * 64;
      surface = createSurface(this.budget, rw, rh, 'temp', this.options);
    }
    surface.ctx.setTransform(1, 0, 0, 1, 0, 0);
    surface.ctx.globalAlpha = 1;
    surface.ctx.globalCompositeOperation = 'source-over';
    this.inUse.add(surface);
    return surface;
  }

  release(surface: Surface): void {
    if (!this.inUse.delete(surface)) return;
    this.free.push(surface);
    this.free.sort((a, b) => b.bytes - a.bytes);
    while (this.free.length > this.maxFree) this.free.pop()?.release();
  }

  /** Giải phóng mọi surface rảnh (khi tab ẩn hoặc thiếu bộ nhớ). */
  trim(): void {
    for (const s of this.free) s.release();
    this.free.length = 0;
  }

  dispose(): void {
    this.trim();
    for (const s of this.inUse) s.release();
    this.inUse.clear();
  }
}
