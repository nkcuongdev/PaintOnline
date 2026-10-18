/**
 * Dung lượng lưu trữ (mục 6.6, 10.3): `navigator.storage.estimate()` để hiển thị và cảnh báo
 * sớm, `persist()` để trình duyệt không tự xóa dữ liệu khi thiếu chỗ.
 */
export interface StorageEstimateInfo {
  usage: number;
  quota: number;
  persisted: boolean | null;
}

/** Cảnh báo khi đã dùng quá 80% quota. */
export const STORAGE_WARNING_RATIO = 0.8;

function storageManager(): StorageManager | null {
  return typeof navigator !== 'undefined' && 'storage' in navigator ? navigator.storage : null;
}

export async function estimateStorage(): Promise<StorageEstimateInfo | null> {
  const storage = storageManager();
  if (!storage || typeof storage.estimate !== 'function') return null;
  try {
    const [estimate, persisted] = await Promise.all([
      storage.estimate(),
      typeof storage.persisted === 'function' ? storage.persisted() : Promise.resolve(null),
    ]);
    if (estimate.quota === undefined || estimate.usage === undefined) return null;
    return { usage: estimate.usage, quota: estimate.quota, persisted };
  } catch {
    return null;
  }
}

/** Xin lưu trữ bền vững; null nếu trình duyệt không hỗ trợ. */
export async function requestPersistentStorage(): Promise<boolean | null> {
  const storage = storageManager();
  if (!storage || typeof storage.persist !== 'function') return null;
  try {
    if (await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    return null;
  }
}

export function isStorageLow(info: StorageEstimateInfo | null): boolean {
  return info !== null && info.quota > 0 && info.usage / info.quota >= STORAGE_WARNING_RATIO;
}
