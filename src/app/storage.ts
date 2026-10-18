import { onChannelMessage } from '@/services/storage/channel';
import { Database } from '@/services/storage/db';
import { ProjectRepository } from '@/services/storage/projectRepo';
import { estimateStorage, requestPersistentStorage } from '@/services/storage/quota';
import { readPreviousSession, SessionTracker } from '@/services/storage/session';
import { SettingsStore } from '@/services/storage/settings';
import { sharedWorkerPool } from '@/services/workers/pool';
import { useProjectStore } from '@/stores/project';
import { useSettingsStore } from '@/stores/settings';

/**
 * Khởi tạo lưu trữ của app (mục 6.4, 6.6): một kết nối IndexedDB, repository, cài đặt, phiên làm
 * việc. Nếu IndexedDB không dùng được, app chạy ở chế độ "không lưu tự động" (vẫn vẽ, export,
 * xuất .paint thủ công).
 */

export const database = new Database();
export const repo = new ProjectRepository(database);
export const settings = new SettingsStore(repo);
export const sessionTracker = new SessionTracker(repo);

/** Codec chạy trong Worker pool dùng chung. */
export function codec() {
  return sharedWorkerPool();
}

let ready: Promise<void> | null = null;

/** Gọi một lần lúc khởi động; mọi thao tác lưu trữ chờ promise này. */
export function initStorage(): Promise<void> {
  ready ??= init();
  return ready;
}

async function init(): Promise<void> {
  const available = await database.available();
  if (!available) {
    useProjectStore.setState({ storage: 'unavailable', listLoaded: true });
    return;
  }
  const [previousSession, appSettings] = await Promise.all([
    readPreviousSession(repo),
    settings.load(),
  ]);
  if (appSettings.customPalette) {
    useSettingsStore.setState({ customPalette: appSettings.customPalette });
  }
  // Bảng màu tùy chỉnh: lưu khi đổi.
  useSettingsStore.subscribe((state, prev) => {
    if (state.customPalette !== prev.customPalette) settings.setCustomPalette(state.customPalette);
  });
  useProjectStore.setState({ storage: 'ready', previousSession });
  // Thùng rác: xóa hẳn project quá 7 ngày.
  await repo.purgeExpired().catch(() => []);
}

export function storageReady(): boolean {
  return useProjectStore.getState().storage === 'ready';
}

/** Cập nhật ước lượng dung lượng (trang chủ, sau mỗi lượt lưu). */
export async function refreshStorageEstimate(): Promise<void> {
  const estimate = await estimateStorage();
  useProjectStore.setState({ estimate });
}

/** Xin lưu trữ bền vững sau khi project đầu tiên được lưu (mục 6.6). */
export async function ensurePersistence(): Promise<void> {
  if (settings.value.persistRequested) return;
  settings.update({ persistRequested: true }, { immediate: true });
  await requestPersistentStorage();
  void refreshStorageEstimate();
}

/** Nghe thay đổi từ tab khác (danh sách project, dung lượng được giải phóng). */
export function onStorageEvent(
  handler: (event: 'projects-changed' | 'storage-freed', projectId: string | null) => void,
): () => void {
  return onChannelMessage((message) => {
    if (message.type === 'projects-changed') handler('projects-changed', message.projectId);
    else if (message.type === 'storage-freed') handler('storage-freed', null);
  });
}
