import { useEffect } from 'react';
import { GLOBAL_COMMANDS } from '@/commands/global';
import { ShortcutManager } from '@/commands/shortcuts';
import { platformFeatures } from '@/services/platform/features';
import { watchFullscreen } from '@/services/platform/fullscreen';
import { useUiStore } from '@/stores/ui';

/**
 * Phím tắt cấp ứng dụng (mục 7.7) dùng ở mọi màn hình: Ctrl+K / `/` Command Palette, `?` bảng phím
 * tắt, Shift+F toàn màn hình. Cùng quy tắc với phím của Editor (không nuốt phím khi đang gõ chữ,
 * trong dialog hay bộ gõ). Đồng bộ trạng thái toàn màn hình vào uiStore.
 */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const manager = new ShortcutManager<object>(
      () => ({}),
      platformFeatures.isApple,
      () => false,
    );
    manager.setCommands(GLOBAL_COMMANDS);
    const detach = manager.attach(window);
    const offFullscreen = watchFullscreen((fullscreen) => {
      useUiStore.getState().setFullscreen(fullscreen);
    });
    return () => {
      detach();
      offFullscreen();
    };
  }, []);
}
