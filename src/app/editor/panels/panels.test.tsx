import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Editor } from '@/engine/core/Editor';
import type { DocumentSummary, LayerSummary } from '@/engine/core/types';
import { t } from '@/i18n';
import { INITIAL_DOCUMENT_STATE, useDocumentStore } from '@/stores/document';
import { useProjectStore } from '@/stores/project';
import { HistoryPanel } from './HistoryPanel';
import { LayersPanel } from './LayersPanel';

/**
 * Component test panel Layers/History (mục 11.1): panel chỉ đọc bản sao trong documentStore và gọi
 * Editor API — dùng editor giả để kiểm tra đúng lời gọi. Kéo thả và vẽ thật nằm ở E2E.
 */

function layer(id: string, patch: Partial<LayerSummary> = {}): LayerSummary {
  return {
    id,
    name: id,
    kind: 'raster',
    visible: true,
    locked: false,
    alphaLocked: false,
    opacity: 1,
    blendMode: 'normal',
    contentRev: 1,
    hasContent: true,
    ...patch,
  };
}

function fakeEditor() {
  const layers = {
    setActive: vi.fn(),
    add: vi.fn(() => 'new'),
    duplicate: vi.fn(() => 'copy'),
    remove: vi.fn(() => true),
    move: vi.fn(() => true),
    setProps: vi.fn(() => true),
    canMergeDown: vi.fn(() => true),
    mergeDown: vi.fn(() => true),
    canMergeVisible: vi.fn(() => true),
    mergeVisible: vi.fn(() => true),
    canFlatten: vi.fn(() => true),
    flatten: vi.fn(() => true),
    rasterize: vi.fn(() => true),
    thumbnail: vi.fn(() => Promise.resolve(null)),
  };
  const editor = { layers, historyGoTo: vi.fn(() => true) };
  return { editor: editor as unknown as Editor, layers, historyGoTo: editor.historyGoTo };
}

function setDoc(layers: LayerSummary[], activeLayerId: string): void {
  const doc: DocumentSummary = {
    id: 'd',
    width: 400,
    height: 300,
    rev: 1,
    activeLayerId,
    layers,
    beautify: null,
  };
  act(() => {
    useDocumentStore.setState({ doc });
  });
}

function renderPanel(node: React.ReactNode) {
  return render(<TooltipProvider>{node}</TooltipProvider>);
}

beforeEach(() => {
  useDocumentStore.setState(INITIAL_DOCUMENT_STATE);
  useProjectStore.setState({ readOnly: false });
});

describe('LayersPanel', () => {
  it('liệt kê layer trên cùng ở đầu, đánh dấu layer hoạt động; click chọn layer', () => {
    const { editor, layers } = fakeEditor();
    setDoc([layer('Nền'), layer('Giữa'), layer('Trên', { kind: 'vector' })], 'Giữa');
    renderPanel(<LayersPanel editor={editor} />);
    const rows = screen.getAllByTestId('layer-row');
    expect(rows.map((r) => r.getAttribute('data-layer-id'))).toEqual(['Trên', 'Giữa', 'Nền']);
    expect(rows[1]?.getAttribute('data-active')).toBe('true');
    fireEvent.click(within(rows[0]).getByTestId('layer-select'));
    expect(layers.setActive).toHaveBeenCalledWith('Trên');
  });

  it('ẩn/hiện, khóa, thêm, nhân bản, gộp xuống, xóa gọi Editor API', () => {
    const { editor, layers } = fakeEditor();
    setDoc([layer('A'), layer('B')], 'B');
    renderPanel(<LayersPanel editor={editor} />);
    const top = screen.getAllByTestId('layer-row')[0];
    fireEvent.click(within(top).getByTestId('layer-visibility'));
    expect(layers.setProps).toHaveBeenCalledWith('B', { visible: false });
    fireEvent.click(within(top).getByTestId('layer-lock'));
    expect(layers.setProps).toHaveBeenCalledWith('B', { locked: true });
    fireEvent.click(screen.getByTestId('layer-add'));
    expect(layers.add).toHaveBeenCalledWith('raster');
    fireEvent.click(screen.getByTestId('layer-duplicate'));
    expect(layers.duplicate).toHaveBeenCalledWith('B');
    fireEvent.click(screen.getByTestId('layer-merge-down'));
    expect(layers.mergeDown).toHaveBeenCalledWith('B');
    fireEvent.click(screen.getByTestId('layer-delete'));
    expect(layers.remove).toHaveBeenCalledWith('B');
  });

  it('không xóa được layer cuối; layer ẩn có nhãn cho trình đọc màn hình', () => {
    const { editor } = fakeEditor();
    setDoc([layer('Duy nhất', { visible: false, hasContent: false })], 'Duy nhất');
    renderPanel(<LayersPanel editor={editor} />);
    expect(screen.getByTestId<HTMLButtonElement>('layer-delete').disabled).toBe(true);
    const select = screen.getByTestId('layer-select');
    expect(select.getAttribute('aria-label')).toContain(t.layers.hiddenBadge);
    expect(select.getAttribute('aria-label')).toContain(t.layers.empty);
    expect(screen.getByTestId('layer-visibility').getAttribute('aria-label')).toBe(t.layers.show);
  });

  it('double-click đổi tên: Enter ghi, Esc hủy', () => {
    const { editor, layers } = fakeEditor();
    setDoc([layer('Lớp 1')], 'Lớp 1');
    renderPanel(<LayersPanel editor={editor} />);
    fireEvent.doubleClick(screen.getByTestId('layer-select'));
    let input = screen.getByTestId<HTMLInputElement>('layer-rename-input');
    fireEvent.change(input, { target: { value: 'Bầu trời' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(layers.setProps).toHaveBeenLastCalledWith('Lớp 1', { name: 'Bầu trời' });
    expect(screen.queryByTestId('layer-rename-input')).toBeNull();

    fireEvent.doubleClick(screen.getByTestId('layer-select'));
    input = screen.getByTestId<HTMLInputElement>('layer-rename-input');
    fireEvent.change(input, { target: { value: 'Bỏ' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(layers.setProps).not.toHaveBeenCalledWith('Lớp 1', { name: 'Bỏ' });
  });

  it('thuộc tính layer hoạt động: opacity hiển thị %, layer khóa thì không chỉnh được', () => {
    const { editor } = fakeEditor();
    setDoc([layer('A', { opacity: 0.4, blendMode: 'multiply', locked: true })], 'A');
    renderPanel(<LayersPanel editor={editor} />);
    const props = screen.getByTestId('layer-properties');
    expect(within(props).getByText('40%')).toBeTruthy();
    expect(screen.getByTestId('layer-blend').textContent).toContain(t.layers.blendModes.multiply);
    expect(screen.getByTestId<HTMLButtonElement>('layer-blend').disabled).toBe(true);
    expect(screen.getByTestId<HTMLButtonElement>('layer-alpha-lock').disabled).toBe(true);
  });

  it('chế độ chỉ đọc: mọi nút thay đổi bị tắt', () => {
    const { editor } = fakeEditor();
    useProjectStore.setState({ readOnly: true });
    setDoc([layer('A'), layer('B')], 'B');
    renderPanel(<LayersPanel editor={editor} />);
    for (const id of ['layer-add', 'layer-duplicate', 'layer-merge-down', 'layer-delete']) {
      expect(screen.getByTestId<HTMLButtonElement>(id).disabled, id).toBe(true);
    }
  });
});

describe('HistoryPanel', () => {
  it('liệt kê bước cũ → mới, đánh dấu bước hiện tại, bước đã hoàn tác; click để nhảy', () => {
    const { editor, historyGoTo } = fakeEditor();
    act(() => {
      useDocumentStore.setState({
        history: {
          canUndo: true,
          canRedo: true,
          undoLabel: 'history.addLayer',
          redoLabel: 'history.mergeDown',
          steps: 2,
          trimmed: false,
          entries: [
            { label: 'history.brush', timestamp: 0 },
            { label: 'history.addLayer', timestamp: 0 },
            { label: 'history.mergeDown', timestamp: 0 },
          ],
          position: 2,
        },
      });
    });
    renderPanel(<HistoryPanel editor={editor} />);
    const entries = screen.getAllByTestId('history-entry');
    expect(entries.map((e) => e.textContent)).toEqual([
      t.historyPanel.original,
      expect.stringContaining(t.history.brush),
      expect.stringContaining(t.history.addLayer),
      expect.stringContaining(t.history.mergeDown),
    ]);
    expect(entries[2]?.getAttribute('aria-current')).toBe('step');
    expect(entries[3]?.getAttribute('data-undone')).toBe('true');
    fireEvent.click(entries[0]);
    expect(historyGoTo).toHaveBeenCalledWith(0);
    fireEvent.click(entries[3]);
    expect(historyGoTo).toHaveBeenCalledWith(3);
  });

  it('báo các bước cũ đã được giải phóng', () => {
    const { editor } = fakeEditor();
    act(() => {
      useDocumentStore.setState({
        history: { ...INITIAL_DOCUMENT_STATE.history, trimmed: true },
      });
    });
    renderPanel(<HistoryPanel editor={editor} />);
    expect(screen.getByText(t.historyPanel.trimmed)).toBeTruthy();
    expect(screen.getAllByTestId('history-entry')[0]?.textContent).toBe(t.historyPanel.oldest);
  });
});
