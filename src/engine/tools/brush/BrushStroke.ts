import type { Point, Rect } from '../../core/types';
import type { GrowableSurface } from '../../memory/GrowableSurface';
import type { MemoryBudget } from '../../memory/MemoryBudget';
import { createSurface, type Surface } from '../../memory/surfaces';
import { catmullRom, distance } from '../../utils/geometry';
import { EMPTY_RECT, inflateRect, unionRect } from '../../utils/rect';

export interface BrushStrokeOptions {
  /** Đường kính, px document. */
  size: number;
  /** 0..1 — 1 = mép cứng. */
  hardness: number;
  /** Alpha mỗi stamp (0..1). */
  flow: number;
  /** Màu CSS đặc vẽ vào stroke buffer; opacity áp dụng khi ghép buffer vào layer. */
  cssColor: string;
  /**
   * `line`: nối đoạn thẳng lineTo với lineCap/lineJoin = round (nét tròn cứng, nhanh và mịn).
   * `stamp`: rải dab theo khoảng cách (nét mềm, marker, thư pháp, áp lực) — mục 5.5.
   */
  mode: 'line' | 'stamp';
  /** Hình đầu cọ của dab: tròn, vuông (marker), dẹt nghiêng 45° (thư pháp). */
  tip?: 'round' | 'square' | 'chisel';
  /** Áp lực bút ánh xạ sang kích thước và/hoặc độ đậm từng dab (chỉ với bút — mục 5.5). */
  pressure?: { size: boolean; opacity: boolean } | null;
}

/** Áp lực 0..1 → hệ số kích thước (tối thiểu 20% để nét nhẹ vẫn thấy). */
export function pressureSize(pressure: number): number {
  return 0.2 + 0.8 * Math.min(1, Math.max(0, pressure));
}

/** Áp lực 0..1 → hệ số độ đậm. */
export function pressureOpacity(pressure: number): number {
  return Math.max(0.05, Math.min(1, pressure));
}

interface StrokePoint extends Point {
  pressure: number;
}

/** Biên nở của stroke buffer — nét thường lan rộng dần nên nở trước một khoảng. */
export const STROKE_GROWTH_MARGIN = 384;

/** Số điểm nội suy tối đa giữa hai mẫu con trỏ. */
const MAX_SUBDIVISIONS = 64;
/** Bỏ mẫu gần hơn ngưỡng này (px document) để tránh nét bị "rung". */
const MIN_SAMPLE_DISTANCE = 0.35;

/**
 * Một nét brush/eraser đang vẽ. Nét được vẽ vào stroke buffer (GrowableSurface dùng chung giữa các
 * nét, chỉ phủ vùng đã từng vẽ), mỗi đoạn mới báo vùng bẩn để Renderer ghép buffer vào layer hoạt động. Khi kết thúc,
 * tool commit buffer bằng PaintCommand.
 *
 * Opacity của nét được áp dụng khi ghép buffer — nhờ vậy chỗ nét tự chồng lên nhau không bị đậm
 * dần (mục 5.5). Đường đi được làm mượt bằng Catmull-Rom qua mọi điểm coalesced.
 */
export class BrushStroke {
  readonly buffer: GrowableSurface;
  private bounds: Rect = { ...EMPTY_RECT };
  private readonly points: StrokePoint[] = [];
  private readonly curve: StrokePoint[] = [];
  private dab: Surface | null = null;
  private toNextStamp = 0;
  private readonly radius: number;
  private readonly spacing: number;

  constructor(
    private readonly memory: MemoryBudget,
    /** Stroke buffer dùng chung của editor (sạch khi bắt đầu nét). */
    buffer: GrowableSurface,
    private readonly options: BrushStrokeOptions,
    private readonly onDirty: (rect: Rect) => void,
  ) {
    this.buffer = buffer;
    this.radius = Math.max(0.5, options.size / 2);
    // Khoảng cách stamp 10–25% đường kính (mục 5.5): nét mềm cần dày hơn để mịn; đầu dẹt (thư
    // pháp) mỏng theo một chiều nên cần dày hơn nữa để không thành chuỗi hạt.
    const tip = options.tip ?? 'round';
    const ratio =
      tip === 'chisel' ? 0.07 : tip === 'square' ? 0.12 : options.hardness >= 0.8 ? 0.2 : 0.12;
    this.spacing = Math.max(0.5, options.size * ratio);
  }

  /** Hình bao vùng đã vẽ (document, số thực). */
  get dirtyBounds(): Readonly<Rect> {
    return this.bounds;
  }

  get isEmpty(): boolean {
    return this.bounds.width <= 0;
  }

  begin(x: number, y: number, pressure = 0.5): void {
    this.points.push({ x, y, pressure });
    if (this.options.mode === 'stamp') this.dab = this.createDab();
    this.dot(x, y, pressure);
  }

  addPoint(x: number, y: number, pressure = 0.5): void {
    const last = this.points.at(-1);
    if (last && distance(last, { x, y }) < MIN_SAMPLE_DISTANCE) return;
    this.points.push({ x, y, pressure });
    const n = this.points.length;
    // Vẽ đoạn p[n-3] → p[n-2]; cần p[n-1] làm điểm điều khiển phía trước.
    if (n >= 3) {
      this.drawCurve(
        this.points[Math.max(0, n - 4)],
        this.points[n - 3],
        this.points[n - 2],
        this.points[n - 1],
      );
    }
    // Giữ tối đa 4 điểm gần nhất — không tăng bộ nhớ theo độ dài nét.
    if (this.points.length > 4) this.points.shift();
  }

  /** Vẽ đoạn cuối tới điểm cuối cùng. */
  end(): void {
    const n = this.points.length;
    if (n >= 2) {
      const p3 = this.points[n - 1];
      this.drawCurve(this.points[Math.max(0, n - 3)], this.points[n - 2], p3, p3);
    }
    this.releaseDab();
  }

  /** Giải phóng dab; stroke buffer do editor thu về và dùng lại (recycleStrokeBuffer). */
  release(): void {
    this.releaseDab();
  }

  private drawCurve(p0: StrokePoint, p1: StrokePoint, p2: StrokePoint, p3: StrokePoint): void {
    const steps = Math.min(MAX_SUBDIVISIONS, Math.max(1, Math.ceil(distance(p1, p2) / 1.5)));
    const curve = this.curve;
    curve.length = 0;
    curve.push({ x: p1.x, y: p1.y, pressure: p1.pressure });
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const point = catmullRom(p0, p1, p2, p3, t, { x: 0, y: 0 });
      curve.push({
        x: point.x,
        y: point.y,
        pressure: p1.pressure + (p2.pressure - p1.pressure) * t,
      });
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of curve) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const area = inflateRect(
      { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      this.radius + 2,
    );
    if (!this.buffer.ensure(area)) {
      // Đoạn nằm hẳn ngoài document: bắt đầu lại nhịp stamp khi nét quay vào.
      this.toNextStamp = 0;
      return;
    }
    const session = this.buffer.begin();
    if (!session) return;
    const ctx = session.ctx;
    if (this.options.mode === 'line') {
      ctx.lineWidth = this.options.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = this.options.cssColor;
      ctx.beginPath();
      ctx.moveTo(curve[0]?.x ?? 0, curve[0]?.y ?? 0);
      for (let i = 1; i < curve.length; i++) ctx.lineTo(curve[i]?.x ?? 0, curve[i]?.y ?? 0);
      ctx.stroke();
    } else {
      this.stampAlong(ctx, curve);
    }
    session.end();
    this.markDirty(area);
  }

  private stampAlong(
    ctx: CanvasDrawImage & CanvasCompositing,
    curve: readonly StrokePoint[],
  ): void {
    const dab = this.dab;
    if (!dab) return;
    ctx.globalAlpha = this.options.flow;
    for (let i = 1; i < curve.length; i++) {
      const a = curve[i - 1];
      const b = curve[i];
      const len = distance(a, b);
      if (len === 0) continue;
      let along = 0;
      while (along + this.toNextStamp <= len) {
        along += this.toNextStamp;
        const t = along / len;
        const pressure = a.pressure + (b.pressure - a.pressure) * t;
        const scale = this.stamp(ctx, dab, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, pressure);
        this.toNextStamp = Math.max(0.5, this.spacing * scale);
      }
      this.toNextStamp -= len - along;
    }
  }

  /** Một dab tại (x, y) theo áp lực; trả về hệ số kích thước đã dùng. */
  private stamp(
    ctx: CanvasDrawImage & CanvasCompositing,
    dab: Surface,
    x: number,
    y: number,
    pressure: number,
  ): number {
    const dynamics = this.options.pressure;
    const scale = dynamics?.size ? pressureSize(pressure) : 1;
    if (dynamics?.opacity) ctx.globalAlpha = this.options.flow * pressureOpacity(pressure);
    if (scale === 1) {
      ctx.drawImage(dab.canvas, x - dab.width / 2, y - dab.height / 2);
    } else {
      const w = dab.width * scale;
      const h = dab.height * scale;
      ctx.drawImage(dab.canvas, x - w / 2, y - h / 2, w, h);
    }
    return scale;
  }

  /** Điểm đầu nét (click không kéo cũng để lại dấu). */
  private dot(x: number, y: number, pressure: number): void {
    const area = inflateRect({ x, y, width: 0, height: 0 }, this.radius + 2);
    if (!this.buffer.ensure(area)) return;
    const session = this.buffer.begin();
    if (!session) return;
    const ctx = session.ctx;
    if (this.options.mode === 'line') {
      ctx.fillStyle = this.options.cssColor;
      ctx.beginPath();
      ctx.arc(x, y, this.options.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.dab) {
      ctx.globalAlpha = this.options.flow;
      const scale = this.stamp(ctx, this.dab, x, y, pressure);
      this.toNextStamp = Math.max(0.5, this.spacing * scale);
    }
    session.end();
    this.markDirty(area);
  }

  /** Dab render sẵn một lần cho cả nét (mục 5.5): tròn gradient theo độ cứng, vuông, hoặc dẹt. */
  private createDab(): Surface {
    const size = Math.max(1, Math.ceil(this.options.size)) + 2;
    const dab = createSurface(this.memory, size, size, 'temp');
    const ctx = dab.ctx;
    const c = size / 2;
    const r = this.options.size / 2;
    const hardness = Math.min(1, Math.max(0, this.options.hardness));
    const tip = this.options.tip ?? 'round';
    if (tip === 'square') {
      // Marker: đầu vuông bo nhẹ, mép cứng.
      ctx.fillStyle = this.options.cssColor;
      ctx.beginPath();
      ctx.roundRect(c - r, c - r, r * 2, r * 2, r * 0.2);
      ctx.fill();
    } else if (tip === 'chisel') {
      // Thư pháp: ngòi dẹt nghiêng 45° — nét dày/mảnh theo hướng kéo.
      ctx.fillStyle = this.options.cssColor;
      ctx.beginPath();
      ctx.ellipse(c, c, Math.max(0.5, r), Math.max(0.5, r * 0.28), -Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (hardness >= 0.99 || r < 1) {
      ctx.fillStyle = this.options.cssColor;
      ctx.beginPath();
      ctx.arc(c, c, Math.max(0.5, r), 0, Math.PI * 2);
      ctx.fill();
    } else {
      const gradient = ctx.createRadialGradient(c, c, 0, c, c, r);
      gradient.addColorStop(0, this.options.cssColor);
      gradient.addColorStop(hardness, this.options.cssColor);
      gradient.addColorStop(1, transparentOf(this.options.cssColor));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }
    return dab;
  }

  private releaseDab(): void {
    this.dab?.release();
    this.dab = null;
  }

  private markDirty(rect: Rect): void {
    this.bounds = unionRect(this.bounds, rect);
    this.onDirty(rect);
  }
}

/** `rgb(r g b)` → `rgb(r g b / 0)`: cùng màu, trong suốt — tránh viền xám khi nội suy gradient. */
function transparentOf(css: string): string {
  return css.replace(/\)$/, ' / 0)').replace(/ \/ [\d.]+ \/ 0\)$/, ' / 0)');
}
