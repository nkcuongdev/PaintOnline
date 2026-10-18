import type { Document } from '../core/Document';
import type { Point, Rect } from '../core/types';
import type { MemoryBudget } from '../memory/MemoryBudget';
import { createSurface, ScratchPool, type Ctx2D, type Surface } from '../memory/surfaces';
import type { FilterPreview, FloatingPreview, OverlayContext, StrokePreview } from '../tools/types';
import { invert, transformRect } from '../viewport/transform';
import type { Viewport } from '../viewport/Viewport';
import {
  containsRect,
  inflateRect,
  intersectRect,
  isEmptyRect,
  roundOutRect,
  unionRect,
} from '../utils/rect';
import { expandForBackdrops } from './backdrop';
import { beautifyFrame, clipToImage, paintBeautifyFrame } from './beautify';
import type { ObjectRenderState } from './Compositor';
import { LayerCaches, type RenderCacheOptions, type RenderCacheStats } from './layerCaches';

/** Màu giao diện quanh canvas — UI truyền vào từ design token (Engine không đọc CSS). */
export interface Appearance {
  checkerLight: string;
  checkerDark: string;
  /** CSS box-shadow của "tờ giấy" document. */
  sheetShadow: string;
  pixelGrid: string;
  /** Màu lưới (Grid — không vào ảnh xuất). */
  guideGrid?: string;
}

const DEFAULT_APPEARANCE: Appearance = {
  checkerLight: '#ffffff',
  checkerDark: '#e3e3e8',
  sheetShadow: '0 1px 3px rgb(0 0 0 / 0.12), 0 8px 28px rgb(0 0 0 / 0.14)',
  pixelGrid: 'rgb(127 127 127 / 0.35)',
};

/** Kích thước ô caro, CSS px. */
const CHECKER_CELL = 8;
/** Từ mức zoom này tắt làm mịn ảnh để thấy rõ pixel; lưới pixel từ mức kế (mục 5.1). */
const PIXELATED_ZOOM = 4;
const PIXEL_GRID_ZOOM = 8;
/** Lưới (Grid) chỉ vẽ khi hai đường cách nhau ít nhất chừng này CSS px. */
const MIN_GRID_SPACING = 6;
const DEFAULT_GUIDE_GRID = 'rgb(59 91 219 / 0.35)';

export interface RendererSource {
  document(): Document | null;
  preview(): StrokePreview | null;
  /** Pixel nổi của vùng chọn (mục 5.7). */
  floating(): FloatingPreview | null;
  /** Xem trước filter (mục 5.8). */
  filter(): FilterPreview | null;
  hover(): Point | null;
  /** Đối tượng vector: môi trường vẽ + bản nháp đang kéo/tạo. */
  objects(): ObjectRenderState;
  drawToolOverlay(overlay: OverlayContext): void;
  /** Lưới hiển thị (null = tắt). */
  grid(): number | null;
}

export interface FrameStats {
  /** Thời gian CPU của frame (ms). */
  duration: number;
  /** Mốc requestAnimationFrame. */
  timestamp: number;
  /** Frame có vẽ lại display (không chỉ overlay). */
  painted: boolean;
}

/**
 * Renderer theo yêu cầu (mục 5.2): chỉ vẽ khi có vùng bẩn, không có vòng lặp chạy liên tục.
 * Chi phí mỗi frame tỉ lệ với vùng màn hình cần vẽ, không phải kích thước ảnh.
 *
 * Bề mặt: display canvas (ảnh đã ghép) và overlay canvas (con trỏ brush, lưới pixel, đuôi nét dự
 * đoán) vẽ lại độc lập. Below/Above cache và mipmap (LayerCaches) giảm số bề mặt lớn phải ghép mỗi
 * frame; luôn có đường vẽ trực tiếp khi cache bị thu hồi.
 */
export class Renderer {
  private container: HTMLElement | null = null;
  private sheet: HTMLDivElement | null = null;
  private display: Surface | null = null;
  private overlay: Surface | null = null;
  private checker: CanvasPattern | null = null;
  private checkerKey = '';
  private appearance: Appearance = DEFAULT_APPEARANCE;

  private dirty: Rect | null = null;
  private fullRepaint = true;
  private overlayDirty = true;
  private raf = 0;
  private paused = false;

  private readonly docScratch: ScratchPool;
  private readonly screenScratch: ScratchPool;
  private readonly caches: LayerCaches;
  private frameListener: ((stats: FrameStats) => void) | null = null;

  constructor(
    private readonly memory: MemoryBudget,
    private readonly viewport: Viewport,
    private readonly source: RendererSource,
  ) {
    this.docScratch = new ScratchPool(memory);
    this.screenScratch = new ScratchPool(memory, {}, 1);
    this.caches = new LayerCaches(memory, () => {
      this.invalidate();
    });
  }

  /** Nội dung layer vừa đổi (Command, undo/redo) — cache chỉ dựng lại vùng này. null = không rõ. */
  contentChanged(rect: Readonly<Rect> | null): void {
    this.caches.contentChanged(rect ? this.withDependents(rect) : null);
  }

  /**
   * Nền trong `rect` đổi thì đối tượng đọc nền ở đó (Redact khảm/làm mờ, Magnifier) đổi ở cả vùng
   * vẽ của chúng — có thể rộng hơn hoặc ở chỗ khác (mục 5.4).
   */
  private withDependents(rect: Readonly<Rect>): Rect {
    const doc = this.source.document();
    if (!doc) return { ...rect };
    return expandForBackdrops(doc, rect, this.source.objects().env);
  }

  /** Cách vẽ đổi mà nội dung không đổi (font web vừa tải): dựng lại mọi cache. */
  resetCaches(): void {
    this.caches.reset();
    this.invalidate();
  }

  /** Bật/tắt Below/Above cache, mipmap (benchmark mục 10.4). */
  setCacheOptions(options: Partial<RenderCacheOptions>): void {
    this.caches.setOptions(options);
    this.invalidate();
  }

  get cacheStats(): RenderCacheStats {
    return this.caches.stats;
  }

  get isAttached(): boolean {
    return this.display !== null;
  }

  /** Canvas trên cùng — nơi InputManager nhận sự kiện. */
  get overlayElement(): HTMLCanvasElement | null {
    return (this.overlay?.canvas as HTMLCanvasElement | undefined) ?? null;
  }

  get displayCanvas(): HTMLCanvasElement | null {
    return (this.display?.canvas as HTMLCanvasElement | undefined) ?? null;
  }

  onFrame(listener: ((stats: FrameStats) => void) | null): void {
    this.frameListener = listener;
  }

  attach(container: HTMLElement): void {
    if (this.container) this.detach();
    this.container = container;

    const sheet = document.createElement('div');
    sheet.setAttribute('aria-hidden', 'true');
    Object.assign(sheet.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      pointerEvents: 'none',
      transformOrigin: '0 0',
    });
    this.sheet = sheet;

    this.display = createSurface(this.memory, 1, 1, 'fixed', { dom: true, desynchronized: true });
    this.overlay = createSurface(this.memory, 1, 1, 'fixed', { dom: true });
    for (const surface of [this.display, this.overlay]) {
      const canvas = surface.canvas as HTMLCanvasElement;
      Object.assign(canvas.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        display: 'block',
      });
    }
    (this.overlay.canvas as HTMLCanvasElement).style.touchAction = 'none';
    container.append(
      sheet,
      this.display.canvas as HTMLCanvasElement,
      this.overlay.canvas as HTMLCanvasElement,
    );
    this.applyAppearance();
    this.invalidate();
  }

  detach(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.sheet?.remove();
    for (const surface of [this.display, this.overlay]) {
      if (!surface) continue;
      (surface.canvas as HTMLCanvasElement).remove();
      surface.release();
    }
    this.display = null;
    this.overlay = null;
    this.sheet = null;
    this.container = null;
    this.checker = null;
    this.checkerKey = '';
    this.docScratch.trim();
    this.screenScratch.trim();
  }

  dispose(): void {
    this.detach();
    this.caches.dispose();
    this.docScratch.dispose();
    this.screenScratch.dispose();
  }

  /** Đổi kích thước bộ đệm theo khung (CSS px) × DPR. */
  resize(): void {
    if (!this.display || !this.overlay) return;
    const w = Math.max(1, Math.round(this.viewport.width * this.viewport.dpr));
    const h = Math.max(1, Math.round(this.viewport.height * this.viewport.dpr));
    this.display.resize(w, h);
    this.overlay.resize(w, h);
    this.checker = null;
    this.invalidate();
  }

  setAppearance(appearance: Partial<Appearance>): void {
    this.appearance = { ...this.appearance, ...appearance };
    this.checker = null;
    this.applyAppearance();
    this.invalidate();
  }

  /** Tab ẩn: dừng render, giải phóng scratch (mục 7.9). */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.docScratch.trim();
      this.screenScratch.trim();
      // Tab ẩn: trả bộ nhớ cache (mục 7.9) — dựng lại lười khi hiện lại.
      this.caches.cancelWarm();
      this.caches.releaseMips();
      this.caches.releaseCaches();
    } else {
      this.invalidate();
    }
  }

  /** Đánh dấu vùng document cần vẽ lại; bỏ trống = toàn bộ (đổi viewport, đổi document…). */
  invalidate(rect?: Readonly<Rect>): void {
    if (rect === undefined) {
      this.fullRepaint = true;
      this.overlayDirty = true;
    } else if (!isEmptyRect(rect)) {
      const area = this.withDependents(rect);
      this.dirty = this.dirty ? unionRect(this.dirty, area) : area;
    } else {
      return;
    }
    this.schedule();
  }

  invalidateOverlay(): void {
    this.overlayDirty = true;
    this.schedule();
  }

  /** Vẽ ngay (test, benchmark) thay vì chờ requestAnimationFrame. */
  flush(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.frame(performance.now());
  }

  private schedule(): void {
    if (this.raf || this.paused || !this.display) return;
    this.raf = requestAnimationFrame((t) => {
      this.raf = 0;
      this.frame(t);
    });
  }

  private frame(timestamp: number): void {
    if (this.paused || !this.display || !this.overlay) return;
    const start = performance.now();
    const painted = this.fullRepaint || this.dirty !== null;
    if (painted) this.paintDisplay();
    if (this.overlayDirty) this.paintOverlay();
    if (painted) this.updateSheet();
    this.frameListener?.({ duration: performance.now() - start, timestamp, painted });
  }

  private paintDisplay(): void {
    const display = this.display;
    if (!display) return;
    const ctx = display.ctx;
    const doc = this.source.document();
    const deviceBounds = { x: 0, y: 0, width: display.width, height: display.height };
    const m = this.viewport.deviceMatrix;

    let clip = deviceBounds;
    if (!this.fullRepaint && this.dirty && doc) {
      clip = intersectRect(
        roundOutRect(inflateRect(transformRect(m, this.dirty), 2)),
        deviceBounds,
      );
    }
    this.fullRepaint = false;
    this.dirty = null;
    if (isEmptyRect(clip)) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(clip.x, clip.y, clip.width, clip.height);
    ctx.clip();
    ctx.clearRect(clip.x, clip.y, clip.width, clip.height);

    const beautify = doc?.beautify ?? null;
    if (doc && beautify) {
      // Khung Làm đẹp: nền + bóng quanh ảnh, ảnh cắt bo góc (giống hệt ảnh xuất).
      const frame = roundOutRect(transformRect(m, beautifyFrame(doc.bounds, beautify)));
      const radius = Math.min(beautify.radius, doc.width / 2, doc.height / 2);
      const interior = transformRect(m, inflateRect(doc.bounds, -radius));
      // Vùng nằm hẳn trong ảnh sẽ được phủ bởi ảnh/nền caro. Không dựng lại gradient và
      // blur bóng của cả khung cho từng đoạn cọ nhỏ; mép bo góc vẫn vẽ đầy đủ.
      if (!containsRect(interior, clip) && !isEmptyRect(intersectRect(clip, frame))) {
        ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
        paintBeautifyFrame(ctx, doc.bounds, beautify);
      }
      ctx.save();
      ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
      clipToImage(ctx, doc.bounds, beautify);
      // Clip giữ nguyên; phần dưới vẽ theo pixel thiết bị như khi không có khung.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (doc) {
      const docOnScreen = roundOutRect(transformRect(m, doc.bounds));
      const area = intersectRect(clip, docOnScreen);
      if (!isEmptyRect(area)) {
        // Vùng document tương ứng với vùng màn hình cần vẽ.
        const region = roundOutRect(transformRect(invert(m), area));
        const preview = this.source.preview();
        const floating = this.source.floating();
        const filter = this.source.filter();
        const objects = this.source.objects();
        if (doc.background.kind === 'color') {
          ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
          this.applySmoothing(ctx);
          this.caches.composite(
            ctx,
            doc,
            {
              region,
              includeBackground: true,
              preview,
              floating,
              filter,
              scratch: this.docScratch,
              objects,
            },
            this.viewport.zoom * this.viewport.dpr,
          );
        } else {
          // Nền trong suốt: ô caro cố định theo màn hình, document ghép riêng rồi đặt lên trên
          // để blend mode của layer không trộn với ô caro.
          ctx.fillStyle = this.checkerPattern(ctx);
          ctx.fillRect(area.x, area.y, area.width, area.height);
          const scratch = this.screenScratch.acquire(area.width, area.height);
          try {
            const s = scratch.ctx;
            s.setTransform(1, 0, 0, 1, 0, 0);
            s.clearRect(0, 0, area.width, area.height);
            s.setTransform(m.a, m.b, m.c, m.d, m.e - area.x, m.f - area.y);
            this.applySmoothing(s);
            this.caches.composite(
              s,
              doc,
              {
                region,
                includeBackground: false,
                preview,
                floating,
                filter,
                scratch: this.docScratch,
                objects,
              },
              this.viewport.zoom * this.viewport.dpr,
            );
            ctx.drawImage(
              scratch.canvas,
              0,
              0,
              area.width,
              area.height,
              area.x,
              area.y,
              area.width,
              area.height,
            );
          } finally {
            this.screenScratch.release(scratch);
          }
        }
      }
    }
    if (doc && beautify) ctx.restore();
    ctx.restore();
  }

  private paintOverlay(): void {
    const overlay = this.overlay;
    if (!overlay) return;
    this.overlayDirty = false;
    const ctx = overlay.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const dpr = this.viewport.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const doc = this.source.document();
    if (doc && this.viewport.zoom >= PIXEL_GRID_ZOOM) this.paintPixelGrid(ctx, doc);
    const grid = this.source.grid();
    if (doc && grid !== null) this.paintGuideGrid(ctx, doc, grid);
    this.source.drawToolOverlay({ ctx, viewport: this.viewport, hover: this.source.hover() });
  }

  private paintPixelGrid(ctx: Ctx2D, doc: Document): void {
    const visible = intersectRect(roundOutRect(this.viewport.visibleDocRect()), doc.bounds);
    if (isEmptyRect(visible)) return;
    const vp = this.viewport;
    const px = 1 / vp.dpr;
    ctx.save();
    ctx.strokeStyle = this.appearance.pixelGrid;
    ctx.lineWidth = px;
    ctx.beginPath();
    const top = vp.docToScreen({ x: 0, y: visible.y }).y;
    const bottom = vp.docToScreen({ x: 0, y: visible.y + visible.height }).y;
    const left = vp.docToScreen({ x: visible.x, y: 0 }).x;
    const right = vp.docToScreen({ x: visible.x + visible.width, y: 0 }).x;
    for (let x = visible.x; x <= visible.x + visible.width; x++) {
      const sx = Math.round(vp.docToScreen({ x, y: 0 }).x * vp.dpr) / vp.dpr + px / 2;
      ctx.moveTo(sx, top);
      ctx.lineTo(sx, bottom);
    }
    for (let y = visible.y; y <= visible.y + visible.height; y++) {
      const sy = Math.round(vp.docToScreen({ x: 0, y }).y * vp.dpr) / vp.dpr + px / 2;
      ctx.moveTo(left, sy);
      ctx.lineTo(right, sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Lưới theo khoảng cách `size` px ảnh; ẩn khi các đường quá sát nhau trên màn hình. */
  private paintGuideGrid(ctx: Ctx2D, doc: Document, size: number): void {
    const vp = this.viewport;
    if (size * vp.zoom < MIN_GRID_SPACING) return;
    const visible = intersectRect(roundOutRect(vp.visibleDocRect()), doc.bounds);
    if (isEmptyRect(visible)) return;
    const px = 1 / vp.dpr;
    const top = vp.docToScreen({ x: 0, y: visible.y }).y;
    const bottom = vp.docToScreen({ x: 0, y: visible.y + visible.height }).y;
    const left = vp.docToScreen({ x: visible.x, y: 0 }).x;
    const right = vp.docToScreen({ x: visible.x + visible.width, y: 0 }).x;
    ctx.save();
    ctx.strokeStyle = this.appearance.guideGrid ?? DEFAULT_GUIDE_GRID;
    ctx.lineWidth = px;
    ctx.beginPath();
    const firstX = Math.ceil(visible.x / size) * size;
    for (let x = firstX; x <= visible.x + visible.width; x += size) {
      const sx = Math.round(vp.docToScreen({ x, y: 0 }).x * vp.dpr) / vp.dpr + px / 2;
      ctx.moveTo(sx, top);
      ctx.lineTo(sx, bottom);
    }
    const firstY = Math.ceil(visible.y / size) * size;
    for (let y = firstY; y <= visible.y + visible.height; y += size) {
      const sy = Math.round(vp.docToScreen({ x: 0, y }).y * vp.dpr) / vp.dpr + px / 2;
      ctx.moveTo(left, sy);
      ctx.lineTo(right, sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Luôn dùng `low` (song tuyến) cho màn hình: trên Chromium, `medium`/`high` dựng mipmap cho CẢ
   * texture nguồn mỗi lần vẽ — đo ở GĐ1: > 250 ms/frame với layer 4K (ADR 0017).
   * Thu nhỏ đẹp ở zoom thấp dùng mipmap ½, ¼ do Engine tự quản (GĐ4, mục 5.2).
   */
  private applySmoothing(ctx: Ctx2D): void {
    ctx.imageSmoothingEnabled = this.viewport.zoom < PIXELATED_ZOOM;
    ctx.imageSmoothingQuality = 'low';
  }

  private checkerPattern(ctx: Ctx2D): CanvasPattern | string {
    const cell = Math.max(1, Math.round(CHECKER_CELL * this.viewport.dpr));
    const key = `${String(cell)}|${this.appearance.checkerLight}|${this.appearance.checkerDark}`;
    if (this.checker && this.checkerKey === key) return this.checker;
    const tile = createSurface(this.memory, cell * 2, cell * 2, 'fixed');
    try {
      const t = tile.ctx;
      t.fillStyle = this.appearance.checkerLight;
      t.fillRect(0, 0, cell * 2, cell * 2);
      t.fillStyle = this.appearance.checkerDark;
      t.fillRect(cell, 0, cell, cell);
      t.fillRect(0, cell, cell, cell);
      this.checker = ctx.createPattern(tile.canvas, 'repeat');
      this.checkerKey = key;
    } finally {
      // Pattern giữ bản sao ảnh của nó nên giải phóng được tile ngay.
      tile.release();
    }
    return this.checker ?? this.appearance.checkerLight;
  }

  private applyAppearance(): void {
    if (this.sheet) this.sheet.style.boxShadow = this.appearance.sheetShadow;
  }

  /** "Tờ giấy" có bóng nằm dưới canvas, theo khung document trên màn hình. */
  private updateSheet(): void {
    const sheet = this.sheet;
    const doc = this.source.document();
    if (!sheet) return;
    if (!doc) {
      sheet.style.display = 'none';
      return;
    }
    const r = transformRect(this.viewport.matrix, doc.bounds);
    // Khung Làm đẹp tự có nền và bóng: không cần "tờ giấy".
    sheet.style.display = doc.beautify ? 'none' : 'block';
    sheet.style.width = `${String(r.width)}px`;
    sheet.style.height = `${String(r.height)}px`;
    sheet.style.transform = `translate(${String(r.x)}px, ${String(r.y)}px)`;
  }
}
