import { beforeEach, describe, expect, it } from 'vitest';
import { isThemePreference, resolveTheme, selectResolvedTheme, useUiStore } from './ui';

describe('resolveTheme', () => {
  it('theo hệ thống khi chọn system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('lựa chọn tường minh thắng theme hệ thống', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('isThemePreference', () => {
  it.each(['system', 'light', 'dark'])('nhận "%s"', (value) => {
    expect(isThemePreference(value)).toBe(true);
  });

  it.each([null, undefined, '', 'Dark', 42])('từ chối %o', (value) => {
    expect(isThemePreference(value)).toBe(false);
  });
});

describe('useUiStore', () => {
  beforeEach(() => {
    useUiStore.setState({
      themePreference: 'system',
      systemPrefersDark: false,
      announcement: null,
    });
  });

  it('selectResolvedTheme phản ánh thay đổi theme hệ thống', () => {
    useUiStore.getState().setSystemPrefersDark(true);
    expect(selectResolvedTheme(useUiStore.getState())).toBe('dark');
  });

  it('announce tăng id để đọc lại câu trùng', () => {
    const { announce } = useUiStore.getState();
    announce('Xin chào');
    announce('Xin chào');
    expect(useUiStore.getState().announcement).toEqual({ id: 2, message: 'Xin chào' });
  });
});
