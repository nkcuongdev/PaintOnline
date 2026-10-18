import type { Document } from '../../core/Document';
import type { AnnotationObject, ID, Rect } from '../../core/types';
import { touchContent, type VectorLayer } from '../../layers/layers';
import type { Command } from '../types';

/** Một thay đổi đối tượng: thêm (before = null), xóa (after = null), sửa hoặc đổi thứ tự. */
export interface ObjectChange {
  layerId: ID;
  before: AnnotationObject | null;
  after: AnnotationObject | null;
  /** Vị trí trong danh sách đối tượng của layer trước/sau thay đổi. */
  beforeIndex: number;
  afterIndex: number;
}

export interface ObjectCommandInit {
  label: string;
  changes: ObjectChange[];
  /** Vùng document cần vẽ lại (hình bao trước ∪ sau). */
  area: Rect | null;
  /**
   * Khóa gộp: các command liên tiếp cùng khóa, cùng đối tượng, cách nhau < 1 s được gộp thành một
   * bước (kéo slider thuộc tính, nudge bằng phím mũi tên — mục 5.6).
   */
  mergeKey?: string;
}

const MERGE_WINDOW_MS = 1000;

/**
 * Thay đổi đối tượng vector (mục 5.6): giữ JSON trước/sau của đối tượng. Đối tượng là giá trị bất
 * biến nên giữ tham chiếu là đủ — không tốn bộ nhớ canvas.
 */
export class ObjectCommand implements Command {
  readonly label: string;
  timestamp = Date.now();
  private changes: ObjectChange[];
  private area: Rect | null;
  private readonly mergeKey: string | undefined;

  constructor(init: ObjectCommandInit) {
    this.label = init.label;
    // Xóa nhiều đối tượng: xóa từ vị trí lớn xuống nhỏ để undo (đảo ngược) chèn lại đúng chỗ.
    this.changes = [...init.changes].sort((a, b) =>
      a.after === null && b.after === null ? b.beforeIndex - a.beforeIndex : 0,
    );
    this.area = init.area;
    this.mergeKey = init.mergeKey;
  }

  /** Id các đối tượng còn tồn tại sau command (để chọn lại sau khi thêm/sửa). */
  get resultIds(): ID[] {
    return this.changes.flatMap((c) => (c.after ? [c.after.id] : []));
  }

  execute(doc: Document): void {
    for (const change of this.changes) {
      apply(doc, change.layerId, change.before, change.after, change.afterIndex);
    }
  }

  undo(doc: Document): void {
    for (let i = this.changes.length - 1; i >= 0; i--) {
      const change = this.changes[i];
      apply(doc, change.layerId, change.after, change.before, change.beforeIndex);
    }
  }

  memoryBytes(): number {
    return 0;
  }

  affectedArea(): Rect | null {
    return this.area;
  }

  mergeWith(next: Command): boolean {
    if (!(next instanceof ObjectCommand) || !this.mergeKey || next.mergeKey !== this.mergeKey) {
      return false;
    }
    if (next.timestamp - this.timestamp > MERGE_WINDOW_MS) return false;
    if (next.changes.length !== this.changes.length) return false;
    const same = this.changes.every((c, i) => {
      const n = next.changes[i];
      return c.after !== null && n.before?.id === c.after.id && n.after !== null;
    });
    if (!same) return false;
    this.changes = this.changes.map((c, i) => ({ ...c, after: next.changes[i]?.after ?? c.after }));
    if (this.area && next.area) {
      const a = this.area;
      const b = next.area;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      this.area = {
        x,
        y,
        width: Math.max(a.x + a.width, b.x + b.width) - x,
        height: Math.max(a.y + a.height, b.y + b.height) - y,
      };
    } else {
      this.area = null;
    }
    this.timestamp = next.timestamp;
    return true;
  }
}

function vectorLayer(doc: Document, id: ID): VectorLayer {
  const layer = doc.getLayer(id);
  if (layer?.kind !== 'vector') throw new Error(`ObjectCommand: không thấy layer chú thích ${id}`);
  return layer;
}

/** Thay `from` bằng `to` trong layer (from = null: chèn; to = null: xóa). */
function apply(
  doc: Document,
  layerId: ID,
  from: AnnotationObject | null,
  to: AnnotationObject | null,
  index: number,
): void {
  const layer = vectorLayer(doc, layerId);
  const objects = [...layer.objects];
  const current = from ? objects.findIndex((o) => o.id === from.id) : -1;
  if (current >= 0 && to && to.id === from?.id && current === index) {
    objects[current] = to;
  } else {
    if (current >= 0) objects.splice(current, 1);
    if (to) objects.splice(Math.max(0, Math.min(index, objects.length)), 0, to);
  }
  layer.objects = objects;
  touchContent(layer);
}
