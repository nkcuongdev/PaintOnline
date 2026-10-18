import { Maximize, Minimize, Search, Settings } from 'lucide-react';
import { IconButton } from '@/app/shared/IconButton';
import { Kbd } from '@/app/shared/Kbd';
import { getGlobalCommand } from '@/commands/global';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { t } from '@/i18n';
import { canFullscreen } from '@/services/platform/fullscreen';
import { openDialog, useUiStore } from '@/stores/ui';

/** Ô tìm lệnh trên top bar (mục 7.2: "🔍 Ctrl+K") — mở Command Palette. */
export function PaletteButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="palette-button"
          aria-label={t.palette.open}
          aria-keyshortcuts="Control+K"
          className="gap-2 bg-card/60 px-2 text-muted-foreground xl:w-44 xl:justify-start"
          onClick={() => {
            useUiStore.getState().setPaletteOpen(true);
          }}
        >
          <Search />
          <span className="hidden flex-1 text-left xl:inline">{t.palette.open}</span>
          <Kbd shortcut="Mod+K" className="hidden xl:inline-flex" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        {t.palette.open}
        <Kbd shortcut="Mod+K" tone="inverted" />
      </TooltipContent>
    </Tooltip>
  );
}

/** Nút toàn màn hình trên top bar (mục 7.6, Shift+F). */
export function FullscreenButton() {
  const fullscreen = useUiStore((s) => s.fullscreen);
  if (!canFullscreen()) return null;
  return (
    <IconButton
      label={fullscreen ? t.view.exitFullscreen : t.view.fullscreen}
      shortcut="Shift+F"
      icon={fullscreen ? <Minimize /> : <Maximize />}
      data-testid="fullscreen-toggle"
      aria-pressed={fullscreen}
      onClick={() => {
        getGlobalCommand('view.fullscreen')?.run();
      }}
    />
  );
}

/** Nút mở Cài đặt (trang chủ). */
export function SettingsButton() {
  return (
    <IconButton
      label={t.settings.title}
      icon={<Settings />}
      data-testid="settings-button"
      onClick={() => {
        openDialog({ kind: 'settings' });
      }}
    />
  );
}
