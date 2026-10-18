import type { Document } from '../core/Document';
import type {
  ColorsState,
  MaskData,
  MaskRequest,
  NoticeCode,
  Point,
  Rect,
  SelectionMode,
  SelectionShape,
  SelectionSummary,
  WorkerClient,
} from '../core/types';
import { AddLayerCommand } from '../history/commands/LayerCommand';
import { PaintCommand } from '../history/commands/PaintCommand';
import type { TileStore } from '../history/TileStore';
import type { Command } from '../history/types';
import { RasterLayer, touchContent } from '../layers/layers';
import {
  boxHandlePosition,
  normalizeAngle,
  resizeBox,
  rotationFromHandle,
  type BoxHandle,
} from '../layers/objects/geometry';
import type { MemoryBudget } from '../memory/MemoryBudget';
import { createSurface, isAllocationError, type Ctx2D, type ScratchPool } from '../memory/surfaces';
import type { OverlayContext, SelectionCoverage } from '../tools/types';
import { colorToCss, opaqueColor, parseColor } from '../utils/color';
import {
  EMPTY_RECT,
  inflateRect,
  intersectRect,
  isEmptyRect,
  roundOutRect,
  unionRect,
} from '../utils/rect';
import type { Viewport } from '../viewport/Viewport';
import { FloatingSelection, type FloatingTransform } from './Floating';
import { Selection } from './Selection';
import { transformShape } from './shape';

/** Phụ thuộc của SelectionManager — Editor cung cấp (không import Editor để tránh vòng). */
export interface SelectionHost {
  document(): Document | null;
  readonly memory: MemoryBudget;
  readonly workers: WorkerClient;
  readonly viewport: Viewport;
  readonly scratch: ScratchPool;
  /** Chạy command; thiếu bộ nhớ thì từ chối an toàn và báo (trả false). */
  execute(command: Command): boolean;
  createTileStore(): TileStore;
  invalidate(rect?: Rect): void;
  invalidateOverlay(): void;
  notify(code: NoticeCode): void;
  colors(): Readonly<ColorsState>;
  layerName(kind: 'raster' | 'vector', n: number): string;
  /** Ghép ảnh nhìn thấy (gồm nền document) của một vùng lên ctx đặt ma trận document. */
  composite(ctx: Ctx2D, region: Rect): void;
  changed(summary: SelectionSummary | null): void;
}

/** Nội dung copy: pixel trong vùng chọn + vị trí (mục 5.7 — paste giữ đúng vị trí). */
export interface ClipboardCapture {
  rect: Rect;
  bitmap: Promise<ImageBitmap>;
  png: Promise<Blob>;
}

export interface SelectionApplyOptions {
  feather: number;
  antiAlias: boolean;
}

/** Handle của pixel nổi: 8 handle co giãn + handle xoay. */
export type FloatingHandle = BoxHandle;

const HANDLES: readonly FloatingHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rotate'];
const HANDLE_SIZE = 8;
const HANDLE_HIT = 7;
/** Khoảng cách handle xoay phía trên khung, CSS px. */
const ROTATE_OFFSET = 24;
const ACCENT = '#3B5BDB';
/** Khoảng cách nét đứt của marching ants, CSS px. */
const ANTS_DASH = 4;

/**
 * Vùng chọn và floating selection (mục 5.7, module engine/selection ở mục 4.1): giữ vùng chọn hiện
 * tại, dựng mask trong Worker khi cần, nhấc pixel thành surface nổi, commit/hủy, copy/cắt/dán, tô
 * và xóa trong vùng chọn, vẽ marching ants và handle biến đổi.
 *
 * Vùng chọn là trạng thái làm việc, không phải dữ liệu document: đổi vùng chọn không tạo bước
 * history (ADR 0025); chỉ thay đổi pixel (di chuyển, xóa, tô, dán) là Command.
 */
export class SelectionManager {
  private current: Selection | null = null;
  private float: FloatingSelection | null = null;
  /** Lượt dựng mask đang chờ — kết quả cũ hơn bị bỏ. */
  private request = 0;
  /** Pha marching ants (CSS px), Editor tăng theo thời gian. */
  antsPhase = 0;

  constructor(private readonly host: SelectionHost) {}

  get selection(): Selection | null {
    return this.current;
  }

  get floating(): FloatingSelection | null {
    return this.float;
  }

  /** Có vùng chọn hoặc pixel nổi. */
  get active(): boolean {
    return this.current !== null || this.float !== null;
  }

  summary(): SelectionSummary | null {
    const f = this.float;
    if (f) {
      return {
        bounds: roundOutRect(f.bounds),
        shape: this.current?.kind ?? 'rect',
        floating: true,
      };
    }
    return this.current?.summary(false) ?? null;
  }

  /** Độ phủ để cắt nét vẽ, tô loang (mục 5.5) — không áp dụng khi đang có pixel nổi. */
  clip(): SelectionCoverage | null {
    return this.float ? null : this.current;
  }

  /** Điểm (document) nằm trong vùng chọn hoặc pixel nổi. */
  contains(p: Readonly<Point>): boolean {
    if (this.float) return this.float.contains(p);
    return this.current?.contains(p) ?? false;
  }

  // ---------------------------------------------------------------------------
  // Đặt vùng chọn
  // ---------------------------------------------------------------------------

  /**
   * Vùng chọn mới từ hình (Marquee, Lasso) kết hợp với vùng đang có. Hình đơn không làm mềm chỉ
   * giữ path (đồng bộ); còn lại dựng mask trong Worker (mục 5.7).
   */
  applyShape(shape: SelectionShape, mode: SelectionMode, options: SelectionApplyOptions): void {
    this.commitFloating();
    const doc = this.host.document();
    if (!doc) return;
    const base = this.current;
    if (!base && (mode === 'subtract' || mode === 'intersect')) return;
    const replace = mode === 'replace' || !base;
    const pathOnly = options.feather <= 0 && (options.antiAlias || shape.kind === 'rect');
    if (replace && pathOnly) {
      this.request++;
      this.set(Selection.fromShape(shape, doc.bounds));
      return;
    }
    this.requestMask(doc, {
      docWidth: doc.width,
      docHeight: doc.height,
      base: replace ? null : base.operand(),
      operand: { kind: 'shape', shape },
      mode: replace ? 'replace' : mode,
      feather: options.feather,
      antiAlias: options.antiAlias,
    });
  }

  /** Vùng chọn từ mask (Magic Wand) kết hợp với vùng đang có. */
  applyMask(mask: MaskData, mode: SelectionMode): void {
    this.commitFloating();
    const doc = this.host.document();
    if (!doc) return;
    const base = this.current;
    if (!base && (mode === 'subtract' || mode === 'intersect')) return;
    const replace = mode === 'replace' || !base;
    this.requestMask(doc, {
      docWidth: doc.width,
      docHeight: doc.height,
      base: replace ? null : base.operand(),
      operand: { kind: 'mask', mask },
      mode: replace ? 'replace' : mode,
      feather: 0,
      antiAlias: true,
    });
  }

  /** Ctrl+A. */
  selectAll(): void {
    this.commitFloating();
    const doc = this.host.document();
    if (!doc) return;
    this.request++;
    this.set(Selection.fromShape({ kind: 'rect', rect: doc.bounds }, doc.bounds));
  }

  /** Ctrl+D / Esc: bỏ chọn (pixel nổi được commit trước, như MS Paint). */
  deselect(): void {
    this.commitFloating();
    this.request++;
    this.set(null);
  }

  /** Đảo vùng chọn: cả document trừ vùng đang chọn. */
  invert(): void {
    this.commitFloating();
    const doc = this.host.document();
    const current = this.current;
    if (!doc) return;
    if (!current) {
      this.selectAll();
      return;
    }
    this.requestMask(doc, {
      docWidth: doc.width,
      docHeight: doc.height,
      base: { kind: 'shape', shape: { kind: 'rect', rect: doc.bounds } },
      operand: current.operand(),
      mode: 'subtract',
      feather: 0,
      antiAlias: true,
    });
  }

  /** Document đổi kích thước hoặc bị thay: bỏ vùng chọn và pixel nổi (không commit). */
  reset(): void {
    this.request++;
    const f = this.float;
    this.float = null;
    f?.dispose();
    this.set(null);
  }

  /** Dời vùng chọn (không có pixel nổi) theo document vừa đổi khung (Canvas size, cắt xén). */
  translate(dx: number, dy: number): void {
    const doc = this.host.document();
    if (this.float || !this.current || !doc) {
      this.reset();
      return;
    }
    const moved = this.current.moved(dx, dy, doc.bounds);
    this.current = null;
    this.set(moved);
  }

  private requestMask(doc: Document, request: MaskRequest): void {
    const id = ++this.request;
    const size = { width: doc.width, height: doc.height };
    this.host.workers.buildMask(request).then(
      (result) => {
        const stale =
          id !== this.request ||
          this.host.document() !== doc ||
          doc.width !== size.width ||
          doc.height !== size.height;
        if (stale) {
          result?.bitmap?.close();
          return;
        }
        if (!result) {
          this.set(null);
          return;
        }
        try {
          this.set(Selection.fromMask(result, this.host.memory));
        } catch (error) {
          result.bitmap?.close();
          if (!isAllocationError(error)) throw error;
          this.host.notify('memory.refused');
        }
      },
      () => {
        if (id === this.request) this.host.notify('image.failed');
      },
    );
  }

  private set(next: Selection | null): void {
    const previous = this.current;
    if (previous && previous !== next && this.float?.hole !== previous) previous.dispose();
    this.current = next;
    this.emit();
  }

  private emit(): void {
    this.host.changed(this.summary());
    this.host.invalidateOverlay();
  }

  // ---------------------------------------------------------------------------
  // Pixel nổi
  // ---------------------------------------------------------------------------

  /** Layer raster có thể sửa pixel (active), hoặc báo lý do. */
  editableLayer(): RasterLayer | null {
    const doc = this.host.document();
    if (!doc) return null;
    const layer = doc.activeLayer;
    if (layer.kind !== 'raster') {
      this.host.notify('layer.notRaster');
      return null;
    }
    if (layer.locked) {
      this.host.notify('layer.locked');
      return null;
    }
    if (!layer.visible) {
      this.host.notify('layer.hidden');
      return null;
    }
    return layer;
  }

  /**
   * Nhấc pixel trong vùng chọn của layer hoạt động thành surface nổi (mục 5.7); `duplicate` (Alt)
   * giữ nguyên pixel gốc. Trả false nếu không nhấc được.
   */
  lift(duplicate: boolean): boolean {
    if (this.float) return true;
    const sel = this.current;
    if (!sel) return false;
    const layer = this.editableLayer();
    if (!layer) return false;
    const rect = sel.bounds;
    let surface;
    try {
      surface = createSurface(this.host.memory, rect.width, rect.height, 'temp');
    } catch (error) {
      if (!isAllocationError(error)) throw error;
      this.host.notify('memory.refused');
      return false;
    }
    const c = surface.ctx;
    c.setTransform(1, 0, 0, 1, -rect.x, -rect.y);
    const part = layer.surface.region(rect);
    if (part) {
      const r = part.rect;
      c.drawImage(part.canvas, part.sx, part.sy, r.width, r.height, r.x, r.y, r.width, r.height);
    }
    c.globalCompositeOperation = 'destination-in';
    sel.cover(c);
    c.globalCompositeOperation = 'source-over';
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.float = new FloatingSelection({
      surface,
      origin: rect,
      target: { kind: 'layer', layerId: layer.id },
      hole: duplicate ? null : sel,
      outline: sel.outline(),
    });
    this.host.invalidate(rect);
    this.emit();
    return true;
  }

  /** Đặt phép biến đổi của pixel nổi (kéo, handle). */
  setTransform(transform: FloatingTransform): void {
    const f = this.float;
    if (!f) return;
    const before = f.bounds;
    f.transform = transform;
    this.host.invalidate(inflateRect(unionRect(before, f.bounds), 2));
    this.emit();
  }

  /** Dời pixel nổi (nhấc ra trước nếu mới chỉ có vùng chọn) — phím mũi tên. */
  nudge(dx: number, dy: number): boolean {
    if (!this.float && !this.lift(false)) return false;
    const f = this.float;
    if (!f) return false;
    const t = f.transform;
    this.setTransform({ ...t, rect: { ...t.rect, x: t.rect.x + dx, y: t.rect.y + dy } });
    return true;
  }

  /** Xoay pixel nổi (hoặc vùng chọn: nhấc ra trước) theo bội số 90°. */
  rotate(quarterTurns: number): boolean {
    if (!this.float && !this.lift(false)) return false;
    const f = this.float;
    if (!f) return false;
    const t = f.transform;
    this.setTransform({
      ...t,
      rotation: normalizeAngle(t.rotation + (quarterTurns * Math.PI) / 2),
    });
    return true;
  }

  /** Lật pixel nổi theo trục của màn hình (ngang: trái ↔ phải). */
  flip(axis: 'horizontal' | 'vertical'): boolean {
    if (!this.float && !this.lift(false)) return false;
    const f = this.float;
    if (!f) return false;
    const t = f.transform;
    this.setTransform({
      ...t,
      rotation: normalizeAngle(-t.rotation),
      flipX: axis === 'horizontal' ? !t.flipX : t.flipX,
      flipY: axis === 'vertical' ? !t.flipY : t.flipY,
    });
    return true;
  }

  /**
   * Commit pixel nổi thành MỘT bước history (Enter, click ra ngoài, đổi tool): PaintCommand trên
   * layer gốc (xóa lỗ + vẽ nội dung đã biến đổi), hoặc AddLayerCommand cho ảnh vừa dán.
   */
  commitFloating(): boolean {
    const f = this.float;
    if (!f) return false;
    this.float = null;
    const doc = this.host.document();
    let committed: boolean;
    let next: Selection | null = this.current;
    try {
      if (!doc) return false;
      if (f.target.kind === 'layer') {
        committed = this.commitToLayer(doc, f);
        if (committed) next = this.selectionAfter(f, doc);
      } else {
        committed = this.commitAsLayer(doc, f);
        next = committed ? this.boxSelection(f, doc) : null;
      }
      return committed;
    } finally {
      this.host.invalidate(inflateRect(unionRect(f.bounds, f.hole?.bounds ?? EMPTY_RECT), 2));
      // Vùng chọn cũ (lỗ) có thể vừa được dùng trong command: chỉ hủy sau khi command đã chạy.
      if (next !== this.current) {
        const previous = this.current;
        this.current = next;
        if (previous && previous !== next) previous.dispose();
      }
      f.dispose();
      this.emit();
    }
  }

  /** Esc: bỏ pixel nổi, layer giữ nguyên (ảnh vừa dán thì bỏ luôn vùng chọn). */
  cancelFloating(): boolean {
    const f = this.float;
    if (!f) return false;
    this.float = null;
    this.host.invalidate(inflateRect(unionRect(f.bounds, f.hole?.bounds ?? EMPTY_RECT), 2));
    f.dispose();
    if (f.target.kind === 'new-layer') this.set(null);
    else this.emit();
    return true;
  }

  private commitToLayer(doc: Document, f: FloatingSelection): boolean {
    if (f.target.kind !== 'layer') return false;
    const layer = doc.getLayer(f.target.layerId);
    if (layer?.kind !== 'raster') return false;
    // Nhân bản mà chưa dời, hoặc nhấc rồi đặt lại đúng chỗ: không đổi pixel nào.
    if (f.isIdentity) return false;
    const dest = intersectRect(roundOutRect(f.bounds), doc.bounds);
    const area = intersectRect(unionRect(f.hole?.bounds ?? EMPTY_RECT, dest), doc.bounds);
    if (isEmptyRect(area)) return false;
    const label = f.isTranslation
      ? f.hole
        ? 'history.moveSelection'
        : 'history.duplicateSelection'
      : 'history.transformSelection';
    return this.paint(layer, label, area, isEmptyRect(dest) ? null : dest, (c) => {
      if (f.hole) {
        c.globalCompositeOperation = 'destination-out';
        f.hole.cover(c);
        c.globalCompositeOperation = 'source-over';
      }
      c.save();
      c.beginPath();
      c.rect(0, 0, doc.width, doc.height);
      c.clip();
      f.draw(c, 'high');
      c.restore();
    });
  }

  private commitAsLayer(doc: Document, f: FloatingSelection): boolean {
    if (f.target.kind !== 'new-layer') return false;
    const after = doc.getLayer(f.target.afterLayerId);
    const index = after ? doc.indexOfLayer(after.id) + 1 : doc.layers.length;
    const n = doc.layers.filter((l) => l.kind === 'raster').length + 1;
    let layer: RasterLayer | null = null;
    try {
      layer = new RasterLayer(
        { name: this.host.layerName('raster', n) },
        this.host.memory,
        doc.bounds,
      );
      const dest = intersectRect(roundOutRect(f.bounds), doc.bounds);
      if (!isEmptyRect(dest) && layer.surface.ensure(dest)) {
        const session = layer.surface.begin();
        if (session) {
          f.draw(session.ctx, 'high');
          session.end();
        }
      }
      touchContent(layer);
    } catch (error) {
      layer?.dispose();
      if (!isAllocationError(error)) throw error;
      this.host.notify('memory.refused');
      return false;
    }
    return this.host.execute(new AddLayerCommand('history.paste', layer, index, true));
  }

  /** Vùng chọn sau khi commit: hình cũ theo phép biến đổi của pixel nổi. */
  private selectionAfter(f: FloatingSelection, doc: Document): Selection | null {
    const sel = this.current;
    if (!sel) return this.boxSelection(f, doc);
    if (f.isTranslation) {
      const dx = f.transform.rect.x - f.origin.x;
      const dy = f.transform.rect.y - f.origin.y;
      if (Number.isInteger(dx) && Number.isInteger(dy)) {
        const moved = sel.moved(dx, dy, doc.bounds);
        if (this.current === sel) this.current = null;
        return moved;
      }
    }
    if (sel.shape) return Selection.fromShape(transformShape(sel.shape, f.docMatrix), doc.bounds);
    return this.boxSelection(f, doc);
  }

  private boxSelection(f: FloatingSelection, doc: Document): Selection | null {
    const t = f.transform;
    if (t.rotation === 0)
      return Selection.fromShape({ kind: 'rect', rect: roundOutRect(t.rect) }, doc.bounds);
    return Selection.fromShape({ kind: 'polygon', points: f.corners() }, doc.bounds);
  }

  // ---------------------------------------------------------------------------
  // Xóa, tô, copy, cắt, dán
  // ---------------------------------------------------------------------------

  /** Delete: xóa pixel trong vùng chọn (layer khóa trong suốt: tô màu phụ, như Eraser). */
  deleteContent(label = 'history.deleteSelection'): boolean {
    const f = this.float;
    if (f) {
      if (f.target.kind === 'new-layer' || !f.hole) return this.cancelFloating();
      // Bỏ pixel nổi, giữ lỗ: chỉ xóa vùng gốc.
      const hole = f.hole;
      this.float = null;
      f.dispose();
      this.host.invalidate(inflateRect(unionRect(f.bounds, hole.bounds), 2));
      const done = this.clearArea(hole, label);
      this.emit();
      return done;
    }
    const sel = this.current;
    if (!sel) return false;
    return this.clearArea(sel, label);
  }

  private clearArea(sel: SelectionCoverage, label: string): boolean {
    const layer = this.editableLayer();
    const doc = this.host.document();
    if (!layer || !doc) return false;
    if (layer.alphaLocked) {
      const secondary = parseColor(this.host.colors().secondary);
      return this.paint(layer, label, sel.bounds, null, (c) => {
        c.globalCompositeOperation = 'source-atop';
        c.globalAlpha = secondary.a / 255;
        this.paintCoverage(sel, c, colorToCss(opaqueColor(this.host.colors().secondary)));
      });
    }
    const area = layer.bounds ? intersectRect(sel.bounds, layer.bounds) : EMPTY_RECT;
    if (isEmptyRect(area)) return false;
    return this.paint(layer, label, area, null, (c) => {
      c.globalCompositeOperation = 'destination-out';
      sel.cover(c);
    });
  }

  /** Tô vùng chọn bằng màu chính (mục 7.6 "Tô màu"). */
  fillContent(): boolean {
    this.commitFloating();
    const sel = this.current;
    const layer = sel ? this.editableLayer() : null;
    if (!sel || !layer) return false;
    const color = this.host.colors().primary;
    const alpha = parseColor(color).a / 255;
    return this.paint(
      layer,
      'history.fillSelection',
      sel.bounds,
      layer.alphaLocked ? null : sel.bounds,
      (c) => {
        c.globalCompositeOperation = layer.alphaLocked ? 'source-atop' : 'source-over';
        c.globalAlpha = alpha;
        this.paintCoverage(sel, c, colorToCss(opaqueColor(color)));
      },
    );
  }

  private paintCoverage(sel: SelectionCoverage, c: Ctx2D, css: string): void {
    if (sel instanceof Selection) sel.paint(c, css, this.host.scratch);
  }

  /**
   * Copy (mục 5.7): pixel của layer hoạt động trong vùng chọn (`merged` hoặc layer chú thích: ảnh
   * đang thấy), kèm vị trí để dán lại đúng chỗ. Pixel nổi được commit trước.
   */
  copy(merged: boolean): ClipboardCapture | null {
    this.commitFloating();
    const doc = this.host.document();
    const sel = this.current;
    if (!doc || !sel) return null;
    const layer = doc.activeLayer;
    const rect = { ...sel.bounds };
    let surface;
    try {
      surface = createSurface(this.host.memory, rect.width, rect.height, 'temp');
    } catch (error) {
      if (!isAllocationError(error)) throw error;
      this.host.notify('memory.refused');
      return null;
    }
    const c = surface.ctx;
    c.setTransform(1, 0, 0, 1, -rect.x, -rect.y);
    if (merged || layer.kind !== 'raster') {
      this.host.composite(c, rect);
    } else {
      const part = layer.surface.region(rect);
      if (part) {
        const r = part.rect;
        c.drawImage(part.canvas, part.sx, part.sy, r.width, r.height, r.x, r.y, r.width, r.height);
      }
    }
    c.globalCompositeOperation = 'destination-in';
    sel.cover(c);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    const canvas = surface.canvas;
    const bitmap = createImageBitmap(canvas);
    const png: Promise<Blob> =
      'convertToBlob' in canvas
        ? canvas.convertToBlob({ type: 'image/png' })
        : new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Không mã hóa được ảnh'));
            }, 'image/png');
          });
    void Promise.allSettled([bitmap, png]).then(() => {
      surface.release();
    });
    return { rect, bitmap, png };
  }

  /** Cắt: copy pixel của layer hoạt động rồi xóa chúng (một bước history). */
  cut(): ClipboardCapture | null {
    this.commitFloating();
    if (!this.current || !this.editableLayer()) return null;
    const capture = this.copy(false);
    if (!capture) return null;
    this.deleteContent('history.cut');
    return capture;
  }

  /**
   * Dán ảnh thành pixel nổi sẽ là layer mới ngay trên layer hoạt động (mục 2, 7.4): tại `at`
   * (dán nội bộ giữ đúng vị trí) hoặc giữa khung nhìn.
   */
  paste(image: CanvasImageSource & { width: number; height: number }, at: Point | null): boolean {
    this.commitFloating();
    const doc = this.host.document();
    if (!doc) return false;
    const width = Math.round(image.width);
    const height = Math.round(image.height);
    if (width < 1 || height < 1) return false;
    let surface;
    try {
      surface = createSurface(this.host.memory, width, height, 'temp');
    } catch (error) {
      if (!isAllocationError(error)) throw error;
      this.host.notify('memory.refused');
      return false;
    }
    surface.ctx.drawImage(image, 0, 0);
    const origin = at ?? this.viewCenterOrigin(doc, width, height);
    const rect = { x: Math.round(origin.x), y: Math.round(origin.y), width, height };
    const outline = Float32Array.from([
      rect.x,
      rect.y,
      rect.x + width,
      rect.y,
      rect.x + width,
      rect.y + height,
      rect.x,
      rect.y + height,
    ]);
    this.request++;
    this.set(Selection.fromShape({ kind: 'rect', rect }, doc.bounds));
    this.float = new FloatingSelection({
      surface,
      origin: rect,
      target: { kind: 'new-layer', afterLayerId: doc.activeLayerId },
      hole: null,
      outline: [outline],
    });
    this.host.invalidate(rect);
    this.emit();
    return true;
  }

  /** Góc trên trái để ảnh nằm giữa phần document đang thấy. */
  private viewCenterOrigin(doc: Document, width: number, height: number): Point {
    const view = this.host.viewport.hasSize
      ? intersectRect(this.host.viewport.visibleDocRect(), doc.bounds)
      : doc.bounds;
    const area = isEmptyRect(view) ? doc.bounds : view;
    return { x: area.x + area.width / 2 - width / 2, y: area.y + area.height / 2 - height / 2 };
  }

  /** PaintCommand trên layer: `ensure` = vùng surface cần nở trước khi vẽ. */
  private paint(
    layer: RasterLayer,
    label: string,
    area: Rect,
    ensure: Rect | null,
    draw: (c: Ctx2D) => void,
  ): boolean {
    const doc = this.host.document();
    if (!doc) return false;
    const target = intersectRect(roundOutRect(area), doc.bounds);
    if (isEmptyRect(target)) return false;
    let store: TileStore;
    try {
      store = this.host.createTileStore();
    } catch (error) {
      if (!isAllocationError(error)) throw error;
      this.host.notify('memory.refused');
      return false;
    }
    const command = new PaintCommand({
      label,
      layerId: layer.id,
      area: target,
      store,
      createStore: () => this.host.createTileStore(),
      apply: (l) => {
        if (ensure) l.surface.ensure(intersectRect(roundOutRect(ensure), doc.bounds));
        const session = l.surface.begin();
        if (!session) return;
        session.ctx.globalAlpha = 1;
        draw(session.ctx);
        session.end();
      },
    });
    return this.host.execute(command);
  }

  // ---------------------------------------------------------------------------
  // Handle biến đổi
  // ---------------------------------------------------------------------------

  /** Handle của pixel nổi dưới điểm màn hình (CSS px). */
  handleAt(screen: Readonly<Point>): FloatingHandle | null {
    const f = this.float;
    if (!f) return null;
    for (const [handle, pos] of this.handlePositions(f)) {
      const s = this.host.viewport.docToScreen(pos);
      if (Math.abs(s.x - screen.x) <= HANDLE_HIT && Math.abs(s.y - screen.y) <= HANDLE_HIT) {
        return handle;
      }
    }
    return null;
  }

  /** Phép biến đổi khi kéo `handle` từ `start` tới điểm `p` (document). */
  dragHandle(
    start: FloatingTransform,
    handle: FloatingHandle,
    p: Readonly<Point>,
    shift: boolean,
  ): FloatingTransform {
    if (handle === 'rotate') {
      return { ...start, rotation: rotationFromHandle(start.rect, p, shift) };
    }
    // Shift giữ tỉ lệ — cùng quy ước với handle của đối tượng vector.
    const rect = resizeBox(start.rect, start.rotation, handle, p, shift, 1);
    return { ...start, rect };
  }

  private handlePositions(f: FloatingSelection): [FloatingHandle, Point][] {
    const t = f.transform;
    const offset = ROTATE_OFFSET / this.host.viewport.zoom;
    return HANDLES.map((h) => [h, boxHandlePosition(t.rect, t.rotation, h, offset)]);
  }

  // ---------------------------------------------------------------------------
  // Overlay: marching ants, khung + handle của pixel nổi
  // ---------------------------------------------------------------------------

  renderOverlay({ ctx, viewport }: OverlayContext, showHandles: boolean): void {
    const f = this.float;
    const lines = f ? f.transformedOutline() : this.current?.outline();
    if (lines && lines.length > 0) this.drawAnts(ctx, viewport, lines);
    if (!f || !showHandles) return;
    ctx.save();
    const corners = f.corners().map((p) => viewport.docToScreen(p));
    ctx.lineWidth = 1;
    ctx.strokeStyle = ACCENT;
    ctx.beginPath();
    corners.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.stroke();
    const positions = new Map(this.handlePositions(f));
    const top = viewport.docToScreen(
      boxHandlePosition(f.transform.rect, f.transform.rotation, 'n', 0),
    );
    const rotate = positions.get('rotate');
    if (rotate) {
      const r = viewport.docToScreen(rotate);
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(r.x, r.y);
      ctx.stroke();
    }
    for (const [handle, pos] of positions) {
      const s = viewport.docToScreen(pos);
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (handle === 'rotate') ctx.arc(s.x, s.y, HANDLE_SIZE / 2 + 0.5, 0, Math.PI * 2);
      else ctx.rect(s.x - HANDLE_SIZE / 2, s.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawAnts(ctx: Ctx2D, viewport: Viewport, lines: readonly Float32Array[]): void {
    const { zoom, panX, panY } = viewport.state;
    ctx.save();
    ctx.beginPath();
    for (const line of lines) {
      for (let i = 0; i + 1 < line.length; i += 2) {
        const x = (line[i] ?? 0) * zoom + panX;
        const y = (line[i + 1] ?? 0) * zoom + panY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
    ctx.lineWidth = 1;
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = '#FFFFFF';
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.strokeStyle = '#000000';
    ctx.setLineDash([ANTS_DASH, ANTS_DASH]);
    ctx.lineDashOffset = -this.antsPhase;
    ctx.stroke();
    ctx.restore();
  }

  dispose(): void {
    this.request++;
    this.float?.dispose();
    this.float = null;
    this.current?.dispose();
    this.current = null;
  }
}
