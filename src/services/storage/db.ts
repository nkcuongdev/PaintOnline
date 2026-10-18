import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { runMigrations } from './migrations';
import {
  DB_NAME,
  DB_VERSION,
  type AppSettings,
  type CheckpointRecord,
  type DocumentRecord,
  type LayerBlobRecord,
  type ProjectMeta,
  type SessionRecord,
  type ThumbnailRecord,
} from './schema';

/** Kiểu các object store (mục 6.4) cho `idb`. */
export interface PaintDB extends DBSchema {
  projects: {
    key: string;
    value: ProjectMeta;
    indexes: { updatedAt: number; deletedAt: number };
  };
  documents: { key: string; value: DocumentRecord };
  layerBlobs: { key: [string, string]; value: LayerBlobRecord };
  thumbnails: { key: string; value: ThumbnailRecord };
  checkpoints: { key: string; value: CheckpointRecord };
  settings: { key: string; value: AppSettings };
  session: { key: string; value: SessionRecord };
}

/** IndexedDB không dùng được (một số chế độ duyệt riêng tư, chính sách trình duyệt — mục 6.6). */
export class StorageUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('IndexedDB không dùng được', { cause });
    this.name = 'StorageUnavailableError';
  }
}

/**
 * Điểm chèn lỗi cho test fault-injection (mục 11.1): gọi trong mỗi transaction ghi, sau khi đã
 * đưa mọi thay đổi vào transaction và trước khi chờ commit. Hook có thể `tx.abort()`, ném lỗi
 * (vd. DOMException QuotaExceededError) hoặc chờ (giả lập lượt lưu chậm).
 */
export interface StorageFaults {
  beforeCommit?: (info: {
    op: string;
    projectId: string | null;
    tx: IDBTransaction;
  }) => void | Promise<void>;
}

/**
 * Kết nối IndexedDB dùng chung. Mở lười; khi kết nối bị đóng ngoài ý muốn (tab khác nâng cấp
 * schema → `versionchange`, trình duyệt dọn dẹp → `close`) thì bỏ kết nối cũ, lần dùng sau mở lại
 * và `generation` tăng — autosave thấy generation đổi sẽ coi mọi layer là bẩn (mục 6.6).
 */
export class Database {
  private connection: Promise<IDBPDatabase<PaintDB>> | null = null;
  private gen = 0;
  private readonly closeListeners = new Set<() => void>();
  faults: StorageFaults | null = null;

  constructor(
    readonly name: string = DB_NAME,
    private readonly factory: () => IDBFactory | undefined = () =>
      typeof indexedDB === 'undefined' ? undefined : indexedDB,
  ) {}

  /** Số lần đã mở kết nối (tăng khi phải mở lại). */
  get generation(): number {
    return this.gen;
  }

  get(): Promise<IDBPDatabase<PaintDB>> {
    this.connection ??= this.open();
    return this.connection;
  }

  /** Thử mở DB; false nếu IndexedDB không dùng được. */
  async available(): Promise<boolean> {
    try {
      await this.get();
      return true;
    } catch {
      return false;
    }
  }

  onUnexpectedClose(listener: () => void): () => void {
    this.closeListeners.add(listener);
    return () => {
      this.closeListeners.delete(listener);
    };
  }

  /** Đóng kết nối hiện tại (test, hoặc giả lập trình duyệt đóng kết nối). */
  async close(options: { unexpected?: boolean } = {}): Promise<void> {
    const pending = this.connection;
    this.connection = null;
    if (!pending) return;
    try {
      (await pending).close();
    } catch {
      // Chưa mở được thì không có gì để đóng.
    }
    if (options.unexpected) this.emitClosed();
  }

  /** Xóa hẳn database (chỉ dùng trong test). */
  async destroy(): Promise<void> {
    await this.close();
    const factory = this.factory();
    if (!factory) return;
    await new Promise<void>((resolve, reject) => {
      const request = factory.deleteDatabase(this.name);
      request.onsuccess = () => {
        resolve();
      };
      request.onerror = () => {
        reject(request.error ?? new Error('Không xóa được database'));
      };
      request.onblocked = () => {
        resolve();
      };
    });
  }

  private async open(): Promise<IDBPDatabase<PaintDB>> {
    const factory = this.factory();
    if (!factory) {
      this.connection = null;
      throw new StorageUnavailableError();
    }
    try {
      const db = await openDB<PaintDB>(this.name, DB_VERSION, {
        upgrade(database, oldVersion, newVersion, transaction) {
          runMigrations(database, transaction, oldVersion, newVersion ?? DB_VERSION);
        },
        blocking: () => {
          // Tab khác cần nâng cấp schema: nhường kết nối, lần ghi sau sẽ mở lại.
          void this.close({ unexpected: true });
        },
        terminated: () => {
          this.connection = null;
          this.emitClosed();
        },
      });
      this.gen++;
      return db;
    } catch (error) {
      this.connection = null;
      throw new StorageUnavailableError(error);
    }
  }

  private emitClosed(): void {
    for (const listener of this.closeListeners) listener();
  }
}

/** Lỗi ghi do kết nối đã đóng (InvalidStateError) — cần mở lại kết nối rồi lưu lại toàn bộ. */
export function isConnectionClosedError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'InvalidStateError' || error.name === 'TransactionInactiveError')
  );
}

export function isQuotaError(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false;
  // Firefox cũ dùng tên NS_ERROR_DOM_QUOTA_REACHED.
  return error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED';
}
