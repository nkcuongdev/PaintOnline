import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '@/stores/ui';
import { applyTheme, readStoredThemePreference, startThemeSync, THEME_STORAGE_KEY } from './theme';

function resetDocument() {
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
  document.head.replaceChildren();
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = '#000000';
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.href = '/favicon-light.svg';
  document.head.append(meta, icon);
}

describe('applyTheme', () => {
  beforeEach(resetDocument);

  it('bật class dark, color-scheme, theme-color và favicon tối', () => {
    applyTheme('dark');
    const root = document.documentElement;
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.colorScheme).toBe('dark');
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(
      '#1b1b1e',
    );
    expect(document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href).toMatch(
      /favicon-dark\.svg$/,
    );
  });

  it('gỡ class dark khi về sáng', () => {
    applyTheme('dark');
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});

describe('readStoredThemePreference', () => {
  it('mặc định theo hệ thống', () => {
    expect(readStoredThemePreference()).toBe('system');
  });

  it('bỏ qua giá trị rác', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(readStoredThemePreference()).toBe('system');
  });
});

describe('startThemeSync', () => {
  let stop: () => void = () => undefined;

  beforeEach(resetDocument);
  afterEach(() => {
    stop();
  });

  it('khôi phục lựa chọn đã lưu khi khởi động', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    stop = startThemeSync();
    expect(useUiStore.getState().themePreference).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('đổi theme trong store thì cập nhật DOM và localStorage', () => {
    stop = startThemeSync();
    useUiStore.getState().setThemePreference('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    useUiStore.getState().setThemePreference('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('đồng bộ khi tab khác đổi theme', () => {
    stop = startThemeSync();
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' }));
    expect(useUiStore.getState().themePreference).toBe('dark');
  });
});
