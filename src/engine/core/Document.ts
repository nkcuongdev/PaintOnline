import {
  RasterLayer,
  touchContent,
  VectorLayer,
  type Layer,
  type LayerInit,
} from '../layers/layers';
import type { MemoryBudget } from '../memory/MemoryBudget';
import type {
  AnnotationObject,
  BeautifySettings,
  Color,
  DocumentBackground,
  DocumentData,
  DocumentSummary,
  ID,
  Point,
  Rect,
} from './types';

export interface DocumentLayerSpec extends LayerInit {
  kind: 'raster' | 'vector';
  /**
   * Ảnh ban đầu của layer raster, đặt tại `origin` (mặc định (0, 0)). ImageData (pixel đã lưu)
   * được ghi bằng putImageData — đúng từng pixel; nguồn khác được vẽ bằng drawImage.
   */
  image?: ImageData | (CanvasImageSource & { width: number; height: number });
  origin?: Point;
  /** Đối tượng của layer chú thích (mở project đã lưu). */
  objects?: AnnotationObject[];
}

function isImageData(value: unknown): value is ImageData {
  return typeof ImageData !== 'undefined' && value instanceof ImageData;
}

export interface DocumentSpec {
  id?: ID;
  width: number;
  height: number;
  background: DocumentBackground;
  /** Thứ tự từ dưới lên trên; mặc định layer cuối là layer hoạt động. */
  layers: DocumentLayerSpec[];
  palette?: Color[];
  activeLayerId?: ID;
  /** Revision đã lưu: mở lại project thì đếm tiếp, để mọi lượt lưu sau có rev lớn hơn (mục 6.6). */
  rev?: number;
  /** Khung Làm đẹp (GĐ7). */
  beautify?: BeautifySettings | null;
}

/**
 * Document lúc chạy (mục 6.1). Mọi thay đổi dữ liệu đi qua Command; `rev` tăng sau mỗi Command
 * kể cả undo/redo, autosave so `rev` với `savedRev` (GĐ3).
 */
export class Document {
  readonly id: ID;
  width: number;
  height: number;
  background: DocumentBackground;
  layers: Layer[];
  activeLayerId: ID;
  palette: Color[];
  /** Khung Làm đẹp — chỉ đổi qua Command (BeautifyCommand). */
  beautify: BeautifySettings | null;
  rev = 0;

  private constructor(spec: DocumentSpec, layers: Layer[]) {
    this.id = spec.id ?? crypto.randomUUID();
    this.width = spec.width;
    this.height = spec.height;
    this.background = spec.background;
    this.layers = layers;
    this.palette = spec.palette ?? [];
    this.beautify = spec.beautify ? { ...spec.beautify } : null;
    this.rev = spec.rev ?? 0;
    const top = layers.at(-1);
    if (!top) throw new Error('Document cần ít nhất một layer');
    const active = spec.activeLayerId;
    this.activeLayerId = active && layers.some((l) => l.id === active) ? active : top.id;
  }

  /** Tạo document; nếu cấp phát thất bại, giải phóng phần đã cấp rồi ném lỗi. */
  static create(spec: DocumentSpec, budget: MemoryBudget): Document {
    const bounds = { x: 0, y: 0, width: spec.width, height: spec.height };
    const layers: Layer[] = [];
    try {
      for (const layerSpec of spec.layers) {
        if (layerSpec.kind === 'vector') {
          const vector = new VectorLayer(layerSpec);
          vector.objects = layerSpec.objects ? [...layerSpec.objects] : [];
          layers.push(vector);
          continue;
        }
        const layer = new RasterLayer(layerSpec, budget, bounds);
        // Gắn vào danh sách trước khi cấp phát để lỗi cấp phát vẫn giải phóng được layer này.
        layers.push(layer);
        const image = layerSpec.image;
        if (image) {
          const origin = layerSpec.origin ?? { x: 0, y: 0 };
          const area = { x: origin.x, y: origin.y, width: image.width, height: image.height };
          if (isImageData(image)) {
            layer.surface.write(area, image);
          } else if (layer.surface.ensure(area)) {
            const session = layer.surface.begin();
            session?.ctx.drawImage(image, origin.x, origin.y);
            session?.end();
          }
          if (layer.surface.bounds) {
            // Ảnh mới (mở file, dán) là nội dung chưa lưu; ảnh đọc từ bản lưu giữ revision cũ.
            if (layerSpec.contentRev === undefined) touchContent(layer);
          }
        }
      }
    } catch (error) {
      for (const layer of layers) layer.dispose();
      throw error;
    }
    return new Document(spec, layers);
  }

  get bounds(): Rect {
    return { x: 0, y: 0, width: this.width, height: this.height };
  }

  get activeLayer(): Layer {
    const layer = this.layers.find((l) => l.id === this.activeLayerId) ?? this.layers.at(-1);
    if (!layer) throw new Error('Document không có layer');
    return layer;
  }

  getLayer(id: ID): Layer | undefined {
    return this.layers.find((l) => l.id === id);
  }

  indexOfLayer(id: ID): number {
    return this.layers.findIndex((l) => l.id === id);
  }

  /** Chỉ gọi từ Command (quy tắc 13.1.4). */
  insertLayer(layer: Layer, index: number): void {
    const layers = [...this.layers];
    layers.splice(Math.max(0, Math.min(index, layers.length)), 0, layer);
    this.layers = layers;
  }

  /** Chỉ gọi từ Command. Không giải phóng layer (command còn giữ để undo/redo). */
  removeLayer(id: ID): void {
    if (this.layers.length <= 1) throw new Error('Document cần ít nhất một layer');
    this.layers = this.layers.filter((l) => l.id !== id);
    if (this.activeLayerId === id) this.activeLayerId = this.layers.at(-1)?.id ?? '';
  }

  /** Chỉ gọi từ Command: thay layer `id` bằng `layer` ở cùng vị trí. */
  replaceLayer(id: ID, layer: Layer): void {
    const index = this.indexOfLayer(id);
    if (index < 0) throw new Error(`Không thấy layer ${id}`);
    const layers = [...this.layers];
    layers[index] = layer;
    this.layers = layers;
  }

  bumpRev(): number {
    this.rev++;
    return this.rev;
  }

  /** Dữ liệu thuần để lưu (mục 6.4): metadata layer, đối tượng vector; pixel lấy riêng. */
  serialize(): DocumentData {
    return {
      rev: this.rev,
      width: this.width,
      height: this.height,
      background:
        this.background.kind === 'color' ? { ...this.background } : { kind: 'transparent' },
      activeLayerId: this.activeLayerId,
      palette: [...this.palette],
      beautify: this.beautify ? { ...this.beautify } : null,
      layers: this.layers.map((layer) => {
        const base = {
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          locked: layer.locked,
          alphaLocked: layer.alphaLocked,
          opacity: layer.opacity,
          blendMode: layer.blendMode,
          contentRev: layer.contentRev,
        };
        return layer.kind === 'raster'
          ? { ...base, kind: 'raster' as const, bounds: layer.bounds ? { ...layer.bounds } : null }
          : { ...base, kind: 'vector' as const, objects: [...layer.objects] };
      }),
    };
  }

  summary(): DocumentSummary {
    return {
      id: this.id,
      width: this.width,
      height: this.height,
      rev: this.rev,
      activeLayerId: this.activeLayerId,
      layers: this.layers.map((l) => l.summary()),
      beautify: this.beautify ? { ...this.beautify } : null,
    };
  }

  dispose(): void {
    for (const layer of this.layers) layer.dispose();
  }
}
