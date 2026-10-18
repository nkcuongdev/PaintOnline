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
  useEffect(
    () =>
      editor.on('viewportChanged', ({ zoom, panX, panY }) => {
        setView({ zoom, panX, panY });
      }),
    [editor],
  );
  return view;
}
