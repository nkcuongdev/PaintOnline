import type {
  MaskData,
  MaskOperand,
  MaskResult,
  Point,
  Rect,
  SelectionShape,
  SelectionSummary,
} from '../core/types';
import type { MemoryBudget } from '../memory/MemoryBudget';
import { createSurface, type Ctx2D, type ScratchPool, type Surface } from '../memory/surfaces';
import type { SelectionCoverage } from '../tools/types';
import { intersectRect, isEmptyRect, roundOutRect } from '../utils/rect';
import { MASK_THRESHOLD, maskAt } from './maskOps';
import { shapeBounds, shapeContains, shapeOutline, traceShape, translateShape } from './shape';

/** Ảnh alpha của mask trên GPU: ImageBitmap dựng trong Worker, hoặc surface dựng tại chỗ. */
type MaskImage = { kind: 'bitmap'; bitmap: ImageBitmap } | { kind: 'surface'; surface: Surface };

/**
 * Vùng chọn (mục 5.7, 6.3 `SelectionState`): chữ nhật, ellipse, Lasso không làm mềm chỉ giữ path;
 * mask raster (kích thước bằng hình bao vùng chọn, không phải cả document) chỉ có khi cần — Magic
 * Wand, làm mềm biên, bỏ khử răng cưa, hoặc kết hợp nhiều vùng. Giá trị bất biến: mọi thay đổi tạo
 * vùng chọn mới; vùng cũ được `dispose()` để trả bộ nhớ của mask.
 */
export class Selection implements SelectionCoverage {
  private disposed = false;
  private flatOutline: Float32Array[] | null = null;

  private constructor(
    readonly bounds: Rect,
    readonly shape: SelectionShape | null,
    readonly mask: MaskData | null,
    private image: MaskImage | null,
    private readonly outlineData: Float32Array[] | null,
    private readonly budget: MemoryBudget | null,
    private readonly reserved: number,
  ) {}

  /** Vùng chọn dạng path, cắt theo khung document. Null nếu không chứa pixel nào. */
  static fromShape(shape: SelectionShape, doc: Readonly<Rect>): Selection | null {
    const bounds = intersectRect(roundOutRect(shapeBounds(shape)), doc);
    if (isEmptyRect(bounds)) return null;
    return new Selection(bounds, shape, null, null, null, null, 0);
  }

  /**
   * Vùng chọn dạng mask từ kết quả của Worker. Ảnh alpha trên GPU tính vào ngân sách (`temp`); ném
   * lỗi cấp phát nếu thiếu chỗ (người gọi từ chối thao tác).
   */
  static fromMask(result: MaskResult, budget: MemoryBudget): Selection {
    const { mask } = result;
    const bytes = mask.bounds.width * mask.bounds.height * 4;
    let image: MaskImage;
    if (result.bitmap) {
      budget.reserve(bytes, 'temp');
      image = { kind: 'bitmap', bitmap: result.bitmap };
    } else {
      image = { kind: 'surface', surface: maskSurface(mask, budget) };
    }
    return new Selection(
      { ...mask.bounds },
      null,
      mask,
      image,
      result.outline,
      budget,
      result.bitmap ? bytes : 0,
    );
  }

  get kind(): SelectionSummary['shape'] {
    return this.shape?.kind ?? 'mask';
  }

  /** Điểm (document) có nằm trong vùng chọn không (để bắt đầu kéo pixel). */
  contains(p: Readonly<Point>): boolean {
    const b = this.bounds;
    if (p.x < b.x || p.y < b.y || p.x >= b.x + b.width || p.y >= b.y + b.height) return false;
    if (this.shape) return shapeContains(this.shape, p);
    return this.mask ? maskAt(this.mask, p.x, p.y) >= MASK_THRESHOLD : false;
  }

  /** Vẽ độ phủ (đen, alpha = mức được chọn) — dùng với `destination-in/out`. */
  cover(ctx: Ctx2D): void {
    if (this.shape) {
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      traceShape(ctx, this.shape);
      ctx.fill('nonzero');
      ctx.restore();
      return;
    }
    const source = this.maskSource();
    if (source) ctx.drawImage(source, this.bounds.x, this.bounds.y);
  }

  /**
   * Tô vùng chọn bằng màu (CSS) lên context đặt ma trận document: path thì tô thẳng; mask thì tô
   * màu lên bản sao mask (`source-in`) rồi ghép.
   */
  paint(ctx: Ctx2D, css: string, scratch: ScratchPool): void {
    if (this.shape) {
      ctx.save();
      ctx.fillStyle = css;
      ctx.beginPath();
      traceShape(ctx, this.shape);
      ctx.fill('nonzero');
      ctx.restore();
      return;
    }
    const source = this.maskSource();
    if (!source) return;
    const { width, height, x, y } = this.bounds;
    const tmp = scratch.acquire(width, height);
    try {
      const s = tmp.ctx;
      s.clearRect(0, 0, width, height);
      s.drawImage(source, 0, 0);
      s.globalCompositeOperation = 'source-in';
      s.fillStyle = css;
      s.fillRect(0, 0, width, height);
      ctx.drawImage(tmp.canvas, 0, 0, width, height, x, y, width, height);
    } finally {
      scratch.release(tmp);
    }
  }

  /** Dữ liệu gửi sang Worker khi kết hợp với vùng chọn mới (bản sao: mask gốc vẫn dùng ở đây). */
  operand(): MaskOperand {
    if (this.shape) return { kind: 'shape', shape: this.shape };
    const mask = this.mask ?? { bounds: this.bounds, data: new Uint8Array(0) };
    return { kind: 'mask', mask: { bounds: { ...mask.bounds }, data: mask.data.slice() } };
  }

  /** Viền marching ants: các đường khép kín (x, y xen kẽ, document). */
  outline(): readonly Float32Array[] {
    if (this.outlineData) return this.outlineData;
    if (!this.flatOutline) {
      const points = this.shape ? shapeOutline(this.shape) : [];
      this.flatOutline = [Float32Array.from(points.flatMap((p) => [p.x, p.y]))];
    }
    return this.flatOutline;
  }

  /**
   * Vùng chọn dời đi (dx, dy) — sau khi di chuyển pixel, cắt xén, đổi khung. Mask dùng chung dữ
   * liệu với vùng cũ: vùng cũ không còn dùng được sau lời gọi này (quyền sở hữu chuyển sang).
   */
  moved(dx: number, dy: number, doc: Readonly<Rect>): Selection | null {
    if (this.shape) {
      const next = Selection.fromShape(translateShape(this.shape, dx, dy), doc);
      this.dispose();
      return next;
    }
    const mask = this.mask;
    if (!mask || !Number.isInteger(dx) || !Number.isInteger(dy)) {
      this.dispose();
      return null;
    }
    const bounds = { ...mask.bounds, x: mask.bounds.x + dx, y: mask.bounds.y + dy };
    const outline = (this.outlineData ?? []).map((line) => {
      const out = new Float32Array(line.length);
      for (let i = 0; i < line.length; i += 2) {
        out[i] = (line[i] ?? 0) + dx;
        out[i + 1] = (line[i + 1] ?? 0) + dy;
      }
      return out;
    });
    const next = new Selection(
      bounds,
      null,
      { bounds, data: mask.data },
      this.image,
      outline,
      this.budget,
      this.reserved,
    );
    // Ảnh mask chuyển sang vùng mới; vùng cũ chỉ đánh dấu đã hủy.
    this.image = null;
    this.disposed = true;
    if (isEmptyRect(intersectRect(bounds, doc))) {
      next.dispose();
      return null;
    }
    return next;
  }

  summary(floating: boolean): SelectionSummary {
    return { bounds: { ...this.bounds }, shape: this.kind, floating };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const image = this.image;
    this.image = null;
    if (image?.kind === 'bitmap') {
      image.bitmap.close();
      this.budget?.release(this.reserved, 'temp');
    } else if (image?.kind === 'surface') {
      image.surface.release();
    }
  }

  private maskSource(): CanvasImageSource | null {
    const image = this.image;
    if (!image) return null;
    return image.kind === 'bitmap' ? image.bitmap : image.surface.canvas;
  }
}

/** Ảnh alpha của mask dựng trên main thread (khi Worker không trả ImageBitmap). */
function maskSurface(mask: MaskData, budget: MemoryBudget): Surface {
  const { width, height } = mask.bounds;
  const surface = createSurface(budget, width, height, 'temp');
  const image = new ImageData(width, height);
  const px = image.data;
  for (let i = 0; i < mask.data.length; i++) px[i * 4 + 3] = mask.data[i] ?? 0;
  surface.ctx.putImageData(image, 0, 0);
  return surface;
}
