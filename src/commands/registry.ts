import type { Editor } from '@/engine/core/Editor';
import type { OpenProject } from '@/app/editor/session';

/**
 * Command Registry (mục 4.1, 8): mọi thao tác người dùng — nút, phím tắt, menu chuột phải, sau này
 * là Command Palette — đi qua một lệnh đăng ký ở đây. Lệnh chỉ gọi Editor API hoặc thao tác cấp ứng
 * dụng (copy, export), không chứa logic xử lý ảnh.
 */

export interface CommandContext {
  project: OpenProject;
  editor: Editor;
}

export interface AppCommand {
  id: string;
  /** Nhãn hiển thị (menu, tooltip, Command Palette). */
  label: () => string;
  /**
   * Phím tắt dạng `Mod+Shift+Z`; phím đầu tiên được hiển thị, các phím sau là phím dự phòng cho tổ
   * hợp dễ bị trình duyệt giành (mục 7.7).
   */
  shortcuts?: readonly string[];
  enabled?: (ctx: CommandContext) => boolean;
  run: (ctx: CommandContext, event?: KeyboardEvent) => void;
  /** Lệnh "giữ phím" (Space → Pan, Alt → lấy màu): chạy `release` khi nhả phím. */
  release?: (ctx: CommandContext) => void;
  /** Cho phép chạy lặp khi giữ phím (nudge, zoom). */
  repeat?: boolean;
  /**
   * `false`: không liệt kê trong Command Palette (phím giữ, nudge, Esc — thao tác chỉ có nghĩa khi
   * bấm phím).
   */
  palette?: false;
}

const commands = new Map<string, AppCommand>();

export function registerCommands(list: readonly AppCommand[]): void {
  for (const command of list) commands.set(command.id, command);
}

export function getCommand(id: string): AppCommand | undefined {
  return commands.get(id);
}

export function allCommands(): AppCommand[] {
  return [...commands.values()];
}

export function isEnabled(command: AppCommand, ctx: CommandContext): boolean {
  return command.enabled?.(ctx) ?? true;
}

/** Chạy lệnh nếu đang dùng được; trả true nếu đã chạy. */
export function runCommand(id: string, ctx: CommandContext, event?: KeyboardEvent): boolean {
  const command = commands.get(id);
  if (!command || !isEnabled(command, ctx)) return false;
  command.run(ctx, event);
  return true;
}

/** Phím tắt hiển thị của lệnh (tooltip, menu). */
export function shortcutOf(id: string): string | undefined {
  return commands.get(id)?.shortcuts?.[0];
}
