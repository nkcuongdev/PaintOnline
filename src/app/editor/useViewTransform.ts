import { useEffect, useState } from 'react';
import type { Editor } from '@/engine/core/Editor';

export interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

/** Khung nhìn cập nhật tức thì (không qua throttle của thanh trạng thái) để ô gõ bám theo ảnh. */
export function useViewTransform(editor: Editor): ViewTransform {
  const [view, setView] = useState<ViewTransform>(() => ({
    zoom: editor.viewport.zoom,
    panX: editor.viewport.state.panX,
    panY: editor.viewport.state.panY,
  }));
  useEffect(() => {
    const off = editor.on('viewportChanged', ({ zoom, panX, panY }) => {
      setView({ zoom, panX, panY });
    });
    // Khung nhìn có thể đã đổi (fit ảnh lúc mở project) giữa lần render đầu và lúc đăng ký sự kiện.
    const { zoom } = editor.viewport;
    const { panX, panY } = editor.viewport.state;
    setView((v) => (v.zoom === zoom && v.panX === panX && v.panY === panY ? v : { zoom, panX, panY }));
    return off;
  }, [editor]);
  return view;
}
