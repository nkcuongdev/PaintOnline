import type { Document } from '../core/Document';
import type { Rect } from '../core/types';
import type { Archivable } from './archive';

/**
 * Mọi thay đổi dữ liệu document là một Command (mục 5.6, quy tắc 13.1.4).
 * `execute` chạy lần đầu và khi redo; `undo` đảo lại.
 */
export interface Command {
  /** Hiển thị trong panel History (khóa i18n, UI dịch). */
  readonly label: string;
  readonly timestamp: number;
  execute(doc: Document): void;
  undo(doc: Document): void;
  /** Dung lượng dữ liệu command đang giữ — báo cáo cho MemoryBudget. */
  memoryBytes(): number;
  /** Vùng document bị ảnh hưởng (để chỉ vẽ lại vùng đó); null/không có = toàn bộ. */
  affectedArea?(): Rect | null;
  /** Gộp command kế tiếp vào command này (đổi màu liên tiếp, nudge bằng phím mũi tên). */
  mergeWith?(next: Command): boolean;
  /**
   * Dữ liệu có thể nén lúc rảnh (mục 5.6). `old` = bước đã cũ hơn 10 bước; bước gần đây chỉ trả
   * phần không còn thuộc document (surface của layer đã xóa/gộp).
   */
  archivables?(old: boolean): readonly Archivable[];
  dispose?(): void;
}
