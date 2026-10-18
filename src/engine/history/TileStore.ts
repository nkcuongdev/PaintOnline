import type { Rect } from '../core/types';
import type { MemoryBudget } from '../memory/MemoryBudget';
import { createSurface, type Canvas, type Ctx2D, type Surface } from '../memory/surfaces';
import { compressedBytes, inflatePixels, type Archivable, type CompressedPixels } from './archive';
import { TILE_SIZE } from './tiles';

/** Số ô tile mỗi hàng của atlas (atlas rộng 2048 px). */
const COLUMNS = 8;

/**
 * Kho tile history nằm trên GPU (ADR 0016): mỗi tile 256×256 là một ô trong một canvas "atlas".
 * Sao chép tile giữa layer và atlas bằng `drawImage` ở tọa độ nguyên, không co giãn — GPU sao chép
 * nguyên giá trị premultiplied nên undo/redo chính xác từng pixel, và KHÔNG có lần đọc pixel
 * GPU → CPU nào (trên Firefox mỗi lần `getImageData` một tile tốn 13–83 ms — đo ở GĐ1).
 *
 * Bộ nhớ thuộc hạng mục `history` của MemoryBudget; khi thiếu chỗ, gọi `makeRoom` để History bỏ
 * bước cũ nhất trước khi cấp phát. Bước cũ (hơn 10 bước) được nén zlib trong Worker (`adopt`) và
 * giải nén đồng bộ khi undo/redo tới (`inflate`) — mục 5.6.
 */
export class TileStore implements Archivable {
  private surface: Surface | null = null;
  private rows = 0;
  private used = 0;
  private compressed: CompressedPixels | null = null;
  private compressedBytes = 0;
  private revision = 0;

  constructor(
    private readonly budget: MemoryBudget,
    private readonly makeRoom: (bytes: number) => boolean,
  ) {}

  get bytes(): number {
    return this.surface?.bytes ?? this.compressedBytes;
  }

  get slotCount(): number {
    return this.used;
  }

  get archived(): boolean {
    return this.compressed !== null;
  }

  /** Bảo đảm còn chỗ cho thêm `count` ô — cấp phát một lần khi đã biết trước số tile. */
  reserve(count: number): void {
    this.inflate();
    const needed = Math.ceil((this.used + count) / COLUMNS);
    if (needed > this.rows) this.grow(needed - this.rows);
  }

  /** Cấp một ô trống; nở atlas (×1,5 số hàng) khi đầy. */
  allocate(): number {
    this.inflate();
    if (this.used >= this.rows * COLUMNS) this.grow(Math.max(1, Math.ceil(this.rows * 1.5)));
    this.revision++;
    return this.used++;
  }

  /** Chép một vùng nguồn (tọa độ nguồn sx, sy) vào ô; phần ngoài vùng nguồn là trong suốt. */
  store(
    slot: number,
    source: Canvas | null,
    sx: number,
    sy: number,
    dx: number,
    dy: number,
    w: number,
    h: number,
  ): void {
    const ctx = this.context();
    const { x, y } = slotOrigin(slot);
    ctx.clearRect(x, y, TILE_SIZE, TILE_SIZE);
    if (source && w > 0 && h > 0) ctx.drawImage(source, sx, sy, w, h, x + dx, y + dy, w, h);
    this.revision++;
  }

  /** Vẽ nội dung ô (kích thước `rect`) vào đích tại `rect` — đích phải được xóa trước. */
  drawTo(slot: number, target: Ctx2D, rect: Readonly<Rect>): void {
    this.inflate();
    const canvas = this.surface?.canvas;
    if (!canvas) return;
    const { x, y } = slotOrigin(slot);
    target.drawImage(
      canvas,
      x,
      y,
      rect.width,
      rect.height,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
    );
  }

  /** Ảnh chụp phần atlas đang dùng để nén trong Worker (Archivable). */
  snapshot(): ReturnType<Archivable['snapshot']> {
    const surface = this.surface;
    if (!surface || this.used === 0) return null;
    const width = COLUMNS * TILE_SIZE;
    const height = Math.ceil(this.used / COLUMNS) * TILE_SIZE;
    return {
      band: (y, rows) => createImageBitmap(surface.canvas, 0, y, width, rows),
      version: this.revision,
      width,
      height,
    };
  }

  /** Nhận bản nén: giải phóng atlas trên GPU, giữ byte nén trong hạng mục history. */
  adopt(compressed: CompressedPixels, version: number): boolean {
    if (!this.surface || this.compressed || version !== this.revision) return false;
    const bytes = compressedBytes(compressed);
    if (bytes >= this.surface.bytes || !this.budget.canReserve(bytes, 'history')) return false;
    this.budget.reserve(bytes, 'history');
    this.surface.release();
    this.surface = null;
    this.compressed = compressed;
    this.compressedBytes = bytes;
    return true;
  }

  /** Giải nén về atlas trên GPU (đồng bộ). Ném lỗi cấp phát nếu không đủ bộ nhớ — bản nén còn nguyên. */
  inflate(): void {
    const compressed = this.compressed;
    if (!compressed) return;
    const image = inflatePixels(compressed);
    const width = COLUMNS * TILE_SIZE;
    const height = this.rows * TILE_SIZE;
    if (!this.budget.canReserve(width * height * 4, 'history')) this.makeRoom(width * height * 4);
    const surface = createSurface(this.budget, width, height, 'history');
    surface.ctx.imageSmoothingEnabled = false;
    surface.ctx.putImageData(image, 0, 0);
    this.surface = surface;
    this.compressed = null;
    this.budget.release(this.compressedBytes, 'history');
    this.compressedBytes = 0;
  }

  release(): void {
    this.surface?.release();
    this.surface = null;
    if (this.compressed) this.budget.release(this.compressedBytes, 'history');
    this.compressed = null;
    this.compressedBytes = 0;
    this.rows = 0;
    this.used = 0;
    this.revision++;
  }

  private context(): Ctx2D {
    this.inflate();
    const ctx = this.surface?.ctx;
    if (!ctx) throw new Error('TileStore chưa cấp phát');
    return ctx;
  }

  private grow(rows: number): void {
    const nextRows = this.rows + rows;
    const width = COLUMNS * TILE_SIZE;
    const height = nextRows * TILE_SIZE;
    const extra = width * height * 4 - this.bytes;
    if (!this.budget.canReserve(extra, 'history')) this.makeRoom(extra);
    const next = createSurface(this.budget, width, height, 'history');
    next.ctx.imageSmoothingEnabled = false;
    if (this.surface) {
      next.ctx.drawImage(this.surface.canvas, 0, 0);
      this.surface.release();
    }
    this.surface = next;
    this.rows = nextRows;
    this.revision++;
  }
}

function slotOrigin(slot: number): { x: number; y: number } {
  return { x: (slot % COLUMNS) * TILE_SIZE, y: Math.floor(slot / COLUMNS) * TILE_SIZE };
}
