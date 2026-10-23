import type { Document } from '../core/Document';
import type { HistorySummary, SurfaceCategory } from '../core/types';
import type { MemoryBudget } from '../memory/MemoryBudget';
import {
  bandRows,
  loadInflater,
  type Archivable,
  type CompressedBand,
  type PixelCompressor,
} from './archive';
import type { Command } from './types';

export interface HistoryOptions {
  /** Tối đa số bước (mục 5.6). */
  maxSteps?: number;
  /** Luôn giữ tối thiểu số bước gần nhất, kể cả khi thiếu bộ nhớ. */
  minSteps?: number;
  /** Số bước gần nhất giữ nguyên dạng GPU; bước cũ hơn được nén (mục 5.6: "cũ hơn 10 bước"). */
  rawSteps?: number;
  onChange?: (summary: HistorySummary) => void;
}

type IdleHandle =
  { kind: 'idle'; id: number } | { kind: 'timeout'; id: ReturnType<typeof setTimeout> };

function requestIdle(callback: () => void, urgent: boolean): IdleHandle {
  if (!urgent && typeof requestIdleCallback === 'function') {
    return { kind: 'idle', id: requestIdleCallback(callback, { timeout: 2000 }) };
  }
  return { kind: 'timeout', id: setTimeout(callback, urgent ? 0 : 300) };
}

function cancelIdle(handle: IdleHandle): void {
  if (handle.kind === 'idle') cancelIdleCallback(handle.id);
  else clearTimeout(handle.id);
}

/**
 * Ngăn xếp Command (mục 5.6). History là một hạng mục của MemoryBudget (tối đa 25% tổng ngân
 * sách): dữ liệu của command (TileStore trên GPU…) tự giữ chỗ trong hạng mục `history`.
 *
 * Thu hồi (mục 5.11, bước 4–5): dữ liệu của bước cũ hơn 10 bước — và surface của layer đã rời
 * document — được nén lossless trong Worker lúc rảnh; khi vẫn thiếu chỗ, bỏ bước cũ nhất nhưng
 * luôn giữ ≥ 10 bước.
 */
export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private bytes = 0;
  private didTrim = false;
  private readonly maxSteps: number;
  private readonly minSteps: number;
  private readonly rawSteps: number;
  private compressor: PixelCompressor | null = null;
  private archiveHandle: IdleHandle | null = null;
  private archiving = false;
  /** Đang thiếu bộ nhớ: nén liền các dải, không chờ lúc rảnh. */
  private urgentArchive = false;
  private readonly unarchivable = new WeakSet<Archivable>();
  private readonly offReclaim: (() => void)[] = [];

  constructor(
    private readonly budget: MemoryBudget,
    private readonly options: HistoryOptions = {},
  ) {
    this.maxSteps = options.maxSteps ?? 100;
    this.minSteps = options.minSteps ?? 10;
    this.rawSteps = options.rawSteps ?? 10;
    this.offReclaim.push(
      budget.addReclaimer('history-compress', () => {
        // Nén chạy bất đồng bộ trong Worker: không giải phóng ngay được, nhưng bắt đầu ngay thay vì
        // chờ lúc rảnh để các lần cấp phát sau có chỗ.
        this.scheduleArchive(true);
      }),
      budget.addReclaimer('history-drop', (bytes, category) => {
        this.dropUntil(bytes, category);
      }),
    );
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get usedBytes(): number {
    return this.bytes;
  }

  get steps(): number {
    return this.undoStack.length;
  }

  /** Bật nén bước cũ (Worker). null = tắt (test không có Worker). */
  setCompressor(compressor: PixelCompressor | null): void {
    this.compressor = compressor;
    if (compressor) this.scheduleArchive(false);
  }

  /** Chạy command lần đầu, đưa vào lịch sử, xóa nhánh redo. Tăng `doc.rev`. */
  execute(command: Command, doc: Document): void {
    command.execute(doc);
    doc.bumpRev();
    for (const c of this.redoStack) c.dispose?.();
    this.redoStack = [];

    const last = this.undoStack.at(-1);
    if (last?.mergeWith?.(command)) {
      command.dispose?.();
    } else {
      this.undoStack.push(command);
    }
    this.account();
    this.trim();
    this.changed();
  }

  /** Hoàn tác bước trên cùng; trả command vừa hoàn tác (null nếu không có). */
  undo(doc: Document): Command | null {
    const command = this.undoStack.at(-1);
    if (!command) return null;
    // Nếu undo ném lỗi (vd. thiếu bộ nhớ), command vẫn ở nguyên chỗ.
    command.undo(doc);
    this.undoStack.pop();
    doc.bumpRev();
    this.redoStack.push(command);
    this.account();
    this.changed();
    return command;
  }

  redo(doc: Document): Command | null {
    const command = this.redoStack.at(-1);
    if (!command) return null;
    command.execute(doc);
    this.redoStack.pop();
    doc.bumpRev();
    this.undoStack.push(command);
    this.account();
    this.trim();
    this.changed();
    return command;
  }

  /**
   * Nhảy tới vị trí `position` (= số bước đã áp dụng) — panel History (mục 2). Dừng ở bước gặp lỗi
   * (thiếu bộ nhớ…); trả số bước đã đi.
   */
  goTo(position: number, doc: Document): number {
    const target = Math.max(0, Math.min(position, this.undoStack.length + this.redoStack.length));
    let moved = 0;
    try {
      while (this.undoStack.length > target) {
        if (!this.undoSilently(doc)) break;
        moved++;
      }
      while (this.undoStack.length < target) {
        if (!this.redoSilently(doc)) break;
        moved++;
      }
    } finally {
      if (moved > 0) {
        this.account();
        this.trim();
        this.changed();
      }
    }
    return moved;
  }

  /**
   * Bỏ nhánh redo trước một thao tác mới cần nhiều bộ nhớ (biến đổi ảnh): layer của nhánh redo vẫn
   * giữ bộ nhớ cho tới khi command mới vào history — mà command mới chỉ tạo được sau khi cấp phát.
   */
  discardRedo(): void {
    if (this.redoStack.length === 0) return;
    for (const c of this.redoStack) c.dispose?.();
    this.redoStack = [];
    this.account();
    this.changed();
  }

  clear(): void {
    for (const c of this.undoStack) c.dispose?.();
    for (const c of this.redoStack) c.dispose?.();
    this.undoStack = [];
    this.redoStack = [];
    this.didTrim = false;
    this.account();
    this.changed();
  }

  dispose(): void {
    if (this.archiveHandle) cancelIdle(this.archiveHandle);
    this.archiveHandle = null;
    this.compressor = null;
    for (const off of this.offReclaim.splice(0)) off();
    this.clear();
  }

  summary(): HistorySummary {
    return {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoLabel: this.undoStack.at(-1)?.label ?? null,
      redoLabel: this.redoStack.at(-1)?.label ?? null,
      steps: this.undoStack.length,
      trimmed: this.didTrim,
      entries: [...this.undoStack, ...[...this.redoStack].reverse()].map((c) => ({
        label: c.label,
        timestamp: c.timestamp,
      })),
      position: this.undoStack.length,
    };
  }

  /**
   * Giải phóng bước cũ nhất cho tới khi đủ chỗ cấp phát thêm `bytes` trong hạng mục history (gọi
   * trước khi một thao tác mới cấp phát bộ nhớ history). Trả về có đủ chỗ hay không.
   */
  makeRoom(bytes: number): boolean {
    this.dropUntil(bytes, 'history');
    return this.budget.canReserve(bytes, 'history');
  }

  private undoSilently(doc: Document): boolean {
    const command = this.undoStack.at(-1);
    if (!command) return false;
    command.undo(doc);
    this.undoStack.pop();
    doc.bumpRev();
    this.redoStack.push(command);
    return true;
  }

  private redoSilently(doc: Document): boolean {
    const command = this.redoStack.at(-1);
    if (!command) return false;
    command.execute(doc);
    this.redoStack.pop();
    doc.bumpRev();
    this.undoStack.push(command);
    return true;
  }

  private dropUntil(bytes: number, category: SurfaceCategory): void {
    let dropped = false;
    while (!this.budget.canReserve(bytes, category) && this.undoStack.length > this.minSteps) {
      this.dropOldest();
      dropped = true;
    }
    if (dropped) {
      this.account();
      this.changed();
    }
  }

  private account(): void {
    let bytes = 0;
    for (const c of this.undoStack) bytes += c.memoryBytes();
    for (const c of this.redoStack) bytes += c.memoryBytes();
    this.bytes = bytes;
  }

  /** Áp lại giới hạn sau khi ngân sách history đổi (Cài đặt). */
  enforceLimits(): void {
    const steps = this.undoStack.length;
    this.trim();
    if (this.undoStack.length !== steps) this.changed();
  }

  /** Loại bước cũ nhất khi vượt số bước hoặc ngân sách history; giữ tối thiểu `minSteps`. */
  private trim(): void {
    const limit = this.budget.limitFor('history');
    while (
      this.undoStack.length > this.minSteps &&
      (this.undoStack.length > this.maxSteps || this.budget.usedBy('history') > limit)
    ) {
      this.dropOldest();
    }
  }

  private dropOldest(): void {
    const oldest = this.undoStack.shift();
    if (!oldest) return;
    this.bytes -= oldest.memoryBytes();
    oldest.dispose?.();
    this.didTrim = true;
  }

  private changed(): void {
    this.options.onChange?.(this.summary());
    this.scheduleArchive(false);
  }

  // ---------------------------------------------------------------------------
  // Nén dữ liệu cũ (mục 5.6, 5.11 bước 4)
  // ---------------------------------------------------------------------------

  /** Dữ liệu được phép nén ở trạng thái history hiện tại, không gồm nhánh redo. */
  private archiveCandidates(): Archivable[] {
    const candidates: Archivable[] = [];
    const oldCount = this.undoStack.length - this.rawSteps;
    for (let i = 0; i < this.undoStack.length; i++) {
      candidates.push(...(this.undoStack[i]?.archivables?.(i < oldCount) ?? []));
    }
    return candidates;
  }

  /** Dữ liệu tiếp theo cần nén: bước cũ trước; bước gần đây chỉ nén phần "rời document". */
  private nextArchivable(): Archivable | null {
    return (
      this.archiveCandidates().find((item) => !item.archived && !this.unarchivable.has(item)) ??
      null
    );
  }

  private scheduleArchive(urgent: boolean): void {
    if (urgent) this.urgentArchive = true;
    if (!this.compressor || this.archiving) return;
    if (this.archiveHandle) {
      if (!urgent) return;
      cancelIdle(this.archiveHandle);
    }
    this.archiveHandle = requestIdle(() => {
      this.archiveHandle = null;
      void this.archiveNext();
    }, urgent);
  }

  private async archiveNext(): Promise<void> {
    const compressor = this.compressor;
    if (!compressor || this.archiving) return;
    const item = this.nextArchivable();
    if (!item) return;
    this.archiving = true;
    try {
      // Bộ giải nén phải sẵn sàng trước khi nhận bản nén (undo cần giải nén đồng bộ).
      if (!(await loadInflater())) {
        this.compressor = null;
        return;
      }
      const snap = item.snapshot();
      let adopted = false;
      if (snap) {
        // Từng dải ~4 MB, nghỉ lúc rảnh giữa các dải: GPU không phải đọc cả layer lớn một lần.
        const rows = bandRows(snap.width);
        const bands: CompressedBand[] = [];
        for (let y = 0; y < snap.height; y += rows) {
          const height = Math.min(rows, snap.height - y);
          bands.push({ y, height, data: await compressor(await snap.band(y, height)) });
          if (this.compressor !== compressor) return;
          if (y + height < snap.height) await this.pause();
        }
        // Worker có thể trả kết quả sau undo: surface đã quay lại document thì không được
        // thay bằng bản nén (adopt giải phóng canvas mà thao tác ảnh đang đọc).
        if (this.archiveCandidates().includes(item)) {
          adopted = item.adopt({ width: snap.width, height: snap.height, bands }, snap.version);
        }
      }
      if (adopted) this.account();
      // Bị undo không có nghĩa là không nén được: redo sau đó vẫn phải được thử lại.
      else if (this.archiveCandidates().includes(item)) this.unarchivable.add(item);
    } catch {
      // Worker lỗi hoặc dữ liệu đã bị giải phóng: giữ nguyên dạng GPU.
      this.unarchivable.add(item);
    } finally {
      this.archiving = false;
    }
    if (!this.nextArchivable()) this.urgentArchive = false;
    this.scheduleArchive(this.urgentArchive);
  }

  /** Nghỉ giữa hai dải: lúc rảnh, hoặc ngay (task kế) khi đang thiếu bộ nhớ. */
  private pause(): Promise<void> {
    return new Promise((resolve) => {
      requestIdle(resolve, this.urgentArchive);
    });
  }
}
