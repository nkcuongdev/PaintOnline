import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openAdjustment } from '@/app/editor/adjustments';
import type { Editor } from '@/engine/core/Editor';
import type { FilterSessionSummary } from '@/engine/core/types';
import { t } from '@/i18n';
import { INITIAL_DOCUMENT_STATE, useDocumentStore } from '@/stores/document';
import { useUiStore } from '@/stores/ui';
import { AdjustmentsPanel } from './AdjustmentsPanel';

/**
 * Bảng điều chỉnh nổi (mục 7.3): slider sinh từ đặc tả tham số, xem trước qua `filters.update`,
 * so sánh khi giữ nút, Áp dụng / Hủy / Esc, thanh tiến trình và nút Dừng khi đang áp dụng.
 */

function fakeEditor(open = true) {
  const filters = {
    isOpen: open,
    state: null,
    begin: vi.fn(() => open),
    run: vi.fn(() => Promise.resolve(true)),
    update: vi.fn(),
    compare: vi.fn(),
    apply: vi.fn(() => Promise.resolve(true)),
    cancel: vi.fn(),
  };
  return { editor: { filters } as unknown as Editor, filters };
}

function show(state: Partial<FilterSessionSummary> = {}, selection = false) {
  act(() => {
    useUiStore.setState({ adjustment: 'brightnessContrast' });
    useDocumentStore.setState({
      filter: {
        steps: [
          { id: 'brightness', amount: 10 },
          { id: 'contrast', amount: 0 },
        ],
        phase: 'preview',
        progress: 0,
        comparing: false,
        ...state,
      },
      pixelSelection: selection
        ? { bounds: { x: 0, y: 0, width: 5, height: 5 }, shape: 'rect', floating: false }
        : null,
    });
  });
}

beforeEach(() => {
  useDocumentStore.setState(INITIAL_DOCUMENT_STATE);
  useUiStore.setState({ adjustment: null });
});

describe('AdjustmentsPanel', () => {
  it('ẩn khi không có phiên; hiện slider theo tham số của Engine', () => {
    const { editor } = fakeEditor();
    render(<AdjustmentsPanel editor={editor} />);
    expect(screen.queryByTestId('adjust-panel')).toBeNull();
    show();
    expect(screen.getByRole('dialog', { name: t.filters.titles.brightnessContrast })).toBeTruthy();
    expect(screen.getByTestId<HTMLInputElement>('filter-input-brightness-amount').value).toBe('10');
    expect(screen.getByTestId<HTMLInputElement>('filter-input-contrast-amount').value).toBe('0');
    expect(screen.queryByText(t.filters.selectionNote)).toBeNull();
  });

  it('đổi tham số gọi update với cả pipeline (kẹp theo dải); Áp dụng, Hủy, Esc, Enter', () => {
    const { editor, filters } = fakeEditor();
    render(<AdjustmentsPanel editor={editor} />);
    show({}, true);
    expect(screen.getByText(t.filters.selectionNote)).toBeTruthy();
    fireEvent.change(screen.getByTestId('filter-input-contrast-amount'), {
      target: { value: '250' },
    });
    expect(filters.update).toHaveBeenLastCalledWith([
      { id: 'brightness', amount: 10 },
      { id: 'contrast', amount: 100 },
    ]);
    fireEvent.click(screen.getByTestId('adjust-reset'));
    expect(filters.update).toHaveBeenLastCalledWith([
      { id: 'brightness', amount: 0 },
      { id: 'contrast', amount: 0 },
    ]);
    fireEvent.click(screen.getByTestId('adjust-apply'));
    expect(filters.apply).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByTestId('filter-input-brightness-amount'), { key: 'Enter' });
    expect(filters.apply).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId('adjust-cancel'));
    fireEvent.keyDown(screen.getByTestId('adjust-panel'), { key: 'Escape' });
    expect(filters.cancel).toHaveBeenCalledTimes(2);
  });

  it('giữ nút so sánh: compare(true) khi nhấn, compare(false) khi thả', () => {
    const { editor, filters } = fakeEditor();
    render(<AdjustmentsPanel editor={editor} />);
    show();
    const compare = screen.getByTestId('adjust-compare');
    fireEvent.pointerDown(compare);
    expect(filters.compare).toHaveBeenLastCalledWith(true);
    fireEvent.pointerUp(compare);
    expect(filters.compare).toHaveBeenLastCalledWith(false);
  });

  it('đang áp dụng: thanh tiến trình, slider bị khóa, nút Dừng gọi cancel', () => {
    const { editor, filters } = fakeEditor();
    render(<AdjustmentsPanel editor={editor} />);
    show({ phase: 'applying', progress: 0.42 });
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    expect(screen.getByTestId<HTMLInputElement>('filter-input-brightness-amount').disabled).toBe(
      true,
    );
    expect(screen.queryByTestId('adjust-apply')).toBeNull();
    fireEvent.click(screen.getByTestId('adjust-stop'));
    expect(filters.cancel).toHaveBeenCalledTimes(1);
  });
});

describe('openAdjustment', () => {
  it('bảng có tham số: mở phiên với giá trị mặc định và nhãn history', () => {
    const { editor, filters } = fakeEditor();
    expect(openAdjustment(editor, 'blur')).toBe(true);
    expect(filters.begin).toHaveBeenCalledWith([{ id: 'blur', radius: 4 }], 'history.blur');
    expect(useUiStore.getState().adjustment).toBe('blur');
  });

  it('Đảo màu áp dụng ngay; Engine từ chối thì không mở bảng', () => {
    const { editor, filters } = fakeEditor();
    openAdjustment(editor, 'invert');
    expect(filters.run).toHaveBeenCalledWith([{ id: 'invert' }], 'history.invert');
    expect(useUiStore.getState().adjustment).toBe('invert');
    act(() => {
      useUiStore.setState({ adjustment: null });
    });
    const refused = fakeEditor(false);
    expect(openAdjustment(refused.editor, 'sepia')).toBe(false);
    expect(useUiStore.getState().adjustment).toBeNull();
  });
});
