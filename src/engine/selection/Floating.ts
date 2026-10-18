import type { ID, Point, Rect } from '../core/types';
import { boundsOfPoints, rectCenter, rotatedCorners } from '../layers/objects/geometry';
import type { Ctx2D, Surface } from '../memory/surfaces';
import type { FloatingPreview, SelectionCoverage } from '../tools/types';
import { applyMatrix, multiply, type Matrix } from '../viewport/transform';

/**
 * Hộp biến đổi của pixel nổi: hình chữ nhật chưa xoay (document) + góc xoay quanh tâm + lật. Kéo
 * handle sửa `rect`/`rotation` bằng cùng hình học với đối tượng vector (resizeBox,
 * rotationFromHandle).
 */
export interface FloatingTransform {
  rect: Rect;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

/** Pixel nổi sẽ về đâu khi commit. */
export type FloatingTarget =
  { kind: 'layer'; layerId: ID } | { kind: 'new-layer'; afterLayerId: ID };

export interface FloatingInit {
  /** Nội dung (kích thước bằng `origin`), tọa độ cục bộ (0, 0) ↔ `origin.x, origin.y`. */
  surface: Surface;
  origin: Rect;
  target: FloatingTarget;
  /** Vùng bị nhấc khỏi layer gốc (null: nhân bản bằng Alt, hoặc dán). */
  hole: SelectionCoverage | null;
  /** Viền vùng chọn lúc nhấc (document) — vẽ marching ants theo phép biến đổi. */
  outline: readonly Float32Array[];
}

/**
 * Floating selection (mục 5.7): pixel tách khỏi layer vào một surface nổi kích thước bằng vùng chọn;
 * Renderer ghép nó như một phần của layer hoạt động (layer có lỗ ở vị trí cũ, trừ khi nhân bản),
 * có handle co giãn/xoay. Document chưa đổi cho tới khi commit (Enter, click ra ngoài) thành một
 * bước history.
 */
export class FloatingSelection implements FloatingPreview {
  readonly surface: Surface;
  readonly origin: Rect;
  readonly target: FloatingTarget;
  readonly hole: SelectionCoverage | null;
  readonly outline: readonly Float32Array[];
  transform: FloatingTransform;

  constructor(init: FloatingInit) {
    this.surface = init.surface;
    this.origin = { ...init.origin };
    this.target = init.target;
    this.hole = init.hole;
    this.outline = init.outline;
    this.transform = { rect: { ...init.origin }, rotation: 0, flipX: false, flipY: false };
  }

  get layerId(): ID | null {
    return this.target.kind === 'layer' ? this.target.layerId : null;
  }

  get afterLayerId(): ID | null {
    return this.target.kind === 'new-layer' ? this.target.afterLayerId : null;
  }

  /** Ma trận tọa độ cục bộ của nội dung → document. */
  get matrix(): Matrix {
    const { rect, rotation, flipX, flipY } = this.transform;
    const w = this.origin.width;
    const h = this.origin.height;
    const c = rectCenter(rect);
    const sx = (rect.width / w) * (flipX ? -1 : 1);
    const sy = (rect.height / h) * (flipY ? -1 : 1);
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    // T(c) · R · S · T(−w/2, −h/2)
    const rs: Matrix = { a: cos * sx, b: sin * sx, c: -sin * sy, d: cos * sy, e: 0, f: 0 };
    const m = multiply(
      { a: 1, b: 0, c: 0, d: 1, e: c.x, f: c.y },
      multiply(rs, { a: 1, b: 0, c: 0, d: 1, e: -w / 2, f: -h / 2 }),
    );
    // Xoay bội số 90°: cos/sin lệch ~1e-16 — làm tròn để chép đúng từng pixel.
    return { a: snap(m.a), b: snap(m.b), c: snap(m.c), d: snap(m.d), e: snap(m.e), f: snap(m.f) };
  }

  /** Ma trận vị trí cũ (document) → vị trí mới: biến đổi viền, hình vùng chọn sau commit. */
  get docMatrix(): Matrix {
    return multiply(this.matrix, { a: 1, b: 0, c: 0, d: 1, e: -this.origin.x, f: -this.origin.y });
  }

  /** Chỉ dời theo số pixel nguyên (không co giãn, xoay): chép nguyên giá trị từng pixel. */
  get isPixelExact(): boolean {
    const m = this.matrix;
    return (
      Math.abs(Math.abs(m.a) - 1) < 1e-9 &&
      Math.abs(Math.abs(m.d) - 1) < 1e-9 &&
      Math.abs(m.b) < 1e-9 &&
      Math.abs(m.c) < 1e-9 &&
      Math.abs(m.e - Math.round(m.e)) < 1e-9 &&
      Math.abs(m.f - Math.round(m.f)) < 1e-9
    );
  }

  /** Còn nguyên chỗ cũ (chưa dời, co giãn, xoay, lật). */
  get isIdentity(): boolean {
    const t = this.transform;
    const o = this.origin;
    return (
      t.rotation === 0 &&
      !t.flipX &&
      !t.flipY &&
      t.rect.x === o.x &&
      t.rect.y === o.y &&
      t.rect.width === o.width &&
      t.rect.height === o.height
    );
  }

  /** Chỉ dời (giữ kích thước, không xoay, không lật). */
  get isTranslation(): boolean {
    const t = this.transform;
    return (
      t.rotation === 0 &&
      !t.flipX &&
      !t.flipY &&
      t.rect.width === this.origin.width &&
      t.rect.height === this.origin.height
    );
  }

  /** Bốn góc của hộp biến đổi (document). */
  corners(): Point[] {
    return rotatedCorners(this.transform.rect, this.transform.rotation);
  }

  get bounds(): Rect {
    return boundsOfPoints(this.corners());
  }

  /** Điểm (document) có nằm trong hộp biến đổi không. */
  contains(p: Readonly<Point>): boolean {
    const m = this.matrix;
    const det = m.a * m.d - m.b * m.c;
    if (Math.abs(det) < 1e-12) return false;
    const x = p.x - m.e;
    const y = p.y - m.f;
    const lx = (m.d * x - m.c * y) / det;
    const ly = (-m.b * x + m.a * y) / det;
    return lx >= 0 && ly >= 0 && lx <= this.origin.width && ly <= this.origin.height;
  }

  /**
   * Vẽ nội dung lên context đã đặt ma trận document → đích. `quality = 'high'` khi commit (mục 5.7:
   * imageSmoothingQuality high, xoay góc lẻ có khử răng cưa cạnh); dời nguyên pixel thì tắt làm mịn
   * để chép đúng từng pixel.
   */
  draw(ctx: Ctx2D, quality: 'preview' | 'high' = 'preview'): void {
    const m = this.matrix;
    ctx.save();
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    if (this.isPixelExact) {
      ctx.imageSmoothingEnabled = false;
    } else {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = quality === 'high' ? 'high' : 'low';
    }
    ctx.drawImage(
      this.surface.canvas,
      0,
      0,
      this.origin.width,
      this.origin.height,
      0,
      0,
      this.origin.width,
      this.origin.height,
    );
    ctx.restore();
  }

  /** Viền marching ants sau phép biến đổi (document). */
  transformedOutline(): Float32Array[] {
    const m = this.docMatrix;
    const p = { x: 0, y: 0 };
    return this.outline.map((line) => {
      const out = new Float32Array(line.length);
      for (let i = 0; i < line.length; i += 2) {
        applyMatrix(m, { x: line[i] ?? 0, y: line[i + 1] ?? 0 }, p);
        out[i] = p.x;
        out[i + 1] = p.y;
      }
      return out;
    });
  }

  dispose(): void {
    this.surface.release();
  }
}

function snap(value: number): number {
  const r = Math.round(value);
  return Math.abs(value - r) < 1e-9 ? r : value;
}
