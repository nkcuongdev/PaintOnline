import type { Document } from '../../core/Document';
import type { ID, Rect } from '../../core/types';
import { touchContent, type RasterLayer } from '../../layers/layers';
import { storeLayerTile, tilesForArea, type StoredTile } from '../tiles';
import type { TileStore } from '../TileStore';
import type { Archivable } from '../archive';
import type { Command } from '../types';

export interface PaintCommandInit {
  label: string;
  layerId: ID;
  /** Hình bao vùng có thể bị đổi (để vẽ lại). */
  area: Rect;
  /** Kho tile (trên GPU) — command sở hữu và giải phóng khi bị loại khỏi history. */
  store: TileStore;
  /** Tạo kho mới cho mỗi lần hoán đổi (undo/redo). */
  createStore: () => TileStore;
  /**
   * Bản trước của các tile đã được chụp dần trong lúc thao tác (TileCapture, cùng `store`). Bỏ
   * trống = chụp mọi tile trong `area` ở lần execute đầu.
   */
  captured?: StoredTile[];
  /** Ghi thay đổi vào layer — chỉ chạy một lần, ở lần execute đầu tiên. */
  apply: (layer: RasterLayer) => void;
}

/**
 * Thay đổi pixel trên một layer raster (brush, eraser, fill, filter vùng — mục 5.6).
 *
 * Kỹ thuật hoán đổi: command chỉ giữ MỘT phiên bản của mỗi tile 256×256 bị chạm. Khi tạo, nó
 * giữ bản trước; khi undo, chụp bản hiện tại (bản sau) rồi ghi bản trước vào layer và từ đó giữ
 * bản sau; redo làm ngược lại. Bộ nhớ chỉ bằng một nửa so với lưu cả hai bản.
 *
 * Tile nằm trong TileStore trên GPU (ADR 0016): mọi phép chép là `drawImage` GPU → GPU, không
 * đọc pixel về CPU, chính xác từng pixel.
 */
export class PaintCommand implements Command {
  readonly label: string;
  readonly timestamp = Date.now();
  private readonly layerId: ID;
  private readonly area: Rect;
  private store: TileStore;
  private readonly createStore: () => TileStore;
  private apply: PaintCommandInit['apply'] | null;
  private tiles: StoredTile[] | null;

  constructor(init: PaintCommandInit) {
    this.label = init.label;
    this.layerId = init.layerId;
    this.area = { ...init.area };
    this.store = init.store;
    this.createStore = init.createStore;
    this.apply = init.apply;
    this.tiles = init.captured ?? null;
  }

  execute(doc: Document): void {
    const layer = this.layer(doc);
    if (this.apply) {
      // Lần đầu: bản trước đã chụp sẵn (hoặc chụp ngay bây giờ), rồi ghi thay đổi.
      this.tiles ??= tilesForArea(this.area, doc.bounds).map((rect) => ({
        rect,
        slot: storeLayerTile(this.store, layer, rect),
      }));
      const apply = this.apply;
      this.apply = null;
      apply(layer);
    } else {
      this.swap(layer);
    }
    touchContent(layer);
  }

  undo(doc: Document): void {
    const layer = this.layer(doc);
    this.swap(layer);
    touchContent(layer);
  }

  affectedArea(): Rect {
    return this.area;
  }

  memoryBytes(): number {
    return this.store.bytes;
  }

  /** Tile của bước cũ được nén trong Worker (mục 5.6); giải nén khi undo/redo tới. */
  archivables(old: boolean): readonly Archivable[] {
    return old && this.store.slotCount > 0 ? [this.store] : [];
  }

  dispose(): void {
    this.store.release();
    this.tiles = [];
    this.apply = null;
  }

  /** Số tile command đang giữ (dùng cho test và thống kê). */
  get tileCount(): number {
    return this.tiles?.length ?? 0;
  }

  /**
   * Hoán đổi tile đang giữ với tile hiện tại của layer, theo 2 pha không xen kẽ:
   * (1) chụp mọi tile hiện tại của layer sang một kho MỚI (layer chưa đổi);
   * (2) ghi các tile đang giữ vào layer (kho cũ không đổi), rồi thay kho cũ bằng kho mới.
   * Không xen đọc/ghi trên cùng một canvas nên mỗi canvas nguồn chỉ cần chụp một lần — với canvas
   * phần mềm, xen kẽ buộc chụp lại cả layer cho từng tile (đo ở GĐ1: undo 4K mất 3,9 s).
   */
  private swap(layer: RasterLayer): void {
    const tiles = this.tiles ?? [];
    // Bước cũ đã nén: giải nén trước (ném lỗi cấp phát nếu thiếu bộ nhớ — command còn nguyên).
    this.store.inflate();
    const next = this.createStore();
    let nextSlots: number[];
    try {
      next.reserve(tiles.filter((tile) => layer.surface.region(tile.rect) !== null).length);
      nextSlots = tiles.map((tile) => storeLayerTile(next, layer, tile.rect));
    } catch (error) {
      next.release();
      throw error;
    }
    for (const tile of tiles) {
      if (tile.slot < 0) {
        layer.surface.write(tile.rect, null);
        continue;
      }
      layer.surface.ensure(tile.rect);
      const session = layer.surface.begin();
      if (!session) continue;
      const c = session.ctx;
      c.clearRect(tile.rect.x, tile.rect.y, tile.rect.width, tile.rect.height);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      c.imageSmoothingEnabled = false;
      this.store.drawTo(tile.slot, c, tile.rect);
      session.end();
    }
    this.store.release();
    this.store = next;
    tiles.forEach((tile, i) => {
      tile.slot = nextSlots[i] ?? -1;
    });
  }

  private layer(doc: Document): RasterLayer {
    const layer = doc.getLayer(this.layerId);
    if (layer?.kind !== 'raster') throw new Error(`PaintCommand: không thấy layer ${this.layerId}`);
    return layer;
  }
}
