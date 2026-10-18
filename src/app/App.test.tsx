import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '@/i18n';
import { useUiStore } from '@/stores/ui';
import { App } from './App';
import { startThemeSync } from './theme';

const PROJECT_ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

function setHash(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

describe('App', () => {
  let stopTheme: () => void = () => undefined;

  beforeEach(() => {
    document.documentElement.className = '';
    useUiStore.setState({
      themePreference: 'system',
      systemPrefersDark: false,
      announcement: null,
    });
    stopTheme = startThemeSync();
  });

  afterEach(() => {
    stopTheme();
  });

  it('trang chủ có top bar, ô dán ảnh, preset và trạng thái trống', async () => {
    render(<App />);
    expect(screen.getByTestId('top-bar')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: t.home.title })).toBeTruthy();
    expect(screen.getByTestId('drop-zone')).toBeTruthy();
    expect(screen.getByTestId('preset-full-hd')).toBeTruthy();
    // jsdom không có IndexedDB: app chạy chế độ không lưu tự động và báo cho người dùng.
    expect(await screen.findByText(t.home.recentEmptyTitle)).toBeTruthy();
    expect(screen.getByTestId('storage-unavailable')).toBeTruthy();
    expect(document.title).toBe(t.app.name);
  });

  // Luồng preset → editor → vẽ cần canvas thật: kiểm tra bằng E2E (tests/e2e) trên 3 engine.

  it('#/project/<id> không còn trong phiên → màn hình hướng dẫn, quay về trang chủ được', async () => {
    setHash(`#/project/${PROJECT_ID}`);
    render(<App />);
    // EditorScreen tải lười: lần đầu Vitest phải biên dịch cả engine — khi chạy song song với
    // browser test có thể quá 1 s mặc định.
    expect(
      await screen.findByTestId('project-missing', undefined, { timeout: 10_000 }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: t.editor.missingTitle })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.notFound.goHome }));
    expect(await screen.findByTestId('start-screen')).toBeTruthy();
  });

  it('hash lạ hiện màn hình 404 và quay về trang chủ được', async () => {
    setHash('#/khong-ton-tai');
    render(<App />);
    expect(screen.getByTestId('not-found-screen')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.notFound.goHome }));
    expect(await screen.findByTestId('start-screen')).toBeTruthy();
  });

  it('đổi theme qua menu: bàn phím mở menu, chọn Tối', async () => {
    render(<App />);
    const trigger = screen.getByTestId('theme-menu-trigger');
    expect(trigger.getAttribute('aria-label')).toBe(t.theme.menuLabel);

    fireEvent.keyDown(trigger, { key: 'Enter' });
    const darkItem = await screen.findByRole('menuitemradio', { name: t.theme.dark });
    fireEvent.click(darkItem);

    expect(useUiStore.getState().themePreference).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByRole('status').textContent).toContain(t.theme.dark);
  });
});
