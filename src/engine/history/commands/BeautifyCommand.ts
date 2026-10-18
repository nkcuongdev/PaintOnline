import type { Document } from '../../core/Document';
import type { BeautifySettings, Rect } from '../../core/types';
import type { Command } from '../types';

/** Kéo slider liên tục trong khoảng này gộp thành một bước history. */
const MERGE_WINDOW_MS = 1000;

/**
 * Đổi khung Làm đẹp của document (GĐ7): bật/tắt, padding, nền, bo góc, bóng. Không đổi pixel nên
 * không giữ dữ liệu ảnh; các lần kéo slider liền nhau gộp một bước.
 */
export class BeautifyCommand implements Command {
  readonly label = 'history.beautify';
  readonly timestamp = Date.now();
  private before: BeautifySettings | null = null;
  private captured = false;
  /** Lần đổi gần nhất đã gộp vào bước này. */
  private lastAt = this.timestamp;

  constructor(private after: BeautifySettings | null) {}

  execute(doc: Document): void {
    if (!this.captured) {
      this.before = doc.beautify ? { ...doc.beautify } : null;
      this.captured = true;
    }
    doc.beautify = this.after ? { ...this.after } : null;
  }

  undo(doc: Document): void {
    doc.beautify = this.before ? { ...this.before } : null;
  }

  memoryBytes(): number {
    return 0;
  }

  affectedArea(): Rect | null {
    return null;
  }

  mergeWith(next: Command): boolean {
    if (!(next instanceof BeautifyCommand)) return false;
    if (next.timestamp - this.lastAt > MERGE_WINDOW_MS) return false;
    // Bật hoặc tắt hẳn là một bước riêng (dễ hoàn tác).
    if ((this.after === null) !== (next.after === null)) return false;
    this.after = next.after;
    this.lastAt = next.timestamp;
    return true;
  }
}
