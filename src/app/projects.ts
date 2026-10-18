import { format, t } from '@/i18n';
import type { ID } from '@/engine/core/types';
import {
  refreshStorageEstimate,
  repo,
  settings,
  storageReady,
  onStorageEvent,
} from '@/app/storage';
import { getCurrentProject } from '@/app/editor/session';
import type { ProjectMeta } from '@/services/storage/schema';
import { useProjectStore } from '@/stores/project';
import { toast } from '@/stores/ui';

/**
 * Danh sách project cho trang chủ (mục 7.3): đọc store `projects` (nhẹ) + ảnh thu nhỏ tách riêng;
 * tạo/đổi tên/nhân bản/xóa mềm/khôi phục/xóa hẳn. Đồng bộ giữa các tab qua BroadcastChannel.
 */

const thumbnailRevs = new Map<ID, number>();

async function loadThumbnails(projects: readonly ProjectMeta[]): Promise<void> {
  const current = useProjectStore.getState().thumbnails;
  const next: Record<string, string> = {};
  const live = new Set(projects.map((p) => p.id));
  await Promise.all(
    projects.map(async (project) => {
      const known = current[project.id];
      if (known && thumbnailRevs.get(project.id) === project.rev) {
        next[project.id] = known;
        return;
      }
      const image = await repo.getThumbnail(project.id).catch(() => null);
      if (image) {
        next[project.id] = URL.createObjectURL(new Blob([image.data], { type: image.type }));
        thumbnailRevs.set(project.id, project.rev);
      }
    }),
  );
  // Thu hồi object URL không còn dùng (mục 10.2).
  for (const [id, url] of Object.entries(current)) {
    if (next[id] !== url) URL.revokeObjectURL(url);
    if (!live.has(id)) thumbnailRevs.delete(id);
  }
  useProjectStore.setState({ thumbnails: next });
}

let refreshing: Promise<void> | null = null;
/** Có yêu cầu đọc lại trong lúc đang đọc (đối tượng để vòng lặp thấy thay đổi từ lời gọi khác). */
const pendingRefresh = { again: false };
const refreshRequested = () => pendingRefresh.again;

/** Đọc lại danh sách project (gộp các lần gọi dồn dập). */
export function refreshProjects(): Promise<void> {
  if (!storageReady()) return Promise.resolve();
  if (refreshing) {
    pendingRefresh.again = true;
    return refreshing;
  }
  refreshing = (async () => {
    do {
      pendingRefresh.again = false;
      try {
        const projects = await repo.listProjects();
        useProjectStore.setState({ projects, listLoaded: true });
        await loadThumbnails(projects);
      } catch {
        useProjectStore.setState({ listLoaded: true });
      }
    } while (refreshRequested());
  })().finally(() => {
    refreshing = null;
  });
  void refreshStorageEstimate();
  return refreshing;
}

let watching = false;

/** Theo dõi thay đổi danh sách (tab này và tab khác). */
export function watchProjects(): () => void {
  if (watching) return () => undefined;
  watching = true;
  const off = onStorageEvent((event) => {
    if (event === 'projects-changed') void refreshProjects();
    if (event === 'storage-freed') getCurrentProject()?.autosave?.resume();
  });
  return () => {
    watching = false;
    off();
  };
}

async function run(action: () => Promise<unknown>, success?: string): Promise<boolean> {
  try {
    await action();
    if (success) toast('success', success);
    return true;
  } catch {
    toast('error', t.projects.actionFailed);
    return false;
  } finally {
    void refreshProjects();
  }
}

export function duplicateProject(project: ProjectMeta): Promise<boolean> {
  const name = format(t.projects.copyName, { name: project.name });
  return run(() => repo.duplicate(project.id, crypto.randomUUID(), name), t.projects.duplicated);
}

export function moveToTrash(project: ProjectMeta): Promise<boolean> {
  return run(
    () => repo.moveToTrash(project.id),
    format(t.projects.trashed, { name: project.name }),
  );
}

export function restoreProject(project: ProjectMeta): Promise<boolean> {
  return run(
    () => repo.restoreFromTrash(project.id),
    format(t.projects.restored, { name: project.name }),
  );
}

export function deleteForever(project: ProjectMeta): Promise<boolean> {
  return run(() => repo.purge([project.id]), format(t.projects.purged, { name: project.name }));
}

export function emptyTrash(): Promise<boolean> {
  return run(() => repo.emptyTrash(), t.projects.trashEmptied);
}

export function deleteCheckpoints(): Promise<boolean> {
  return run(() => repo.deleteCheckpoints(), t.storage.checkpointsDeleted);
}

/** Project đã sửa sau lần xuất .paint gần nhất và quá 7 ngày chưa sao lưu (mục 6.6). */
export const BACKUP_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;

export function needsBackup(project: ProjectMeta, now = Date.now()): boolean {
  if (project.deletedAt !== undefined) return false;
  const exported = project.lastExportedAt ?? project.createdAt;
  return project.updatedAt > exported && now - exported >= BACKUP_REMINDER_MS;
}

export function backupReminderVisible(projects: readonly ProjectMeta[], now = Date.now()): number {
  const dismissed = settings.value.backupReminderDismissedAt ?? 0;
  if (now - dismissed < BACKUP_REMINDER_MS) return 0;
  return projects.filter((p) => needsBackup(p, now)).length;
}

export function dismissBackupReminder(): void {
  settings.update({ backupReminderDismissedAt: Date.now() }, { immediate: true });
}
