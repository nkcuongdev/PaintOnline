import type { Rect } from '../core/types';
import type { MemoryBudget } from '../memory/MemoryBudget';
import {
  createSurface,
  isAllocationError,
  type Canvas,
  type Ctx2D,
  type Surface,
} from '../memory/surfaces';
import { intersectRect, isEmptyRect } from '../utils/rect';

/** Ô hợp lệ của bề mặt dẫn xuất (px của chính bề mặt). */
const CELL = 256;

/**
 * Bề mặt dẫn xuất (Below/Above cache, mipmap — mục 5.2): kích thước cố định, thuộc hạng mục
 * `cache` của MemoryBudget, dựng LƯỜI theo từng ô 256 px — chỉ phần sắp được vẽ mới được tính, nên
 * dựng lại sau khi bị vô hiệu chỉ tốn bằng một frame vẽ trực tiếp. Có thể bị thu hồi bất cứ lúc
 * nào; Renderer luôn còn đường vẽ trực tiếp (cache không phải điều kiện đúng).
 */
export class DerivedSurface {
  private surface: Surface | null = null;
  private readonly valid: Uint8Array;
  private readonly cols: number;
  private readonly rows: number;
  private generation = 0;

  constructor(
    private readonly budget: MemoryBudget,
    readonly width: number,
    readonly height: number,
  ) {
    this.cols = Math.max(1, Math.ceil(width / CELL));
    this.rows = Math.max(1, Math.ceil(height / CELL));
    this.valid = new Uint8Array(this.cols * this.rows);
  }

  get allocated(): boolean {
    return this.surface !== null;
  }

  get canvas(): Canvas | null {
    return this.surface?.canvas ?? null;
  }

  get bytes(): number {
    return this.surface?.bytes ?? 0;
  }

  /** Tăng mỗi lần vô hiệu/giải phóng — việc dựng dần đang chờ biết nội dung đã đổi thì bỏ. */
  get version(): number {
    return this.generation;
  }

  /** Số ô chưa hợp lệ trong vùng (px của bề mặt) — quyết định dựng ngay hay dựng dần. */
  invalidCells(rect: Readonly<Rect>): number {
    if (!this.surface) return this.cellRange(rect).count;
    const { cx0, cy0, cx1, cy1 } = this.cellRange(rect);
    let n = 0;
    for (let cy = cy0; cy < cy1; cy++) {
      for (let cx = cx0; cx < cx1; cx++) if (!this.valid[cy * this.cols + cx]) n++;
    }
    return n;
  }

  /**
   * Dựng dần (lúc rảnh): tính từng ô chưa hợp lệ trong vùng cho tới hạn `deadline`
   * (performance.now()). Trả true khi vùng đã đủ — hoặc không cấp phát được (bỏ việc).
   */
  fillStep(
    rect: Readonly<Rect>,
    fill: (ctx: Ctx2D, area: Rect) => void,
    deadline: number,
  ): boolean {
    if (!this.surface && !this.allocate()) return true;
    const { cx0, cy0, cx1, cy1 } = this.cellRange(rect);
    for (let cy = cy0; cy < cy1; cy++) {
      for (let cx = cx0; cx < cx1; cx++) {
        if (this.valid[cy * this.cols + cx]) continue;
        if (performance.now() > deadline) return false;
        this.fillCells(cx, cy, cx + 1, cy + 1, fill);
      }
    }
    return true;
  }

  /**
   * Bảo đảm vùng `rect` (px của bề mặt) đã được tính; `fill` vẽ vùng còn thiếu (context đã xóa và
   * cắt theo vùng, ma trận đơn vị). Trả canvas, hoặc null nếu không cấp phát được (dùng đường trực
   * tiếp).
   */
  ensure(rect: Readonly<Rect>, fill: (ctx: Ctx2D, area: Rect) => void): Canvas | null {
    const r = intersectRect(rect, { x: 0, y: 0, width: this.width, height: this.height });
    if (!this.surface && !this.allocate()) return null;
    if (!this.surface) return null;
    if (isEmptyRect(r)) return this.surface.canvas;
    const cx0 = Math.floor(r.x / CELL);
    const cy0 = Math.floor(r.y / CELL);
    const cx1 = Math.ceil((r.x + r.width) / CELL);
    const cy1 = Math.ceil((r.y + r.height) / CELL);

    let allInvalid = true;
    let anyInvalid = false;
    for (let cy = cy0; cy < cy1; cy++) {
      for (let cx = cx0; cx < cx1; cx++) {
        if (this.valid[cy * this.cols + cx]) allInvalid = false;
        else anyInvalid = true;
      }
    }
    if (!anyInvalid) return this.surface.canvas;
    if (allInvalid) {
      // Trường hợp thường gặp sau khi vô hiệu: một lần vẽ cho cả vùng.
      this.fillCells(cx0, cy0, cx1, cy1, fill);
      return this.surface.canvas;
    }
    for (let cy = cy0; cy < cy1; cy++) {
      let cx = cx0;
      while (cx < cx1) {
        if (this.valid[cy * this.cols + cx]) {
          cx++;
          continue;
        }
        let end = cx;
        while (end < cx1 && !this.valid[cy * this.cols + end]) end++;
        this.fillCells(cx, cy, end, cy + 1, fill);
        cx = end;
      }
    }
    return this.surface.canvas;
  }

  /** Vô hiệu một vùng (px của bề mặt) hoặc toàn bộ. */
  invalidate(rect?: Readonly<Rect>): void {
    this.generation++;
    if (!rect) {
      this.valid.fill(0);
      return;
    }
    const r = intersectRect(rect, { x: 0, y: 0, width: this.width, height: this.height });
    if (isEmptyRect(r)) return;
    const cx0 = Math.floor(r.x / CELL);
    const cy0 = Math.floor(r.y / CELL);
    const cx1 = Math.ceil((r.x + r.width) / CELL);
    const cy1 = Math.ceil((r.y + r.height) / CELL);
    for (let cy = cy0; cy < cy1; cy++) {
      for (let cx = cx0; cx < cx1; cx++) this.valid[cy * this.cols + cx] = 0;
    }
  }

  release(): void {
    this.surface?.release();
    this.surface = null;
    this.valid.fill(0);
    this.generation++;
  }

  private allocate(): boolean {
    try {
      this.surface = createSurface(this.budget, this.width, this.height, 'cache');
    } catch (error) {
      if (!isAllocationError(error)) throw error;
      return false;
    }
    this.valid.fill(0);
    return true;
  }

  private cellRange(rect: Readonly<Rect>): {
    cx0: number;
    cy0: number;
    cx1: number;
    cy1: number;
    count: number;
  } {
    const r = intersectRect(rect, { x: 0, y: 0, width: this.width, height: this.height });
    if (isEmptyRect(r)) return { cx0: 0, cy0: 0, cx1: 0, cy1: 0, count: 0 };
    const cx0 = Math.floor(r.x / CELL);
    const cy0 = Math.floor(r.y / CELL);
    const cx1 = Math.ceil((r.x + r.width) / CELL);
    const cy1 = Math.ceil((r.y + r.height) / CELL);
    return { cx0, cy0, cx1, cy1, count: (cx1 - cx0) * (cy1 - cy0) };
  }

  private fillCells(
    cx0: number,
    cy0: number,
    cx1: number,
    cy1: number,
    fill: (ctx: Ctx2D, area: Rect) => void,
  ): void {
    const surface = this.surface;
    if (!surface) return;
    const area = intersectRect(
      { x: cx0 * CELL, y: cy0 * CELL, width: (cx1 - cx0) * CELL, height: (cy1 - cy0) * CELL },
      { x: 0, y: 0, width: this.width, height: this.height },
    );
    const ctx = surface.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(area.x, area.y, area.width, area.height);
    ctx.beginPath();
    ctx.rect(area.x, area.y, area.width, area.height);
    ctx.clip();
    fill(ctx, area);
    ctx.restore();
    for (let cy = cy0; cy < cy1; cy++) {
      for (let cx = cx0; cx < cx1; cx++) this.valid[cy * this.cols + cx] = 1;
    }
  }
}

/** Nguồn gốc của một chuỗi mipmap: canvas + vùng document mà nó phủ. */
export interface MipSource {
  /** Bảo đảm vùng (px của nguồn) hợp lệ rồi trả canvas; null nếu không dùng được. */
  ensure(rect: Readonly<Rect>): Canvas | null;
  width: number;
  height: number;
}

/**
 * Mipmap ½ và ¼ của một nguồn (layer hoặc cache) — mục 5.2. Mỗi mức là trung bình 2×2 của mức
 * trước (drawImage thu nhỏ đúng một nửa với lọc song tuyến = lọc hộp 2×2), dựng lười theo ô.
 */
export class MipChain {
  private readonly levels: DerivedSurface[] = [];

  constructor(
    private readonly budget: MemoryBudget,
    private readonly source: MipSource,
  ) {}

  /** Mức `level` (1 = ½, 2 = ¼): canvas với vùng `rect` (px của mức đó) đã hợp lệ. */
  ensure(level: 1 | 2, rect: Readonly<Rect>): Canvas | null {
    return this.level(level).ensure(rect, this.filler(level));
  }

  invalidCells(level: 1 | 2, rect: Readonly<Rect>): number {
    return this.level(level).invalidCells(rect);
  }

  version(level: 1 | 2): number {
    return this.level(level).version;
  }

  /** Dựng dần mức `level` trong vùng (xem DerivedSurface.fillStep). */
  fillStep(level: 1 | 2, rect: Readonly<Rect>, deadline: number): boolean {
    return this.level(level).fillStep(rect, this.filler(level), deadline);
  }

  private filler(level: 1 | 2): (ctx: Ctx2D, area: Rect) => void {
    return (ctx, area) => {
      const parentRect = {
        x: area.x * 2,
        y: area.y * 2,
        width: area.width * 2,
        height: area.height * 2,
      };
      const parent = level === 1 ? this.source.ensure(parentRect) : this.ensure(1, parentRect);
      if (!parent) return;
      const p = level === 1 ? this.source : this.level(1);
      const src = intersectRect(parentRect, { x: 0, y: 0, width: p.width, height: p.height });
      if (isEmptyRect(src)) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'low';
      ctx.drawImage(
        parent,
        src.x,
        src.y,
        src.width,
        src.height,
        src.x / 2,
        src.y / 2,
        src.width / 2,
        src.height / 2,
      );
    };
  }

  /** Vô hiệu vùng (px của nguồn) ở mọi mức, hoặc toàn bộ. */
  invalidate(rect?: Readonly<Rect>): void {
    this.levels.forEach((surface, i) => {
      if (!rect) {
        surface.invalidate();
        return;
      }
      const f = 2 ** (i + 1);
      const x = Math.floor(rect.x / f);
      const y = Math.floor(rect.y / f);
      surface.invalidate({
        x,
        y,
        width: Math.ceil((rect.x + rect.width) / f) - x,
        height: Math.ceil((rect.y + rect.height) / f) - y,
      });
    });
  }

  get bytes(): number {
    return this.levels.reduce((sum, l) => sum + l.bytes, 0);
  }

  release(): void {
    for (const level of this.levels) level.release();
  }

  private level(level: 1 | 2): DerivedSurface {
    let surface = this.levels.at(level - 1);
    if (!surface) {
      if (level === 2) this.level(1);
      const f = 2 ** level;
      surface = new DerivedSurface(
        this.budget,
        Math.ceil(this.source.width / f),
        Math.ceil(this.source.height / f),
      );
      this.levels[level - 1] = surface;
    }
    return surface;
  }
}
