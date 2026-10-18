import type { Rect, SurfaceCategory } from '../core/types';
import {
  alignOutRect,
  containsRect,
  inflateRect,
  intersectRect,
  isEmptyRect,
  roundOutRect,
} from '../utils/rect';
import type { MemoryBudget } from './MemoryBudget';
import {
  compressedBytes,
  inflatePixels,
  type Archivable,
  type CompressedPixels,
} from '../history/archive';
import { createSurface, type Ctx2D, type Surface } from './surfaces';

/** Lưới căn surface của layer (mục 5.4) — trùng kích thước tile history. */
export const SURFACE_GRID = 256;

/**
 * Surface chỉ phủ vùng có nội dung, căn theo bội số 256 px và không vượt khung document
 * (mục 5.4). Layer mới chưa có surface; vẽ ra ngoài thì surface nở ra.
 *
 * Interface công khai giữ ở mức `ensure(rect)` / `region(rect)` / đọc–ghi vùng để sau này có thể
 * thay hiện thực bằng tile thưa mà không đổi tool (mục 5.11).
 */
export class GrowableSurface implements Archivable {
  private current: Surface | null = null;
  private area: Rect | null = null;
  /** Nội dung đã nén (layer nằm trong history, không thuộc document — mục 5.6). */
  private packed: CompressedPixels | null = null;
  private revision = 0;

  constructor(
    private readonly budget: MemoryBudget,
    private docBounds: Rect,
    private category: SurfaceCategory = 'layer',
    /**
     * Biên dự phòng (px) khi phải nở: nở rộng hơn vùng cần để giảm số lần cấp phát lại + sao chép.
     * 0 cho layer (tiết kiệm bộ nhớ); stroke buffer dùng biên lớn vì nét thường lan rộng dần.
     */
    private readonly growthMargin = 0,
  ) {}

  /** Vị trí surface trong document; null = trống. */
  get bounds(): Readonly<Rect> | null {
    return this.area;
  }

  get surface(): Surface | null {
    return this.current;
  }

  get isEmpty(): boolean {
    return this.current === null && this.packed === null;
  }

  get bytes(): number {
    return this.current?.bytes ?? 0;
  }

  get archived(): boolean {
    return this.packed !== null;
  }

  /**
   * Bảo đảm surface phủ `rect` (cắt theo khung document). Trả false nếu rect nằm ngoài document.
   * Ném lỗi cấp phát nếu vượt ngân sách — surface cũ vẫn nguyên vẹn.
   */
  ensure(rect: Readonly<Rect>): boolean {
    this.unarchive();
    this.revision++;
    const wanted = intersectRect(alignOutRect(rect, SURFACE_GRID), this.docBounds);
    if (isEmptyRect(wanted)) return false;
    if (this.area && containsRect(this.area, wanted)) return true;

    const grown =
      this.growthMargin > 0
        ? intersectRect(
            alignOutRect(inflateRect(rect, this.growthMargin), SURFACE_GRID),
            this.docBounds,
          )
        : wanted;
    const next = this.area ? unionAligned(this.area, grown, this.docBounds) : grown;
    const surface = createSurface(this.budget, next.width, next.height, this.category);
    if (this.current && this.area) {
      surface.ctx.drawImage(this.current.canvas, this.area.x - next.x, this.area.y - next.y);
      this.current.release();
    }
    this.current = surface;
    this.area = next;
    return true;
  }

  /**
   * Context đã dịch gốc về tọa độ document. Gọi sau `ensure()`; trả null nếu chưa có surface.
   * Người gọi phải `restore()` (hàm trả về) để trả lại trạng thái context.
   */
  begin(): { ctx: Ctx2D; end: () => void } | null {
    if (!this.current || !this.area) return null;
    this.revision++;
    const ctx = this.current.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, -this.area.x, -this.area.y);
    return {
      ctx,
      end: () => {
        ctx.restore();
      },
    };
  }

  /** Nguồn vẽ cho một vùng document: canvas + tọa độ nguồn, hoặc null nếu vùng trống. */
  region(
    rect: Readonly<Rect>,
  ): { canvas: Surface['canvas']; sx: number; sy: number; rect: Rect } | null {
    if (!this.current || !this.area) return null;
    const r = intersectRect(rect, this.area);
    if (isEmptyRect(r)) return null;
    return { canvas: this.current.canvas, sx: r.x - this.area.x, sy: r.y - this.area.y, rect: r };
  }

  /**
   * Đọc pixel một vùng nguyên (tile history). Đọc thẳng vùng con trên context của layer: trên
   * Chromium có GPU, vẽ qua scratch `willReadFrequently` buộc đọc ngược cả texture và chậm hơn
   * ~7 lần (đo ở GĐ1). Trả null nếu vùng chưa có dữ liệu (trong suốt).
   */
  read(rect: Readonly<Rect>): ImageData | null {
    const src = this.region(rect);
    if (!src || !this.current) return null;
    // Đọc đúng vùng con từ chính context của layer (GPU chỉ trả về phần cần đọc).
    const part = this.current.ctx.getImageData(src.sx, src.sy, src.rect.width, src.rect.height);
    if (src.rect.width === rect.width && src.rect.height === rect.height) return part;
    const out = new ImageData(rect.width, rect.height);
    const ox = src.rect.x - rect.x;
    const oy = src.rect.y - rect.y;
    const rowBytes = src.rect.width * 4;
    for (let y = 0; y < src.rect.height; y++) {
      out.data.set(
        part.data.subarray(y * rowBytes, (y + 1) * rowBytes),
        ((oy + y) * rect.width + ox) * 4,
      );
    }
    return out;
  }

  /** Ghi lại pixel một vùng nguyên; `data = null` nghĩa là vùng trong suốt. */
  write(rect: Readonly<Rect>, data: ImageData | null): void {
    this.revision++;
    if (data === null) {
      if (!this.current || !this.area) return;
      const r = intersectRect(rect, this.area);
      if (isEmptyRect(r)) return;
      this.current.ctx.clearRect(r.x - this.area.x, r.y - this.area.y, r.width, r.height);
      return;
    }
    this.ensure(rect);
    if (!this.current || !this.area) return;
    this.current.ctx.putImageData(data, rect.x - this.area.x, rect.y - this.area.y);
  }

  /** Đổi khung document (crop/resize canvas ở GĐ5). Không đổi nội dung đang có. */
  setDocumentBounds(bounds: Readonly<Rect>): void {
    this.docBounds = { ...bounds };
  }

  /** Xóa nội dung một vùng (giữ nguyên surface để dùng lại). */
  erase(rect: Readonly<Rect>): void {
    if (!this.current || !this.area) return;
    this.revision++;
    const r = intersectRect(roundOutRect(inflateRect(rect, 1)), this.area);
    if (isEmptyRect(r)) return;
    this.current.ctx.clearRect(r.x - this.area.x, r.y - this.area.y, r.width, r.height);
  }

  clear(): void {
    this.release();
  }

  release(): void {
    this.current?.release();
    this.current = null;
    if (this.packed) this.budget.release(compressedBytes(this.packed), 'history');
    this.packed = null;
    this.area = null;
    this.revision++;
  }

  /** Ảnh chụp toàn surface để nén (Archivable) — chỉ dùng cho layer đã rời document. */
  snapshot(): ReturnType<Archivable['snapshot']> {
    const current = this.current;
    if (!current || !this.area) return null;
    return {
      band: (y, height) => createImageBitmap(current.canvas, 0, y, current.width, height),
      version: this.revision,
      width: current.width,
      height: current.height,
    };
  }

  /**
   * Đổi hạng mục ngân sách của surface (giữ nguyên nội dung): layer dựng tạm trong `temp` khi biến
   * đổi ảnh, chuyển sang `layer` khi đã vào document (ADR 0025).
   */
  recategorize(category: SurfaceCategory): void {
    if (category === this.category) return;
    this.current?.recategorize(category);
    this.category = category;
  }

  /** Thay surface trên GPU bằng bản nén (byte tính vào hạng mục history). */
  adopt(compressed: CompressedPixels, version: number): boolean {
    const current = this.current;
    if (!current || this.packed || version !== this.revision) return false;
    if (compressed.width !== current.width || compressed.height !== current.height) return false;
    const bytes = compressedBytes(compressed);
    if (bytes >= current.bytes || !this.budget.canReserve(bytes, 'history')) return false;
    this.budget.reserve(bytes, 'history');
    current.release();
    this.current = null;
    this.packed = compressed;
    return true;
  }

  /**
   * Giải nén về surface (đồng bộ) trước khi layer quay lại document. Ném lỗi cấp phát nếu không đủ
   * bộ nhớ — bản nén còn nguyên.
   */
  unarchive(): void {
    const packed = this.packed;
    if (!packed) return;
    const image = inflatePixels(packed);
    const surface = createSurface(this.budget, packed.width, packed.height, this.category);
    surface.ctx.putImageData(image, 0, 0);
    this.current = surface;
    this.packed = null;
    this.budget.release(compressedBytes(packed), 'history');
    this.revision++;
  }
}

function unionAligned(a: Readonly<Rect>, b: Readonly<Rect>, doc: Readonly<Rect>): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return intersectRect({ x, y, width: right - x, height: bottom - y }, doc);
}
