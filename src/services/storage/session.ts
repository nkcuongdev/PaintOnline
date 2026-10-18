import type { ID, ToolId, ViewData } from '@/engine/core/types';
import type { ProjectRepository } from './projectRepo';
import { isValidViewData, type SessionRecord } from './schema';

/**
 * Phiên làm việc để khôi phục (mục 6.6, 7.4): project đang mở, khung nhìn, tool, và cờ
 * `cleanExit`. Khi mở project đặt `cleanExit = false`; pagehide bình thường đặt `true`. Lần mở app
 * sau thấy `false` → banner khôi phục ghi rõ thời điểm của bản lưu hợp lệ.
 *
 * Lượt ghi IndexedDB bắt đầu trong `pagehide` có thể bị hủy khi trang đóng (đo được trên Chromium:
 * tải lại trang bình thường vẫn bị coi là thoát đột ngột). Vì vậy pagehide ghi thêm token của phiên
 * vào localStorage — đồng bộ, luôn xong trước khi trang đóng (ADR 0021).
 */

const UPDATE_DEBOUNCE_MS = 1000;

/** Token của phiên vừa thoát sạch gần nhất (localStorage, ghi đồng bộ trong pagehide). */
export const CLEAN_EXIT_KEY = 'paint-online:clean-exit';

function writeCleanExitToken(token: string): void {
  try {
    window.localStorage.setItem(CLEAN_EXIT_KEY, token);
  } catch {
    // localStorage bị chặn: chỉ còn cờ trong IndexedDB.
  }
}

function readCleanExitToken(): string | null {
  try {
    return window.localStorage.getItem(CLEAN_EXIT_KEY);
  } catch {
    return null;
  }
}

export class SessionTracker {
  private record: Omit<SessionRecord, 'key'> = {
    projectId: null,
    viewport: null,
    activeTool: null,
    panels: {},
    cleanExit: true,
    updatedAt: 0,
  };
  private timer = 0;
  /** Mỗi lần mở project một token mới: phân biệt phiên của tab này với tab khác. */
  private token: string = crypto.randomUUID();

  constructor(private readonly repo: ProjectRepository) {}

  /** Mở project: ghi ngay (đồng bộ nhất có thể) để một sự cố sau đó được phát hiện. */
  begin(projectId: ID, viewport: ViewData | null, activeTool: ToolId | null): Promise<void> {
    this.token = crypto.randomUUID();
    this.record = {
      projectId,
      viewport,
      activeTool,
      panels: {},
      cleanExit: false,
      updatedAt: Date.now(),
      token: this.token,
    };
    return this.write();
  }

  /** Khung nhìn / tool đổi (debounce 1 s). */
  update(patch: { viewport?: ViewData; activeTool?: ToolId }): void {
    if (!this.record.projectId) return;
    this.record = { ...this.record, ...patch, updatedAt: Date.now() };
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      void this.write();
    }, UPDATE_DEBOUNCE_MS);
  }

  /** Về trang chủ / đóng project chủ động: không còn gì để khôi phục. */
  end(): Promise<void> {
    window.clearTimeout(this.timer);
    this.record = { ...this.record, projectId: null, cleanExit: true, updatedAt: Date.now() };
    return this.write();
  }

  /** pagehide bình thường: thoát sạch, vẫn nhớ project để đề nghị "Tiếp tục". */
  markCleanExit(): void {
    window.clearTimeout(this.timer);
    if (this.record.projectId) writeCleanExitToken(this.token);
    this.record = { ...this.record, cleanExit: true, updatedAt: Date.now() };
    void this.write();
  }

  /** Trang được hiện lại từ bfcache sau pagehide: phiên vẫn tiếp tục. */
  markResumed(): void {
    if (!this.record.projectId) return;
    // Token mới: cờ thoát sạch vừa ghi không còn áp dụng cho phiên tiếp tục này.
    this.token = crypto.randomUUID();
    this.record = { ...this.record, cleanExit: false, updatedAt: Date.now(), token: this.token };
    void this.write();
  }

  private async write(): Promise<void> {
    try {
      await this.repo.putSession(this.record);
    } catch {
      // Không ghi được phiên (DB đóng, hết dung lượng) chỉ làm mất khả năng khôi phục khung nhìn.
    }
  }
}

/** Đọc phiên trước (một lần khi khởi động, trước khi phiên mới ghi đè). */
export async function readPreviousSession(repo: ProjectRepository): Promise<SessionRecord | null> {
  try {
    const record = await repo.getSession();
    if (!record || typeof record.cleanExit !== 'boolean') return null;
    const cleanToken = readCleanExitToken();
    return {
      ...record,
      cleanExit: record.cleanExit || (record.token !== undefined && record.token === cleanToken),
      viewport: isValidViewData(record.viewport) ? record.viewport : null,
    };
  } catch {
    return null;
  }
}
