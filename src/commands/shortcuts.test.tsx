// jsdom: ShortcutManager kiểm tra phần tử đích (ô nhập liệu, dialog) bằng kiểu DOM.
import { describe, expect, it, vi } from 'vitest';
import type { AppCommand, CommandContext } from './registry';
import { matchesShortcut, parseShortcut, ShortcutManager } from './shortcuts';

type TestKey = KeyboardEvent & { prevented: boolean };

/** KeyboardEvent tối giản; `prevented` ghi lại việc gọi preventDefault. */
function key(code: string, init: Partial<KeyboardEvent> = {}): TestKey {
  const e = {
    code,
    key: code,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
    target: null,
    prevented: false,
    preventDefault: () => {
      e.prevented = true;
    },
    ...init,
  };
  return e as unknown as TestKey;
}

describe('parseShortcut / matchesShortcut (mục 7.7)', () => {
  it('Mod = Ctrl trên Windows/Linux, ⌘ trên Apple', () => {
    const undo = parseShortcut('Mod+Z');
    expect(matchesShortcut(key('KeyZ', { ctrlKey: true }), undo, false)).toBe(true);
    expect(matchesShortcut(key('KeyZ', { metaKey: true }), undo, false)).toBe(false);
    expect(matchesShortcut(key('KeyZ', { metaKey: true }), undo, true)).toBe(true);
    expect(matchesShortcut(key('KeyZ', { ctrlKey: true, shiftKey: true }), undo, false)).toBe(
      false,
    );
  });

  it('phím cộng: Shift không quan trọng, có cả phím số phụ', () => {
    const plus = parseShortcut('+');
    expect(matchesShortcut(key('Equal', { shiftKey: true }), plus, false)).toBe(true);
    expect(matchesShortcut(key('NumpadAdd'), plus, false)).toBe(true);
    const modPlus = parseShortcut('Mod++');
    expect(modPlus.mod).toBe(true);
    expect(matchesShortcut(key('Equal', { ctrlKey: true }), modPlus, false)).toBe(true);
  });

  it('Shift+1, chữ cái, ngoặc, giữ Alt', () => {
    expect(
      matchesShortcut(key('Digit1', { shiftKey: true }), parseShortcut('Shift+1'), false),
    ).toBe(true);
    expect(matchesShortcut(key('Digit1'), parseShortcut('Shift+1'), false)).toBe(false);
    expect(
      matchesShortcut(key('BracketLeft', { shiftKey: true }), parseShortcut('Shift+['), false),
    ).toBe(true);
    expect(matchesShortcut(key('AltLeft', { altKey: true }), parseShortcut('Alt'), false)).toBe(
      true,
    );
  });
});

describe('ShortcutManager', () => {
  const ctx = {} as CommandContext;

  function manager(commands: AppCommand[], toolKey = () => false) {
    const m = new ShortcutManager(() => ctx, false, toolKey);
    m.setCommands(commands);
    return m;
  }

  it('chạy lệnh, chặn hành vi mặc định; lệnh tắt thì trả phím cho trình duyệt', () => {
    const run = vi.fn();
    let enabled = true;
    const m = manager([
      { id: 'x', label: () => 'x', shortcuts: ['B'], run, enabled: () => enabled },
    ]);
    const e = key('KeyB');
    m.onKeyDown(e);
    expect(run).toHaveBeenCalledOnce();
    expect(e.prevented).toBe(true);
    enabled = false;
    const e2 = key('KeyB');
    m.onKeyDown(e2);
    expect(e2.prevented).toBe(false);
  });

  it('bỏ qua phím khi đang gõ bằng bộ gõ (isComposing) — gõ tiếng Việt không bị nuốt', () => {
    const run = vi.fn();
    const m = manager([{ id: 'x', label: () => 'x', shortcuts: ['T'], run }]);
    m.onKeyDown(key('KeyT', { isComposing: true }));
    expect(run).not.toHaveBeenCalled();
  });

  it('phím lặp: chỉ lệnh cho phép lặp mới chạy lại', () => {
    const once = vi.fn();
    const many = vi.fn();
    const m = manager([
      { id: 'a', label: () => 'a', shortcuts: ['X'], run: once },
      { id: 'b', label: () => 'b', shortcuts: ['+'], run: many, repeat: true },
    ]);
    m.onKeyDown(key('KeyX', { repeat: true }));
    m.onKeyDown(key('Equal', { repeat: true }));
    expect(once).not.toHaveBeenCalled();
    expect(many).toHaveBeenCalledOnce();
  });

  it('lệnh giữ phím: chạy một lần khi nhấn, release khi nhả', () => {
    const run = vi.fn();
    const release = vi.fn();
    const m = manager([{ id: 'pan', label: () => 'pan', shortcuts: ['Space'], run, release }]);
    m.onKeyDown(key('Space'));
    m.onKeyDown(key('Space', { repeat: true }));
    m.onKeyUp(key('Space'));
    expect(run).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it('tool đang dùng được xử lý phím trước (Enter/Esc của Polygon)', () => {
    const run = vi.fn();
    const m = manager([{ id: 'esc', label: () => 'esc', shortcuts: ['Escape'], run }], () => true);
    m.onKeyDown(key('Escape'));
    expect(run).not.toHaveBeenCalled();
  });
});
