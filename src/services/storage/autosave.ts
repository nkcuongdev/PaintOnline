import type { DocumentData, ID, LayerCapture, ViewData } from '@/engine/core/types';
import type { ImageCodec } from '@/services/workers/codec';
import { isConnectionClosedError, isQuotaError } from './db';
import {
  MissingLayerBlobError,
  ProjectNotFoundError,
  StaleRevisionError,
  type EncodedLayer,
  type ProjectRepository,
  type SaveResult,
} from './projectRepo';
import { RECORD_SCHEMA_VERSION, type ProjectMode, type StoredImage } from './schema';
import type { SaveStatus } from './saveStatus';

/**
 * Autosave theo revision (mục 6.6).
 *
 * - Kích hoạt: debounce 1,5 s sau thay đổi cuối, tối đa 10 s một lần khi thao tác liên tục; ngay
 *   khi tab ẩn / pagehide / chuyển project / Ctrl+S (người gọi dùng `saveNow`). Không lưu giữa
 *   chừng một nét vẽ hay transform — chờ Command commit.
 * - Một lượt lưu: (1) Chụp — đồng bộ trên main thread: serialize document + ImageBitmap của layer
 *   có contentRev mới; (2) Mã hóa trong Worker; (3) Ghi trong MỘT transaction. Chỉ khi
 *   transaction complete mới đặt savedRev = snapshotRev.
 * - Single-flight: mỗi lúc một lượt; thay đổi đến trong lúc lưu chỉ đánh dấu, lượt kế tiếp chạy
 *   ngay sau và gộp mọi thay đổi. Repository từ chối revision cũ hơn bản đã lưu.
 * - Lỗi: hết quota → xóa checkpoint rồi thử lại một lần, vẫn hết thì dừng ở trạng thái "Hết dung
 *   lượng" tới khi `resume()`; lỗi tạm thời → thử lại sau 2 s, 5 s, 15 s rồi báo lỗi; kết nối bị
 *   đóng → mở lại một lần và lưu lại toàn bộ; mã hóa thất bại → mã hóa lại từng layer một.
 */

/** Nguồn dữ liệu (Editor) — interface hẹp để test được không cần Engine thật. */
export interface AutosaveSource {
  /** `document.rev` hiện tại. */
  readonly rev: number;
  /** Đang có thao tác dở (nét vẽ, kéo đối tượng) hoặc tác vụ nền — chưa chụp được. */
  readonly blocked: boolean;
  serialize(): DocumentData | null;
  captureLayers(saved: ReadonlyMap<ID, number>): LayerCapture[];
  renderThumbnail(maxSide: number): Promise<ImageBitmap>;
  view(): ViewData;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
  now(): number;
}

const browserTimers: Timers = {
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => {
    window.clearTimeout(id);
  },
  now: () => Date.now(),
};

export interface AutosaveOptions {
  projectId: ID;
  meta: () => { name: string; mode: ProjectMode };
  repo: ProjectRepository;
  codec: ImageCodec;
  source: AutosaveSource;
  onStatus: (status: SaveStatus) => void;
  onSaved?: (result: SaveResult) => void;
  /** Revision và contentRev từng layer đã có trong DB (mở project); không có = project mới. */
  saved?: { rev: number; layers: ReadonlyMap<ID, number> };
  /** Thời điểm checkpoint gần nhất (để ghi checkpoint sau mỗi 15 phút chỉnh sửa). */
  lastCheckpointAt?: number | null;
  timers?: Timers;
  debounceMs?: number;
  maxWaitMs?: number;
  retryDelaysMs?: readonly number[];
  checkpointIntervalMs?: number;
  thumbnailSide?: number;
  /** Ảnh thu nhỏ tạo lại tối đa mỗi khoảng này (luôn tạo khi lưu bền vững / đóng project). */
  thumbnailIntervalMs?: number;
}

type Durability = 'default' | 'strict';

/** Chờ thao tác dở kết thúc trước khi chụp. */
const BLOCKED_POLL_MS = 120;

export class Autosave {
  private status: SaveStatus;
  private savedRev: number;
  private savedLayers: Map<ID, number>;
  private created: boolean;
  private lastCheckpointAt: number;

  private running: Promise<void> | null = null;
  private wanted = false;
  private wantedDurability: Durability = 'default';
  private debounceTimer: number | null = null;
  private retryTimer: number | null = null;
  private firstDirtyAt: number | null = null;
  private failures = 0;
  private quotaCleanupTried = false;
  private reopenTried = false;
  private missingRetried = false;
  private sequentialEncode = false;
  private generation: number | null = null;
  private stopped = false;
  private disposed = false;
  private savedAt: number | null = null;

  private readonly timers: Timers;
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly retryDelays: readonly number[];
  private readonly checkpointIntervalMs: number;
  private readonly thumbnailSide: number;
  private readonly thumbnailIntervalMs: number;
  private lastThumbnailAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: AutosaveOptions) {
    this.timers = options.timers ?? browserTimers;
    this.debounceMs = options.debounceMs ?? 1500;
    this.maxWaitMs = options.maxWaitMs ?? 10_000;
    this.retryDelays = options.retryDelaysMs ?? [2000, 5000, 15_000];
    this.checkpointIntervalMs = options.checkpointIntervalMs ?? 15 * 60 * 1000;
    this.thumbnailSide = options.thumbnailSide ?? 320;
    this.thumbnailIntervalMs = options.thumbnailIntervalMs ?? 20_000;
    this.savedRev = options.saved?.rev ?? -1;
    this.savedLayers = new Map(options.saved?.layers ?? []);
    this.created = options.saved !== undefined;
    this.lastCheckpointAt = options.lastCheckpointAt ?? this.timers.now();
    this.status = this.isDirty ? { kind: 'dirty' } : { kind: 'saved', savedAt: null };
  }

  get current(): SaveStatus {
    return this.status;
  }

  get lastSavedRev(): number {
    return this.savedRev;
  }

  /** Còn thay đổi chưa vào DB. */
  get isDirty(): boolean {
    return this.options.source.rev !== this.savedRev;
  }

  /** Engine báo document đổi (documentChanged). */
  notifyChange(): void {
    if (this.disposed || this.stopped) return;
    if (!this.isDirty) return;
    const now = this.timers.now();
    this.firstDirtyAt ??= now;
    if (this.status.kind === 'saved') this.setStatus({ kind: 'dirty' });
    if (this.status.kind === 'error' || this.status.kind === 'quota') return;
    this.clearDebounce();
    const wait = Math.max(0, Math.min(this.debounceMs, this.firstDirtyAt + this.maxWaitMs - now));
    this.debounceTimer = this.timers.setTimeout(() => {
      this.debounceTimer = null;
      void this.request('default');
    }, wait);
  }

  /**
   * Lưu ngay (tab ẩn, pagehide, chuyển project, Ctrl+S). Trả true nếu sau lượt này DB đã có
   * revision hiện tại.
   */
  async saveNow(durability: Durability = 'default'): Promise<boolean> {
    if (this.disposed || this.stopped) return !this.isDirty;
    const target = this.options.source.rev;
    await this.request(durability, true);
    return this.savedRev >= target;
  }

  /** Người dùng nhấn "Thử lại" (sau lỗi lưu hoặc hết dung lượng). */
  retry(): Promise<boolean> {
    this.failures = 0;
    this.quotaCleanupTried = false;
    this.missingRetried = false;
    this.reopenTried = false;
    this.sequentialEncode = false;
    this.clearRetry();
    if (this.status.kind === 'error' || this.status.kind === 'quota') {
      this.setStatus({ kind: 'dirty' });
    }
    return this.saveNow('default');
  }

  /** Dung lượng vừa được giải phóng (dọn thùng rác, xóa project) — tự thử lại nếu đang hết quota. */
  resume(): void {
    if (this.status.kind === 'quota') void this.retry();
  }

  /** Dừng lưu (tab khác giữ quyền chỉnh sửa, hoặc project bị đóng). */
  stop(status: SaveStatus = { kind: 'readonly' }): void {
    this.stopped = true;
    this.clearDebounce();
    this.clearRetry();
    this.setStatus(status);
  }

  /** Đóng project: lưu bền vững (strict) rồi ghi checkpoint. */
  async close(): Promise<boolean> {
    const ok = await this.saveNow('strict');
    if (ok && this.created) {
      try {
        await this.options.repo.writeCheckpoint(this.options.projectId);
      } catch {
        // Checkpoint là dự phòng: không ghi được (vd. thiếu dung lượng) không chặn việc đóng.
      }
    }
    return ok;
  }

  dispose(): void {
    this.disposed = true;
    this.clearDebounce();
    this.clearRetry();
  }

  // ---------------------------------------------------------------------------

  private request(durability: Durability, immediate = false): Promise<void> {
    if (durability === 'strict') this.wantedDurability = 'strict';
    this.wanted = true;
    if (immediate) this.clearDebounce();
    this.running ??= this.loop().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async loop(): Promise<void> {
    while (this.wanted && !this.disposed && !this.stopped) {
      this.wanted = false;
      if (!this.isDirty) {
        this.wantedDurability = 'default';
        if (this.status.kind !== 'saved') this.setStatus({ kind: 'saved', savedAt: this.savedAt });
        continue;
      }
      if (this.options.source.blocked) {
        await this.sleep(BLOCKED_POLL_MS);
        this.wanted = true;
        continue;
      }
      const durability = this.wantedDurability;
      this.wantedDurability = 'default';
      const outcome = await this.attempt(durability);
      if (outcome === 'retry-now') this.wanted = true;
      else if (outcome === 'stop') return;
    }
  }

  private async attempt(durability: Durability): Promise<'ok' | 'retry-now' | 'stop'> {
    const { source, repo, projectId } = this.options;
    // Kết nối DB đã được mở lại kể từ lượt trước: không còn chắc DB có đủ pixel → lưu lại toàn bộ.
    if (this.generation !== null && this.generation !== repo.db.generation) {
      this.savedLayers.clear();
    }

    // --- Pha 1: Chụp (đồng bộ) -------------------------------------------------------
    const data = source.serialize();
    if (!data) return 'ok';
    const view = source.view();
    const captures = source.captureLayers(this.savedLayers);
    // Ảnh thu nhỏ (ghép cả document trên main thread) không cần mới từng giây: giãn nhịp để lượt lưu
    // thường không tốn thêm thời gian main thread (mục 11.2: không long task > 100 ms).
    const now = this.timers.now();
    const thumbnailBitmap =
      durability === 'strict' || now - this.lastThumbnailAt >= this.thumbnailIntervalMs
        ? source.renderThumbnail(this.thumbnailSide)
        : null;
    this.setStatus({ kind: 'saving' });

    try {
      // --- Pha 2: Mã hóa (Worker) — xong hẳn trước khi mở transaction ------------------
      const layers = await this.encodeLayers(captures);
      const thumbnail = thumbnailBitmap ? await this.encodeThumbnail(thumbnailBitmap) : null;

      // --- Pha 3: Ghi (một transaction) -----------------------------------------------
      const meta = this.options.meta();
      const result = await repo.saveSnapshot({
        projectId,
        name: meta.name,
        mode: meta.mode,
        document: { ...data, schemaVersion: RECORD_SCHEMA_VERSION, projectId, viewport: view },
        layers,
        thumbnail,
        durability,
        create: !this.created,
      });
      this.created = true;
      if (thumbnail) this.lastThumbnailAt = now;
      this.generation = repo.db.generation;
      this.savedRev = data.rev;
      this.savedAt = result.savedAt;
      this.savedLayers = new Map(
        data.layers.flatMap((l) =>
          l.kind === 'raster' && l.bounds ? [[l.id, l.contentRev] as const] : [],
        ),
      );
      this.failures = 0;
      this.reopenTried = false;
      this.missingRetried = false;
      this.quotaCleanupTried = false;
      this.sequentialEncode = false;
      this.firstDirtyAt = this.isDirty ? this.timers.now() : null;
      this.setStatus(this.isDirty ? { kind: 'dirty' } : { kind: 'saved', savedAt: result.savedAt });
      this.options.onSaved?.(result);
      if (this.isDirty) this.notifyChange();
      await this.maybeCheckpoint();
      return 'ok';
    } catch (error) {
      void closeCaptures(captures);
      void thumbnailBitmap?.then(
        (b) => {
          b.close();
        },
        () => undefined,
      );
      return this.handleError(error);
    }
  }

  private async encodeLayers(captures: readonly LayerCapture[]): Promise<EncodedLayer[]> {
    const { codec } = this.options;
    const encodeOne = async (capture: LayerCapture): Promise<EncodedLayer> => {
      const bitmap = await capture.bitmap;
      const png = await codec.encodeLayer(bitmap);
      return {
        layerId: capture.layerId,
        png,
        bounds: capture.bounds,
        contentRev: capture.contentRev,
      };
    };
    try {
      if (!this.sequentialEncode) return await Promise.all(captures.map(encodeOne));
      // Mã hóa lại từng layer một (ít bộ nhớ đỉnh hơn) sau khi mã hóa song song thất bại.
      const out: EncodedLayer[] = [];
      for (const capture of captures) out.push(await encodeOne(capture));
      return out;
    } catch (error) {
      throw new EncodeError(error);
    }
  }

  private async encodeThumbnail(bitmap: Promise<ImageBitmap>): Promise<StoredImage | null> {
    try {
      const blob = await this.options.codec.thumbnail(await bitmap, this.thumbnailSide);
      // ArrayBuffer đọc xong trước khi mở transaction (transaction không được chờ promise ngoài).
      return { data: await blob.arrayBuffer(), type: blob.type };
    } catch {
      // Ảnh thu nhỏ không bắt buộc: giữ ảnh cũ trong DB.
      return null;
    }
  }

  private async handleError(error: unknown): Promise<'ok' | 'retry-now' | 'stop'> {
    const { repo } = this.options;
    if (error instanceof StaleRevisionError) {
      this.setStatus({ kind: 'error', reason: 'conflict' });
      return 'stop';
    }
    if (error instanceof ProjectNotFoundError) {
      this.setStatus({ kind: 'error', reason: 'missing' });
      return 'stop';
    }
    if (error instanceof MissingLayerBlobError && !this.missingRetried) {
      this.missingRetried = true;
      this.savedLayers.clear();
      return 'retry-now';
    }
    if (error instanceof EncodeError) {
      if (!this.sequentialEncode) {
        this.sequentialEncode = true;
        return 'retry-now';
      }
      this.setStatus({ kind: 'error', reason: 'encode' });
      return 'stop';
    }
    if (isQuotaError(error)) {
      if (!this.quotaCleanupTried) {
        this.quotaCleanupTried = true;
        // Checkpoint là thứ bị xóa đầu tiên khi thiếu dung lượng (mục 6.6).
        const freed = await repo.deleteCheckpoints().catch(() => 0);
        if (freed > 0) return 'retry-now';
      }
      this.setStatus({ kind: 'quota' });
      return 'stop';
    }
    if (isConnectionClosedError(error) && !this.reopenTried) {
      this.reopenTried = true;
      await repo.db.close();
      this.savedLayers.clear();
      return 'retry-now';
    }
    // Lỗi tạm thời: thử lại sau 2 s, 5 s, 15 s; sau 3 lần → "Lỗi lưu".
    this.failures++;
    const delay = this.retryDelays.at(this.failures - 1);
    if (delay === undefined || this.failures > this.retryDelays.length) {
      this.setStatus({ kind: 'error', reason: 'transient' });
      return 'stop';
    }
    this.setStatus({ kind: 'dirty' });
    this.clearRetry();
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = null;
      void this.request('default');
    }, delay);
    return 'stop';
  }

  private async maybeCheckpoint(): Promise<void> {
    const now = this.timers.now();
    if (now - this.lastCheckpointAt < this.checkpointIntervalMs) return;
    this.lastCheckpointAt = now;
    try {
      await this.options.repo.writeCheckpoint(this.options.projectId);
    } catch {
      // Không ghi được checkpoint (thiếu dung lượng…) không ảnh hưởng bản lưu chính.
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.timers.setTimeout(resolve, ms);
    });
  }

  private setStatus(status: SaveStatus): void {
    if (this.disposed) return;
    const same =
      this.status.kind === status.kind && JSON.stringify(this.status) === JSON.stringify(status);
    this.status = status;
    if (!same) this.options.onStatus(status);
  }

  private clearDebounce(): void {
    if (this.debounceTimer !== null) this.timers.clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) this.timers.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}

/** Mã hóa pixel thất bại (thường do thiếu bộ nhớ). */
export class EncodeError extends Error {
  constructor(cause: unknown) {
    super('Không mã hóa được pixel layer', { cause });
    this.name = 'EncodeError';
  }
}

async function closeCaptures(captures: readonly LayerCapture[]): Promise<void> {
  for (const capture of captures) {
    try {
      // Bitmap đã chuyển sang Worker thì close() không làm gì.
      (await capture.bitmap).close();
    } catch {
      // Chụp thất bại: không có gì để giải phóng.
    }
  }
}
