import type { Rect } from '../core/types';
import type { RasterLayer } from '../layers/layers';
import { intersectRect, isEmptyRect } from '../utils/rect';
import type { TileStore } from './TileStore';

/** Kích thước tile history (mục 5.6). */
export const TILE_SIZE = 256;

/**
 * Các tile 256×256 (căn theo gốc document, cắt theo khung document) mà `area` chạm vào.
 * Tile ở mép phải/dưới có thể nhỏ hơn 256.
 */
export function tilesForArea(area: Readonly<Rect>, doc: Readonly<Rect>): Rect[] {
  const clipped = intersectRect(area, doc);
  if (isEmptyRect(clipped)) return [];
  const tx0 = Math.floor(clipped.x / TILE_SIZE);
  const ty0 = Math.floor(clipped.y / TILE_SIZE);
  const tx1 = Math.ceil((clipped.x + clipped.width) / TILE_SIZE);
  const ty1 = Math.ceil((clipped.y + clipped.height) / TILE_SIZE);
  const tiles: Rect[] = [];
  for (let ty = ty0; ty < ty1; ty++) {
    for (let tx = tx0; tx < tx1; tx++) {
      const tile = intersectRect(
        { x: tx * TILE_SIZE, y: ty * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE },
        doc,
      );
      if (!isEmptyRect(tile)) tiles.push(tile);
    }
  }
  return tiles;
}

/** Một tile được giữ trong TileStore; `slot = -1` nghĩa là tile trong suốt hoàn toàn. */
export interface StoredTile {
  rect: Rect;
  slot: number;
}

/**
 * Chép tile hiện tại của layer vào kho. Vùng layer chưa có surface (chưa từng vẽ) là trong suốt:
 * không tốn ô nào — trường hợp rất phổ biến khi vẽ trên layer mới.
 */
export function storeLayerTile(
  store: TileStore,
  layer: RasterLayer,
  tile: Readonly<Rect>,
  slot?: number,
): number {
  const src = layer.surface.region(tile);
  if (!src) return -1;
  const s = slot ?? store.allocate();
  store.store(
    s,
    src.canvas,
    src.sx,
    src.sy,
    src.rect.x - tile.x,
    src.rect.y - tile.y,
    src.rect.width,
    src.rect.height,
  );
  return s;
}

/**
 * Chụp DẦN bản trước của tile: lần đầu thao tác chạm một tile, chép tile đó vào kho ngay (layer
 * chưa đổi cho tới khi commit). Phép chép chạy trên GPU nên gần như không tốn thời gian main
 * thread; commit lúc nhả chuột không phải chụp gì thêm.
 */
export class TileCapture {
  private readonly captured = new Map<number, StoredTile>();

  constructor(
    readonly store: TileStore,
    private readonly layer: RasterLayer,
    private readonly doc: Readonly<Rect>,
  ) {}

  /** Chụp mọi tile mà `rect` chạm và chưa được chụp. */
  touch(rect: Readonly<Rect>): void {
    const clipped = intersectRect(rect, this.doc);
    if (isEmptyRect(clipped)) return;
    const tx0 = Math.floor(clipped.x / TILE_SIZE);
    const ty0 = Math.floor(clipped.y / TILE_SIZE);
    const tx1 = Math.ceil((clipped.x + clipped.width) / TILE_SIZE);
    const ty1 = Math.ceil((clipped.y + clipped.height) / TILE_SIZE);
    for (let ty = ty0; ty < ty1; ty++) {
      for (let tx = tx0; tx < tx1; tx++) {
        const key = ty * 65536 + tx;
        if (this.captured.has(key)) continue;
        const tile = intersectRect(
          { x: tx * TILE_SIZE, y: ty * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE },
          this.doc,
        );
        this.captured.set(key, { rect: tile, slot: storeLayerTile(this.store, this.layer, tile) });
      }
    }
  }

  get size(): number {
    return this.captured.size;
  }

  /** Tile đã chụp, theo thứ tự hàng rồi cột. */
  tiles(): StoredTile[] {
    return [...this.captured.entries()].sort(([a], [b]) => a - b).map(([, tile]) => tile);
  }

  /** Hủy nét: trả bộ nhớ của kho. */
  discard(): void {
    this.captured.clear();
    this.store.release();
  }
}
