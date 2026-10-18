import type { Document } from '../core/Document';
import type {
  FilterSessionSummary,
  FilterStep,
  NoticeCode,
  Rect,
  WorkerClient,
} from '../core/types';
import { PaintCommand } from '../history/commands/PaintCommand';
import { TileCapture } from '../history/tiles';
import type { TileStore } from '../history/TileStore';
import type { Command } from '../history/types';
import type { RasterLayer } from '../layers/layers';
import type { MemoryBudget } from '../memory/MemoryBudget';
import { createSurface, isAllocationError, type Surface } from '../memory/surfaces';
import type { FilterPreview, SelectionCoverage } from '../tools/types';
import {
  containsRect,
  EMPTY_RECT,
  inflateRect,
  intersectRect,
  isEmptyRect,
  rectArea,
  roundOutRect,
} from '../utils/rect';
import type { Viewport } from '../viewport/Viewport';
import { filterHalo, filterHaloMax, isIdentityPipeline, isSpatial, normalizeStep } from './spec';

/** Số pixel tối đa của bản xem trước (mục 5.8: "tối đa khoảng 1 MP"). */
export const MAX_PREVIEW_PIXELS = 1_000_000;
/** Diện tích một dải khi áp dụng full-res (đọc pixel từng dải để không chặn main thread lâu). */
const APPLY_BAND_PIXELS = 2_000_000;
/** Số dải chạy song song (kích thước tối đa của Worker pool — mục 5.8). */
const APPLY_LANES = 4;
/** Bản xem trước nhỏ hơn mức này chạy một phần (chia nhỏ hơn không đáng chi phí gửi nhận). */
const MIN_PREVIEW_STRIP = 100_000;
/** Chờ khung nhìn đứng yên rồi mới dựng lại bản xem trước khi pan/zoom. */
const VIEW_SETTLE_MS = 80;
/** Tham số đổi trong khoảng này = đang kéo slider: dùng bản nháp. */
const DRAG_WINDOW_MS = 200;
/** Thời gian Worker nhắm tới cho bản nháp khi kéo slider (mục 11.2: ≤ 100 ms mỗi lần cập nhật). */
const DRAFT_TARGET_MS = 40;
/**
 * Mức thu nhỏ của bản xem trước: mức k có tỉ lệ = tỉ lệ cơ sở / 2^k. Pixel nguồn chỉ đọc từ GPU ở
 * mức 0; mức thấp hơn thu nhỏ trên CPU từ đó (trung bình 2 × 2) — đổi mức khi kéo slider không phải
 * đọc ngược GPU (làm khựng main thread, đo ở GĐ6). Bản nháp tối đa mức 2 (1/16 số pixel), blur tối
 * đa mức 3.
 */
const MAX_DRAFT_LEVEL = 2;
const MAX_LEVEL = 3;
/** Số bản pixel nguồn giữ lại (các mức của cùng khung nhìn). */
const SOURCE_CACHE = MAX_LEVEL + 1;

export interface FilterHost {
  document(): Document | null;
  readonly memory: MemoryBudget;
  readonly workers: WorkerClient;
  readonly viewport: Viewport;
  /** Chạy command; thiếu bộ nhớ thì từ chối an toàn và báo (trả false). */
  execute(command: Command): boolean;
  createTileStore(): TileStore;
  notify(code: NoticeCode): void;
  /** Vùng chọn hiện tại (filter chỉ tác động bên trong — mục 5.8). */
  clip(): SelectionCoverage | null;
  /** Trước khi mở: commit pixel nổi, kết thúc gõ chữ, hủy thao tác đang kéo. */
  settle(): void;
  invalidate(rect?: Rect): void;
  /** Đang áp dụng full-res: khóa thao tác vẽ, undo/redo. */
  setRunning(running: boolean): void;
  changed(summary: FilterSessionSummary | null): void;
}

/**
 * Kế hoạch xem trước trên lưới pixel cố định theo tỉ lệ `scale` (pixel i của lưới phủ đoạn
 * [i/scale, (i+1)/scale) của document): lưới không đổi khi phần đệm đổi, nên pixel nguồn đã đọc dùng
 * lại được suốt lượt kéo slider.
 */
interface PreviewPlan {
  /** Mức thu nhỏ (tỉ lệ = tỉ lệ cơ sở / 2^level). */
  level: number;
  baseScale: number;
  /** Lưới mức 0 (cả document) — lưới mức k = lưới mức 0 chia 2^k, làm tròn lên. */
  baseGrid: Rect;
  scale: number;
  /** Cả document trên lưới. */
  grid: Rect;
  /** Vùng đọc (gồm phần đệm) và phần kết quả — pixel lưới. */
  read: Rect;
  core: Rect;
  /** Phần đệm, pixel lưới. */
  halo: number;
  /** Vị trí phần kết quả trong document. */
  dest: Rect;
}

/** Pixel nguồn đã đọc (lưới của `key`) phủ `rect`. */
interface SourceEntry {
  key: string;
  rect: Rect;
  image: ImageData;
}

class Aborted extends Error {}
/** Bản xem trước đầy đủ bị ngắt vì tham số vừa đổi. */
class Interrupted extends Error {}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Điều chỉnh và bộ lọc (mục 2, 5.8 — GĐ6). Một phiên gắn với layer hoạt động:
 * - Xem trước: khi tham số đổi, pipeline chạy trong Worker trên bản thu nhỏ (≤ 1 MP) của phần
 *   đang nhìn thấy; yêu cầu mới trong lúc Worker bận được gộp (chỉ chạy bản mới nhất). Renderer ghép
 *   kết quả thay pixel của layer — document chưa đổi.
 * - Áp dụng: chạy full-res theo dải (có phần đệm cho blur/khảm), song song trên pool, có tiến trình
 *   và hủy được; kết quả ghép qua vùng chọn rồi ghi bằng MỘT PaintCommand (undo được).
 */
export class FilterRunner {
  private steps: FilterStep[] | null = null;
  private label = 'history.filter';
  private applying = false;
  private progress = 0;
  private comparing = false;
  /** Tăng khi phiên đóng/mở: kết quả của phiên cũ bị bỏ. */
  private generation = 0;
  private abort: AbortController | null = null;

  private preview: FilterPreview | null = null;
  private previewSurface: Surface | null = null;
  private sources: SourceEntry[] = [];
  private inFlight = false;
  private pending = false;
  private requestedAt = 0;
  private viewTimer: ReturnType<typeof setTimeout> | null = null;
  /** Lần đổi tham số gần nhất (kéo slider) và hẹn dựng lại bản đầy đủ sau bản nháp. */
  private lastUpdateAt = 0;
  private refineTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Thời gian Worker cho 1 MP dữ liệu của từng loại pipeline (ms, trung bình trượt) — đo trên chính
   * thiết bị đang chạy để chọn cỡ bản nháp.
   */
  private readonly costPerMP = new Map<string, number>();
  /** Số pixel đọc của bản đầy đủ gần nhất và tỉ lệ cơ sở (ước tính bản nháp). */
  private lastReadPixels = MAX_PREVIEW_PIXELS;
  private baseScaleHint = 1;

  /**
   * Benchmark (mục 11.2): số lần xem trước đã hiện cho một lần đổi tham số; lần gần nhất — lúc đổi
   * tham số, lúc kết quả sẵn sàng (trước khi vẽ) và khoảng giữa hai mốc (ms). `refines`: số lần dựng
   * lại bản đầy đủ sau bản nháp (không tính vào độ trễ).
   */
  readonly stats = { previews: 0, lastMs: 0, requestedAt: 0, shownAt: 0, refines: 0 };

  constructor(private readonly host: FilterHost) {}

  get isOpen(): boolean {
    return this.steps !== null;
  }

  get isApplying(): boolean {
    return this.applying;
  }

  summary(): FilterSessionSummary | null {
    if (!this.steps) return null;
    return {
      steps: this.steps,
      phase: this.applying ? 'applying' : 'preview',
      progress: this.progress,
      comparing: this.comparing,
    };
  }

  /** Ảnh xem trước cho Renderer (null khi đang giữ nút so sánh). */
  filterPreview(): FilterPreview | null {
    return this.comparing ? null : this.preview;
  }

  /** Mở phiên trên layer hoạt động. `label`: khóa history của bước khi áp dụng. */
  open(steps: readonly FilterStep[], label = 'history.filter'): boolean {
    const doc = this.host.document();
    if (!doc || this.applying) return false;
    if (this.steps) this.close();
    this.host.settle();
    if (!this.target(doc, true)) return false;
    this.generation++;
    this.steps = steps.map(normalizeStep);
    this.label = label;
    this.progress = 0;
    this.comparing = false;
    this.requestedAt = performance.now();
    this.emit();
    this.schedulePreview();
    return true;
  }

  /** Tham số đổi (kéo slider): xem trước lại. */
  update(steps: readonly FilterStep[]): void {
    if (!this.steps || this.applying) return;
    this.steps = steps.map(normalizeStep);
    this.requestedAt = performance.now();
    this.lastUpdateAt = this.requestedAt;
    this.emit();
    this.schedulePreview();
  }

  /** Giữ nút so sánh: hiện ảnh gốc. */
  setComparing(comparing: boolean): void {
    if (!this.steps || this.comparing === comparing) return;
    this.comparing = comparing;
    if (this.preview) this.host.invalidate(roundOutRect(this.preview.rect));
    this.emit();
  }

  /**
   * Document, layer hoạt động hoặc vùng chọn đổi: kiểm tra layer đích, dựng lại bản xem trước.
   * `view`: chỉ khung nhìn đổi — chờ đứng yên rồi mới dựng lại.
   */
  refresh(view = false): void {
    if (!this.steps || this.applying) return;
    if (view) {
      if (this.viewTimer) clearTimeout(this.viewTimer);
      this.viewTimer = setTimeout(() => {
        this.viewTimer = null;
        this.schedulePreview();
      }, VIEW_SETTLE_MS);
      return;
    }
    const doc = this.host.document();
    if (!doc || !this.target(doc, true)) {
      this.close();
      return;
    }
    this.schedulePreview();
  }

  /** Hủy: đang áp dụng thì dừng (quay lại xem trước); đang xem trước thì đóng phiên. */
  cancel(): void {
    if (this.applying) {
      this.abort?.abort();
      return;
    }
    if (this.steps) this.close();
  }

  /** Mở và áp dụng ngay (Đảo màu, Đen trắng — không cần chỉnh tham số). */
  async run(steps: readonly FilterStep[], label = 'history.filter'): Promise<boolean> {
    if (!this.open(steps, label)) return false;
    return this.apply();
  }

  /**
   * Áp dụng full-res. Trả true nếu đã thành một bước history; phiên đóng khi xong. Bị hủy hoặc lỗi
   * thì layer giữ nguyên và phiên quay lại xem trước.
   */
  async apply(): Promise<boolean> {
    const doc = this.host.document();
    const steps = this.steps;
    if (!doc || !steps || this.applying) return false;
    const layer = this.target(doc, true);
    if (!layer) {
      this.close();
      return false;
    }
    if (isIdentityPipeline(steps)) {
      this.close();
      return false;
    }
    const clip = this.host.clip();
    const area = this.region(doc, layer, steps, clip);
    if (isEmptyRect(area)) {
      this.host.notify('filter.empty');
      this.close();
      return false;
    }
    this.applying = true;
    this.progress = 0;
    this.comparing = false;
    const abort = new AbortController();
    this.abort = abort;
    this.host.setRunning(true);
    this.emit();
    const rev = doc.rev;
    let result: Surface | null = null;
    let capture: TileCapture | null = null;
    let done = false;
    try {
      result = createSurface(this.host.memory, area.width, area.height, 'temp');
      // Bản trước của tile được chụp dần theo từng dải (layer chưa đổi tới lúc commit) — commit
      // không phải chụp cả vùng một lượt.
      capture = new TileCapture(this.host.createTileStore(), layer, doc.bounds);
      await this.runBands(doc, layer, steps, area, result, capture, abort.signal);
      if (abort.signal.aborted || this.host.document() !== doc || doc.rev !== rev) {
        throw new Aborted();
      }
      const captured = capture;
      capture = null;
      done = this.commit(layer, area, result, clip, captured);
    } catch (error) {
      if (isAllocationError(error)) this.host.notify('memory.refused');
      else if (!(error instanceof Aborted) && !abort.signal.aborted) {
        this.host.notify('filter.failed');
      }
    } finally {
      capture?.discard();
      result?.release();
      this.applying = false;
      this.abort = null;
      this.host.setRunning(false);
    }
    if (done) this.close();
    else if (this.steps) {
      this.progress = 0;
      this.emit();
      // Document có thể đã đổi trong lúc chạy: kiểm tra lại layer đích, dựng lại bản xem trước.
      this.refresh();
    }
    return done;
  }

  dispose(): void {
    this.abort?.abort();
    if (this.steps) this.close();
  }

  // ---------------------------------------------------------------------------

  private emit(): void {
    this.host.changed(this.summary());
  }

  private close(): void {
    this.generation++;
    this.steps = null;
    this.comparing = false;
    this.progress = 0;
    this.pending = false;
    if (this.viewTimer) clearTimeout(this.viewTimer);
    this.viewTimer = null;
    if (this.refineTimer) clearTimeout(this.refineTimer);
    this.refineTimer = null;
    this.clearPreview();
    this.sources = [];
    this.previewSurface?.release();
    this.previewSurface = null;
    this.emit();
  }

  private clearPreview(): void {
    if (!this.preview) return;
    this.host.invalidate(roundOutRect(this.preview.rect));
    this.preview = null;
  }

  /** Layer đích: layer hoạt động, phải là layer ảnh đang hiện, không khóa. */
  private target(doc: Document, report: boolean): RasterLayer | null {
    const layer = doc.activeLayer;
    let code: NoticeCode | null = null;
    if (layer.kind !== 'raster') code = 'filter.notRaster';
    else if (layer.locked) code = 'layer.locked';
    else if (!layer.visible) code = 'layer.hidden';
    if (code) {
      if (report) this.host.notify(code);
      return null;
    }
    return layer.kind === 'raster' ? layer : null;
  }

  /**
   * Vùng filter tác động (document, số nguyên): nội dung layer (blur/khảm lan ra thêm phần đệm),
   * cắt theo vùng chọn và khung document.
   */
  private region(
    doc: Document,
    layer: RasterLayer,
    steps: readonly FilterStep[],
    clip: SelectionCoverage | null,
  ): Rect {
    const bounds = layer.bounds;
    if (!bounds) return EMPTY_RECT;
    const halo = steps.some(isSpatial) ? filterHalo(steps) : 0;
    let r = intersectRect(inflateRect(bounds, halo), doc.bounds);
    if (clip) r = intersectRect(r, clip.bounds);
    return roundOutRect(r);
  }

  // ---------------------------------------------------------------------------
  // Xem trước
  // ---------------------------------------------------------------------------

  private schedulePreview(): void {
    if (this.inFlight) {
      this.pending = true;
      return;
    }
    void this.renderPreview();
  }

  private async renderPreview(): Promise<void> {
    const steps = this.steps;
    const doc = this.host.document();
    if (!steps || !doc || this.applying) return;
    const layer = this.target(doc, false);
    if (!layer) return;
    const generation = this.generation;
    const requestedAt = this.requestedAt;
    const clip = this.host.clip();
    // Đang kéo slider: bản nháp vừa thời gian mục tiêu (theo tốc độ đo được của pipeline này);
    // thả tay thì dựng lại bản đầy đủ (≤ 1 MP — mục 5.8).
    const kind = steps.map((step) => step.id).join('+');
    const dragging = performance.now() - this.lastUpdateAt < DRAG_WINDOW_MS;
    const plan = isIdentityPipeline(steps)
      ? null
      : this.previewPlan(doc, layer, steps, clip, dragging ? this.draftLevel(kind) : 0);
    if (!plan) {
      // Không có gì để lọc (tham số trung tính, ngoài khung nhìn): hiện ảnh gốc.
      this.clearPreview();
      this.recordPreview(requestedAt);
      return;
    }
    let source: SourceEntry;
    try {
      source = this.sourceFor(layer, plan, steps);
    } catch (error) {
      if (!isAllocationError(error)) throw error;
      return;
    }
    this.inFlight = true;
    this.pending = false;
    let pixels: Uint8ClampedArray<ArrayBuffer> | null;
    const started = performance.now();
    try {
      // Bản dựng lại khi thôi kéo nhường chỗ ngay cho lần cập nhật mới.
      pixels = await this.previewPixels(source, plan, steps, layer.alphaLocked, !dragging);
      const ms = (performance.now() - started) / (rectArea(plan.read) / 1e6);
      const previous = this.costPerMP.get(kind);
      this.costPerMP.set(kind, previous === undefined ? ms : previous * 0.6 + ms * 0.4);
    } catch {
      pixels = null;
    } finally {
      this.inFlight = false;
    }
    // Phiên đã đóng/mở lại hoặc đang áp dụng trong lúc chờ Worker: bỏ kết quả.
    if (!this.isCurrent(generation)) return;
    if (pixels) this.showPreview(layer, plan, pixels, clip, requestedAt);
    // Tham số đã đổi trong lúc Worker chạy: dựng bản mới nhất.
    if (this.hasPending()) this.schedulePreview();
    else if (dragging && plan.level > this.previewLevel(steps)) this.scheduleRefine();
    else this.prepareDraft(kind);
  }

  /** Mức của bản đầy đủ: 0, trừ pipeline chỉ có blur (xem `blurLevel`). */
  private previewLevel(steps: readonly FilterStep[]): number {
    return blurLevel(steps, this.baseScaleHint);
  }

  /**
   * Mức bản nháp khi kéo slider: mức nhỏ nhất (ảnh lớn nhất) mà thời gian Worker ước tính (theo tốc
   * độ đã đo của pipeline này) vừa mục tiêu.
   */
  private draftLevel(kind: string): number {
    const cost = this.costPerMP.get(kind);
    if (cost === undefined) return 0;
    let level = 0;
    let ms = cost * (this.lastReadPixels / 1e6);
    while (ms > DRAFT_TARGET_MS && level < MAX_DRAFT_LEVEL) {
      level++;
      ms /= 4;
    }
    return level;
  }

  /**
   * Sau bản xem trước đầy đủ: nếu kéo slider sẽ cần bản nháp, chuẩn bị sẵn pixel nguồn của mức nháp
   * lúc rảnh.
   */
  private prepareDraft(kind: string): void {
    const level = this.draftLevel(kind);
    if (level === 0) return;
    const generation = this.generation;
    idle(() => {
      const steps = this.steps;
      const doc = this.host.document();
      if (!steps || !doc || !this.isCurrent(generation) || this.inFlight) return;
      const layer = this.target(doc, false);
      const plan = layer ? this.previewPlan(doc, layer, steps, this.host.clip(), level) : null;
      if (!layer || !plan) return;
      try {
        this.sourceFor(layer, plan, steps);
      } catch (error) {
        if (!isAllocationError(error)) throw error;
      }
    });
  }

  /** Bản nháp đang hiện: khi thôi kéo slider, dựng lại bản đầy đủ. */
  private scheduleRefine(): void {
    if (this.refineTimer) clearTimeout(this.refineTimer);
    const wait = Math.max(0, this.lastUpdateAt + DRAG_WINDOW_MS - performance.now()) + 10;
    this.refineTimer = setTimeout(() => {
      this.refineTimer = null;
      if (this.steps && !this.applying) this.schedulePreview();
    }, wait);
  }

  /**
   * Chạy pipeline cho bản xem trước, chia theo hàng thành dải chạy song song trên các Worker của
   * pool (mỗi dải đọc thêm phần đệm nên kết quả giống chạy một lần) — tính nhanh gấp số Worker.
   *
   * `interruptible` (bản đầy đủ): chia dải nhỏ hơn và thôi nhận dải mới ngay khi tham số đổi — lần
   * cập nhật mới chỉ chờ các dải đang chạy (ngắn) thay vì cả bản đầy đủ. Worker không bị dừng giữa
   * chừng (dừng = tạo lại Worker, chậm hơn). Bị ngắt thì ném `Interrupted`.
   */
  private async previewPixels(
    source: SourceEntry,
    plan: PreviewPlan,
    steps: readonly FilterStep[],
    lockAlpha: boolean,
    interruptible: boolean,
  ): Promise<Uint8ClampedArray<ArrayBuffer>> {
    const { core, read, halo, scale } = plan;
    const workers = this.host.workers;
    const concurrency = workers.concurrency ?? 1;
    const lanes = Math.max(
      1,
      Math.min(concurrency, Math.floor((core.width * core.height) / MIN_PREVIEW_STRIP)),
    );
    const rows = interruptible
      ? Math.min(core.height, Math.max(Math.ceil(MIN_PREVIEW_STRIP / core.width), 2 * halo, 16))
      : Math.ceil(core.height / lanes);
    const strips: [number, number][] = [];
    for (let y0 = core.y; y0 < core.y + core.height; y0 += rows) {
      strips.push([y0, Math.min(core.y + core.height, y0 + rows)]);
    }
    const out = new Uint8ClampedArray(core.width * core.height * 4);
    let next = 0;
    const lane = async () => {
      while (next < strips.length) {
        if (interruptible && this.hasPending()) throw new Interrupted();
        const [y0, y1] = strips[next++];
        const top = Math.max(read.y, y0 - halo);
        const bottom = Math.min(read.y + read.height, y1 + halo);
        const part = { x: read.x, y: top, width: read.width, height: bottom - top };
        const pixels = await workers.applyFilter({
          width: part.width,
          height: part.height,
          data: extract(source.image, source.rect, part),
          originX: part.x / scale,
          originY: part.y / scale,
          scale,
          core: { x: core.x - part.x, y: y0 - top, width: core.width, height: y1 - y0 },
          steps,
          lockAlpha,
        });
        out.set(pixels, (y0 - core.y) * core.width * 4);
      }
    };
    await Promise.all(Array.from({ length: Math.min(lanes, strips.length) }, lane));
    return out;
  }

  private hasPending(): boolean {
    return this.pending;
  }

  /** Phiên `generation` vẫn đang xem trước (đọc lại trạng thái sau khi chờ bất đồng bộ). */
  private isCurrent(generation: number): boolean {
    return generation === this.generation && this.steps !== null && !this.applying;
  }

  private previewPlan(
    doc: Document,
    layer: RasterLayer,
    steps: readonly FilterStep[],
    clip: SelectionCoverage | null,
    draft: number,
  ): PreviewPlan | null {
    const area = this.region(doc, layer, steps, clip);
    const vp = this.host.viewport;
    const visible = vp.hasSize
      ? intersectRect(roundOutRect(vp.visibleDocRect()), area)
      : { ...area };
    if (isEmptyRect(visible)) return null;
    // Tỉ lệ cơ sở: ≤ 1 MP cho phần đang thấy, không mịn hơn màn hình.
    const device = vp.zoom * vp.dpr;
    let baseScale = Math.min(1, device, Math.sqrt(MAX_PREVIEW_PIXELS / rectArea(visible)));
    if (baseScale > 0.98) baseScale = 1;
    this.baseScaleHint = baseScale;
    const level = Math.max(draft, blurLevel(steps, baseScale));
    const scale = baseScale / 2 ** level;
    const baseGrid = {
      x: 0,
      y: 0,
      width: Math.ceil(doc.width * baseScale),
      height: Math.ceil(doc.height * baseScale),
    };
    const grid = levelGrid(baseGrid, level);
    const x0 = Math.floor(visible.x * scale);
    const y0 = Math.floor(visible.y * scale);
    const x1 = Math.min(grid.width, Math.ceil((visible.x + visible.width) * scale));
    const y1 = Math.min(grid.height, Math.ceil((visible.y + visible.height) * scale));
    if (x1 <= x0 || y1 <= y0) return null;
    const core = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    const halo = filterHalo(steps, scale);
    const read = intersectRect(inflateRect(core, halo), grid);
    if (level === 0) this.lastReadPixels = rectArea(read);
    return {
      level,
      baseScale,
      baseGrid,
      scale,
      grid,
      read,
      core,
      halo,
      dest: {
        x: x0 / scale,
        y: y0 / scale,
        width: core.width / scale,
        height: core.height / scale,
      },
    };
  }

  /**
   * Pixel nguồn của bản xem trước ở mức của `plan`. Mức 0: thu nhỏ trên GPU rồi đọc một lần (rộng hơn
   * vùng cần: đủ phần đệm cho tham số lớn nhất, căn theo lưới 2^MAX_LEVEL). Mức k > 0: thu nhỏ mức
   * k − 1 trên CPU. Giữ lại cho tới khi layer hoặc khung nhìn đổi — kéo slider chỉ cắt phần cần từ
   * bộ nhớ rồi chạy lại filter trong Worker.
   */
  private sourceFor(
    layer: RasterLayer,
    plan: PreviewPlan,
    steps: readonly FilterStep[],
  ): SourceEntry {
    const prefix = `${layer.id}:${String(layer.contentRev)}:${String(plan.baseScale)}:`;
    const key = `${prefix}${String(plan.level)}`;
    const hit = this.sources.find((e) => e.key === key && containsRect(e.rect, plan.read));
    if (hit) {
      this.sources = [hit, ...this.sources.filter((e) => e !== hit)];
      return hit;
    }
    let entry: SourceEntry;
    if (plan.level > 0) {
      const parent = this.sourceFor(layer, levelUp(plan), steps);
      const rect = {
        x: parent.rect.x / 2,
        y: parent.rect.y / 2,
        width: Math.ceil(parent.rect.width / 2),
        height: Math.ceil(parent.rect.height / 2),
      };
      entry = { key, rect, image: halveImage(parent.image) };
    } else {
      // Phần đệm đủ cho tham số lớn nhất: kéo bán kính blur, cỡ ô khảm lên vẫn không phải đọc lại.
      const margin = Math.max(16, filterHaloMax(steps, plan.scale) - plan.halo);
      const align = 2 ** MAX_LEVEL;
      const wide = inflateRect(plan.read, margin);
      const x = Math.max(0, Math.floor(wide.x / align) * align);
      const y = Math.max(0, Math.floor(wide.y / align) * align);
      const rect = intersectRect(
        {
          x,
          y,
          width: Math.ceil((wide.x + wide.width) / align) * align - x,
          height: Math.ceil((wide.y + wide.height) / align) * align - y,
        },
        plan.grid,
      );
      entry = { key, rect, image: this.readSource(layer, rect, plan.scale) };
    }
    this.sources = [entry, ...this.sources].slice(0, SOURCE_CACHE);
    return entry;
  }

  /** Pixel của layer trong `rect` (lưới tỉ lệ `s`) — đọc từ GPU một lần. */
  private readSource(layer: RasterLayer, rect: Rect, s: number): ImageData {
    if (s === 1) return layer.surface.read(rect) ?? new ImageData(rect.width, rect.height);
    const surface = createSurface(this.host.memory, rect.width, rect.height, 'temp');
    try {
      const c = surface.ctx;
      const part = layer.surface.region(
        roundOutRect({
          x: rect.x / s,
          y: rect.y / s,
          width: rect.width / s,
          height: rect.height / s,
        }),
      );
      if (part) {
        c.setTransform(s, 0, 0, s, -rect.x, -rect.y);
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'medium';
        const p = part.rect;
        c.drawImage(part.canvas, part.sx, part.sy, p.width, p.height, p.x, p.y, p.width, p.height);
        c.setTransform(1, 0, 0, 1, 0, 0);
      }
      return c.getImageData(0, 0, rect.width, rect.height);
    } finally {
      surface.release();
    }
  }

  private showPreview(
    layer: RasterLayer,
    plan: PreviewPlan,
    pixels: Uint8ClampedArray<ArrayBuffer>,
    clip: SelectionCoverage | null,
    requestedAt: number,
  ): void {
    const { width, height } = plan.core;
    let surface = this.previewSurface;
    try {
      if (!surface) {
        surface = createSurface(this.host.memory, width, height, 'temp');
        this.previewSurface = surface;
      } else if (surface.width !== width || surface.height !== height) {
        surface.resize(width, height);
      }
    } catch (error) {
      if (!isAllocationError(error)) throw error;
      return;
    }
    surface.ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
    this.clearPreview();
    this.preview = {
      layerId: layer.id,
      rect: plan.dest,
      image: surface.canvas,
      width,
      height,
      clip,
    };
    this.host.invalidate(roundOutRect(plan.dest));
    this.recordPreview(requestedAt);
  }

  private recordPreview(requestedAt: number): void {
    // Dựng lại cho cùng lần đổi tham số (bản đầy đủ sau bản nháp, khung nhìn đổi): không phải độ trễ.
    if (requestedAt === this.stats.requestedAt) {
      this.stats.refines++;
      return;
    }
    const now = performance.now();
    this.stats.previews++;
    this.stats.requestedAt = requestedAt;
    this.stats.shownAt = now;
    this.stats.lastMs = now - requestedAt;
  }

  // ---------------------------------------------------------------------------
  // Áp dụng full-res
  // ---------------------------------------------------------------------------

  /**
   * Chạy pipeline theo dải ~2 MP (đọc thêm phần đệm quanh dải để kết quả giống hệt chạy một lần),
   * tối đa 4 dải song song trên Worker pool, nhường main thread giữa các dải; ghi kết quả vào
   * `result` (gốc tại `area`).
   */
  private async runBands(
    doc: Document,
    layer: RasterLayer,
    steps: readonly FilterStep[],
    area: Rect,
    result: Surface,
    capture: TileCapture,
    signal: AbortSignal,
  ): Promise<void> {
    const halo = filterHalo(steps);
    const rows = Math.max(1, Math.floor(APPLY_BAND_PIXELS / area.width));
    const bands: Rect[] = [];
    for (let y = area.y; y < area.y + area.height; y += rows) {
      bands.push({
        x: area.x,
        y,
        width: area.width,
        height: Math.min(rows, area.y + area.height - y),
      });
    }
    let next = 0;
    let finished = 0;
    const lane = async () => {
      while (next < bands.length) {
        signal.throwIfAborted();
        const band = bands[next++];
        const read = intersectRect(inflateRect(band, halo), doc.bounds);
        const source = layer.surface.read(read) ?? new ImageData(read.width, read.height);
        const pixels = await this.host.workers.applyFilter(
          {
            width: read.width,
            height: read.height,
            data: source.data,
            originX: read.x,
            originY: read.y,
            scale: 1,
            core: { x: band.x - read.x, y: band.y - read.y, ...size(band) },
            steps,
            lockAlpha: layer.alphaLocked,
          },
          signal,
        );
        signal.throwIfAborted();
        result.ctx.putImageData(
          new ImageData(pixels, band.width, band.height),
          band.x - area.x,
          band.y - area.y,
        );
        capture.touch(band);
        finished++;
        this.progress = finished / bands.length;
        this.emit();
        await yieldToMain();
      }
    };
    await Promise.all(Array.from({ length: Math.min(APPLY_LANES, bands.length) }, lane));
  }

  /** Ghi kết quả vào layer bằng một PaintCommand: thay pixel trong vùng (trộn theo vùng chọn). */
  private commit(
    layer: RasterLayer,
    area: Rect,
    result: Surface,
    clip: SelectionCoverage | null,
    capture: TileCapture,
  ): boolean {
    if (clip) {
      // Kết quả × độ phủ vùng chọn; lúc ghi: gốc × (1 − độ phủ) + phần này.
      const c = result.ctx;
      c.save();
      c.setTransform(1, 0, 0, 1, -area.x, -area.y);
      c.globalCompositeOperation = 'destination-in';
      clip.cover(c);
      c.restore();
    }
    const canvas = result.canvas;
    const command = new PaintCommand({
      label: this.label,
      layerId: layer.id,
      area,
      store: capture.store,
      captured: capture.tiles(),
      createStore: () => this.host.createTileStore(),
      apply: (l) => {
        l.surface.ensure(area);
        const session = l.surface.begin();
        if (!session) return;
        const c = session.ctx;
        c.beginPath();
        c.rect(area.x, area.y, area.width, area.height);
        c.clip();
        c.globalAlpha = 1;
        c.imageSmoothingEnabled = false;
        if (clip) {
          c.globalCompositeOperation = 'destination-out';
          clip.cover(c);
          c.globalCompositeOperation = 'lighter';
        } else {
          c.clearRect(area.x, area.y, area.width, area.height);
          c.globalCompositeOperation = 'source-over';
        }
        c.drawImage(canvas, area.x, area.y);
        session.end();
      },
    });
    return this.host.execute(command);
  }
}

/**
 * Mức thu nhỏ đủ cho pipeline chỉ có blur (và bước theo từng pixel): ảnh đã blur mịn nên lấy mẫu
 * sao cho σ ≥ 4 pixel xem trước là đủ — phóng lên trông như bản 1 MP mà rẻ hơn nhiều (blur bán kính
 * lớn). Pipeline có sharpen, khảm cần đủ chi tiết: mức 0.
 */
function blurLevel(steps: readonly FilterStep[], baseScale: number): number {
  let sigma = Infinity;
  for (const step of steps) {
    if (step.id === 'sharpen' || step.id === 'pixelate') return 0;
    if (step.id === 'blur') sigma = Math.min(sigma, step.radius);
  }
  if (!Number.isFinite(sigma)) return 0;
  let level = 0;
  while (level < MAX_LEVEL && (sigma * baseScale) / 2 ** (level + 1) >= 4) level++;
  return level;
}

/** Lưới (cả document) ở mức `level`: lưới mức 0 chia 2^level, làm tròn lên. */
function levelGrid(baseGrid: Rect, level: number): Rect {
  const f = 2 ** level;
  return {
    x: 0,
    y: 0,
    width: Math.ceil(baseGrid.width / f),
    height: Math.ceil(baseGrid.height / f),
  };
}

/** Kế hoạch ở mức lớn hơn một bậc (ảnh gấp đôi) — để dựng nguồn mức thấp từ mức cao. */
function levelUp(plan: PreviewPlan): PreviewPlan {
  const level = plan.level - 1;
  const grid = levelGrid(plan.baseGrid, level);
  const read = {
    x: plan.read.x * 2,
    y: plan.read.y * 2,
    width: plan.read.width * 2,
    height: plan.read.height * 2,
  };
  return { ...plan, level, scale: plan.scale * 2, grid, read: intersectRect(read, grid) };
}

/** Thu nhỏ 1/2 mỗi chiều: trung bình 2 × 2 nhân trước theo alpha (pixel trong suốt không làm tối). */
function halveImage(image: ImageData): ImageData {
  const { width: w, height: h, data: d } = image;
  const W = Math.ceil(w / 2);
  const H = Math.ceil(h / 2);
  const out = new ImageData(W, H);
  const o = out.data;
  const row = w * 4;
  for (let Y = 0; Y < H; Y++) {
    const y0 = Y * 2;
    // Hàng/cột lẻ ở mép: lấy lại pixel cuối (trung bình vẫn đúng).
    const dy = y0 + 1 < h ? row : 0;
    for (let X = 0; X < W; X++) {
      const x0 = X * 2;
      const dx = x0 + 1 < w ? 4 : 0;
      const i = y0 * row + x0 * 4;
      const a0 = d[i + 3];
      const a1 = d[i + dx + 3];
      const a2 = d[i + dy + 3];
      const a3 = d[i + dy + dx + 3];
      const a = a0 + a1 + a2 + a3;
      const j = (Y * W + X) * 4;
      if (a > 0) {
        o[j] = (d[i] * a0 + d[i + dx] * a1 + d[i + dy] * a2 + d[i + dy + dx] * a3) / a;
        o[j + 1] =
          (d[i + 1] * a0 + d[i + dx + 1] * a1 + d[i + dy + 1] * a2 + d[i + dy + dx + 1] * a3) / a;
        o[j + 2] =
          (d[i + 2] * a0 + d[i + dx + 2] * a1 + d[i + dy + 2] * a2 + d[i + dy + dx + 2] * a3) / a;
      }
      o[j + 3] = a / 4;
    }
  }
  return out;
}

/** Chạy lúc main thread rảnh (Safari không có requestIdleCallback: hẹn giờ ngắn). */
function idle(task: () => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(task, { timeout: 300 });
  else setTimeout(task, 30);
}

/** Chép một vùng con (`sub`, cùng hệ tọa độ với `at`) của ảnh nguồn. */
function extract(image: ImageData, at: Rect, sub: Rect): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(sub.width * sub.height * 4);
  const row = sub.width * 4;
  for (let y = 0; y < sub.height; y++) {
    const from = ((sub.y - at.y + y) * image.width + (sub.x - at.x)) * 4;
    out.set(image.data.subarray(from, from + row), y * row);
  }
  return out;
}

function size(r: Readonly<Rect>): { width: number; height: number } {
  return { width: r.width, height: r.height };
}
