import type { IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import type { PaintDB } from './db';

/**
 * Migration schema IndexedDB theo từng phiên bản (mục 6.4). Mỗi bước nâng từ `version - 1` lên
 * `version`, chạy trong transaction `versionchange` của trình duyệt: lỗi ở bất kỳ bước nào làm cả
 * lần nâng cấp bị hủy và DB giữ nguyên phiên bản cũ.
 *
 * Thêm phiên bản mới: tăng DB_VERSION trong schema.ts và thêm một phần tử vào MIGRATIONS — không
 * bao giờ sửa bước đã phát hành.
 */

export type UpgradeTransaction = IDBPTransaction<PaintDB, StoreNames<PaintDB>[], 'versionchange'>;

export interface Migration {
  version: number;
  migrate: (db: IDBPDatabase<PaintDB>, tx: UpgradeTransaction) => void;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    migrate(db) {
      const projects = db.createObjectStore('projects', { keyPath: 'id' });
      projects.createIndex('updatedAt', 'updatedAt');
      projects.createIndex('deletedAt', 'deletedAt');
      db.createObjectStore('documents', { keyPath: 'projectId' });
      db.createObjectStore('layerBlobs', { keyPath: ['projectId', 'layerId'] });
      db.createObjectStore('thumbnails', { keyPath: 'projectId' });
      db.createObjectStore('checkpoints', { keyPath: 'projectId' });
      db.createObjectStore('settings', { keyPath: 'key' });
      db.createObjectStore('session', { keyPath: 'key' });
    },
  },
];

/** Các bước cần chạy để đi từ `oldVersion` lên `newVersion` (hàm thuần, có unit test). */
export function migrationsBetween(
  oldVersion: number,
  newVersion: number,
  migrations: readonly Migration[] = MIGRATIONS,
): Migration[] {
  if (newVersion < oldVersion) throw new Error('Không hạ phiên bản DB');
  const steps = migrations
    .filter((m) => m.version > oldVersion && m.version <= newVersion)
    .sort((a, b) => a.version - b.version);
  for (let v = oldVersion + 1, i = 0; v <= newVersion; v++, i++) {
    if (steps[i]?.version !== v) throw new Error(`Thiếu migration cho phiên bản ${String(v)}`);
  }
  return steps;
}

export function runMigrations(
  db: IDBPDatabase<PaintDB>,
  tx: UpgradeTransaction,
  oldVersion: number,
  newVersion: number,
): void {
  for (const step of migrationsBetween(oldVersion, newVersion)) step.migrate(db, tx);
}
