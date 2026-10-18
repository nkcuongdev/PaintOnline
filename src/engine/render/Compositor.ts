import type { Document } from '../core/Document';
import type { AnnotationObject, ID, Rect } from '../core/types';
import { blendToComposite, type Layer, type RasterLayer, type VectorLayer } from '../layers/layers';
import { rendererFor } from '../layers/objects/registry';
import { drawSpotlights } from '../layers/objects/spotlight';
import type { BackdropLayer, DrawExtra, ObjectEnv } from '../layers/objects/types';
import type { Canvas, Ctx2D, ScratchPool } from '../memory/surfaces';
import type {
  FilterPreview,
  FloatingPreview,
  SelectionCoverage,
  StrokePreview,
} from '../tools/types';
import { colorToCss } from '../utils/color';
import { inflateRect, intersectRect, isEmptyRect, roundOutRect, unionRect } from '../utils/rect';
import { transformRect } from '../viewport/transform';

/** Một phần ảnh nguồn và vị trí đích (tọa độ document) — để vẽ layer từ mipmap thay vì surface gốc. */
export interface SourcePart {
  canvas: Canvas;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Vùng document tương ứng. */
  dest: Rect;
}

export interface CompositeOptions {
  /** Vùng document cần ghép. */
  region: Readonly<Rect>;
  /** Vẽ màu nền document (false khi ghép trên ô caro của màn hình). */
  includeBackground: boolean;
  /** Nét đang vẽ, ghép vào layer của nó trước (mục 5.2 bước 4). */
  preview: StrokePreview | null;
  /** Pixel nổi (mục 5.7): ghép như một phần của layer gốc, hoặc như layer mới sắp thêm. */
  floating?: FloatingPreview | null;
  /** Xem trước filter trên một layer (mục 5.8). */
  filter?: FilterPreview | null;
  /** Scratch tọa độ document để ghép layer + stroke buffer. */
  scratch: ScratchPool;
  /** Đối tượng vector: môi trường vẽ và bản nháp đang kéo/tạo. */
  objects: ObjectRenderState;
  /** Chỉ ghép các layer có chỉ số trong [from, to) — Below/Above cache. Mặc định: tất cả. */
  range?: { from: number; to: number };
  /**
   * Nguồn thay thế cho layer raster (mipmap khi thu nhỏ — mục 5.2). Trả null để dùng surface gốc.
   * `region` là vùng document đã cắt theo bounds của layer.
   */
  rasterSource?: (layer: RasterLayer, region: Rect) => SourcePart | null;
}

/** Trạng thái vẽ đối tượng vector (mục 5.4). Export và đọc pixel dùng `overrides = pending = null`. */
export interface ObjectRenderState {
  env: ObjectEnv;
  /** Đối tượng thay thế tạm trong lúc kéo: id → bản mới, hoặc null = ẩn (đang sửa chữ). */
  overrides: ReadonlyMap<ID, AnnotationObject | null> | null;
  /**
   * Đối tượng đang tạo: vẽ cuối layer chú thích `layerId`, hoặc ngay trên layer `afterLayerId` khi
   * layer chú thích sẽ được tạo lúc thả chuột.
   */
  pending: PendingObjects | null;
}

export interface PendingObjects {
  layerId: ID | null;
  afterLayerId: ID;
  objects: readonly AnnotationObject[];
}

/**
 * Ghép document lên một context đã đặt sẵn ma trận document → đích. Dùng chung cho màn hình
 * (ma trận viewport), cache và export (ma trận đơn vị) để kết quả nhất quán tuyệt đối (mục 3.1).
 */
export function compositeDocument(target: Ctx2D, doc: Document, options: CompositeOptions): void {
  const region = intersectRect(options.region, doc.bounds);
  if (isEmptyRect(region)) return;

  target.save();
  // Đối tượng vector có thể vượt khung document: cắt theo vùng cần ghép (đã nằm trong document).
  target.beginPath();
  target.rect(region.x, region.y, region.width, region.height);
  target.clip();
  if (options.includeBackground && doc.background.kind === 'color') {
    target.globalAlpha = 1;
    target.globalCompositeOperation = 'source-over';
    target.fillStyle = colorToCss(doc.background.color);
    target.fillRect(region.x, region.y, region.width, region.height);
  }
  const from = options.range?.from ?? 0;
  const to = Math.min(options.range?.to ?? doc.layers.length, doc.layers.length);
  for (const layer of doc.layers.slice(from, to)) {
    drawLayer(target, layer, region, options);
    drawPendingAfter(target, layer.id, region, options);
  }
  target.restore();
}

/** Đối tượng đang tạo trên layer chú thích sẽ được tạo ngay trên `layerId`. */
export function drawPendingAfter(
  target: Ctx2D,
  layerId: ID,
  region: Rect,
  options: CompositeOptions,
): void {
  const floating = options.floating;
  if (floating?.layerId === null && floating.afterLayerId === layerId) {
    // Ảnh vừa dán: sẽ thành layer mới ngay trên `layerId` khi commit.
    target.save();
    target.globalAlpha = 1;
    target.globalCompositeOperation = 'source-over';
    target.beginPath();
    target.rect(region.x, region.y, region.width, region.height);
    target.clip();
    floating.draw(target);
    target.restore();
  }
  const pending = options.objects.pending;
  if (pending?.layerId !== null || pending.afterLayerId !== layerId) return;
  target.globalAlpha = 1;
  target.globalCompositeOperation = 'source-over';
  drawObjects(target, pending.objects, region, options.objects.env, null, {
    kind: 'after',
    id: layerId,
  });
}

/**
 * Ghép một layer lên đích với opacity + blend mode của nó (bỏ qua nếu ẩn). Dùng cho màn hình,
 * export và Merge Down — vẽ layer trên vào layer dưới (mục 5.4).
 */
export function drawLayer(
  target: Ctx2D,
  layer: Layer,
  region: Rect,
  options: CompositeOptions,
): void {
  if (!layer.visible || layer.opacity <= 0) return;
  if (layer.kind === 'vector') {
    drawVectorLayer(target, layer, region, options);
    return;
  }
  const preview = options.preview?.layerId === layer.id ? options.preview : null;
  const floating = options.floating?.layerId === layer.id ? options.floating : null;
  const filter = options.filter?.layerId === layer.id ? options.filter : null;
  target.globalAlpha = layer.opacity;
  target.globalCompositeOperation = blendToComposite(layer.blendMode);
  if (filter && !preview && !floating) {
    drawWithFilter(target, layer, filter, region, options);
    return;
  }
  if (preview || floating) {
    drawWithPreview(target, layer, { stroke: preview, floating }, region, options.scratch);
    return;
  }
  drawRaster(target, layer, region, options);
}

/** Pixel của layer raster trong vùng (nguồn thay thế — mipmap — nếu có). */
function drawRaster(
  target: Ctx2D,
  layer: RasterLayer,
  region: Rect,
  options: CompositeOptions,
): void {
  const surface = layer.surface.surface;
  const bounds = layer.bounds;
  if (!surface || !bounds) return;
  // Chỉ vẽ phần nguồn ứng với vùng cần vẽ: GPU không phải xử lý cả texture của layer mỗi frame
  // (đo ở docs/perf-baseline.md, GĐ1). Nới 2 px để nội suy ở mép không tạo đường nối.
  const r = roundOutRect(intersectRect(inflateRect(region, 2), bounds));
  if (isEmptyRect(r)) return;
  const part = options.rasterSource?.(layer, r);
  if (part) {
    drawSourcePart(target, part);
    return;
  }
  target.drawImage(
    surface.canvas,
    r.x - bounds.x,
    r.y - bounds.y,
    r.width,
    r.height,
    r.x,
    r.y,
    r.width,
    r.height,
  );
}

export function drawSourcePart(target: Ctx2D, part: SourcePart): void {
  const { dest } = part;
  target.drawImage(
    part.canvas,
    part.sx,
    part.sy,
    part.sw,
    part.sh,
    dest.x,
    dest.y,
    dest.width,
    dest.height,
  );
}

/**
 * Cách ghép layer chú thích (ADR 0023):
 * - `direct`: normal, opacity 1 — vẽ thẳng từng đối tượng (Highlight `multiply` trộn với layer dưới).
 * - `passthrough`: normal, opacity < 1 — vẽ đối tượng lên bản sao nền rồi trộn tuyến tính với nền
 *   theo opacity: đúng opacity của cả layer (chỗ đối tượng chồng nhau không đậm thêm) mà Highlight
 *   vẫn trộn với ảnh bên dưới.
 * - `isolated`: blend khác normal — ghép riêng nhóm đối tượng rồi blend cả nhóm như một layer.
 */
export type VectorLayerMode = 'direct' | 'passthrough' | 'isolated';

export function vectorLayerMode(layer: Pick<Layer, 'opacity' | 'blendMode'>): VectorLayerMode {
  if (layer.blendMode !== 'normal') return 'isolated';
  return layer.opacity < 1 ? 'passthrough' : 'direct';
}

/**
 * Layer chú thích: vẽ trực tiếp từng đối tượng lên đích với ma trận hiện tại — nét vector sắc ở mọi
 * mức zoom (ADR 0020). Opacity/blend của layer qua bề mặt tạm theo pixel thiết bị của đích.
 */
function drawVectorLayer(
  target: Ctx2D,
  layer: VectorLayer,
  region: Rect,
  options: CompositeOptions,
): void {
  const state = options.objects;
  const pending = state.pending?.layerId === layer.id ? state.pending.objects : null;
  if (layer.objects.length === 0 && !pending) return;
  // Đối tượng đang tạo nằm cuối layer: cùng dãy số thứ tự, cùng nhóm Spotlight với đối tượng cũ.
  const objects = pending ? [...layer.objects, ...pending] : layer.objects;
  const draw = (ctx: Ctx2D) => {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    drawObjects(ctx, objects, region, state.env, state.overrides, { kind: 'layer', id: layer.id });
  };
  const mode = vectorLayerMode(layer);
  if (mode === 'direct') {
    draw(target);
    return;
  }
  const m = target.getTransform();
  const canvas = target.canvas;
  const device = intersectRect(roundOutRect(inflateRect(transformRect(m, region), 1)), {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
  });
  if (isEmptyRect(device)) return;
  const scratch = options.scratch.acquire(device.width, device.height);
  try {
    const s = scratch.ctx;
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.clearRect(0, 0, device.width, device.height);
    if (mode === 'passthrough') {
      // Bản sao nền (vùng thiết bị) để đối tượng trộn đúng với ảnh bên dưới.
      s.drawImage(
        canvas,
        device.x,
        device.y,
        device.width,
        device.height,
        0,
        0,
        device.width,
        device.height,
      );
    }
    s.save();
    s.setTransform(m.a, m.b, m.c, m.d, m.e - device.x, m.f - device.y);
    s.beginPath();
    s.rect(region.x, region.y, region.width, region.height);
    s.clip();
    draw(s);
    s.restore();

    target.save();
    target.setTransform(1, 0, 0, 1, 0, 0);
    if (mode === 'passthrough') {
      // nền × (1 − α) + (nền + đối tượng) × α — nội suy tuyến tính trên giá trị premultiplied.
      target.globalAlpha = layer.opacity;
      target.globalCompositeOperation = 'destination-out';
      target.fillStyle = '#000';
      target.fillRect(device.x, device.y, device.width, device.height);
      target.globalCompositeOperation = 'lighter';
    } else {
      target.globalAlpha = layer.opacity;
      target.globalCompositeOperation = blendToComposite(layer.blendMode);
    }
    target.drawImage(
      scratch.canvas,
      0,
      0,
      device.width,
      device.height,
      device.x,
      device.y,
      device.width,
      device.height,
    );
    target.restore();
  } finally {
    options.scratch.release(scratch);
  }
}

/**
 * Vẽ các đối tượng của một layer chú thích theo thứ tự (mục 6.2). Phần phụ thuộc vị trí trong layer
 * tính ở đây: số thứ tự Step, nhóm Spotlight (một lớp làm tối, vẽ ở vị trí Spotlight đầu tiên), ảnh
 * nền của Redact khảm/làm mờ và Magnifier (`env.backdrop`). Dùng cho màn hình, cache, export,
 * Rasterize, Merge và thumbnail — mọi đường ra đều nướng cùng một hiệu ứng.
 */
export function drawObjects(
  target: Ctx2D,
  objects: readonly AnnotationObject[],
  region: Rect,
  env: ObjectEnv,
  overrides: ReadonlyMap<ID, AnnotationObject | null> | null,
  layer: BackdropLayer | null,
): void {
  const list: AnnotationObject[] = [];
  for (const original of objects) {
    const obj = overrides?.has(original.id) ? overrides.get(original.id) : original;
    if (obj) list.push(obj);
  }
  let step = 0;
  let spotlights = false;
  list.forEach((obj, index) => {
    if (obj.type === 'step') step++;
    const renderer = rendererFor(obj);
    if (!renderer) return;
    if (obj.type === 'spotlight') {
      if (spotlights) return;
      spotlights = true;
      const group = list.filter((o) => o.type === 'spotlight');
      drawSpotlights(target, group, env.documentBounds?.() ?? null);
      return;
    }
    const b = renderer.bounds(obj, env);
    if (isEmptyRect(intersectRect(b, region))) return;
    let extra: DrawExtra | undefined;
    if (obj.type === 'step') {
      extra = { stepNumber: step };
    } else if (obj.type === 'redact' && obj.mode !== 'solid') {
      extra = { backdrop: layer ? (env.backdrop?.redact(layer, list, index) ?? null) : null };
    } else if (obj.type === 'magnifier') {
      extra = { backdrop: layer ? (env.backdrop?.magnify(layer, list, index) ?? null) : null };
    }
    renderer.draw(target, obj, env, extra);
  });
}

/** Hình bao nội dung layer (document): bounds surface, hoặc hợp hình bao các đối tượng. */
export function layerContentBounds(layer: Layer, env: ObjectEnv): Rect | null {
  if (layer.kind === 'raster') return layer.bounds ? { ...layer.bounds } : null;
  let area: Rect | null = null;
  for (const obj of layer.objects) {
    const b = rendererFor(obj)?.bounds(obj, env);
    if (b && !isEmptyRect(b)) area = area ? unionRect(area, b) : b;
  }
  return area;
}

/** Thay đổi tạm trên một layer, ghép trước khi vẽ layer (mục 5.2 bước 4). */
interface LayerDrafts {
  stroke: StrokePreview | null;
  floating: FloatingPreview | null;
}

/**
 * Layer đang có nét vẽ hoặc pixel nổi: ghép layer + thay đổi tạm trên scratch (tọa độ document, chỉ
 * trong vùng cần vẽ), rồi vẽ scratch với opacity/blend của layer.
 * - Pixel nổi: khoét lỗ ở vị trí cũ (`destination-out` theo vùng chọn) rồi vẽ nội dung đã biến đổi.
 * - Nét vẽ: stroke buffer, cắt theo vùng chọn (`destination-in` trên scratch thứ hai — mục 5.5).
 */
function drawWithPreview(
  target: Ctx2D,
  layer: RasterLayer,
  drafts: LayerDrafts,
  region: Rect,
  pool: ScratchPool,
): void {
  const { stroke: preview, floating } = drafts;
  const empty = { x: 0, y: 0, width: 0, height: 0 };
  let content: Rect = layer.bounds ?? empty;
  if (preview?.composite === 'source-over')
    content = unionRect(content, preview.buffer.bounds ?? empty);
  if (floating) content = unionRect(content, floating.bounds);
  // Nới 2 px để nội suy ở mép không bị kẹp khi zoom không nguyên.
  const r = roundOutRect(intersectRect(inflateRect(region, 2), content));
  if (isEmptyRect(r)) return;

  const scratch = pool.acquire(r.width, r.height);
  try {
    const s = scratch.ctx;
    s.setTransform(1, 0, 0, 1, -r.x, -r.y);
    s.clearRect(r.x, r.y, r.width, r.height);
    // Chỉ chép phần nguồn trong vùng r (không vẽ cả surface — xem drawLayer).
    const layerPart = layer.surface.region(r);
    if (layerPart) {
      s.globalAlpha = 1;
      s.globalCompositeOperation = 'source-over';
      drawPart(s, layerPart);
    }
    if (floating) {
      s.globalAlpha = 1;
      if (floating.hole) {
        s.globalCompositeOperation = 'destination-out';
        floating.hole.cover(s);
      }
      s.globalCompositeOperation = 'source-over';
      s.save();
      s.beginPath();
      s.rect(r.x, r.y, r.width, r.height);
      s.clip();
      floating.draw(s);
      s.restore();
    }
    const bufferPart = preview?.buffer.region(r);
    if (preview && bufferPart) {
      const clip = preview.clip ?? null;
      s.globalAlpha = preview.opacity;
      s.globalCompositeOperation = preview.composite;
      if (clip) drawClipped(s, bufferPart, clip, pool);
      else drawPart(s, bufferPart);
    }
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalAlpha = 1;
    s.globalCompositeOperation = 'source-over';
    target.drawImage(scratch.canvas, 0, 0, r.width, r.height, r.x, r.y, r.width, r.height);
  } finally {
    pool.release(scratch);
  }
}

/**
 * Xem trước filter (mục 5.8): ngoài khung xem trước vẽ layer như thường (cache, mipmap); trong khung
 * vẽ ảnh đã lọc. Ảnh này ở độ phân giải màn hình (≤ 1 MP) nên không cần scratch cỡ document — ghép
 * khi thu nhỏ ảnh lớn rẻ như khi zoom 100% (đo ở GĐ6). Có vùng chọn: gốc × (1 − m) + lọc × m.
 */
function drawWithFilter(
  target: Ctx2D,
  layer: RasterLayer,
  filter: FilterPreview,
  region: Rect,
  options: CompositeOptions,
): void {
  const f = filter.rect;
  // Khung xem trước trên pixel thiết bị, làm tròn vào trong: hai vùng clip (ngoài khung / trong
  // khung) khít nhau, không khử răng cưa — không có đường nối mờ quanh khung khi zoom lẻ.
  const m = target.getTransform();
  const device = transformRect(m, f);
  const x0 = Math.ceil(device.x);
  const y0 = Math.ceil(device.y);
  const x1 = Math.floor(device.x + device.width);
  const y1 = Math.floor(device.y + device.height);
  if (x1 <= x0 || y1 <= y0) {
    drawRaster(target, layer, region, options);
    return;
  }
  const canvas = target.canvas;
  // Phần ngoài khung (evenodd: cả canvas trừ khung — giao với clip vùng cần vẽ đang có).
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.beginPath();
  target.rect(0, 0, canvas.width, canvas.height);
  target.rect(x0, y0, x1 - x0, y1 - y0);
  target.clip('evenodd');
  target.setTransform(m);
  drawRaster(target, layer, region, options);
  target.restore();

  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.beginPath();
  target.rect(x0, y0, x1 - x0, y1 - y0);
  target.clip();
  target.setTransform(m);
  if (filter.clip) {
    drawFilterInSelection(target, layer, filter, filter.clip, options.scratch);
  } else {
    target.drawImage(filter.image, 0, 0, filter.width, filter.height, f.x, f.y, f.width, f.height);
  }
  target.restore();
}

/**
 * Trộn ảnh lọc với ảnh gốc theo độ phủ vùng chọn trên scratch cùng lưới với ảnh xem trước:
 * gốc × (1 − m) + lọc × m (cộng giá trị nhân trước bằng `lighter`) — như lúc áp dụng.
 */
function drawFilterInSelection(
  target: Ctx2D,
  layer: RasterLayer,
  filter: FilterPreview,
  clip: SelectionCoverage,
  pool: ScratchPool,
): void {
  const { width: w, height: h, rect: f } = filter;
  const sx = w / f.width;
  const sy = h / f.height;
  const out = pool.acquire(w, h);
  const tmp = pool.acquire(w, h);
  try {
    const o = out.ctx;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, w, h);
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
    o.setTransform(sx, 0, 0, sy, -f.x * sx, -f.y * sy);
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = 'medium';
    const part = layer.surface.region(roundOutRect(f));
    if (part) drawPart(o, part);
    o.globalCompositeOperation = 'destination-out';
    clip.cover(o);

    const t = tmp.ctx;
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.clearRect(0, 0, w, h);
    t.globalAlpha = 1;
    t.globalCompositeOperation = 'source-over';
    t.drawImage(filter.image, 0, 0, w, h, 0, 0, w, h);
    t.setTransform(sx, 0, 0, sy, -f.x * sx, -f.y * sy);
    t.globalCompositeOperation = 'destination-in';
    clip.cover(t);
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.globalCompositeOperation = 'source-over';

    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = 'lighter';
    o.drawImage(tmp.canvas, 0, 0, w, h, 0, 0, w, h);
    o.globalCompositeOperation = 'source-over';
    target.drawImage(out.canvas, 0, 0, w, h, f.x, f.y, f.width, f.height);
  } finally {
    pool.release(tmp);
    pool.release(out);
  }
}

/** Vẽ một phần stroke buffer chỉ trong vùng chọn: chép sang scratch, `destination-in`, rồi ghép. */
function drawClipped(
  target: Ctx2D,
  part: { canvas: CanvasImageSource; sx: number; sy: number; rect: Rect },
  clip: SelectionCoverage,
  pool: ScratchPool,
): void {
  const r = intersectRect(part.rect, clip.bounds);
  if (isEmptyRect(r)) return;
  const tmp = pool.acquire(r.width, r.height);
  try {
    const t = tmp.ctx;
    t.setTransform(1, 0, 0, 1, -r.x, -r.y);
    t.clearRect(r.x, r.y, r.width, r.height);
    drawPart(t, part);
    t.globalCompositeOperation = 'destination-in';
    clip.cover(t);
    t.setTransform(1, 0, 0, 1, 0, 0);
    target.drawImage(tmp.canvas, 0, 0, r.width, r.height, r.x, r.y, r.width, r.height);
  } finally {
    pool.release(tmp);
  }
}

/** Vẽ một phần surface (từ GrowableSurface.region) vào đúng vị trí document. */
function drawPart(
  target: Ctx2D,
  part: { canvas: CanvasImageSource; sx: number; sy: number; rect: Rect },
): void {
  const { rect } = part;
  target.drawImage(
    part.canvas,
    part.sx,
    part.sy,
    rect.width,
    rect.height,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
  );
}
