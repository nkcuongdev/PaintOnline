import { isEditableTarget } from '@/services/platform/browserGuards';

/**
 * ShortcutManager (mục 5.9, 7.7): khớp phím với lệnh theo phạm vi. Quy tắc tôn trọng trình duyệt:
 * - không gán phím trình duyệt giữ riêng (Ctrl+N/T/W, Ctrl+1…9, DevTools…);
 * - chỉ preventDefault khi phím thuộc về app; khi focus ở ô nhập liệu, menu, dialog hoặc đang gõ bằng
 *   bộ gõ (`isComposing`) thì trả phím lại cho trình duyệt — gõ tiếng Việt không bao giờ bị nuốt;
 * - Ctrl+C/X/V đi qua sự kiện `copy`/`cut`/`paste`, không qua keydown.
 */

export interface ParsedShortcut {
  mod: boolean;
  shift: boolean;
  alt: boolean;
  /** Các `KeyboardEvent.code` khớp. */
  codes: readonly string[];
  /** Phím mà Shift không quan trọng (vd. `+` là Shift+= trên bàn phím US). */
  anyShift: boolean;
  /** Bản thân phím là phím bổ trợ (giữ Alt). */
  modifierKey: boolean;
}

const NAMED: Readonly<Record<string, readonly string[]>> = {
  '[': ['BracketLeft'],
  ']': ['BracketRight'],
  '+': ['Equal', 'NumpadAdd'],
  '-': ['Minus', 'NumpadSubtract'],
  '=': ['Equal'],
  '\\': ['Backslash'],
  '/': ['Slash'],
  // `?` = Shift+/ trên bàn phím US (bảng phím tắt — mục 7.3).
  '?': ['Slash'],
  Space: ['Space'],
  Escape: ['Escape'],
  Enter: ['Enter', 'NumpadEnter'],
  Delete: ['Delete'],
  Backspace: ['Backspace'],
  ArrowUp: ['ArrowUp'],
  ArrowDown: ['ArrowDown'],
  ArrowLeft: ['ArrowLeft'],
  ArrowRight: ['ArrowRight'],
  Alt: ['AltLeft', 'AltRight'],
};

export function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.split('+');
  // `Mod++` / `+`: phím cộng nằm ở cuối.
  let key = parts.pop() ?? '';
  if (key === '' && shortcut.endsWith('+')) {
    parts.pop();
    key = '+';
  }
  const mods = new Set(parts);
  let codes: readonly string[];
  if (/^[A-Z]$/i.test(key)) codes = [`Key${key.toUpperCase()}`];
  else if (/^[0-9]$/.test(key)) codes = [`Digit${key}`, `Numpad${key}`];
  else codes = NAMED[key] ?? [key];
  return {
    mod: mods.has('Mod'),
    shift: mods.has('Shift') || key === '?',
    alt: mods.has('Alt'),
    codes,
    anyShift: key === '+' || key === '-',
    modifierKey: key === 'Alt',
  };
}

export function matchesShortcut(
  e: KeyboardEvent,
  shortcut: ParsedShortcut,
  isApple: boolean,
): boolean {
  if (!shortcut.codes.includes(e.code)) return false;
  if (shortcut.modifierKey) return !e.ctrlKey && !e.metaKey && !e.shiftKey;
  const mod = isApple ? e.metaKey : e.ctrlKey;
  const otherMod = isApple ? e.ctrlKey : e.metaKey;
  if (mod !== shortcut.mod || otherMod) return false;
  if (e.altKey !== shortcut.alt) return false;
  return shortcut.anyShift || e.shiftKey === shortcut.shift;
}

/** Focus nằm trong menu, dialog, popover — phím (Esc, mũi tên) thuộc về thành phần đó. */
export function belongsToOverlay(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      '[role="menu"],[role="dialog"],[role="alertdialog"],[role="listbox"],[data-radix-popper-content-wrapper]',
    ) !== null
  );
}

/** Phím điều hướng thuộc về control đang focus trong panel (danh sách layer, kéo thả bằng phím). */
const PANEL_KEYS = new Set([
  'Space',
  'Enter',
  'NumpadEnter',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'Delete',
  'Backspace',
]);

/** Focus nằm trong panel (Layers, History) và phím là phím điều hướng của panel. */
export function belongsToPanel(e: KeyboardEvent): boolean {
  return (
    PANEL_KEYS.has(e.code) &&
    e.target instanceof Element &&
    e.target.closest('[data-keyboard-scope="panel"]') !== null
  );
}

/** Lệnh gắn được phím: lệnh của Editor (AppCommand) hoặc lệnh cấp ứng dụng (GlobalCommand). */
export interface BindableCommand<C> {
  shortcuts?: readonly string[];
  enabled?: (ctx: C) => boolean;
  run: (ctx: C, event?: KeyboardEvent) => void;
  release?: (ctx: C) => void;
  repeat?: boolean;
}

interface Binding<C> {
  command: BindableCommand<C>;
  shortcut: ParsedShortcut;
}

export class ShortcutManager<C> {
  private bindings: Binding<C>[] = [];
  private readonly held = new Map<string, BindableCommand<C>>();

  constructor(
    private readonly context: () => C | null,
    private readonly isApple: boolean,
    /** Cho tool đang dùng xử lý phím trước (Enter/Esc/Backspace của Polygon…). */
    private readonly toolKey: (e: KeyboardEvent) => boolean,
  ) {}

  setCommands(commands: readonly BindableCommand<C>[]): void {
    this.bindings = commands.flatMap((command) =>
      (command.shortcuts ?? []).map((s) => ({ command, shortcut: parseShortcut(s) })),
    );
  }

  /** Gắn vào window; trả hàm gỡ. */
  attach(target: Window): () => void {
    const down = (e: KeyboardEvent) => {
      this.onKeyDown(e);
    };
    const up = (e: KeyboardEvent) => {
      this.onKeyUp(e);
    };
    const blur = () => {
      this.releaseAll();
    };
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('blur', blur);
    return () => {
      this.releaseAll();
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', blur);
    };
  }

  onKeyDown(e: KeyboardEvent): void {
    if (
      e.defaultPrevented ||
      e.isComposing ||
      isEditableTarget(e.target) ||
      belongsToOverlay(e.target) ||
      belongsToPanel(e)
    ) {
      return;
    }
    const ctx = this.context();
    if (!ctx) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey && this.toolKey(e)) {
      e.preventDefault();
      return;
    }
    for (const { command, shortcut } of this.bindings) {
      if (!matchesShortcut(e, shortcut, this.isApple)) continue;
      if (command.enabled && !command.enabled(ctx)) continue;
      e.preventDefault();
      if (command.release) {
        // Lệnh giữ phím: chỉ chạy lần đầu, bỏ qua phím lặp.
        if (e.repeat || this.held.has(e.code)) return;
        this.held.set(e.code, command);
      } else if (e.repeat && !command.repeat) {
        return;
      }
      command.run(ctx, e);
      return;
    }
  }

  onKeyUp(e: KeyboardEvent): void {
    const command = this.held.get(e.code);
    if (!command) return;
    this.held.delete(e.code);
    const ctx = this.context();
    // Nhả Alt: chặn Firefox bật thanh menu (mục 7.7).
    if (e.code.startsWith('Alt')) e.preventDefault();
    if (ctx) command.release?.(ctx);
  }

  private releaseAll(): void {
    const ctx = this.context();
    for (const command of this.held.values()) if (ctx) command.release?.(ctx);
    this.held.clear();
  }
}
