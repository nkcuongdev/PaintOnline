import { describe, expect, it } from 'vitest';
import { detectApplePlatform } from '@/services/platform/features';
import { formatShortcut, shortcutKeys } from './shortcut';

describe('formatShortcut', () => {
  it('Windows/Linux dùng Ctrl và dấu +', () => {
    expect(formatShortcut('Mod+Shift+S', false)).toBe('Ctrl+Shift+S');
  });

  it('Apple dùng ký hiệu ⌘ ⇧ và không có dấu +', () => {
    expect(formatShortcut('Mod+Shift+S', true)).toBe('⌘⇧S');
  });

  it('viết hoa phím một ký tự', () => {
    expect(formatShortcut('Mod+v', false)).toBe('Ctrl+V');
  });

  it('đổi tên phím đặc biệt', () => {
    expect(shortcutKeys('Escape', false)).toEqual(['Esc']);
  });
});

describe('detectApplePlatform', () => {
  const nav = (platform: string, uaPlatform?: string) =>
    ({
      platform,
      userAgentData: uaPlatform === undefined ? undefined : { platform: uaPlatform },
    }) as unknown as Navigator;

  it('nhận macOS qua navigator.platform', () => {
    expect(detectApplePlatform(nav('MacIntel'))).toBe(true);
  });

  it('ưu tiên userAgentData.platform', () => {
    expect(detectApplePlatform(nav('MacIntel', 'Windows'))).toBe(false);
  });

  it('Windows không phải Apple', () => {
    expect(detectApplePlatform(nav('Win32'))).toBe(false);
  });

  it('nhận iPad', () => {
    expect(detectApplePlatform(nav('iPad'))).toBe(true);
  });
});
