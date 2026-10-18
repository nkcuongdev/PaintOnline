/**
 * Định dạng phím tắt để hiển thị trong tooltip, menu, Command Palette.
 * Phím tắt viết dạng `Mod+Shift+S`; `Mod` là Ctrl (Windows/Linux) hoặc ⌘ (Apple).
 */

const APPLE_SYMBOLS: Readonly<Record<string, string>> = {
  Mod: '⌘',
  Ctrl: '⌃',
  Alt: '⌥',
  Shift: '⇧',
};

const KEY_NAMES: Readonly<Record<string, string>> = {
  Escape: 'Esc',
  Delete: 'Del',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: 'Space',
};

/** Tách phím tắt thành từng phím để hiển thị trong các ô <kbd>. */
export function shortcutKeys(shortcut: string, isApple: boolean): string[] {
  const parts = shortcut.split('+');
  // Phím cộng ở cuối (`+`, `Mod++`): hai phần rỗng cuối là chính phím `+`.
  if (shortcut.endsWith('+')) parts.splice(-2, 2, '+');
  return parts.map((part) => {
    const key = part.trim();
    if (key === 'Mod') return isApple ? '⌘' : 'Ctrl';
    if (isApple && key in APPLE_SYMBOLS) return APPLE_SYMBOLS[key] ?? key;
    return KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  });
}

/** Chuỗi một dòng: `Ctrl+Shift+S` hoặc `⇧⌘S`. */
export function formatShortcut(shortcut: string, isApple: boolean): string {
  const keys = shortcutKeys(shortcut, isApple);
  return isApple ? keys.join('') : keys.join('+');
}
