import type { Document } from '../../core/Document';
import type { ID, Rect } from '../../core/types';
import type { Layer } from '../../layers/layers';
import type { Archivable } from '../archive';
import type { Command } from '../types';

/** Trạng thái hình học của document: kích thước + danh sách layer. */
export interface DocumentFrame {
  width: number;
  height: number;
  layers: readonly Layer[];
  activeLayerId: ID;
}

/**
 * DocumentCommand (mục 5.6): biến đổi toàn ảnh — cắt xén, Trim, Resize, Canvas size, xoay, lật
 * (cả ảnh hoặc chỉ một layer). Command giữ nguyên các layer cũ (cùng id, khác đối tượng) làm
 * "snapshot": surface của chúng được nén lúc rảnh như layer đã xóa (mục 5.6), nên undo khôi phục
 * đúng từng pixel mà không phải biến đổi ngược (xoay/co giãn ngược sẽ mất chất lượng).
 */
export class DocumentCommand implements Command {
  readonly timestamp = Date.now();
  private before: DocumentFrame | null = null;
  private applied = false;

  constructor(
    readonly label: string,
    private readonly after: DocumentFrame,
  ) {}

  execute(doc: Document): void {
    this.before ??= {
      width: doc.width,
      height: doc.height,
      layers: [...doc.layers],
      activeLayerId: doc.activeLayerId,
    };
    swap(this.removed(), this.created());
    apply(doc, this.after);
    this.applied = true;
  }

  undo(doc: Document): void {
    const before = this.before;
    if (!before) return;
    swap(this.created(), this.removed());
    apply(doc, before);
    this.applied = false;
  }

  memoryBytes(): number {
    return 0;
  }

  affectedArea(): Rect | null {
    return null;
  }

  archivables(): readonly Archivable[] {
    const out: Archivable[] = [];
    for (const layer of this.applied ? this.removed() : this.created()) {
      if (layer.kind === 'raster' && !layer.surface.isEmpty) out.push(layer.surface);
    }
    return out;
  }

  dispose(): void {
    for (const layer of this.applied ? this.removed() : this.created()) layer.dispose();
  }

  /** Layer cũ không còn trong trạng thái sau. */
  private removed(): Layer[] {
    const kept = new Set(this.after.layers);
    return (this.before?.layers ?? []).filter((l) => !kept.has(l));
  }

  /** Layer mới tạo cho trạng thái sau. */
  private created(): Layer[] {
    const old = new Set(this.before?.layers ?? []);
    return this.after.layers.filter((l) => !old.has(l));
  }
}

function apply(doc: Document, frame: DocumentFrame): void {
  doc.width = frame.width;
  doc.height = frame.height;
  doc.layers = [...frame.layers];
  doc.activeLayerId = frame.activeLayerId;
}

/** Giải nén surface trước khi layer quay lại document (ném lỗi cấp phát nếu thiếu bộ nhớ). */
function restore(layers: readonly Layer[]): void {
  for (const layer of layers) {
    if (layer.kind === 'raster') layer.surface.unarchive();
  }
}

function setCategory(layers: readonly Layer[], category: 'layer' | 'temp'): void {
  for (const layer of layers) {
    if (layer.kind === 'raster') layer.surface.recategorize(category);
  }
}

/**
 * Đổi bộ layer của document: bộ sắp rời document chuyển sang hạng mục `temp` TRƯỚC khi giải nén bộ
 * quay lại — phần 60% dành cho layer không chặn undo/redo của biến đổi ảnh lớn (đo ở GĐ9: undo
 * Canvas size trên L bị từ chối khi layer cũ đã được nén lúc rảnh). Vẫn trong tổng ngân sách; bộ
 * rời document được nén lúc rảnh như trước.
 */
function swap(leaving: readonly Layer[], entering: readonly Layer[]): void {
  setCategory(leaving, 'temp');
  try {
    restore(entering);
  } catch (error) {
    setCategory(leaving, 'layer');
    throw error;
  }
  setCategory(entering, 'layer');
}
