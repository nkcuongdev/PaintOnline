import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@/engine/core/Editor';
import { t } from '@/i18n';
import { INITIAL_DOCUMENT_STATE, useDocumentStore } from '@/stores/document';
import { useUiStore } from '@/stores/ui';
import { CanvasSizeDialog, ResizeImageDialog } from './ImageSizeDialogs';

/**
 * Hộp thoại Resize và Canvas size (mục 7.3): ổ khóa tỉ lệ, đơn vị px/%, cách co giãn, neo 9 hướng,
 * giới hạn kích thước theo thiết bị — gọi đúng Editor API.
 */

function fakeEditor() {
  const image = {
    resize: vi.fn(() => Promise.resolve(true)),
    canvasSize: vi.fn(() => Promise.resolve(true)),
  };
  return { editor: { image } as unknown as Editor, image };
}

function open(kind: 'resizeImage' | 'canvasSize') {
  act(() => {
    useDocumentStore.setState({
      doc: {
        id: 'd',
        width: 400,
        height: 300,
        rev: 1,
        activeLayerId: 'a',
        layers: [],
        beautify: null,
      },
    });
    useUiStore.setState({ dialog: { kind } });
  });
}

function input(testId: string): HTMLInputElement {
  return screen.getByTestId<HTMLInputElement>(testId);
}

beforeEach(() => {
  useDocumentStore.setState(INITIAL_DOCUMENT_STATE);
  useUiStore.setState({ dialog: null });
});

describe('ResizeImageDialog', () => {
  it('giữ tỉ lệ khi đổi chiều rộng; áp dụng gọi editor.image.resize', () => {
    const { editor, image } = fakeEditor();
    render(<ResizeImageDialog editor={editor} />);
    open('resizeImage');
    expect(input('resize-width').value).toBe('400');
    fireEvent.change(input('resize-width'), { target: { value: '200' } });
    expect(input('resize-height').value).toBe('150');
    expect(screen.getByTestId('resize-result').textContent).toContain('200 × 150');
    fireEvent.click(screen.getByRole('radio', { name: t.resizeDialog.pixelated }));
    fireEvent.click(screen.getByTestId('resize-apply'));
    expect(image.resize).toHaveBeenCalledWith(200, 150, 'pixelated');
    expect(useUiStore.getState().dialog).toBeNull();
  });

  it('đơn vị % và bỏ khóa tỉ lệ', () => {
    const { editor, image } = fakeEditor();
    render(<ResizeImageDialog editor={editor} />);
    open('resizeImage');
    fireEvent.click(screen.getByRole('radio', { name: t.resizeDialog.percent }));
    expect(input('resize-width').value).toBe('100');
    fireEvent.click(screen.getByTestId('resize-keep-ratio'));
    fireEvent.change(input('resize-width'), { target: { value: '50' } });
    expect(input('resize-height').value).toBe('100');
    fireEvent.click(screen.getByTestId('resize-apply'));
    expect(image.resize).toHaveBeenCalledWith(200, 300, 'smooth');
  });

  it('vượt giới hạn thiết bị: báo lỗi, không cho áp dụng', () => {
    const { editor, image } = fakeEditor();
    render(<ResizeImageDialog editor={editor} />);
    open('resizeImage');
    fireEvent.change(input('resize-width'), { target: { value: '100000' } });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByTestId<HTMLButtonElement>('resize-apply').disabled).toBe(true);
    expect(image.resize).not.toHaveBeenCalled();
  });
});

describe('CanvasSizeDialog', () => {
  it('neo góc trên trái; áp dụng gọi editor.image.canvasSize', () => {
    const { editor, image } = fakeEditor();
    render(<CanvasSizeDialog editor={editor} />);
    open('canvasSize');
    expect(screen.getByTestId('canvas-anchor-center').getAttribute('aria-checked')).toBe('true');
    fireEvent.change(input('canvas-width'), { target: { value: '500' } });
    fireEvent.click(screen.getByTestId('canvas-anchor-nw'));
    expect(screen.getByTestId('canvas-anchor-nw').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByTestId('canvas-apply'));
    expect(image.canvasSize).toHaveBeenCalledWith(500, 300, 'nw');
  });
});
