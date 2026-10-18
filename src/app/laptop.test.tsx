// jsdom: Command Palette, bảng phím tắt, Cài đặt, phím tắt cấp ứng dụng (GĐ8+9 — ADR 0028).
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { shortcutRows } from '@/app/dialogs/shortcutRows';
import { SettingsDialog } from '@/app/dialogs/SettingsDialog';
import { ShortcutsDialog } from '@/app/dialogs/ShortcutsDialog';
import { describeObject } from '@/app/editor/panels/describeObject';
import { useGlobalShortcuts } from '@/app/layout/useGlobalShortcuts';
import { TooltipProvider } from '@/components/ui/tooltip';
import { recordError, resetErrorLogForTest } from '@/services/diagnostics/errorLog';
import { DEFAULT_HISTORY_SHARE, DEFAULT_VIEW, useSettingsStore } from '@/stores/settings';
import { useUiStore } from '@/stores/ui';

function GlobalKeys() {
  useGlobalShortcuts();
  return null;
}

beforeEach(() => {
  useUiStore.setState({ dialog: null, paletteOpen: false, zen: false });
  useSettingsStore.setState({
    autosave: true,
    historyShare: DEFAULT_HISTORY_SHARE,
    view: DEFAULT_VIEW,
  });
  resetErrorLogForTest();
});

afterEach(() => {
  resetErrorLogForTest();
});

describe('bảng phím tắt (mục 7.3, 7.7)', () => {
  it('sinh từ Command Registry: đủ nhóm, gồm phím mới và phím dự phòng', () => {
    const rows = shortcutRows();
    const keysOf = (label: RegExp) => rows.find((r) => label.test(r.label))?.keys;
    expect(new Set(rows.map((r) => r.group))).toEqual(
      new Set(['tools', 'edit', 'view', 'layers', 'brush', 'app']),
    );
    expect(keysOf(/^Tìm lệnh$/)).toEqual(['Mod+K', '/']);
    expect(keysOf(/^Bảng phím tắt$/)).toEqual(['?']);
    expect(keysOf(/^Zen mode$/)).toEqual(['\\']);
    expect(keysOf(/^Toàn màn hình$/)).toEqual(['Shift+F']);
    expect(keysOf(/^Phóng to$/)).toEqual(['+', 'Mod++', 'Mod+=']);
    // Shift+mũi tên là bước lớn, `[` là chiều giảm — không gộp như phím dự phòng.
    expect(keysOf(/^Dịch .* 1 px$/)).toEqual(['↑↓←→']);
    expect(keysOf(/^Dịch .* 10 px$/)).toEqual(['Shift+↑↓←→']);
    expect(keysOf(/^Tăng \/ giảm cỡ$/)).toEqual([']', '[']);
    // Phím 1…9, 0 (độ mờ) gộp thành một ô.
    expect(rows.some((r) => r.keys.includes('0–9'))).toBe(true);
  });

  it('mở bằng `?`, tìm được (không dấu), Esc đóng', async () => {
    render(
      <TooltipProvider>
        <GlobalKeys />
        <ShortcutsDialog />
      </TooltipProvider>,
    );
    fireEvent.keyDown(window, { code: 'Slash', key: '?', shiftKey: true });
    expect(await screen.findByTestId('shortcuts-dialog')).toBeTruthy();
    fireEvent.change(screen.getByTestId('shortcuts-search'), { target: { value: 'toan man' } });
    const rows = screen.getAllByTestId('shortcut-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('Toàn màn hình');
  });
});

describe('phím tắt cấp ứng dụng (mục 7.7)', () => {
  it('Ctrl+K và `/` mở Command Palette; bỏ qua khi đang gõ trong ô nhập', () => {
    render(
      <>
        <GlobalKeys />
        <input data-testid="field" />
      </>,
    );
    fireEvent.keyDown(window, { code: 'KeyK', key: 'k', ctrlKey: true });
    expect(useUiStore.getState().paletteOpen).toBe(true);
    act(() => {
      useUiStore.getState().setPaletteOpen(false);
    });
    fireEvent.keyDown(window, { code: 'Slash', key: '/' });
    expect(useUiStore.getState().paletteOpen).toBe(true);
    act(() => {
      useUiStore.getState().setPaletteOpen(false);
    });
    fireEvent.keyDown(screen.getByTestId('field'), { code: 'Slash', key: '/' });
    expect(useUiStore.getState().paletteOpen).toBe(false);
  });
});

describe('Cài đặt (mục 7.3)', () => {
  it('tự động lưu, bộ nhớ lịch sử, cỡ lưới, nhật ký lỗi', async () => {
    recordError('react', new Error('thử'));
    act(() => {
      useUiStore.getState().openDialog({ kind: 'settings' });
    });
    render(
      <TooltipProvider>
        <SettingsDialog />
      </TooltipProvider>,
    );
    expect(await screen.findByTestId('settings-dialog')).toBeTruthy();

    fireEvent.click(screen.getByTestId('settings-autosave').querySelector('[data-value="off"]')!);
    expect(useSettingsStore.getState().autosave).toBe(false);

    fireEvent.click(screen.getByTestId('settings-history').querySelector('[data-value="0.4"]')!);
    expect(useSettingsStore.getState().historyShare).toBe(0.4);

    fireEvent.change(screen.getByTestId('settings-grid-size'), { target: { value: '64' } });
    expect(useSettingsStore.getState().view.gridSize).toBe(64);

    expect(screen.getByTestId('error-log-count').textContent).toContain('1');
    fireEvent.click(screen.getByTestId('error-log-clear'));
    await waitFor(() => {
      expect(screen.getByTestId('error-log-empty')).toBeTruthy();
    });
  });
});

describe('danh sách đối tượng đọc được (mục 7.8)', () => {
  it('mô tả theo loại: chữ có nội dung, số thứ tự, kiểu che', () => {
    const base = { id: 'o', rotation: 0, opacity: 1 } as const;
    expect(
      describeObject(
        {
          ...base,
          type: 'text',
          origin: { x: 0, y: 0 },
          wrapWidth: null,
          text: '  Lỗi\nở đây ',
          font: { family: 'Inter Variable', size: 20, weight: 400, italic: false },
          align: 'left',
          color: '#000000FF',
          background: null,
          outline: null,
        } as never,
        0,
      ),
    ).toBe('Chữ: Lỗi ở đây');
    expect(describeObject({ ...base, type: 'step' } as never, 3)).toBe('Số thứ tự 3');
    expect(describeObject({ ...base, type: 'redact', mode: 'blur' } as never, 0)).toBe(
      'Che thông tin (Làm mờ)',
    );
  });
});
