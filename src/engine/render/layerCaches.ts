import type { Document } from '../core/Document';
import type { ID, Rect } from '../core/types';
import type { Layer, RasterLayer } from '../layers/layers';
import type { MemoryBudget } from '../memory/MemoryBudget';
import type { Canvas, Ctx2D, Surface } from '../memory/surfaces';
import { inflateRect, intersectRect, isEmptyRect, roundOutRect, unionRect } from '../utils/rect';
import {
  compositeDocument,
  vectorLayerMode,
  type CompositeOptions,
  type SourcePart,
} from './Compositor';
import { DerivedSurface, MipChain } from './cache';

/** Mipmap chỉ dùng cho ảnh lớn hơn 4K (mục 5.2). */
export const MIPMAP_MIN_PIXELS = 3840 * 2160;

export interface RenderCacheOptions {
  /** Below/Above cache (mục 5.2, 10.4). */
  caches: boolean;
  /** Mipmap ½, ¼ khi thu nhỏ dưới 50% ảnh > 4K. */
  mipmaps: boolean;
}

export interface RenderCacheStats {
  below: boolean;
  above: boolean;
  /** Mức mipmap của frame gần nhất (0 = không dùng). */
  mipLevel: 0 | 1 | 2;
  bytes: number;
  /** Còn phần cache đang được dựng dần lúc rảnh. */
  warming: boolean;
}

/** Mức mipmap theo tỉ lệ thiết bị (zoom × DPR). */
export function mipLevelFor(scale: number): 0 | 1 | 2 {
  if (scale <= 0.25) return 2;
  if (scale <= 0.5) return 1;
  return 0;
}

/** Layer có phụ thuộc nền bên dưới không (blend khác normal, Highlight, pass-through…). */
function needsBackdrop(layer: Layer): boolean {
  if (layer.blendMode !== 'normal') return true;
  if (layer.kind === 'raster') return false;
  if (vectorLayerMode(layer) !== 'direct') return true;
  return layer.objects.some(
    (o) =>
      o.type === 'highlight' ||
      o.type === 'spotlight' ||
      (o.type === 'redact' && o.mode !== 'solid'),
  );
}

function shows(layer: Layer): boolean {
  return layer.visible && layer.opacity > 0;
}

/** Chữ ký cấu trúc của một dải layer: đổi thứ tự, ẩn/hiện, opacity, blend → dựng lại cache. */
function signature(layers: readonly Layer[]): string {
  return layers
    .map((l) => `${l.id}:${l.kind}:${l.visible ? 1 : 0}:${String(l.opacity)}:${l.blendMode}`)
    .join('|');
}

/** Vùng nội dung đổi kể từ frame trước: hình chữ nhật, hoặc 'all' khi không biết vùng. */
type Pending = Rect | 'all' | null;

/** Theo dõi `contentRev` của các layer mà một cache/mipmap được dựng từ đó. */
class RevTracker {
  private revs = new Map<ID, number>();
  private epoch = -1;

  /**
   * Trả vùng cần vô hiệu: null = không đổi; 'all' = toàn bộ (không biết vùng, hoặc đã bỏ lỡ một
   * frame có thay đổi).
   */
  sync(layers: readonly Layer[], pending: Pending, epoch: number, next: number): Pending {
    let changed = layers.length !== this.revs.size;
    for (const layer of layers) {
      if (this.revs.get(layer.id) !== layer.contentRev) changed = true;
    }
    const known = this.epoch === epoch;
    this.epoch = next;
    if (!changed) return null;
    this.revs = new Map(layers.map((l) => [l.id, l.contentRev]));
    return known && pending ? pending : 'all';
  }

  reset(): void {
    this.revs.clear();
    this.epoch = -1;
  }
}

/** Below hoặc Above cache: ảnh ghép sẵn của một dải layer liền nhau, kích thước document. */
class StackCache {
  private surface: DerivedSurface | null = null;
  private mip: MipChain | null = null;
  private key = '';
  private readonly revs = new RevTracker();

  constructor(private readonly budget: MemoryBudget) {}

  get bytes(): number {
    return (this.surface?.bytes ?? 0) + (this.mip?.bytes ?? 0);
  }

  /** Đồng bộ với document; trả bề mặt đã sẵn sàng vô hiệu đúng phần cần dựng lại. */
  sync(
    doc: Document,
    key: string,
    layers: readonly Layer[],
    pending: Pending,
    epoch: number,
    next: number,
  ): DerivedSurface {
    if (this.surface?.width !== doc.width || this.surface.height !== doc.height) {
      this.release();
      this.surface = new DerivedSurface(this.budget, doc.width, doc.height);
    }
    const surface = this.surface;
    const dirty = this.revs.sync(layers, pending, epoch, next);
    if (key !== this.key) {
      this.key = key;
      surface.invalidate();
      this.mip?.invalidate();
    } else if (dirty === 'all') {
      surface.invalidate();
      this.mip?.invalidate();
    } else if (dirty) {
      const r = roundOutRect(inflateRect(dirty, 2));
      surface.invalidate(r);
      this.mip?.invalidate(r);
    }
    return surface;
  }

  mipChain(fill: (ctx: Ctx2D, area: Rect) => void): MipChain | null {
    const surface = this.surface;
    if (!surface) return null;
    this.mip ??= new MipChain(this.budget, {
      ensure: (rect) => surface.ensure(rect, fill),
      width: surface.width,
      height: surface.height,
    });
    return this.mip;
  }

  releaseMip(): void {
    this.mip?.release();
    this.mip = null;
  }

  release(): void {
    this.releaseMip();
    this.surface?.release();
    this.surface = null;
    this.key = '';
    this.revs.reset();
  }
}

/** Mipmap của một layer raster, gắn với surface hiện tại của layer (surface nở → dựng lại). */
interface LayerMip {
  surface: Surface;
  chain: MipChain;
  revs: RevTracker;
  lastUsed: number;
}

/** Số frame không dùng tới thì trả bộ nhớ mipmap của layer. */
const MIP_IDLE_FRAMES = 120;

/**
 * Số ô 256 px tối đa được dựng ngay trong một frame. Nhiều hơn (đổi layer hoạt động, cache vừa bị
 * thu hồi, ảnh lớn đang thu nhỏ) thì frame đó vẽ trực tiếp và cache được dựng dần lúc rảnh — tránh
 * một frame phải ghép lại cả ảnh ở độ phân giải gốc (đo ở GĐ4: ~550 ms với L × 20 layer).
 */
const SYNC_CELLS = 6;
/** Ô mipmap rẻ hơn (chỉ thu nhỏ từ mức trên) nên được dựng ngay nhiều hơn. */
const SYNC_MIP_CELLS = 24;
/** Thời gian tối đa cho mỗi lượt dựng dần lúc rảnh. */
const WARM_SLICE_MS = 8;

type IdleHandle =
  { kind: 'idle'; id: number } | { kind: 'timeout'; id: ReturnType<typeof setTimeout> };

/**
 * Below/Above cache và mipmap (mục 5.2, 10.4). Renderer gọi `composite()` thay cho
 * `compositeDocument()` khi vẽ màn hình; export, đọc pixel, Merge vẫn ghép trực tiếp.
 *
 * - Below cache: nền + mọi layer dưới layer hoạt động khi có ≥ 2 layer hiển thị — đúng với mọi
 *   blend mode vì nền nằm sẵn trong cache.
 * - Above cache: các layer trên layer hoạt động khi có ≥ 2 layer hiển thị và không layer nào phụ
 *   thuộc nền (blend normal, không Highlight/pass-through) — `source-over` có tính kết hợp nên ghép
 *   sẵn rồi đặt lên trên cho cùng kết quả. Có layer phụ thuộc nền → ghép từng layer mỗi frame.
 * - Dải có layer chú thích chỉ được cache khi tỉ lệ thiết bị ≤ 1 (cache ở độ phân giải document làm
 *   nét vector mờ khi phóng to — ADR 0020).
 * - Mipmap ½, ¼ khi tỉ lệ thiết bị ≤ 50% và ảnh > 4K, cho cache và layer raster vẽ trực tiếp.
 *
 * Mọi bề mặt thuộc hạng mục `cache`, bị thu hồi đầu tiên trong chuỗi của MemoryBudget (mipmap
 * trước, rồi cache) — trừ lúc đang vẽ frame.
 */
export class LayerCaches {
  private readonly below: StackCache;
  private readonly above: StackCache;
  private readonly layerMips = new Map<ID, LayerMip>();
  private options: RenderCacheOptions = { caches: true, mipmaps: true };
  private pending: Pending = null;
  private epoch = 0;
  private frame = 0;
  private inFrame = false;
  private generation = 0;
  private lastDoc: Document | null = null;
  private lastStats: RenderCacheStats = {
    below: false,
    above: false,
    mipLevel: 0,
    bytes: 0,
    warming: false,
  };
  private readonly offs: (() => void)[] = [];
  /** Việc dựng dần lúc rảnh, theo bề mặt; trả true khi xong (hoặc bỏ vì nội dung đã đổi). */
  private readonly warm = new Map<object, (deadline: number) => boolean>();
  private warmHandle: IdleHandle | null = null;

  constructor(
    private readonly budget: MemoryBudget,
    /** Gọi khi một phần cache vừa dựng xong lúc rảnh — Renderer vẽ lại để dùng cache. */
    private readonly onWarm: () => void = () => undefined,
  ) {
    this.below = new StackCache(budget);
    this.above = new StackCache(budget);
    this.offs.push(
      budget.addReclaimer('mipmap', () => {
        if (!this.inFrame) this.releaseMips();
      }),
      budget.addReclaimer('cache', () => {
        if (!this.inFrame) this.releaseCaches();
      }),
    );
  }

  get stats(): RenderCacheStats {
    return { ...this.lastStats, bytes: this.bytes, warming: this.warm.size > 0 };
  }

  get bytes(): number {
    let sum = this.below.bytes + this.above.bytes;
    for (const mip of this.layerMips.values()) sum += mip.chain.bytes;
    return sum;
  }

  setOptions(options: Partial<RenderCacheOptions>): void {
    this.options = { ...this.options, ...options };
    if (!this.options.caches) this.releaseCaches();
    if (!this.options.mipmaps) this.releaseMips();
  }

  /** Nội dung layer đổi trong `rect` (null = không rõ vùng) — Command, undo/redo. */
  contentChanged(rect: Readonly<Rect> | null): void {
    if (!rect || this.pending === 'all') this.pending = 'all';
    else this.pending = this.pending ? unionRect(this.pending, rect) : { ...rect };
  }

  /** Cách vẽ đổi mà `contentRev` không đổi (font web vừa tải xong): dựng lại mọi thứ. */
  reset(): void {
    this.generation++;
    this.pending = 'all';
  }

  releaseMips(): void {
    this.below.releaseMip();
    this.above.releaseMip();
    for (const mip of this.layerMips.values()) mip.chain.release();
    this.layerMips.clear();
  }

  releaseCaches(): void {
    this.below.release();
    this.above.release();
  }

  dispose(): void {
    this.cancelWarm();
    this.releaseMips();
    this.releaseCaches();
    for (const off of this.offs.splice(0)) off();
  }

  /** Bỏ mọi việc dựng dần (tab ẩn, dispose). */
  cancelWarm(): void {
    this.warm.clear();
    const handle = this.warmHandle;
    this.warmHandle = null;
    if (!handle) return;
    if (handle.kind === 'idle') cancelIdleCallback(handle.id);
    else clearTimeout(handle.id);
  }

  private scheduleWarm(key: object, step: (deadline: number) => boolean): void {
    this.warm.set(key, step);
    this.requestWarmRun();
  }

  private requestWarmRun(): void {
    if (this.warmHandle) return;
    const run = (budget: number) => {
      this.warmHandle = null;
      const deadline = performance.now() + Math.max(4, Math.min(WARM_SLICE_MS, budget));
      let finished = false;
      for (const [key, task] of [...this.warm]) {
        if (performance.now() > deadline) break;
        if (task(deadline)) {
          this.warm.delete(key);
          finished = true;
        }
      }
      if (this.warm.size > 0) this.requestWarmRun();
      if (finished) this.onWarm();
    };
    this.warmHandle =
      typeof requestIdleCallback === 'function'
        ? {
            kind: 'idle',
            id: requestIdleCallback(
              (idle) => {
                run(idle.timeRemaining());
              },
              { timeout: 200 },
            ),
          }
        : {
            kind: 'timeout',
            id: setTimeout(() => {
              run(WARM_SLICE_MS);
            }, 16),
          };
  }

  /**
   * Ghép document lên đích (ma trận document → thiết bị đã đặt) như `compositeDocument`, dùng cache
   * và mipmap khi được. `scale` = zoom × DPR.
   */
  composite(target: Ctx2D, doc: Document, options: CompositeOptions, scale: number): void {
    this.inFrame = true;
    this.frame++;
    if (this.lastDoc !== doc) {
      this.lastDoc = doc;
      this.releaseMips();
      this.releaseCaches();
      this.pending = 'all';
    }
    const pending = this.pending;
    const epoch = this.epoch;
    const next = pending ? epoch + 1 : epoch;
    try {
      this.compositeInner(target, doc, options, scale, pending, epoch, next);
    } finally {
      this.pending = null;
      this.epoch = next;
      this.inFrame = false;
    }
  }

  private compositeInner(
    target: Ctx2D,
    doc: Document,
    options: CompositeOptions,
    scale: number,
    pending: Pending,
    epoch: number,
    next: number,
  ): void {
    const level =
      this.options.mipmaps && doc.width * doc.height > MIPMAP_MIN_PIXELS ? mipLevelFor(scale) : 0;
    if (level === 0) this.releaseMips();
    else this.dropIdleMips(doc);

    const rasterSource =
      level === 0
        ? undefined
        : (layer: RasterLayer, r: Rect) => this.layerSource(layer, r, level, pending, epoch, next);
    const stats: RenderCacheStats = {
      below: false,
      above: false,
      mipLevel: level,
      bytes: 0,
      warming: false,
    };
    this.lastStats = stats;

    const active = doc.indexOfLayer(doc.activeLayerId);
    const n = doc.layers.length;
    const usable = this.options.caches && active >= 0 && this.draftsOnActive(doc, options);
    const belowLayers = doc.layers.slice(0, Math.max(0, active));
    const aboveLayers = doc.layers.slice(active + 1);
    const vectorOk = scale <= 1;
    const belowOk =
      usable &&
      belowLayers.filter(shows).length >= 2 &&
      (vectorOk || !belowLayers.some((l) => l.kind === 'vector'));
    const aboveOk =
      usable &&
      aboveLayers.filter(shows).length >= 2 &&
      !aboveLayers.some((l) => shows(l) && needsBackdrop(l)) &&
      (vectorOk || !aboveLayers.some((l) => l.kind === 'vector'));
    // Cache không còn phù hợp với cấu trúc hiện tại thì trả bộ nhớ (bản nháp chỉ tạm bỏ qua).
    if (this.options.caches && active >= 0 && this.draftsOnActive(doc, options)) {
      if (!belowOk) this.below.release();
      if (!aboveOk) this.above.release();
    }

    if (!belowOk && !aboveOk) {
      compositeDocument(target, doc, { ...options, rasterSource });
      return;
    }

    const region = intersectRect(options.region, doc.bounds);
    if (isEmptyRect(region)) return;
    const base = { ...options, rasterSource };
    const range = (from: number, to: number, background: boolean): CompositeOptions => ({
      ...base,
      includeBackground: background,
      range: { from, to },
    });
    const cacheFill =
      (from: number, to: number, background: boolean) => (ctx: Ctx2D, area: Rect) => {
        compositeDocument(ctx, doc, {
          ...options,
          region: area,
          includeBackground: background,
          preview: null,
          floating: null,
          filter: null,
          objects: { env: options.objects.env, overrides: null, pending: null },
          range: { from, to },
          rasterSource: undefined,
        });
      };
    const background = options.includeBackground && doc.background.kind === 'color';
    const bgKey = background && doc.background.kind === 'color' ? doc.background.color : '-';

    // 1. Nền + các layer phía dưới.
    let drewBelow = false;
    if (belowOk) {
      const key = `below|${String(this.generation)}|${bgKey}|${signature(belowLayers)}`;
      const surface = this.below.sync(doc, key, belowLayers, pending, epoch, next);
      const fill = cacheFill(0, active, background);
      drewBelow = this.drawCache(target, this.below, surface, region, level, fill);
      stats.below = drewBelow;
    }
    if (!drewBelow) compositeDocument(target, doc, range(0, active, options.includeBackground));

    // 2. Layer hoạt động (gồm nét đang vẽ, bản nháp đối tượng).
    compositeDocument(target, doc, range(active, active + 1, false));

    // 3. Các layer phía trên.
    let drewAbove = false;
    if (aboveOk) {
      const key = `above|${String(this.generation)}|${signature(aboveLayers)}`;
      const surface = this.above.sync(doc, key, aboveLayers, pending, epoch, next);
      const fill = cacheFill(active + 1, n, false);
      drewAbove = this.drawCache(target, this.above, surface, region, level, fill);
      stats.above = drewAbove;
    }
    if (!drewAbove) compositeDocument(target, doc, range(active + 1, n, false));
  }

  /** Vẽ phần cache ứng với vùng; false nếu không cấp phát được (người gọi vẽ trực tiếp). */
  private drawCache(
    target: Ctx2D,
    cache: StackCache,
    surface: DerivedSurface,
    region: Rect,
    level: 0 | 1 | 2,
    fill: (ctx: Ctx2D, area: Rect) => void,
  ): boolean {
    const r = roundOutRect(
      intersectRect(inflateRect(region, 2), {
        x: 0,
        y: 0,
        width: surface.width,
        height: surface.height,
      }),
    );
    if (isEmptyRect(r)) return true;
    const mip = level > 0 ? cache.mipChain(fill) : null;
    const f = 2 ** level;
    const lr = levelRect(r, f);
    // Thiếu nhiều: frame này vẽ trực tiếp, cache (và mipmap của nó) được dựng dần lúc rảnh.
    if (surface.invalidCells(r) > SYNC_CELLS) {
      const version = surface.version;
      const mipVersion = mip && level > 0 ? mip.version(level as 1 | 2) : 0;
      this.scheduleWarm(surface, (deadline) => {
        if (surface.version !== version) return true;
        if (!surface.fillStep(r, fill, deadline)) return false;
        if (!mip || level === 0) return true;
        if (mip.version(level) !== mipVersion) return true;
        return mip.fillStep(level, lr, deadline);
      });
      return false;
    }
    let part: SourcePart | null = null;
    if (mip && level > 0) {
      const l = level as 1 | 2;
      if (mip.invalidCells(l, lr) > SYNC_MIP_CELLS) {
        const version = mip.version(l);
        this.scheduleWarm(mip, (deadline) =>
          mip.version(l) !== version ? true : mip.fillStep(l, lr, deadline),
        );
      } else {
        const canvas = mip.ensure(l, lr);
        if (canvas) {
          part = {
            canvas,
            sx: lr.x,
            sy: lr.y,
            sw: lr.width,
            sh: lr.height,
            dest: scaleRect(lr, f),
          };
        }
      }
    }
    if (!part) {
      const canvas = surface.ensure(r, fill);
      if (!canvas) return false;
      part = { canvas, sx: r.x, sy: r.y, sw: r.width, sh: r.height, dest: r };
    }
    target.save();
    target.beginPath();
    target.rect(region.x, region.y, region.width, region.height);
    target.clip();
    target.globalAlpha = 1;
    target.globalCompositeOperation = 'source-over';
    target.drawImage(
      part.canvas,
      part.sx,
      part.sy,
      part.sw,
      part.sh,
      part.dest.x,
      part.dest.y,
      part.dest.width,
      part.dest.height,
    );
    target.restore();
    return true;
  }

  /** Mipmap của layer raster vẽ trực tiếp. */
  private layerSource(
    layer: RasterLayer,
    r: Rect,
    level: 1 | 2,
    pending: Pending,
    epoch: number,
    next: number,
  ): SourcePart | null {
    const surface = layer.surface.surface;
    const bounds = layer.bounds;
    if (!surface || !bounds) return null;
    let mip = this.layerMips.get(layer.id);
    if (mip?.surface !== surface) {
      mip?.chain.release();
      const canvas: Canvas = surface.canvas;
      mip = {
        surface,
        chain: new MipChain(this.budget, {
          ensure: () => canvas,
          width: surface.width,
          height: surface.height,
        }),
        revs: new RevTracker(),
        lastUsed: this.frame,
      };
      this.layerMips.set(layer.id, mip);
    }
    mip.lastUsed = this.frame;
    const dirty = mip.revs.sync([layer], pending, epoch, next);
    if (dirty === 'all') mip.chain.invalidate();
    else if (dirty)
      mip.chain.invalidate(
        roundOutRect(inflateRect({ ...dirty, x: dirty.x - bounds.x, y: dirty.y - bounds.y }, 2)),
      );

    const f = 2 ** level;
    const local = { x: r.x - bounds.x, y: r.y - bounds.y, width: r.width, height: r.height };
    const lr = levelRect(local, f);
    const chain = mip.chain;
    if (chain.invalidCells(level, lr) > SYNC_MIP_CELLS) {
      // Ảnh lớn vừa thu nhỏ: vẽ từ surface gốc, mipmap dựng dần lúc rảnh.
      const version = chain.version(level);
      this.scheduleWarm(chain, (deadline) =>
        chain.version(level) !== version ? true : chain.fillStep(level, lr, deadline),
      );
      return null;
    }
    const canvas = chain.ensure(level, lr);
    if (!canvas) return null;
    const dest = scaleRect(lr, f);
    return {
      canvas,
      sx: lr.x,
      sy: lr.y,
      sw: lr.width,
      sh: lr.height,
      dest: { ...dest, x: dest.x + bounds.x, y: dest.y + bounds.y },
    };
  }

  private dropIdleMips(doc: Document): void {
    for (const [id, mip] of this.layerMips) {
      if (!doc.getLayer(id) || this.frame - mip.lastUsed > MIP_IDLE_FRAMES) {
        mip.chain.release();
        this.layerMips.delete(id);
      }
    }
  }

  /**
   * Bản nháp đối tượng (đang kéo, đang tạo, đang gõ chữ) chỉ nằm trên layer hoạt động? Nếu không,
   * frame này vẽ trực tiếp để cache không chứa trạng thái tạm.
   */
  private draftsOnActive(doc: Document, options: CompositeOptions): boolean {
    const { overrides, pending } = options.objects;
    const active = doc.activeLayer;
    const floating = options.floating;
    if (floating && floating.layerId !== active.id && floating.afterLayerId !== active.id) {
      return false;
    }
    if (options.filter && options.filter.layerId !== active.id) return false;
    if (pending && pending.layerId !== active.id && pending.afterLayerId !== active.id)
      return false;
    if (overrides && overrides.size > 0) {
      if (active.kind !== 'vector') return false;
      const ids = new Set(active.objects.map((o) => o.id));
      for (const id of overrides.keys()) if (!ids.has(id)) return false;
    }
    return true;
  }
}

/** Vùng ở mức mipmap (chia `f`, làm tròn ra ngoài). */
function levelRect(r: Readonly<Rect>, f: number): Rect {
  const x = Math.floor(r.x / f);
  const y = Math.floor(r.y / f);
  return {
    x,
    y,
    width: Math.ceil((r.x + r.width) / f) - x,
    height: Math.ceil((r.y + r.height) / f) - y,
  };
}

function scaleRect(r: Readonly<Rect>, f: number): Rect {
  return { x: r.x * f, y: r.y * f, width: r.width * f, height: r.height * f };
}
