import { create } from 'zustand';
import type { ProjectMeta, SessionRecord } from '@/services/storage/schema';
import type { SaveStatus } from '@/services/storage/saveStatus';
import type { StorageEstimateInfo } from '@/services/storage/quota';

/**
 * projectStore (mục 4.1): danh sách project cho trang chủ, trạng thái lưu của project đang mở,
 * dung lượng lưu trữ, phiên trước để khôi phục. Chỉ app/ ghi store này (qua các hàm trong
 * app/projects.ts và app/editor/session.ts).
 */
export type StorageAvailability = 'checking' | 'ready' | 'unavailable';

export interface ProjectStoreState {
  storage: StorageAvailability;
  /** Mọi project kể cả thùng rác, mới sửa trước. */
  projects: ProjectMeta[];
  listLoaded: boolean;
  /** Object URL ảnh thu nhỏ theo project (thu hồi khi ảnh đổi). */
  thumbnails: Record<string, string>;
  estimate: StorageEstimateInfo | null;
  /** Phiên trước khi mở app (banner khôi phục). */
  previousSession: SessionRecord | null;
  recoveryDismissed: boolean;
  /** Project đang mở. */
  saveStatus: SaveStatus | null;
  readOnly: boolean;
  /** Đang chuyển quyền chỉnh sửa sang tab này. */
  takingOver: boolean;
}

export const INITIAL_PROJECT_STATE: ProjectStoreState = {
  storage: 'checking',
  projects: [],
  listLoaded: false,
  thumbnails: {},
  estimate: null,
  previousSession: null,
  recoveryDismissed: false,
  saveStatus: null,
  readOnly: false,
  takingOver: false,
};

export const useProjectStore = create<ProjectStoreState>()(() => INITIAL_PROJECT_STATE);

export function selectActiveProjects(state: ProjectStoreState): ProjectMeta[] {
  return state.projects.filter((p) => p.deletedAt === undefined);
}

export function selectTrashedProjects(state: ProjectStoreState): ProjectMeta[] {
  return state.projects.filter((p) => p.deletedAt !== undefined);
}
