import type { Document } from '../core/Document';
import { BLEND_MODES, type ID, type NoticeCode, type Rect } from '../core/types';
import {
  AddLayerCommand,
  LayerPropsCommand,
  MoveLayerCommand,
  RasterizeLayerCommand,
  RemoveLayerCommand,
  ReplaceLayersCommand,
  SetObjectsCommand,
  TransactionCommand,
  type LayerProps,
} from '../history/commands/LayerCommand';
import { PaintCommand } from '../history/commands/PaintCommand';
import type { TileStore } from '../history/TileStore';
import type { Command } from '../history/types';
import type { MemoryBudget } from '../memory/MemoryBudget';
import {
  createSurface,
  isAllocationError,
  type ScratchPool,
  type Surface,
} from '../memory/surfaces';
import {
  compositeDocument,
  drawLayer,
  drawObjects,
  layerContentBounds,
  vectorLayerMode,
  type CompositeOptions,
} from '../render/Compositor';
import { intersectRect, isEmptyRect, roundOutRect, unionRect } from '../utils/rect';
import type { ObjectEnv } from './objects/types';
import { hasRedactions, RasterLayer, touchContent, VectorLayer, type Layer } from './layers';

/** Những gì LayerManager cần từ Editor — giữ module này không phụ thuộc Editor. */
export interface LayerManagerHost {
  document(): Document | null;
  readonly memory: MemoryBudget;
  readonly env: ObjectEnv;
  /** Scratch tọa độ document cho Merge/Flatten (ghép layer chú thích có opacity/blend). */
  readonly scratch: ScratchPool;
  /** Chạy command an toàn: thiếu bộ nhớ → từ chối có thông báo, trả false. */
  execute(command: Command): boolean;
  notify(code: NoticeCode): void;
  layerName(kind: 'raster' | 'vector', n: number): string;
  /** Tên bản sao ("Lớp 1 (bản sao)") và tên layer nền sau Flatten — chuỗi giao diện do UI cấp. */
  copyName(name: string): string;
  backgroundName(): string;
  createTileStore(): TileStore;
  rasterize(id: ID, vector: VectorLayer): RasterLayer;
  /** Trước thao tác cấu trúc: ghi chữ đang gõ, bỏ chọn đối tượng. */
  settle(): void;
}

/** Độ dài tối đa của tên layer. */
export const MAX_LAYER_NAME = 100;

/** Layer hiện ra (có đóng góp vào ảnh ghép). */
function shows(layer: Layer): boolean {
  return layer.visible && (layer.opacity > 0 || hasRedactions(layer));
}

/**
 * Thao tác quản lý layer của panel Layers (mục 2, 5.4, 5.6). Mọi thay đổi đi qua Command (một bước
 * history mỗi thao tác); thao tác tạo mới (nhân bản, Merge Visible, Flatten) cấp phát qua
 * MemoryBudget và bị từ chối có thông báo nếu không đủ bộ nhớ — không layer nào bị mất.
 */
export class LayerManager {
  constructor(private readonly host: LayerManagerHost) {}

  /** Thêm layer trống ngay trên layer hoạt động (Shift+N). Layer raster chưa tốn bộ nhớ (cấp lười). */
  add(kind: 'raster' | 'vector' = 'raster'): ID | null {
    const doc = this.host.document();
    if (!doc) return null;
    this.host.settle();
    const name = this.uniqueName(doc, kind);
    const layer =
      kind === 'raster'
        ? new RasterLayer({ name }, this.host.memory, doc.bounds)
        : new VectorLayer({ name });
    const index = doc.indexOfLayer(doc.activeLayerId) + 1;
    const label = kind === 'raster' ? 'history.addLayer' : 'history.addAnnotationLayer';
    if (!this.host.execute(new AddLayerCommand(label, layer, index))) {
      layer.dispose();
      return null;
    }
    return layer.id;
  }

  /** Nhân bản layer, đặt ngay trên bản gốc và chọn bản sao (Ctrl+J). */
  duplicate(id: ID): ID | null {
    const doc = this.host.document();
    const source = doc?.getLayer(id);
    if (!doc || !source) return null;
    this.host.settle();
    const init = {
      name: this.host.copyName(source.name).slice(0, MAX_LAYER_NAME),
      visible: source.visible,
      locked: source.locked,
      alphaLocked: source.alphaLocked,
      opacity: source.opacity,
      blendMode: source.blendMode,
    };
    let copy: Layer;
    if (source.kind === 'raster') {
      const raster = new RasterLayer(init, this.host.memory, doc.bounds);
      const bounds = source.bounds;
      const canvas = source.surface.surface?.canvas;
      try {
        if (bounds && canvas && raster.surface.ensure(bounds)) {
          const session = raster.surface.begin();
          if (session) {
            session.ctx.globalAlpha = 1;
            session.ctx.globalCompositeOperation = 'source-over';
            session.ctx.imageSmoothingEnabled = false;
            session.ctx.drawImage(canvas, bounds.x, bounds.y);
            session.end();
          }
        }
      } catch (error) {
        raster.dispose();
        if (!isAllocationError(error)) throw error;
        this.host.notify('memory.refused');
        return null;
      }
      copy = raster;
    } else {
      const vector = new VectorLayer(init);
      vector.objects = source.objects.map((o) => ({ ...o, id: crypto.randomUUID() }));
      copy = vector;
    }
    touchContent(copy);
    const index = doc.indexOfLayer(id) + 1;
    if (!this.host.execute(new AddLayerCommand('history.duplicateLayer', copy, index, true))) {
      copy.dispose();
      return null;
    }
    return copy.id;
  }

  /** Xóa layer (không xóa được layer cuối cùng). */
  remove(id: ID): boolean {
    const doc = this.host.document();
    const layer = doc?.getLayer(id);
    if (!doc || !layer || doc.layers.length <= 1) return false;
    this.host.settle();
    return this.host.execute(new RemoveLayerCommand('history.deleteLayer', layer));
  }

  /** Đưa layer tới vị trí `index` (chỉ số từ dưới lên) — kéo thả hoặc phím trong panel. */
  move(id: ID, index: number): boolean {
    const doc = this.host.document();
    if (!doc) return false;
    const from = doc.indexOfLayer(id);
    const to = Math.max(0, Math.min(Math.round(index), doc.layers.length - 1));
    if (from < 0 || from === to) return false;
    this.host.settle();
    return this.host.execute(new MoveLayerCommand('history.moveLayer', id, to));
  }

  /**
   * Đổi thuộc tính. Layer khóa chặn mọi thay đổi nội dung/cách ghép (opacity, blend, khóa trong
   * suốt); đổi tên, ẩn/hiện và mở khóa vẫn được (mục 5.4).
   */
  setProps(id: ID, patch: Partial<LayerProps>): boolean {
    const doc = this.host.document();
    const layer = doc?.getLayer(id);
    if (!doc || !layer) return false;
    const next: Partial<LayerProps> = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim().slice(0, MAX_LAYER_NAME);
      if (name && name !== layer.name) next.name = name;
    }
    if (patch.visible !== undefined && patch.visible !== layer.visible)
      next.visible = patch.visible;
    if (patch.locked !== undefined && patch.locked !== layer.locked) next.locked = patch.locked;
    if (patch.alphaLocked !== undefined && patch.alphaLocked !== layer.alphaLocked) {
      next.alphaLocked = patch.alphaLocked;
    }
    if (patch.opacity !== undefined && Number.isFinite(patch.opacity)) {
      const opacity = Math.round(Math.min(1, Math.max(0, patch.opacity)) * 100) / 100;
      if (opacity !== layer.opacity) next.opacity = opacity;
    }
    if (
      patch.blendMode !== undefined &&
      patch.blendMode !== layer.blendMode &&
      BLEND_MODES.includes(patch.blendMode)
    ) {
      next.blendMode = patch.blendMode;
    }
    const keys = Object.keys(next) as (keyof LayerProps)[];
    if (keys.length === 0) return false;
    const guarded = keys.some((k) => k === 'opacity' || k === 'blendMode' || k === 'alphaLocked');
    if (layer.locked && next.locked !== false && guarded) {
      this.host.notify('layer.locked');
      return false;
    }
    return this.host.execute(new LayerPropsCommand(propsLabel(keys), id, next));
  }

  /** Lý do không gộp được layer `id` xuống layer dưới; null = gộp được. */
  mergeDownBlocker(id: ID): NoticeCode | 'no-layer-below' | null {
    const doc = this.host.document();
    const index = doc?.indexOfLayer(id) ?? -1;
    const upper = doc?.layers[index];
    const lower = doc?.layers[index - 1];
    if (!upper || !lower) return 'no-layer-below';
    if (hasRedactions(upper) || hasRedactions(lower)) return 'layer.redactionProtected';
    if (upper.locked || lower.locked) return 'layer.locked';
    if (!upper.visible || !lower.visible) return 'layer.hidden';
    return null;
  }

  /**
   * Merge Down (Ctrl+E): vẽ layer trên vào layer dưới với opacity/blend của nó — một
   * TransactionCommand gồm snapshot tile bị đổi của layer dưới và chính layer trên (mục 5.4).
   * Layer dưới là layer chú thích: hai layer chú thích "thường" thì gộp đối tượng (vẫn sửa được),
   * còn lại rasterize layer dưới trước (Merge luôn dùng ảnh render cuối cùng).
   */
  mergeDown(id: ID): boolean {
    const doc = this.host.document();
    if (!doc) return false;
    const blocker = this.mergeDownBlocker(id);
    if (blocker) {
      if (blocker !== 'no-layer-below') this.host.notify(blocker);
      return false;
    }
    const index = doc.indexOfLayer(id);
    const upper = doc.layers.at(index);
    const lower = index > 0 ? doc.layers.at(index - 1) : undefined;
    if (!upper || !lower) return false;
    this.host.settle();
    const label = 'history.mergeDown';

    if (
      upper.kind === 'vector' &&
      lower.kind === 'vector' &&
      vectorLayerMode(upper) === 'direct' &&
      vectorLayerMode(lower) === 'direct'
    ) {
      return this.host.execute(
        new TransactionCommand(label, [
          new SetObjectsCommand(label, lower.id, [...lower.objects, ...upper.objects]),
          new RemoveLayerCommand(label, upper, lower.id),
        ]),
      );
    }

    const children: Command[] = [];
    let targetId = lower.id;
    if (lower.kind === 'vector') {
      const rasterize = new RasterizeLayerCommand('history.rasterize', lower, (rid, vector) =>
        this.host.rasterize(rid, vector),
      );
      children.push(rasterize);
      targetId = rasterize.rasterId;
    }
    const content = layerContentBounds(upper, this.host.env);
    const area = content ? intersectRect(roundOutRect(content), doc.bounds) : null;
    if (area && !isEmptyRect(area)) {
      const options = this.compositeOptions(area);
      children.push(
        new PaintCommand({
          label,
          layerId: targetId,
          area,
          store: this.host.createTileStore(),
          createStore: () => this.host.createTileStore(),
          apply: (target) => {
            target.surface.ensure(area);
            const session = target.surface.begin();
            if (!session) return;
            // Không cắt (clip) theo vùng: nội dung layer nằm trong hình bao nên trong các tile đã
            // chụp; clip vùng nhỏ làm trình duyệt khử răng cưa nét vector khác với lúc hiển thị.
            drawLayer(session.ctx, upper, area, options);
            session.end();
          },
        }),
      );
    }
    children.push(new RemoveLayerCommand(label, upper, targetId));
    return this.host.execute(new TransactionCommand(label, children));
  }

  /** Các layer sẽ bị gộp bởi Merge Visible (≥ 2 layer đang hiện). */
  mergeVisibleCandidates(): Layer[] {
    return this.host.document()?.layers.filter((l) => l.visible) ?? [];
  }

  /**
   * Merge Visible: gộp mọi layer đang hiện thành một layer raster đặt ở vị trí layer hiện thấp nhất;
   * layer ẩn giữ nguyên. Kết quả đúng như ảnh đang thấy (gồm cả màu nền nếu có).
   */
  mergeVisible(): boolean {
    const doc = this.host.document();
    if (!doc) return false;
    const visible = this.mergeVisibleCandidates();
    const lowest = visible.at(0);
    if (visible.length < 2 || !lowest) return false;
    if (visible.some((l) => l.locked)) {
      this.host.notify('layer.locked');
      return false;
    }
    this.host.settle();
    const merged = this.composeVisible(doc, lowest.name);
    if (!merged) return false;
    const after: Layer[] = [];
    let placed = false;
    for (const layer of doc.layers) {
      if (!layer.visible) {
        after.push(layer);
        continue;
      }
      if (!placed) {
        after.push(merged);
        placed = true;
      }
    }
    const command = new ReplaceLayersCommand('history.mergeVisible', after, merged.id);
    if (!this.host.execute(command)) {
      merged.dispose();
      return false;
    }
    return true;
  }

  /** Flatten: gộp toàn bộ thành một layer nền; layer ẩn bị bỏ (có undo). */
  canFlatten(): boolean {
    const doc = this.host.document();
    if (!doc) return false;
    const only = doc.layers.at(0);
    if (doc.layers.length > 1) return true;
    return (
      only !== undefined &&
      (only.kind === 'vector' || only.opacity < 1 || only.blendMode !== 'normal' || !only.visible)
    );
  }

  flatten(): boolean {
    const doc = this.host.document();
    if (!doc || !this.canFlatten()) return false;
    if (doc.layers.some((l) => l.visible && l.locked)) {
      this.host.notify('layer.locked');
      return false;
    }
    this.host.settle();
    const merged = this.composeVisible(doc, this.host.backgroundName());
    if (!merged) return false;
    const command = new ReplaceLayersCommand('history.flatten', [merged], merged.id);
    if (!this.host.execute(command)) {
      merged.dispose();
      return false;
    }
    return true;
  }

  /** Rasterize layer chú thích (mục 5.4, có undo). */
  rasterize(id: ID): boolean {
    const doc = this.host.document();
    const layer = doc?.getLayer(id);
    if (!doc || layer?.kind !== 'vector') return false;
    if (hasRedactions(layer)) {
      this.host.notify('layer.redactionProtected');
      return false;
    }
    if (layer.locked) {
      this.host.notify('layer.locked');
      return false;
    }
    this.host.settle();
    return this.host.execute(
      new RasterizeLayerCommand('history.rasterize', layer, (rid, vector) =>
        this.host.rasterize(rid, vector),
      ),
    );
  }

  /**
   * Ảnh thu nhỏ của một layer trong khung document (panel Layers — mục 2, P1). Thu nhỏ từng nửa
   * với lọc song tuyến (không dùng `imageSmoothingQuality = 'high'`: Chromium dựng mipmap cho cả
   * texture nguồn mỗi lần vẽ — ADR 0017).
   */
  async thumbnail(id: ID, maxSide: number): Promise<ImageBitmap | null> {
    const doc = this.host.document();
    const layer = doc?.getLayer(id);
    if (!doc || !layer) return null;
    const scale = Math.min(1, maxSide / Math.max(doc.width, doc.height));
    const width = Math.max(1, Math.round(doc.width * scale));
    const height = Math.max(1, Math.round(doc.height * scale));
    let out: Surface | null = null;
    const temps: Surface[] = [];
    try {
      out = createSurface(this.host.memory, width, height, 'temp');
      const ctx = out.ctx;
      if (layer.kind === 'vector') {
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        drawObjects(ctx, layer.objects, doc.bounds, this.host.env, null, {
          kind: 'layer',
          id: layer.id,
        });
      } else {
        const bounds = layer.bounds;
        let canvas = layer.surface.surface?.canvas ?? null;
        if (bounds && canvas) {
          let sw = bounds.width;
          let sh = bounds.height;
          const target = Math.max(1, bounds.width * scale);
          // Thu nhỏ từng nửa cho tới khi còn ≤ 2 lần kích thước đích.
          while (sw > target * 2 && sw > 2 && sh > 2) {
            const hw = Math.max(1, Math.ceil(sw / 2));
            const hh = Math.max(1, Math.ceil(sh / 2));
            const half = createSurface(this.host.memory, hw, hh, 'temp');
            temps.push(half);
            half.ctx.imageSmoothingEnabled = true;
            half.ctx.imageSmoothingQuality = 'low';
            half.ctx.drawImage(canvas, 0, 0, sw, sh, 0, 0, hw, hh);
            canvas = half.canvas;
            sw = hw;
            sh = hh;
          }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'low';
          ctx.drawImage(
            canvas,
            0,
            0,
            sw,
            sh,
            bounds.x * scale,
            bounds.y * scale,
            bounds.width * scale,
            bounds.height * scale,
          );
        }
      }
      return await createImageBitmap(out.canvas);
    } catch (error) {
      if (isAllocationError(error)) return null;
      throw error;
    } finally {
      for (const temp of temps) temp.release();
      out?.release();
    }
  }

  private compositeOptions(region: Rect): CompositeOptions {
    return {
      region,
      includeBackground: false,
      preview: null,
      scratch: this.host.scratch,
      objects: { env: this.host.env, overrides: null, pending: null },
    };
  }

  /** Ghép các layer đang hiện (gồm màu nền) vào một layer raster mới; null nếu thiếu bộ nhớ. */
  private composeVisible(doc: Document, name: string): RasterLayer | null {
    let area: Rect | null = doc.background.kind === 'color' ? doc.bounds : null;
    for (const layer of doc.layers) {
      if (!shows(layer)) continue;
      const b = layerContentBounds(layer, this.host.env);
      if (b) area = area ? unionRect(area, b) : b;
    }
    const merged = new RasterLayer({ name }, this.host.memory, doc.bounds);
    const region = area ? intersectRect(roundOutRect(area), doc.bounds) : null;
    try {
      if (region && !isEmptyRect(region) && merged.surface.ensure(region)) {
        const session = merged.surface.begin();
        if (session) {
          compositeDocument(session.ctx, doc, {
            ...this.compositeOptions(region),
            includeBackground: true,
          });
          session.end();
        }
      }
    } catch (error) {
      merged.dispose();
      if (!isAllocationError(error)) throw error;
      this.host.notify('memory.refused');
      return null;
    } finally {
      this.host.scratch.trim();
    }
    touchContent(merged);
    return merged;
  }

  private uniqueName(doc: Document, kind: 'raster' | 'vector'): string {
    const names = new Set(doc.layers.map((l) => l.name));
    let n = doc.layers.filter((l) => l.kind === kind).length + 1;
    let name = this.host.layerName(kind, n);
    while (names.has(name)) name = this.host.layerName(kind, ++n);
    return name;
  }
}

function propsLabel(keys: readonly (keyof LayerProps)[]): string {
  if (keys.length !== 1) return 'history.layerProps';
  switch (keys[0]) {
    case 'name':
      return 'history.renameLayer';
    case 'visible':
      return 'history.layerVisibility';
    case 'locked':
      return 'history.layerLock';
    case 'alphaLocked':
      return 'history.layerAlphaLock';
    case 'opacity':
      return 'history.layerOpacity';
    default:
      return 'history.layerBlend';
  }
}
