import { useEffect, useRef } from 'react';
import type { Editor } from '@/engine/core/Editor';
import { format, t } from '@/i18n';
import { useDocumentStore } from '@/stores/document';
import { selectResolvedTheme, useUiStore } from '@/stores/ui';

function readAppearance() {
  const css = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const dark = document.documentElement.classList.contains('dark');
  return {
    checkerLight: get('--checker-light', '#ffffff'),
    checkerDark: get('--checker-dark', '#e3e3e8'),
    sheetShadow: dark
      ? '0 0 0 1px rgb(255 255 255 / 0.06), 0 10px 30px rgb(0 0 0 / 0.45)'
      : '0 0 0 1px rgb(0 0 0 / 0.05), 0 2px 6px rgb(0 0 0 / 0.08), 0 12px 32px rgb(0 0 0 / 0.12)',
    pixelGrid: dark ? 'rgb(255 255 255 / 0.18)' : 'rgb(0 0 0 / 0.18)',
  };
}

/**
 * Vùng canvas: Engine tự tạo display/overlay canvas bên trong phần tử này (mọi canvas đi qua
 * engine/memory) và nhận Pointer Events trực tiếp — React không re-render khi vẽ (mục 10.1).
 */
export function CanvasView({ editor }: { editor: Editor }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const theme = useUiStore(selectResolvedTheme);
  const width = useDocumentStore((s) => s.doc?.width ?? 0);
  const height = useDocumentStore((s) => s.doc?.height ?? 0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    editor.mount(host);
    return () => {
      editor.unmount();
    };
  }, [editor]);

  useEffect(() => {
    editor.setAppearance(readAppearance());
  }, [editor, theme]);

  return (
    <div
      ref={hostRef}
      role="application"
      aria-label={format(t.editor.canvasLabel, { width, height })}
      data-testid="canvas-view"
      // Chặn vuốt Back/Forward và kéo giãn trang trong vùng canvas (mục 7.9).
      className="absolute inset-0 overscroll-none select-none"
    />
  );
}
