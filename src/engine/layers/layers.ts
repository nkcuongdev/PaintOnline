import type {
  AnnotationObject,
  BlendMode,
  ID,
  LayerBase,
  LayerSummary,
  Rect,
  SurfaceCategory,
} from '../core/types';
import type { MemoryBudget } from '../memory/MemoryBudget';
import { GrowableSurface } from '../memory/GrowableSurface';

/**
 * Bộ đếm revision nội dung dùng chung cho mọi layer: mỗi lần nội dung đổi, layer nhận một giá trị
 * chưa từng xuất hiện. Autosave so `contentRev` với giá trị đã lưu (mục 6.6); bộ đếm chung bảo đảm
 * một layer được dựng lại (redo rasterize) hay vẽ lại sau undo không thể trùng giá trị cũ.
 */
let contentSeq = 0;

/** Đánh dấu nội dung layer vừa đổi. */
export function touchContent(layer: { contentRev: number }): void {
  contentSeq++;
  layer.contentRev = contentSeq;
}

/** Ghi nhận revision nội dung đọc từ bản lưu để bộ đếm luôn lớn hơn mọi giá trị đã có. */
export function observeContentRev(rev: number): void {
  if (Number.isFinite(rev) && rev > contentSeq) contentSeq = Math.floor(rev);
}

/** Thuộc tính khởi tạo layer. */
export interface LayerInit {
  id?: ID;
  name: string;
  visible?: boolean;
  locked?: boolean;
  alphaLocked?: boolean;
  opacity?: number;
  blendMode?: BlendMode;
  /** Revision nội dung đọc từ bản lưu (mục 6.4). */
  contentRev?: number;
}

abstract class LayerCommon implements LayerBase {
  readonly id: ID;
  name: string;
  visible: boolean;
  locked: boolean;
  alphaLocked: boolean;
  opacity: number;
  blendMode: BlendMode;
  contentRev: number;

  constructor(init: LayerInit) {
    this.id = init.id ?? crypto.randomUUID();
    this.name = init.name;
    this.visible = init.visible ?? true;
    this.locked = init.locked ?? false;
    this.alphaLocked = init.alphaLocked ?? false;
    this.opacity = init.opacity ?? 1;
    this.blendMode = init.blendMode ?? 'normal';
    this.contentRev = init.contentRev ?? 0;
    observeContentRev(this.contentRev);
  }

  abstract readonly kind: 'raster' | 'vector';

  summary(): LayerSummary {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      visible: this.visible,
      locked: this.locked,
      alphaLocked: this.alphaLocked,
      opacity: this.opacity,
      blendMode: this.blendMode,
      contentRev: this.contentRev,
      hasContent: this.hasContent,
    };
  }

  abstract get hasContent(): boolean;

  abstract dispose(): void;
}

/** Layer pixel: GrowableSurface cấp phát lười, căn 256 px (mục 5.4). */
export class RasterLayer extends LayerCommon {
  readonly kind = 'raster' as const;
  readonly surface: GrowableSurface;

  /**
   * `category`: hạng mục ngân sách của surface — `layer`, hoặc `temp` cho layer đang dựng khi biến
   * đổi ảnh (chuyển sang `layer` khi vào document — ADR 0025).
   */
  constructor(
    init: LayerInit,
    budget: MemoryBudget,
    docBounds: Rect,
    category: SurfaceCategory = 'layer',
  ) {
    super(init);
    this.surface = new GrowableSurface(budget, docBounds, category);
  }

  /** Vị trí surface trong document; null = layer trống (mục 6.1). */
  get bounds(): Readonly<Rect> | null {
    return this.surface.bounds;
  }

  get hasContent(): boolean {
    return !this.surface.isEmpty;
  }

  dispose(): void {
    this.surface.release();
  }
}

/**
 * Layer chú thích: danh sách đối tượng vector (mục 5.4, 6.2). Engine tự tạo khi dùng shape/text;
 * renderer từng loại đối tượng đăng ký qua objectRegistry từ GĐ2.
 */
export class VectorLayer extends LayerCommon {
  readonly kind = 'vector' as const;
  objects: AnnotationObject[] = [];

  get hasContent(): boolean {
    return this.objects.length > 0;
  }

  dispose(): void {
    this.objects = [];
  }
}

export type Layer = RasterLayer | VectorLayer;

/** `normal` của plan tương ứng `source-over` của Canvas 2D; 15 mode còn lại trùng tên (mục 5.4). */
export function blendToComposite(mode: BlendMode): GlobalCompositeOperation {
  return mode === 'normal' ? 'source-over' : mode;
}
