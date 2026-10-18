import { COMMANDS, type AppCommand } from '@/commands';
import { DISPLAY_SHORTCUTS } from '@/commands/definitions/view';
import { GLOBAL_COMMANDS } from '@/commands/global';
import { t } from '@/i18n';

export type GroupId = 'tools' | 'edit' | 'view' | 'layers' | 'brush' | 'app';

export interface ShortcutRow {
  group: GroupId;
  label: string;
  /** Phím chính trước, phím dự phòng sau (mục 7.7). */
  keys: string[];
}

export const GROUP_ORDER: readonly GroupId[] = ['tools', 'edit', 'view', 'layers', 'brush', 'app'];

export function groupLabel(group: GroupId): string {
  switch (group) {
    case 'tools':
      return t.shortcutsDialog.groupTools;
    case 'edit':
      return t.shortcutsDialog.groupEdit;
    case 'view':
      return t.shortcutsDialog.groupView;
    case 'layers':
      return t.shortcutsDialog.groupLayers;
    case 'brush':
      return t.shortcutsDialog.groupBrush;
    case 'app':
      return t.shortcutsDialog.groupApp;
  }
}

function groupOf(id: string): GroupId {
  const prefix = id.slice(0, id.indexOf('.'));
  switch (prefix) {
    case 'tool':
      return 'tools';
    case 'view':
      return 'view';
    case 'layer':
      return 'layers';
    case 'brush':
    case 'colors':
      return 'brush';
    case 'file':
    case 'app':
      return 'app';
    default:
      return 'edit';
  }
}

/** Gộp phím 1…9, 0 thành "0–9" (độ mờ 10%–100%). */
function compactKeys(keys: readonly string[]): string[] {
  if (keys.length > 3 && keys.every((k) => /^[0-9]$/.test(k))) return ['0–9'];
  return [...keys];
}

/**
 * Nhãn riêng cho bảng: lệnh giữ phím ("Giữ để kéo khung nhìn"), cặp tăng/giảm gộp một dòng
 * ("Tăng / giảm cỡ" — `]` / `[` là hai chiều, không phải phím dự phòng của nhau).
 */
function labelOf(command: AppCommand): string {
  switch (command.id) {
    case 'tool.panHold':
      return t.shortcutsDialog.holdSpace;
    case 'tool.eyedropperHold':
      return t.shortcutsDialog.holdAlt;
    case 'brush.sizeUp':
    case 'brush.sizeDown':
      return t.shortcutsDialog.sizeKeys;
    case 'brush.hardnessUp':
    case 'brush.hardnessDown':
      return t.shortcutsDialog.hardnessKeys;
    default:
      return command.label();
  }
}

/** Mũi tên 4 hướng gói trong một ô (Kbd giữ nguyên nhãn nhiều ký tự). */
const ARROWS = '↑↓←→';

/**
 * Các dòng của bảng phím tắt — sinh từ Command Registry và lệnh cấp ứng dụng, nên luôn khớp phím
 * thật (mục 7.7). Cùng nhãn trong cùng nhóm thì gộp phím (Enter…). Nudge 4 hướng tách theo bước
 * (Shift = bước lớn) để `Shift+←` không bị đọc là phím dự phòng của `←`.
 */
export function shortcutRows(): ShortcutRow[] {
  const rows: ShortcutRow[] = [];
  const byKey = new Map<string, ShortcutRow>();
  const add = (group: GroupId, label: string, keys: readonly string[]) => {
    if (keys.length === 0) return;
    const key = `${group}:${label}`;
    const existing = byKey.get(key);
    if (existing) {
      for (const k of keys) if (!existing.keys.includes(k)) existing.keys.push(k);
      return;
    }
    const row = { group, label, keys: compactKeys(keys) };
    byKey.set(key, row);
    rows.push(row);
  };
  for (const command of COMMANDS) {
    if (command.id.startsWith('object.nudge')) {
      add('edit', t.shortcutsDialog.nudge, [ARROWS]);
      add('edit', t.shortcutsDialog.nudgeLarge, [`Shift+${ARROWS}`]);
      continue;
    }
    add(groupOf(command.id), labelOf(command), command.shortcuts ?? []);
  }
  for (const command of GLOBAL_COMMANDS) {
    add(groupOf(command.id), command.label(), command.shortcuts ?? []);
  }
  // Phím đi qua sự kiện trình duyệt (copy/cut/paste, lăn chuột), không qua keydown.
  add('edit', t.shortcutsDialog.copy, [DISPLAY_SHORTCUTS['edit.copy'] ?? 'Mod+C']);
  add('edit', t.shortcutsDialog.cut, [DISPLAY_SHORTCUTS['edit.cut'] ?? 'Mod+X']);
  add('edit', t.shortcutsDialog.paste, [DISPLAY_SHORTCUTS['edit.paste'] ?? 'Mod+V']);
  add('view', t.shortcutsDialog.wheelZoom, [t.shortcutsDialog.wheelKeys]);
  add('brush', t.shortcutsDialog.altDrag, [t.shortcutsDialog.altDragKeys]);
  return rows;
}
