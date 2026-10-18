import { useSyncExternalStore } from 'react';

/** Khung nhìn desktop đầy đủ (mục 7.5): từ 1280 px panel phải gắn cố định bên cạnh canvas. */
export const DOCKED_PANEL_QUERY = '(min-width: 1280px)';

function media(query: string): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query)
    : null;
}

/** Media query hiện tại, cập nhật khi đổi kích thước cửa sổ. Không hỗ trợ matchMedia: coi là khớp. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = media(query);
      list?.addEventListener('change', onChange);
      return () => {
        list?.removeEventListener('change', onChange);
      };
    },
    () => media(query)?.matches ?? true,
    () => true,
  );
}

/** Đọc ngoài React (lệnh bật/tắt panel). */
export function matchesMedia(query: string): boolean {
  return media(query)?.matches ?? true;
}
