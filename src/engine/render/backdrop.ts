import type { Document } from '../core/Document';
import type { AnnotationObject, MagnifierObject, Rect, RedactObject } from '../core/types';
import { redactPixelRect } from '../layers/objects/annotate';
import { backdropInfluence, rendererFor } from '../layers/objects/registry';
import {
  blurImage,
  pixelateBlocks,
  redactHalo,
  redactStrength,
} from '../layers/objects/redactEffect';
import type {
  BackdropImage,
  BackdropLayer,
  BackdropSource,
  ObjectEnv,
} from '../layers/objects/types';
import type { MemoryBudget } from '../memory/MemoryBudget';
import {
  createSurface,
  isAllocationError,
  type ScratchPool,
  type Surface,
} from '../memory/surfaces';
import { colorToCss, opaqueColor } from '../utils/color';
import {
  containsRect,
  inflateRect,
  intersectRect,
  isEmptyRect,
  rectsIntersect,
  roundOutRect,
  unionRect,
} from '../utils/rect';
import { compositeDocument, drawObjects } from './Compositor';

/** Số ảnh nền giữ trong cache (mỗi đối tượng một ảnh; bỏ ảnh dùng lâu nhất khi vượt). */
const MAX_ENTRIES = 48;
/**
 * Document tới cỡ này (ảnh chụp màn hình 1080p) giữ pixel nền của cả ảnh; lớn hơn thì giữ vùng
 * quanh đối tượng nới thêm `BELOW_MARGIN` px.
 */
const BELOW_FULL_PIXELS = 1920 * 1200;
const BELOW_MARGIN = 384;
/** Làm mờ khi đang kéo: vùng đọc lớn hơn cỡ này thì tính bản nháp ở ½ độ phân giải. */
const DRAFT_MIN_PIXELS = 60_000;

/** Pixel của các layer bên dưới (chưa gồm đối tượng cùng layer) — dùng lại khi chỉ đối tượng đổi. */
interface BelowPixels {
  key: string;
  rect: Rect;
  data: ImageData;
}

interface Entry {
  key: string;
  before: readonly AnnotationObject[];
  surface: Surface;
  rect: Rect;
}

export interface BackdropHost {
  document(): Document | null;
  memory: MemoryBudget;
  scratch: ScratchPool;
  env: ObjectEnv;
}

/**
 * Ảnh nền bên dưới đối tượng (mục 5.4): Redact khảm/làm mờ và Magnifier lấy pixel của các layer
 * bên dưới (và đối tượng đứng trước trong cùng layer) ở độ phân giải document, xử lý, rồi cache kết
 * quả cho tới khi nền đổi. Chạy đồng bộ: màn hình, export, copy, Rasterize đều nhận cùng một ảnh, nên
 * pixel gốc dưới vùng che không bao giờ có trong ảnh xuất.
 *
 * Chữ ký của nền: kích thước + màu nền document, `contentRev`/hiển thị/opacity/blend của từng layer
 * bên dưới, danh sách đối tượng đứng trước (giá trị bất biến — so theo tham chiếu), thuộc tính đối
 * tượng. Đổi bất kỳ phần nào thì dựng lại.
 */
export class BackdropEffects implements BackdropSource {
  private readonly entries = new Map<string, Entry>();
  /**
   * Đọc pixel từ canvas GPU sang CPU rất đắt (Chromium đọc cả texture nguồn — đo ở GĐ7: ~28 ms cho
   * một vùng 0,2 MP trên ảnh 1080p). Nền bên dưới không đổi khi kéo đối tượng, nên chỉ đọc một lần.
   */
  private below: BelowPixels | null = null;

  constructor(private readonly host: BackdropHost) {}

  redact(
    layer: BackdropLayer,
    objects: readonly AnnotationObject[],
    index: number,
  ): BackdropImage | null {
    const obj = objects[index];
    if (obj.type !== 'redact' || obj.mode === 'solid') return null;
    return this.build(layer, objects, index, `r:${obj.id}`, redactPlan(obj));
  }

  magnify(
    layer: BackdropLayer,
    objects: readonly AnnotationObject[],
    index: number,
  ): BackdropImage | null {
    const obj = objects[index];
    if (obj.type !== 'magnifier') return null;
    return this.build(layer, objects, index, `m:${obj.id}`, magnifierPlan(obj));
  }

  /** Bỏ mọi ảnh (đổi document, tab ẩn). */
  clear(): void {
    for (const entry of this.entries.values()) entry.surface.release();
    this.entries.clear();
    this.below = null;
  }

  get bytes(): number {
    let sum = 0;
    for (const entry of this.entries.values()) sum += entry.surface.bytes;
    return sum;
  }

  private build(
    layer: BackdropLayer,
    objects: readonly AnnotationObject[],
    index: number,
    id: string,
    plan: Plan,
  ): BackdropImage | null {
    const doc = this.host.document();
    if (!doc) return null;
    const below = layersBelow(doc, layer);
    if (below < 0) return null;
    const out = intersectRect(roundOutRect(plan.out), doc.bounds);
    if (isEmptyRect(out)) return null;
    const read = intersectRect(inflateRect(out, plan.halo), doc.bounds);
    const before = objects.slice(0, index);
    // Đang kéo/tạo (bản nháp khác đối tượng đã lưu): làm mờ vùng lớn tính nhanh ở ½ độ phân giải.
    // Thả chuột thì đối tượng khớp bản đã lưu → tính lại chính xác (ảnh xuất luôn chính xác).
    const draft =
      plan.draftable &&
      read.width * read.height > DRAFT_MIN_PIXELS &&
      committed(doc, layer, objects[index]) !== objects[index];
    const key = `${signature(doc, below, plan.key, out, read)}|${draft ? 'draft' : 'exact'}`;

    const cached = this.entries.get(id);
    if (cached?.key === key && sameObjects(cached.before, before)) {
      // Dùng gần đây: đưa về cuối thứ tự LRU.
      this.entries.delete(id);
      this.entries.set(id, cached);
      return { image: cached.surface.canvas, rect: cached.rect };
    }
    cached?.surface.release();
    this.entries.delete(id);

    let surface: Surface | null = null;
    try {
      const pixels = this.composite(doc, below, before, layer, read, plan.base);
      const local = {
        x: out.x - read.x,
        y: out.y - read.y,
        width: out.width,
        height: out.height,
      };
      surface = createSurface(this.host.memory, out.width, out.height, 'cache');
      if (draft) this.drawDraft(surface, plan, pixels, local);
      else surface.ctx.putImageData(plan.process(pixels, local), 0, 0);
    } catch (error) {
      surface?.release();
      if (isAllocationError(error)) return null;
      throw error;
    }
    this.entries.set(id, { key, before, surface, rect: out });
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.get(oldest)?.surface.release();
      this.entries.delete(oldest);
    }
    return { image: surface.canvas, rect: out };
  }

  /** Bản nháp ½ độ phân giải, phóng lên vùng kết quả bằng nội suy song tuyến. */
  private drawDraft(surface: Surface, plan: Plan, pixels: ImageData, local: Rect): void {
    const half = plan.draft(halve(pixels));
    const tmp = createSurface(this.host.memory, half.width, half.height, 'temp');
    try {
      tmp.ctx.putImageData(half, 0, 0);
      const ctx = surface.ctx;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'low';
      ctx.drawImage(
        tmp.canvas,
        local.x / 2,
        local.y / 2,
        local.width / 2,
        local.height / 2,
        0,
        0,
        local.width,
        local.height,
      );
    } finally {
      tmp.release();
    }
  }

  /** Pixel các layer [0, below) phủ `read` — đọc từ GPU một lần cho mỗi trạng thái nền. */
  private belowPixels(doc: Document, below: number, read: Rect): BelowPixels {
    const key = signature(doc, below, '', doc.bounds, doc.bounds);
    const cached = this.below;
    if (cached?.key === key && containsRect(cached.rect, read)) return cached;
    const rect =
      doc.width * doc.height <= BELOW_FULL_PIXELS
        ? doc.bounds
        : intersectRect(inflateRect(read, BELOW_MARGIN), doc.bounds);
    this.below = null;
    const work = createSurface(this.host.memory, rect.width, rect.height, 'temp', {
      willReadFrequently: true,
    });
    try {
      const ctx = work.ctx;
      ctx.setTransform(1, 0, 0, 1, -rect.x, -rect.y);
      compositeDocument(ctx, doc, {
        region: rect,
        includeBackground: true,
        preview: null,
        scratch: this.host.scratch,
        objects: { env: this.host.env, overrides: null, pending: null },
        range: { from: 0, to: below },
      });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.below = { key, rect, data: ctx.getImageData(0, 0, rect.width, rect.height) };
      return this.below;
    } finally {
      work.release();
    }
  }

  /** Pixel nền trong vùng `read`: layer [0, below) + đối tượng `before` của layer chứa đối tượng. */
  private composite(
    doc: Document,
    below: number,
    before: readonly AnnotationObject[],
    layer: BackdropLayer,
    read: Rect,
    base: string | null,
  ): ImageData {
    const pixels = this.belowPixels(doc, below, read);
    // Canvas CPU: chép pixel nền từ bộ nhớ, vẽ thêm đối tượng, đọc lại — không chạm GPU.
    const work = createSurface(this.host.memory, read.width, read.height, 'temp', {
      willReadFrequently: true,
    });
    try {
      const ctx = work.ctx;
      const dx = read.x - pixels.rect.x;
      const dy = read.y - pixels.rect.y;
      ctx.putImageData(pixels.data, -dx, -dy, dx, dy, read.width, read.height);
      if (base) {
        // Nền đục: vùng che không bao giờ trong suốt (nền trong suốt sẽ để lộ ảnh gốc ở màn hình).
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, read.width, read.height);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.setTransform(1, 0, 0, 1, -read.x, -read.y);
      if (before.length > 0) {
        const container = layer.kind === 'layer' ? doc.getLayer(layer.id) : null;
        ctx.save();
        ctx.beginPath();
        ctx.rect(read.x, read.y, read.width, read.height);
        ctx.clip();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        // Layer chú thích đang ẩn thì đối tượng của nó không hiện — cũng không vào nền.
        if (!container || container.visible) {
          drawObjects(ctx, before, read, this.host.env, null, layer);
        }
        ctx.restore();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return ctx.getImageData(0, 0, read.width, read.height);
    } finally {
      work.release();
    }
  }
}

// ---------------------------------------------------------------------------

interface Plan {
  /** Vùng ảnh kết quả (document, trước khi cắt theo document). */
  out: Rect;
  /** Phần nền đọc thêm quanh `out`. */
  halo: number;
  /** Màu nền đục lót dưới ảnh (Redact), hoặc null (Magnifier giữ trong suốt). */
  base: string | null;
  /** Thuộc tính đối tượng ảnh hưởng tới kết quả. */
  key: string;
  /** Xử lý pixel nền (`local` = vùng kết quả trong ảnh đọc) → ảnh kích thước `local`. */
  process(pixels: ImageData, local: Rect): ImageData;
  /** Có bản nháp khi kéo (làm mờ). */
  draftable: boolean;
  /** Bản nháp trên ảnh đọc đã thu ½ (cả ảnh, chưa cắt). */
  draft(half: ImageData): ImageData;
}

function redactPlan(obj: RedactObject): Plan {
  const strength = redactStrength(obj);
  const base = colorToCss(opaqueColor(obj.color));
  return {
    out: redactPixelRect(obj),
    halo: redactHalo(obj),
    base,
    key: `${obj.mode}|${String(strength)}|${obj.color}`,
    process(pixels, local) {
      if (obj.mode === 'blur') blurImage(pixels, strength);
      const out = crop(pixels, local);
      if (obj.mode === 'pixelate') pixelateBlocks(out, strength);
      return out;
    },
    draftable: obj.mode === 'blur',
    draft(half) {
      blurImage(half, strength / 2);
      return half;
    },
  };
}

function magnifierPlan(obj: MagnifierObject): Plan {
  return {
    out: obj.source,
    halo: 0,
    base: null,
    key: '',
    process: crop,
    draftable: false,
    draft: (half) => half,
  };
}

/** Thu ½ (trung bình 2 × 2; cạnh lẻ lấy phần còn lại). */
function halve(src: ImageData): ImageData {
  const w = Math.ceil(src.width / 2);
  const h = Math.ceil(src.height / 2);
  const out = new ImageData(w, h);
  const s = src.data;
  const d = out.data;
  for (let y = 0; y < h; y++) {
    const y0 = y * 2;
    const y1 = Math.min(src.height - 1, y0 + 1);
    for (let x = 0; x < w; x++) {
      const x0 = x * 2;
      const x1 = Math.min(src.width - 1, x0 + 1);
      const a = (y0 * src.width + x0) * 4;
      const b = (y0 * src.width + x1) * 4;
      const c = (y1 * src.width + x0) * 4;
      const e = (y1 * src.width + x1) * 4;
      const o = (y * w + x) * 4;
      for (let k = 0; k < 4; k++) {
        d[o + k] = ((s[a + k] ?? 0) + (s[b + k] ?? 0) + (s[c + k] ?? 0) + (s[e + k] ?? 0)) / 4;
      }
    }
  }
  return out;
}

/** Đối tượng đã lưu trong document có cùng id (null: đang tạo, chưa có trong layer). */
function committed(
  doc: Document,
  layer: BackdropLayer,
  obj: AnnotationObject | undefined,
): AnnotationObject | null {
  if (!obj || layer.kind !== 'layer') return null;
  const container = doc.getLayer(layer.id);
  if (container?.kind !== 'vector') return null;
  return container.objects.find((o) => o.id === obj.id) ?? null;
}

function crop(pixels: ImageData, r: Rect): ImageData {
  if (r.x === 0 && r.y === 0 && r.width === pixels.width && r.height === pixels.height) {
    return pixels;
  }
  const out = new ImageData(r.width, r.height);
  for (let y = 0; y < r.height; y++) {
    const from = ((r.y + y) * pixels.width + r.x) * 4;
    out.data.set(pixels.data.subarray(from, from + r.width * 4), y * r.width * 4);
  }
  return out;
}

/** Số layer nằm dưới layer chứa đối tượng (−1 = không tìm thấy). */
function layersBelow(doc: Document, layer: BackdropLayer): number {
  const index = doc.indexOfLayer(layer.id);
  if (index < 0) return -1;
  return layer.kind === 'layer' ? index : index + 1;
}

function signature(doc: Document, below: number, own: string, out: Rect, read: Rect): string {
  const parts: string[] = [
    `${String(doc.width)}x${String(doc.height)}`,
    doc.background.kind === 'color' ? doc.background.color : '-',
    own,
    `${String(out.x)},${String(out.y)},${String(out.width)},${String(out.height)}`,
    `${String(read.x)},${String(read.y)},${String(read.width)},${String(read.height)}`,
  ];
  for (const layer of doc.layers.slice(0, below)) {
    parts.push(
      `${layer.id}:${String(layer.contentRev)}:${layer.visible ? 1 : 0}:${String(layer.opacity)}:${layer.blendMode}`,
    );
  }
  return parts.join('|');
}

function sameObjects(a: readonly AnnotationObject[], b: readonly AnnotationObject[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Vùng phải vẽ lại khi nền trong `rect` đổi: thêm vùng vẽ của mọi đối tượng có ảnh nền đọc từ
 * vùng đó (Redact khảm/làm mờ: cả ô khảm/phần mờ lan ra; Magnifier: bản phóng to ở chỗ khác).
 * Lặp vài lượt cho đối tượng phụ thuộc lẫn nhau (Magnifier phóng to một vùng che).
 */
export function expandForBackdrops(doc: Document, rect: Readonly<Rect>, env: ObjectEnv): Rect {
  let area: Rect = { ...rect };
  for (let pass = 0; pass < 3; pass++) {
    let grown = false;
    for (const layer of doc.layers) {
      if (layer.kind !== 'vector') continue;
      for (const obj of layer.objects) {
        const influence = backdropInfluence(obj);
        if (!influence || !rectsIntersect(influence, area)) continue;
        const b = rendererFor(obj)?.bounds(obj, env);
        if (!b) continue;
        const next = unionRect(area, b);
        if (
          next.x !== area.x ||
          next.y !== area.y ||
          next.width !== area.width ||
          next.height !== area.height
        ) {
          area = next;
          grown = true;
        }
      }
    }
    if (!grown) break;
  }
  return area;
}
