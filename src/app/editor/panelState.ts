import { DOCKED_PANEL_QUERY, matchesMedia, useMediaQuery } from '@/app/shared/useMediaQuery';
import { useUiStore } from '@/stores/ui';

/**
 * Panel phải theo khung nhìn (mục 7.5): từ 1280 px gắn cố định cạnh canvas, trạng thái mở được nhớ;
 * laptop 1024–1279 px là ngăn trượt nổi trên canvas, mặc định đóng và tự đóng khi vẽ.
 */
export function usePanelVisibility(): { docked: boolean; visible: boolean } {
  const docked = useMediaQuery(DOCKED_PANEL_QUERY);
  const open = useUiStore((s) => (docked ? s.rightPanel.open : s.panelOverlayOpen));
  return { docked, visible: open };
}

export function isPanelVisible(): boolean {
  const ui = useUiStore.getState();
  return matchesMedia(DOCKED_PANEL_QUERY) ? ui.rightPanel.open : ui.panelOverlayOpen;
}

export function setPanelVisible(open: boolean): void {
  const ui = useUiStore.getState();
  if (matchesMedia(DOCKED_PANEL_QUERY)) ui.setRightPanel({ open });
  else ui.setPanelOverlayOpen(open);
}
