import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OptionsBar } from '@/app/editor/OptionsBar';
import { STYLE_PRESETS } from '@/app/editor/presets';
import { ToolIsland } from '@/app/editor/ToolIsland';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DEFAULT_TOOL_OPTIONS } from '@/engine/core/options';
import type { Editor } from '@/engine/core/Editor';
import type { BeautifySettings, DocumentSummary, ToolId } from '@/engine/core/types';
import { BEAUTIFY_DEFAULTS } from '@/engine/render/beautify';
import { SCREENSHOT_TOOLS } from '@/engine/tools/registry';
import { t } from '@/i18n';
import { INITIAL_DOCUMENT_STATE, useDocumentStore } from '@/stores/document';
import { INITIAL_TOOL_STATE, useToolStore } from '@/stores/tool';
import { BeautifyPanel } from './BeautifyPanel';

/**
 * Giao diện chế độ Screenshot (mục 7.3 — GĐ7): panel Làm đẹp, tool island rút gọn, kiểu nhanh cho
 * mũi tên/khung/chữ, cảnh báo làm mờ của Redact (mục 5.4).
 */

function fakeEditor() {
  const beautify = {
    settings: null as BeautifySettings | null,
    preferred: { ...BEAUTIFY_DEFAULTS },
    set: vi.fn(() => true),
  };
  const editor = {
    beautify,
    viewport: { fit: vi.fn() },
    tools: { setActive: vi.fn() },
    options: { set: vi.fn() },
    objects: { applyPreset: vi.fn(), applyStyle: vi.fn(), deleteSelected: vi.fn() },
    colors: { primary: '#000000FF', secondary: '#FFFFFFFF', recent: [] },
    pickColor: vi.fn(),
  };
  return { editor: editor as unknown as Editor, fake: editor };
}

function setDoc(beautify: BeautifySettings | null): void {
  const doc: DocumentSummary = {
    id: 'd',
    width: 400,
    height: 300,
    rev: 1,
    activeLayerId: 'a',
    layers: [],
    beautify,
  };
  act(() => {
    useDocumentStore.setState({ doc });
  });
}

function selectTool(tool: ToolId, redact?: Partial<typeof DEFAULT_TOOL_OPTIONS.redact>): void {
  act(() => {
    useToolStore.setState({
      selected: tool,
      active: tool,
      options: {
        ...INITIAL_TOOL_STATE.options,
        redact: { ...DEFAULT_TOOL_OPTIONS.redact, ...redact },
      },
    });
  });
}

beforeEach(() => {
  useDocumentStore.setState(INITIAL_DOCUMENT_STATE);
  useToolStore.setState(INITIAL_TOOL_STATE);
});

describe('BeautifyPanel', () => {
  it('đang tắt: bật dùng cài đặt ưa dùng và vừa khung', () => {
    const { editor, fake } = fakeEditor();
    setDoc(null);
    render(<BeautifyPanel editor={editor} />);
    const toggle = screen.getByTestId('beautify-toggle');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(fake.beautify.set).toHaveBeenCalledWith(BEAUTIFY_DEFAULTS);
    expect(fake.viewport.fit).toHaveBeenCalledTimes(1);
  });

  it('đang bật: đổi nền, bóng; tắt gửi null', () => {
    const { editor, fake } = fakeEditor();
    const on = { padding: 48, background: 'ocean', radius: 8, shadow: true } as const;
    setDoc(on);
    render(<BeautifyPanel editor={editor} />);
    expect(screen.getByTestId('beautify-toggle').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('beautify-bg-ocean').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: t.beautify.backgrounds.sunset }));
    expect(fake.beautify.set).toHaveBeenLastCalledWith({ ...on, background: 'sunset' });
    fireEvent.click(screen.getByTestId('beautify-shadow'));
    expect(fake.beautify.set).toHaveBeenLastCalledWith({ ...on, shadow: false });
    fireEvent.click(screen.getByTestId('beautify-toggle'));
    expect(fake.beautify.set).toHaveBeenLastCalledWith(null);
    expect(fake.viewport.fit).not.toHaveBeenCalled();
  });
});

describe('Tool island rút gọn của chế độ Screenshot', () => {
  it('chỉ có các tool chú thích (mục 7.3) và bảng màu', () => {
    const { editor, fake } = fakeEditor();
    render(
      <TooltipProvider>
        <ToolIsland editor={editor} compact />
      </TooltipProvider>,
    );
    for (const id of SCREENSHOT_TOOLS) expect(screen.getByTestId(`tool-${id}`)).toBeTruthy();
    for (const id of ['brush', 'pencil', 'bucket', 'lasso', 'eraser'])
      expect(screen.queryByTestId(`tool-${id}`)).toBeNull();
    expect(screen.queryByTestId('tool-select-variants')).toBeNull();
    fireEvent.click(screen.getByTestId('tool-step'));
    expect(fake.tools.setActive).toHaveBeenCalledWith('step');
  });
});

describe('Options bar — Redact và kiểu nhanh', () => {
  it('Khảm: chỉ hiện cỡ ô; Làm đẹp: chỉ hiện độ mờ + cảnh báo có thể khôi phục', () => {
    const { editor } = fakeEditor();
    selectTool('redact', { mode: 'pixelate' });
    const { rerender } = render(
      <TooltipProvider>
        <OptionsBar editor={editor} />
      </TooltipProvider>,
    );
    expect(screen.getByTestId('option-blockSize')).toBeTruthy();
    expect(screen.queryByTestId('option-blurRadius')).toBeNull();
    expect(screen.queryByTestId('redact-blur-warning')).toBeNull();
    selectTool('redact', { mode: 'blur' });
    rerender(
      <TooltipProvider>
        <OptionsBar editor={editor} />
      </TooltipProvider>,
    );
    expect(screen.getByTestId('option-blurRadius')).toBeTruthy();
    expect(screen.queryByTestId('option-blockSize')).toBeNull();
    expect(screen.getByTestId('redact-blur-warning').textContent).toContain(
      t.toolOptions.redactBlurWarning,
    );
  });

  it('kiểu nhanh của mũi tên: đặt option + màu một lần', () => {
    const { editor, fake } = fakeEditor();
    selectTool('arrow');
    render(
      <TooltipProvider>
        <OptionsBar editor={editor} />
      </TooltipProvider>,
    );
    const preset = STYLE_PRESETS.arrow[0];
    if (!preset) throw new Error('thiếu preset');
    fireEvent.click(screen.getByTestId(`preset-${preset.id}`));
    expect(fake.objects.applyPreset).toHaveBeenCalledWith('arrow', preset.options, {
      primary: preset.primary,
      secondary: undefined,
    });
  });

  it('kiểu nhanh của khung và chữ; tool khác không có', () => {
    const { editor } = fakeEditor();
    selectTool('rect');
    const { rerender } = render(
      <TooltipProvider>
        <OptionsBar editor={editor} />
      </TooltipProvider>,
    );
    expect(screen.getAllByRole('button', { name: /Khung/ })).toHaveLength(
      STYLE_PRESETS.frame.length,
    );
    selectTool('text');
    rerender(
      <TooltipProvider>
        <OptionsBar editor={editor} />
      </TooltipProvider>,
    );
    expect(screen.getByTestId('preset-text-label')).toBeTruthy();
    selectTool('brush');
    rerender(
      <TooltipProvider>
        <OptionsBar editor={editor} />
      </TooltipProvider>,
    );
    expect(screen.queryByTestId('style-presets')).toBeNull();
  });
});
