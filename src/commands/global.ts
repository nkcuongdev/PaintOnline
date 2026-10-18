import { openHelp } from '@/app/help/open';
import { navigate, readRoute } from '@/app/router';
import { format, t } from '@/i18n';
import { toggleFullscreen } from '@/services/platform/fullscreen';
import { openDialog, resolveTheme, toast, useUiStore, type ThemePreference } from '@/stores/ui';

/**
 * Lệnh cấp ứng dụng (mục 7.6, 7.7): dùng được ở mọi màn hình (trang chủ và editor), không cần
 * project đang mở. Lệnh của Editor nằm ở Command Registry (`registry.ts`); Command Palette liệt kê
 * cả hai loại.
 */
export interface GlobalCommand {
  id: string;
  label: () => string;
  /** Phím đầu tiên được hiển thị; các phím sau là phím dự phòng (mục 7.7). */
  shortcuts?: readonly string[];
  enabled?: () => boolean;
  run: () => void;
}

function setTheme(preference: ThemePreference): void {
  const ui = useUiStore.getState();
  ui.setThemePreference(preference);
  const next = resolveTheme(preference, ui.systemPrefersDark);
  ui.announce(format(t.theme.changed, { theme: next === 'dark' ? t.theme.dark : t.theme.light }));
}

export const GLOBAL_COMMANDS: readonly GlobalCommand[] = [
  {
    // Ctrl+K có thể bị trình duyệt giành (ô tìm kiếm) — dự phòng `/` (mục 7.7).
    id: 'app.commandPalette',
    label: () => t.palette.open,
    shortcuts: ['Mod+K', '/'],
    run: () => {
      useUiStore.getState().setPaletteOpen(true);
    },
  },
  {
    id: 'app.shortcuts',
    label: () => t.shortcutsDialog.title,
    shortcuts: ['?'],
    run: () => {
      openDialog({ kind: 'shortcuts' });
    },
  },
  {
    id: 'app.help',
    label: () => t.help.title,
    enabled: () => readRoute().name !== 'help',
    run: () => {
      openHelp();
    },
  },
  {
    id: 'app.settings',
    label: () => t.settings.title,
    run: () => {
      openDialog({ kind: 'settings' });
    },
  },
  {
    id: 'view.fullscreen',
    label: () => (useUiStore.getState().fullscreen ? t.view.exitFullscreen : t.view.fullscreen),
    shortcuts: ['Shift+F'],
    run: () => {
      void toggleFullscreen().then((ok) => {
        if (!ok) toast('error', t.view.fullscreenFailed);
      });
    },
  },
  {
    id: 'app.newImage',
    label: () => t.palette.newImage,
    run: () => {
      openDialog({ kind: 'newImage' });
    },
  },
  {
    id: 'app.home',
    label: () => t.editor.backToHome,
    enabled: () => readRoute().name !== 'home',
    run: () => {
      navigate({ name: 'home' });
    },
  },
  {
    id: 'theme.system',
    label: () => format(t.palette.theme, { theme: t.theme.system }),
    run: () => {
      setTheme('system');
    },
  },
  {
    id: 'theme.light',
    label: () => format(t.palette.theme, { theme: t.theme.light }),
    run: () => {
      setTheme('light');
    },
  },
  {
    id: 'theme.dark',
    label: () => format(t.palette.theme, { theme: t.theme.dark }),
    run: () => {
      setTheme('dark');
    },
  },
];

export function getGlobalCommand(id: string): GlobalCommand | undefined {
  return GLOBAL_COMMANDS.find((command) => command.id === id);
}
