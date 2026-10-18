import type { IDBPTransaction, StoreNames } from 'idb';
import type { ID, Rect } from '@/engine/core/types';
import { broadcast } from './channel';
import type { Database, PaintDB } from './db';
import {
  parseDocumentRecord,
  RECORD_SCHEMA_VERSION,
  TRASH_RETENTION_MS,
  type AppSettings,
  type CheckpointRecord,
  type DocumentRecord,
  type LayerBlobRecord,
  type ProjectMeta,
  type ProjectMode,
  type SessionRecord,
  type StoredImage,
} from './schema';

/**
 * Repository IndexedDB (mục 6.4, 6.6). Mỗi thao tác ghi là MỘT transaction: ghi tất cả hoặc
 * không ghi gì. Lượt lưu của autosave từ chối ghi đè revision mới hơn đã có trong DB.
 */

/** Pixel một layer raster đã mã hóa (PNG RGBA — ADR 0021), sẵn sàng ghi. */
export interface EncodedLayer {
  layerId: ID;
  png: ArrayBuffer;
  bounds: Rect;
  contentRev: number;
}

export interface SaveRequest {
  projectId: ID;
  name: string;
  mode: ProjectMode;
  /** Bản ghi document đầy đủ của revision cần lưu. */
  document: DocumentRecord;
  /** Chỉ các layer có contentRev mới (đã mã hóa). Layer còn lại phải có sẵn trong DB. */
  layers: EncodedLayer[];
  thumbnail: StoredImage | null;
  /** 'strict' cho Ctrl+S và lượt lưu khi đóng project (mục 6.6). */
  durability?: 'default' | 'strict';
  /** Lượt lưu đầu tiên của project mới: tạo metadata. */
  create?: boolean;
}

export interface SaveResult {
  rev: number;
  sizeBytes: number;
  savedAt: number;
}

/** DB đã có revision mới hơn bản đang lưu (lượt lưu chậm, hoặc tab khác đã ghi). */
export class StaleRevisionError extends Error {
  constructor(
    readonly stored: number,
    readonly attempted: number,
  ) {
    super(`Revision ${String(attempted)} cũ hơn revision đã lưu ${String(stored)}`);
    this.name = 'StaleRevisionError';
  }
}

/** Layer được coi là đã lưu nhưng blob không có hoặc lệch revision — cần lưu lại toàn bộ. */
export class MissingLayerBlobError extends Error {
  constructor(readonly layerId: ID) {
    super(`Thiếu pixel của layer ${layerId}`);
    this.name = 'MissingLayerBlobError';
  }
}

export class ProjectNotFoundError extends Error {
  constructor(
    readonly projectId: ID,
    readonly reason: 'missing' | 'deleted' = 'missing',
  ) {
    super(`Không có project ${projectId}`);
    this.name = 'ProjectNotFoundError';
  }
}

/** Bản lưu hiện tại không đọc được (document thiếu hoặc sai schema). */
export class CorruptProjectError extends Error {
  constructor(
    readonly projectId: ID,
    readonly hasCheckpoint: boolean,
    cause?: unknown,
  ) {
    super(`Bản lưu của project ${projectId} không hợp lệ`, { cause });
    this.name = 'CorruptProjectError';
  }
}

export interface LoadedProject {
  meta: ProjectMeta;
  document: DocumentRecord;
  /** Pixel theo layerId (chỉ layer raster có nội dung). */
  blobs: Map<ID, LayerBlobRecord>;
}

/** Dữ liệu một project đầy đủ để nhập (file .paint) hoặc sao chép. */
export interface ProjectBundle {
  meta: Pick<ProjectMeta, 'name' | 'mode'> & Partial<Pick<ProjectMeta, 'lastExportedAt'>>;
  document: DocumentRecord;
  layers: EncodedLayer[];
  thumbnail: StoredImage | null;
}

type WriteStores = StoreNames<PaintDB>[];
type WriteTx<S extends WriteStores> = IDBPTransaction<PaintDB, S, 'readwrite'>;

/** Khoảng khóa của mọi layerBlobs thuộc một project: [id] … [id, []] (mảng xếp sau chuỗi). */
function projectBlobRange(projectId: ID): IDBKeyRange {
  return IDBKeyRange.bound([projectId], [projectId, []]);
}

/** Ước lượng kích thước bản ghi JSON (đủ cho hiển thị dung lượng). */
function jsonBytes(value: unknown): number {
  return JSON.stringify(value).length;
}

function projectsChanged(projectId: ID | null): void {
  broadcast({ type: 'projects-changed', projectId }, { local: true });
}

export class ProjectRepository {
  constructor(
    readonly db: Database,
    private readonly now: () => number = Date.now,
  ) {}

  // ---------------------------------------------------------------------------
  // Đọc
  // ---------------------------------------------------------------------------

  /** Mọi project, kể cả trong thùng rác (trang chủ lọc). Chỉ đọc store `projects`. */
  async listProjects(): Promise<ProjectMeta[]> {
    const db = await this.db.get();
    const all = await db.getAll('projects');
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getMeta(projectId: ID): Promise<ProjectMeta | null> {
    const db = await this.db.get();
    return (await db.get('projects', projectId)) ?? null;
  }

  async getThumbnail(projectId: ID): Promise<StoredImage | null> {
    const db = await this.db.get();
    return (await db.get('thumbnails', projectId))?.image ?? null;
  }

  /**
   * Đọc bản lưu hiện tại: metadata, document (đã validate), pixel từng layer. Ném
   * ProjectNotFoundError hoặc CorruptProjectError (kèm cờ có checkpoint để UI đề nghị mở).
   */
  async loadProject(projectId: ID): Promise<LoadedProject> {
    const db = await this.db.get();
    const tx = db.transaction(['projects', 'documents', 'layerBlobs', 'checkpoints'], 'readonly');
    const [meta, rawDocument, blobs, checkpointKey] = await Promise.all([
      tx.objectStore('projects').get(projectId),
      tx.objectStore('documents').get(projectId),
      tx.objectStore('layerBlobs').getAll(projectBlobRange(projectId)),
      tx.objectStore('checkpoints').getKey(projectId),
    ]);
    await tx.done;
    if (!meta) throw new ProjectNotFoundError(projectId);
    if (meta.deletedAt !== undefined) throw new ProjectNotFoundError(projectId, 'deleted');
    let document: DocumentRecord;
    try {
      if (!rawDocument) throw new Error('Thiếu bản ghi document');
      document = parseDocumentRecord(rawDocument);
    } catch (error) {
      throw new CorruptProjectError(projectId, checkpointKey !== undefined, error);
    }
    return { meta, document, blobs: new Map(blobs.map((b) => [b.layerId, b])) };
  }

  // ---------------------------------------------------------------------------
  // Lượt lưu (autosave, Ctrl+S) — mục 6.6, pha "Ghi"
  // ---------------------------------------------------------------------------

  /**
   * Ghi một revision trong MỘT transaction trên projects, documents, layerBlobs, thumbnails.
   * Từ chối (StaleRevisionError) nếu DB đã có revision lớn hơn. Blob của layer đã bị xóa (hoặc
   * thành trống) được xóa trong cùng transaction.
   */
  async saveSnapshot(request: SaveRequest): Promise<SaveResult> {
    const db = await this.db.get();
    const { projectId, document } = request;
    const tx = db.transaction(['projects', 'documents', 'layerBlobs', 'thumbnails'], 'readwrite', {
      durability: request.durability ?? 'default',
    });
    const savedAt = this.now();
    try {
      const [stored, meta] = await Promise.all([
        tx.objectStore('documents').get(projectId),
        tx.objectStore('projects').get(projectId),
      ]);
      if (stored && stored.rev > document.rev) {
        throw new StaleRevisionError(stored.rev, document.rev);
      }
      if (!meta && !request.create) throw new ProjectNotFoundError(projectId);

      const sizeBytes = await this.writeLayers(tx, projectId, document, request.layers, savedAt);
      const thumbnailBytes = await this.writeThumbnail(
        tx,
        projectId,
        request.thumbnail,
        document.rev,
        savedAt,
      );
      const record = { ...document, projectId, schemaVersion: RECORD_SCHEMA_VERSION };
      await tx.objectStore('documents').put(record);
      const total = sizeBytes + thumbnailBytes + jsonBytes(record);
      await tx.objectStore('projects').put({
        id: projectId,
        name: request.name,
        mode: request.mode,
        width: document.width,
        height: document.height,
        layerCount: document.layers.length,
        sizeBytes: total,
        rev: document.rev,
        createdAt: meta?.createdAt ?? savedAt,
        updatedAt: savedAt,
        openedAt: meta?.openedAt ?? savedAt,
        lastExportedAt: meta?.lastExportedAt,
        deletedAt: meta?.deletedAt,
        schemaVersion: RECORD_SCHEMA_VERSION,
      });
      await this.db.faults?.beforeCommit?.({
        op: 'save',
        projectId,
        tx: tx as unknown as IDBTransaction,
      });
      await tx.done;
      projectsChanged(projectId);
      return { rev: document.rev, sizeBytes: total, savedAt };
    } catch (error) {
      abortQuietly(tx);
      await tx.done.catch(() => undefined);
      throw error;
    }
  }

  /** Ghi blob của layer bẩn, xóa blob thừa, kiểm tra layer "đã lưu" thật sự có trong DB. */
  private async writeLayers(
    tx: WriteTx<['projects', 'documents', 'layerBlobs', 'thumbnails']>,
    projectId: ID,
    document: DocumentRecord,
    dirty: readonly EncodedLayer[],
    savedAt: number,
  ): Promise<number> {
    const store = tx.objectStore('layerBlobs');
    const live = new Map<ID, number>();
    for (const layer of document.layers) {
      if (layer.kind === 'raster' && layer.bounds) live.set(layer.id, layer.contentRev);
    }
    const written = new Set<ID>();
    let bytes = 0;
    for (const layer of dirty) {
      if (!live.has(layer.layerId)) continue;
      await store.put({
        projectId,
        layerId: layer.layerId,
        png: layer.png,
        bounds: layer.bounds,
        contentRev: layer.contentRev,
        updatedAt: savedAt,
      });
      written.add(layer.layerId);
      bytes += layer.png.byteLength;
    }
    const present = new Set<ID>(written);
    let cursor = await store.openCursor(projectBlobRange(projectId));
    while (cursor) {
      const { layerId, contentRev, png } = cursor.value;
      if (!written.has(layerId)) {
        if (!live.has(layerId)) {
          await cursor.delete();
        } else if (live.get(layerId) === contentRev) {
          present.add(layerId);
          bytes += png.byteLength;
        }
      }
      cursor = await cursor.continue();
    }
    for (const layerId of live.keys()) {
      if (!present.has(layerId)) throw new MissingLayerBlobError(layerId);
    }
    return bytes;
  }

  private async writeThumbnail(
    tx: WriteTx<['projects', 'documents', 'layerBlobs', 'thumbnails']>,
    projectId: ID,
    image: StoredImage | null,
    rev: number,
    savedAt: number,
  ): Promise<number> {
    const store = tx.objectStore('thumbnails');
    if (image) {
      await store.put({ projectId, image, rev, updatedAt: savedAt });
      return image.data.byteLength;
    }
    return (await store.get(projectId))?.image.data.byteLength ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Quản lý project (trang chủ)
  // ---------------------------------------------------------------------------

  /** Tạo project từ dữ liệu có sẵn (nhập .paint, khôi phục) trong một transaction. */
  async createProject(projectId: ID, bundle: ProjectBundle): Promise<ProjectMeta> {
    const db = await this.db.get();
    const tx = db.transaction(['projects', 'documents', 'layerBlobs', 'thumbnails'], 'readwrite', {
      durability: 'strict',
    });
    const now = this.now();
    try {
      if (await tx.objectStore('projects').getKey(projectId)) {
        throw new Error(`Project ${projectId} đã tồn tại`);
      }
      const document: DocumentRecord = {
        ...bundle.document,
        projectId,
        schemaVersion: RECORD_SCHEMA_VERSION,
      };
      let bytes = jsonBytes(document);
      for (const layer of bundle.layers) {
        await tx.objectStore('layerBlobs').put({
          projectId,
          layerId: layer.layerId,
          png: layer.png,
          bounds: layer.bounds,
          contentRev: layer.contentRev,
          updatedAt: now,
        });
        bytes += layer.png.byteLength;
      }
      if (bundle.thumbnail) {
        await tx.objectStore('thumbnails').put({
          projectId,
          image: bundle.thumbnail,
          rev: document.rev,
          updatedAt: now,
        });
        bytes += bundle.thumbnail.data.byteLength;
      }
      await tx.objectStore('documents').put(document);
      const meta: ProjectMeta = {
        id: projectId,
        name: bundle.meta.name,
        mode: bundle.meta.mode,
        width: document.width,
        height: document.height,
        layerCount: document.layers.length,
        sizeBytes: bytes,
        rev: document.rev,
        createdAt: now,
        updatedAt: now,
        openedAt: now,
        lastExportedAt: bundle.meta.lastExportedAt,
        schemaVersion: RECORD_SCHEMA_VERSION,
      };
      await tx.objectStore('projects').put(meta);
      await this.db.faults?.beforeCommit?.({
        op: 'create',
        projectId,
        tx: tx as unknown as IDBTransaction,
      });
      await tx.done;
      projectsChanged(projectId);
      return meta;
    } catch (error) {
      abortQuietly(tx);
      await tx.done.catch(() => undefined);
      throw error;
    }
  }

  /** Đọc toàn bộ dữ liệu đã lưu của project (xuất .paint, nhân bản). */
  async readBundle(projectId: ID): Promise<ProjectBundle & { meta: ProjectMeta }> {
    const loaded = await this.loadProject(projectId);
    const thumbnail = await this.getThumbnail(projectId);
    const layers: EncodedLayer[] = [];
    for (const layer of loaded.document.layers) {
      if (layer.kind !== 'raster' || !layer.bounds) continue;
      const blob = loaded.blobs.get(layer.id);
      if (!blob)
        throw new CorruptProjectError(projectId, false, new MissingLayerBlobError(layer.id));
      layers.push({
        layerId: layer.id,
        png: blob.png,
        bounds: blob.bounds,
        contentRev: blob.contentRev,
      });
    }
    return { meta: loaded.meta, document: loaded.document, layers, thumbnail };
  }

  /** Nhân bản: bản sao độc lập với id mới (blob dùng chung nội dung, không mã hóa lại). */
  async duplicate(projectId: ID, newId: ID, name: string): Promise<ProjectMeta> {
    const bundle = await this.readBundle(projectId);
    return this.createProject(newId, {
      meta: { name, mode: bundle.meta.mode },
      document: bundle.document,
      layers: bundle.layers,
      thumbnail: bundle.thumbnail,
    });
  }

  async rename(projectId: ID, name: string): Promise<void> {
    await this.updateMeta(projectId, (meta) => ({ ...meta, name }));
  }

  /** Đổi chế độ giao diện của project (Paint ↔ Screenshot — mục 7.3). */
  async setMode(projectId: ID, mode: ProjectMode): Promise<void> {
    await this.updateMeta(projectId, (meta) => ({ ...meta, mode }));
  }

  async touchOpened(projectId: ID): Promise<void> {
    await this.updateMeta(projectId, (meta) => ({ ...meta, openedAt: this.now() }), false);
  }

  async markExported(projectId: ID): Promise<void> {
    await this.updateMeta(projectId, (meta) => ({ ...meta, lastExportedAt: this.now() }));
  }

  /** Xóa mềm: vào thùng rác, xóa hẳn sau 7 ngày (mục 2 ★). */
  async moveToTrash(projectId: ID): Promise<void> {
    await this.updateMeta(projectId, (meta) => ({ ...meta, deletedAt: this.now() }));
  }

  async restoreFromTrash(projectId: ID): Promise<void> {
    await this.updateMeta(projectId, (meta) => {
      const { deletedAt: _deleted, ...rest } = meta;
      return rest;
    });
  }

  /** Xóa hẳn một project ở mọi store (thao tác "Xóa vĩnh viễn" trong thùng rác). */
  async purge(projectIds: readonly ID[]): Promise<void> {
    if (projectIds.length === 0) return;
    const db = await this.db.get();
    const tx = db.transaction(
      ['projects', 'documents', 'layerBlobs', 'thumbnails', 'checkpoints'],
      'readwrite',
    );
    for (const id of projectIds) {
      await Promise.all([
        tx.objectStore('projects').delete(id),
        tx.objectStore('documents').delete(id),
        tx.objectStore('layerBlobs').delete(projectBlobRange(id)),
        tx.objectStore('thumbnails').delete(id),
        tx.objectStore('checkpoints').delete(id),
      ]);
    }
    await tx.done;
    projectsChanged(null);
    broadcast({ type: 'storage-freed' }, { local: true });
  }

  /** Xóa hẳn project nằm trong thùng rác quá 7 ngày. Trả về id đã xóa. */
  async purgeExpired(): Promise<ID[]> {
    const limit = this.now() - TRASH_RETENTION_MS;
    const db = await this.db.get();
    const expired = (await db.getAll('projects')).filter(
      (meta) => meta.deletedAt !== undefined && meta.deletedAt <= limit,
    );
    const ids = expired.map((meta) => meta.id);
    await this.purge(ids);
    return ids;
  }

  async emptyTrash(): Promise<ID[]> {
    const db = await this.db.get();
    const ids = (await db.getAll('projects'))
      .filter((meta) => meta.deletedAt !== undefined)
      .map((meta) => meta.id);
    await this.purge(ids);
    return ids;
  }

  private async updateMeta(
    projectId: ID,
    change: (meta: ProjectMeta) => ProjectMeta,
    notify = true,
  ): Promise<void> {
    const db = await this.db.get();
    const tx = db.transaction('projects', 'readwrite');
    const meta = await tx.store.get(projectId);
    if (!meta) {
      await tx.done;
      throw new ProjectNotFoundError(projectId);
    }
    await tx.store.put(change(meta));
    await tx.done;
    if (notify) projectsChanged(projectId);
  }

  // ---------------------------------------------------------------------------
  // Checkpoint (mục 6.6)
  // ---------------------------------------------------------------------------

  /**
   * Sao bản lưu hiện tại thành checkpoint (thay checkpoint cũ). Blob dùng lại nội dung đã mã
   * hóa nên không cần Worker; chạy trong một transaction.
   */
  async writeCheckpoint(projectId: ID): Promise<CheckpointRecord | null> {
    const db = await this.db.get();
    const tx = db.transaction(['documents', 'layerBlobs', 'checkpoints'], 'readwrite');
    try {
      const document = await tx.objectStore('documents').get(projectId);
      if (!document) {
        await tx.done;
        return null;
      }
      const blobs = await tx.objectStore('layerBlobs').getAll(projectBlobRange(projectId));
      const checkpoint: CheckpointRecord = {
        projectId,
        rev: document.rev,
        createdAt: this.now(),
        document,
        layers: blobs.map(({ layerId, png, bounds, contentRev }) => ({
          layerId,
          png,
          bounds,
          contentRev,
        })),
      };
      await tx.objectStore('checkpoints').put(checkpoint);
      await this.db.faults?.beforeCommit?.({
        op: 'checkpoint',
        projectId,
        tx: tx as unknown as IDBTransaction,
      });
      await tx.done;
      return checkpoint;
    } catch (error) {
      abortQuietly(tx);
      await tx.done.catch(() => undefined);
      throw error;
    }
  }

  async getCheckpointInfo(projectId: ID): Promise<{ rev: number; createdAt: number } | null> {
    const db = await this.db.get();
    const checkpoint = await db.get('checkpoints', projectId);
    return checkpoint ? { rev: checkpoint.rev, createdAt: checkpoint.createdAt } : null;
  }

  /**
   * Thay bản lưu hiện tại (hỏng) bằng checkpoint. Revision được đặt lớn hơn mọi revision đã ghi
   * để không lượt lưu cũ nào ghi đè được.
   */
  async restoreCheckpoint(projectId: ID): Promise<void> {
    const db = await this.db.get();
    const tx = db.transaction(['projects', 'documents', 'layerBlobs', 'checkpoints'], 'readwrite', {
      durability: 'strict',
    });
    try {
      const [checkpoint, meta, current] = await Promise.all([
        tx.objectStore('checkpoints').get(projectId),
        tx.objectStore('projects').get(projectId),
        tx.objectStore('documents').get(projectId),
      ]);
      if (!checkpoint || !meta) throw new ProjectNotFoundError(projectId);
      const rev = Math.max(checkpoint.rev, current?.rev ?? 0, meta.rev) + 1;
      await tx.objectStore('layerBlobs').delete(projectBlobRange(projectId));
      for (const layer of checkpoint.layers) {
        await tx.objectStore('layerBlobs').put({ ...layer, projectId, updatedAt: this.now() });
      }
      await tx.objectStore('documents').put({ ...checkpoint.document, rev });
      await tx.objectStore('projects').put({ ...meta, rev, updatedAt: this.now() });
      await tx.done;
      projectsChanged(projectId);
    } catch (error) {
      abortQuietly(tx);
      await tx.done.catch(() => undefined);
      throw error;
    }
  }

  /** Xóa checkpoint (thứ bị xóa đầu tiên khi thiếu dung lượng). Trả về số checkpoint đã xóa. */
  async deleteCheckpoints(): Promise<number> {
    const db = await this.db.get();
    const tx = db.transaction('checkpoints', 'readwrite');
    const count = await tx.store.count();
    await tx.store.clear();
    await tx.done;
    if (count > 0) broadcast({ type: 'storage-freed' }, { local: true });
    return count;
  }

  async checkpointBytes(): Promise<number> {
    const db = await this.db.get();
    const all = await db.getAll('checkpoints');
    return all.reduce(
      (sum, c) => sum + jsonBytes(c.document) + c.layers.reduce((s, l) => s + l.png.byteLength, 0),
      0,
    );
  }

  // ---------------------------------------------------------------------------
  // Cài đặt và phiên làm việc
  // ---------------------------------------------------------------------------

  async getSettings(): Promise<AppSettings | null> {
    const db = await this.db.get();
    return (await db.get('settings', 'app')) ?? null;
  }

  async putSettings(patch: Partial<Omit<AppSettings, 'key'>>): Promise<void> {
    const db = await this.db.get();
    const tx = db.transaction('settings', 'readwrite');
    const current = (await tx.store.get('app')) ?? { key: 'app' as const };
    await tx.store.put({ ...current, ...patch, key: 'app' });
    await tx.done;
  }

  async getSession(): Promise<SessionRecord | null> {
    const db = await this.db.get();
    return (await db.get('session', 'last')) ?? null;
  }

  async putSession(record: Omit<SessionRecord, 'key'>): Promise<void> {
    const db = await this.db.get();
    await db.put('session', { ...record, key: 'last' });
  }
}

function abortQuietly(tx: { abort: () => void }): void {
  try {
    tx.abort();
  } catch {
    // Transaction đã kết thúc (commit hoặc bị hủy) — không còn gì để hủy.
  }
}
