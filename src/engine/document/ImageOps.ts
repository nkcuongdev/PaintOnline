import type { Document } from '../core/Document';
import type { NoticeCode, Rect, ResampleQuality, WorkerClient } from '../core/types';
import { DocumentCommand, type DocumentFrame } from '../history/commands/DocumentCommand';
import type { Command } from '../history/types';
import { RasterLayer, touchContent, VectorLayer, type Layer } from '../layers/layers';
import { rendererFor } from '../layers/objects/registry';
import { transformObject } from '../layers/objects/transform';
import type { ObjectEnv } from '../layers/objects/types';
import type { MemoryBudget } from '../memory/MemoryBudget';
import {
  createSurface,
  isAllocationError,
  type Canvas,
  type Ctx2D,
  type Surface,
} from '../memory/surfaces';
import { intersectRect, isEmptyRect, rectEquals, roundOutRect, unionRect } from '../utils/rect';
import { transformRect, type Matrix } from '../viewport/transform';

/** Điểm neo khi đổi kích thước khung (Canvas size — neo 9 hướng, mục 7.3). */
export type CanvasAnchor = 'nw' | 'n' | 'ne' | 'w' | 'center' | 'e' | 'sw' | 's' | 'se';

/** Góc xoay theo chiều kim đồng hồ. */
export type RotateAngle = 90 | 180 | 270;
export type FlipAxis = 'horizontal' | 'vertical';

const ANCHOR_FACTORS: Readonly<Record<CanvasAnchor, readonly [number, number]>> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  w: [0, 0.5],
  center: [0.5, 0.5],
  e: [1, 0.5],
  sw: [0, 1],
  s: [0.5, 1],
  se: [1, 1],
};

export interface ImageOpsHost {
  document(): Document | null;
  readonly memory: MemoryBudget;
  readonly workers: WorkerClient;
  readonly objectEnv: ObjectEnv;
  /** Chạy command; thiếu bộ nhớ thì từ chối an toàn và báo (trả false). */
  execute(command: Command): boolean;
  notify(code: NoticeCode): void;
  /** Trước khi biến đổi: commit pixel nổi, kết thúc gõ chữ, hủy thao tác đang kéo. */
  settle(): void;
  /** Đang chạy nền: khóa thao tác vẽ, undo/redo. */
  setRunning(running: boolean): void;
  /** Vùng chọn hiện tại (cắt xén theo vùng chọn). */
  selectionBounds(): Rect | null;
  /** Sau khi biến đổi xong: bỏ vùng chọn (vị trí pixel đã đổi). */
  finished(): void;
}

/** Kế hoạch biến đổi: kích thước mới + ma trận document cũ → mới. */
interface Plan {
  label: string;
  width: number;
  height: number;
  matrix: Matrix;
  /** Co giãn (Resize): resample chất lượng cao trong Worker; null = chép nguyên pixel. */
  resample: ResampleQuality | null;
  /** Chỉ biến đổi layer này (xoay/lật một layer); null = cả ảnh. */
  layerId: string | null;
}

class Aborted extends Error {}

const translate = (dx: number, dy: number): Matrix => ({ a: 1, b: 0, c: 0, d: 1, e: dx, f: dy });

/** Nhường main thread giữa các layer để UI không bị treo (ảnh lớn, nhiều layer — mục 9 GĐ5). */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Biến đổi toàn ảnh (mục 2, GĐ5): cắt xén (khung, vùng chọn), Trim vùng trong suốt, Resize ảnh,
 * Canvas size có neo 9 hướng, xoay 90°/180°, lật — cho cả ảnh hoặc một layer. Mỗi thao tác là MỘT
 * DocumentCommand có undo; layer mới được dựng từng cái một, nhường main thread giữa các layer và
 * resample trong Worker, nên ảnh lớn không làm treo UI. Thiếu bộ nhớ thì từ chối, ảnh giữ nguyên.
 */
export class ImageOps {
  private running = false;

  constructor(private readonly host: ImageOpsHost) {}

  get isRunning(): boolean {
    return this.running;
  }

  /** Cắt xén theo khung (document, làm tròn ra pixel nguyên, cắt theo khung document). */
  crop(rect: Readonly<Rect>): Promise<boolean> {
    return this.run((doc) => {
      const r = intersectRect(roundOutRect(rect), doc.bounds);
      if (isEmptyRect(r) || rectEquals(r, doc.bounds)) return null;
      return this.reframe('history.crop', r.width, r.height, -r.x, -r.y);
    });
  }

  /** Cắt xén theo hình bao vùng chọn. */
  cropToSelection(): Promise<boolean> {
    const bounds = this.host.selectionBounds();
    if (!bounds) {
      this.host.notify('selection.empty');
      return Promise.resolve(false);
    }
    return this.crop(bounds);
  }

  /** Đổi kích thước khung, giữ nguyên tỉ lệ pixel; nội dung neo theo `anchor`. */
  canvasSize(width: number, height: number, anchor: CanvasAnchor): Promise<boolean> {
    return this.run(
      (doc) => {
        const w = Math.round(width);
        const h = Math.round(height);
        if (w === doc.width && h === doc.height) return null;
        const [fx, fy] = ANCHOR_FACTORS[anchor];
        return this.reframe(
          'history.canvasSize',
          w,
          h,
          Math.round((w - doc.width) * fx),
          Math.round((h - doc.height) * fy),
        );
      },
      () => this.checkSize(width, height),
    );
  }

  /** Resize ảnh: resample mọi layer (đối tượng chú thích co giãn theo). */
  resize(width: number, height: number, quality: ResampleQuality): Promise<boolean> {
    return this.run(
      (doc) => {
        const w = Math.round(width);
        const h = Math.round(height);
        if (w === doc.width && h === doc.height) return null;
        return {
          label: 'history.resize',
          width: w,
          height: h,
          matrix: { a: w / doc.width, b: 0, c: 0, d: h / doc.height, e: 0, f: 0 },
          resample: quality,
          layerId: null,
        };
      },
      () => this.checkSize(width, height),
    );
  }

  /** Xoay cả ảnh (đổi chiều rộng/cao khi 90°/270°) hoặc chỉ layer hoạt động (quanh tâm ảnh). */
  rotate(angle: RotateAngle, scope: 'image' | 'layer'): Promise<boolean> {
    return this.run(
      (doc) => {
        const W = doc.width;
        const H = doc.height;
        const layerId = scope === 'layer' ? doc.activeLayerId : null;
        const label = scope === 'layer' ? 'history.rotateLayer' : 'history.rotate';
        if (angle === 180) {
          return {
            label,
            width: W,
            height: H,
            matrix: { a: -1, b: 0, c: 0, d: -1, e: W, f: H },
            resample: null,
            layerId,
          };
        }
        const cw = angle === 90;
        if (scope === 'image') {
          const matrix = cw
            ? { a: 0, b: 1, c: -1, d: 0, e: H, f: 0 }
            : { a: 0, b: -1, c: 1, d: 0, e: 0, f: W };
          return { label, width: H, height: W, matrix, resample: null, layerId };
        }
        // Một layer: xoay quanh tâm ảnh, làm tròn phần dời để vẫn chép nguyên pixel.
        const cx = W / 2;
        const cy = H / 2;
        const matrix = cw
          ? { a: 0, b: 1, c: -1, d: 0, e: Math.round(cx + cy), f: Math.round(cy - cx) }
          : { a: 0, b: -1, c: 1, d: 0, e: Math.round(cx - cy), f: Math.round(cx + cy) };
        return { label, width: W, height: H, matrix, resample: null, layerId };
      },
      scope === 'layer' ? (doc) => this.checkLayer(doc) : undefined,
    );
  }

  /** Lật cả ảnh hoặc chỉ layer hoạt động. */
  flip(axis: FlipAxis, scope: 'image' | 'layer'): Promise<boolean> {
    return this.run(
      (doc) => ({
        label: scope === 'layer' ? 'history.flipLayer' : 'history.flip',
        width: doc.width,
        height: doc.height,
        matrix:
          axis === 'horizontal'
            ? { a: -1, b: 0, c: 0, d: 1, e: doc.width, f: 0 }
            : { a: 1, b: 0, c: 0, d: -1, e: 0, f: doc.height },
        resample: null,
        layerId: scope === 'layer' ? doc.activeLayerId : null,
      }),
      scope === 'layer' ? (doc) => this.checkLayer(doc) : undefined,
    );
  }

  /** Trim: cắt bỏ phần trong suốt quanh nội dung của các layer đang hiện. */
  async trim(): Promise<boolean> {
    const doc = this.host.document();
    if (!doc || this.running) return false;
    this.host.settle();
    this.running = true;
    this.host.setRunning(true);
    let bounds: Rect | null;
    try {
      bounds = await this.contentBounds(doc);
    } catch {
      this.host.notify('image.failed');
      return false;
    } finally {
      this.running = false;
      this.host.setRunning(false);
    }
    if (this.host.document() !== doc) return false;
    const r = bounds ? intersectRect(roundOutRect(bounds), doc.bounds) : null;
    if (!r || isEmptyRect(r) || rectEquals(r, doc.bounds)) {
      this.host.notify('image.nothingToTrim');
      return false;
    }
    return this.run(() => this.reframe('history.trim', r.width, r.height, -r.x, -r.y));
  }

  /** Hình bao nội dung (document) của các layer đang hiện. */
  private async contentBounds(doc: Document): Promise<Rect | null> {
    let area: Rect | null = null;
    for (const layer of doc.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      if (layer.kind === 'vector') {
        for (const obj of layer.objects) {
          const b = rendererFor(obj)?.bounds(obj, this.host.objectEnv);
          if (b && !isEmptyRect(b)) area = area ? unionRect(area, b) : b;
        }
        continue;
      }
      const surface = layer.surface.surface;
      const origin = layer.bounds;
      if (!surface || !origin) continue;
      const bitmap = await createImageBitmap(surface.canvas);
      const b = await this.host.workers.alphaBounds(bitmap);
      if (b) {
        const docRect = { ...b, x: b.x + origin.x, y: b.y + origin.y };
        area = area ? unionRect(area, docRect) : docRect;
      }
    }
    return area;
  }

  private reframe(label: string, width: number, height: number, dx: number, dy: number): Plan {
    return { label, width, height, matrix: translate(dx, dy), resample: null, layerId: null };
  }

  private checkSize(width: number, height: number): boolean {
    if (!this.host.memory.allowsDocument(Math.round(width), Math.round(height))) {
      this.host.notify('document.tooLarge');
      return false;
    }
    return true;
  }

  private checkLayer(doc: Document): boolean {
    const layer = doc.activeLayer;
    if (layer.locked) {
      this.host.notify('layer.locked');
      return false;
    }
    return true;
  }

  /**
   * Chạy một biến đổi: dựng layer mới (bất đồng bộ), rồi thay toàn bộ bằng một DocumentCommand.
   * Document đổi giữa chừng (không xảy ra vì thao tác bị khóa, nhưng vẫn kiểm tra) thì bỏ kết quả.
   */
  private async run(
    plan: (doc: Document) => Plan | null,
    check?: (doc: Document) => boolean,
  ): Promise<boolean> {
    const doc = this.host.document();
    if (!doc || this.running) return false;
    if (check && !check(doc)) return false;
    this.host.settle();
    const p = plan(doc);
    if (!p) return false;
    this.running = true;
    this.host.setRunning(true);
    const rev = doc.rev;
    const created: Layer[] = [];
    /** Đã giao layer mới cho command: command tự giải phóng chúng nếu bị từ chối. */
    let handedOver = false;
    try {
      const layers: Layer[] = [];
      for (const layer of doc.layers) {
        if (p.layerId !== null && layer.id !== p.layerId) {
          layers.push(layer);
          continue;
        }
        const next = await this.transformLayer(layer, p);
        created.push(next);
        layers.push(next);
        if (this.host.document() !== doc || doc.rev !== rev) throw new Aborted();
      }
      const frame: DocumentFrame = {
        width: p.width,
        height: p.height,
        layers,
        activeLayerId: doc.activeLayerId,
      };
      handedOver = true;
      const executed = this.host.execute(new DocumentCommand(p.label, frame));
      if (executed) {
        // Layer mới đã thuộc document: tính vào hạng mục layer (layer cũ nằm trong command, được
        // nén lúc rảnh — tạm thời phần layer có thể vượt 60%, vẫn trong tổng ngân sách).
        for (const layer of created) {
          if (layer.kind === 'raster') layer.surface.recategorize('layer');
        }
        this.host.finished();
      }
      return executed;
    } catch (error) {
      if (isAllocationError(error)) this.host.notify('memory.refused');
      else if (!(error instanceof Aborted)) this.host.notify('image.failed');
      return false;
    } finally {
      if (!handedOver) for (const layer of created) layer.dispose();
      this.running = false;
      this.host.setRunning(false);
    }
  }

  /** Layer mới (cùng id, thuộc tính) với nội dung đã biến đổi. */
  private async transformLayer(layer: Layer, p: Plan): Promise<Layer> {
    const init = {
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      locked: layer.locked,
      alphaLocked: layer.alphaLocked,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
    };
    const docBounds = { x: 0, y: 0, width: p.width, height: p.height };
    if (layer.kind === 'vector') {
      const vector = new VectorLayer(init);
      vector.objects = layer.objects.map((obj) =>
        transformObject(obj, p.matrix, this.host.objectEnv),
      );
      touchContent(vector);
      return vector;
    }
    // Dựng trong hạng mục `temp`: lúc này layer cũ và layer mới cùng tồn tại (layer cũ là snapshot
    // cho undo) — chỉ tổng ngân sách giới hạn, không phải phần 60% của layer (ADR 0025).
    const raster = new RasterLayer(init, this.host.memory, docBounds, 'temp');
    try {
      await this.transformPixels(layer, raster, p, docBounds);
      touchContent(raster);
      await yieldToMain();
    } catch (error) {
      raster.dispose();
      throw error;
    }
    return raster;
  }

  private async transformPixels(
    from: RasterLayer,
    to: RasterLayer,
    p: Plan,
    docBounds: Rect,
  ): Promise<void> {
    const surface = from.surface.surface;
    const bounds = from.bounds;
    if (!surface || !bounds) return;
    const exact = transformRect(p.matrix, bounds);
    const dest = intersectRect(roundOutRect(exact), docBounds);
    if (isEmptyRect(dest)) return;
    if (!p.resample) {
      if (!to.surface.ensure(dest)) return;
      // Dời, xoay 90°, lật với hệ số nguyên: chép đúng từng pixel.
      const m = p.matrix;
      await drawBanded(to, dest, (c) => {
        c.imageSmoothingEnabled = false;
        c.transform(m.a, m.b, m.c, m.d, m.e, m.f);
        c.drawImage(surface.canvas, bounds.x, bounds.y);
      });
      return;
    }
    // Resize: co giãn trên GPU ngay trong context của layer (chép ảnh lớn sang Worker buộc trình
    // duyệt đọc ngược cả texture — Chromium đứng hình > 1 s, đo ở GĐ5). Thu nhỏ: giảm từng nửa
    // (song tuyến đúng ½ = trung bình 2×2) rồi song tuyến lần cuối; phóng to: nội suy chất lượng
    // cao; `pixelated`: lấy điểm gần nhất.
    const smooth = p.resample === 'smooth';
    const temps: Surface[] = [];
    try {
      let source: Canvas = surface.canvas;
      let sw = bounds.width;
      let sh = bounds.height;
      while (smooth && (exact.width < sw / 2 || exact.height < sh / 2)) {
        const nw = exact.width < sw / 2 ? Math.ceil(sw / 2) : sw;
        const nh = exact.height < sh / 2 ? Math.ceil(sh / 2) : sh;
        const step = createSurface(this.host.memory, nw, nh, 'temp');
        temps.push(step);
        step.ctx.imageSmoothingEnabled = true;
        step.ctx.imageSmoothingQuality = 'low';
        step.ctx.drawImage(source, 0, 0, sw, sh, 0, 0, nw, nh);
        source = step.canvas;
        sw = nw;
        sh = nh;
        await yieldToMain();
      }
      if (!to.surface.ensure(dest)) return;
      const upscale = exact.width > sw || exact.height > sh;
      const src = source;
      await drawBanded(to, dest, (c) => {
        c.imageSmoothingEnabled = smooth;
        c.imageSmoothingQuality = upscale ? 'high' : 'low';
        c.drawImage(src, 0, 0, sw, sh, exact.x, exact.y, exact.width, exact.height);
      });
    } finally {
      for (const step of temps) step.release();
    }
  }
}

/** Diện tích một dải khi chép layer (pixel). */
const BAND_PIXELS = 4_000_000;

/**
 * Vẽ vào layer theo dải ~4 MP (cắt bằng clip), nhường main thread giữa các dải — một lượt chép cả
 * layer 24 MP tốn ~300 ms trên Firefox (đo ở GĐ5).
 */
async function drawBanded(
  layer: RasterLayer,
  dest: Rect,
  draw: (ctx: Ctx2D) => void,
): Promise<void> {
  const rows = Math.max(1, Math.ceil(BAND_PIXELS / dest.width));
  for (let y = dest.y; y < dest.y + dest.height; y += rows) {
    const session = layer.surface.begin();
    if (!session) return;
    const c = session.ctx;
    c.beginPath();
    c.rect(dest.x, y, dest.width, Math.min(rows, dest.y + dest.height - y));
    c.clip();
    draw(c);
    session.end();
    if (y + rows < dest.y + dest.height) await yieldToMain();
  }
}
