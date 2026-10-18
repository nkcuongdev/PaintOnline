import { ChevronDown, EyeOff, Maximize, Monitor, Scan, ZoomIn, ZoomOut } from 'lucide-react';
import { getGlobalCommand } from '@/commands/global';
import { runCommand, type CommandContext } from '@/commands';
import { Kbd } from '@/app/shared/Kbd';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { t } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';
import { useUiStore } from '@/stores/ui';
import { CommandItem } from './ImageMenu';

/**
 * Menu "Xem" (mục 7.2, 7.6): thu phóng, lưới, thước đo, bám lưới, Zen mode, toàn màn hình. Lưới,
 * thước đo, bám lưới là cài đặt của trình duyệt (nhớ giữa các project).
 */
export function ViewMenu({ context }: { context: CommandContext }) {
  const view = useSettingsStore((s) => s.view);
  const setView = useSettingsStore((s) => s.setView);
  const fullscreen = useUiStore((s) => s.fullscreen);
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" data-testid="view-menu" aria-label={t.view.menu}>
              <Monitor />
              <span className="hidden xl:inline">{t.view.menu}</span>
              <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t.view.menu}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-64" data-testid="view-menu-content">
        <CommandItem id="view.zoomIn" context={context} icon={<ZoomIn />} />
        <CommandItem id="view.zoomOut" context={context} icon={<ZoomOut />} />
        <CommandItem id="view.fit" context={context} icon={<Maximize />} />
        <CommandItem id="view.actualSize" context={context} icon={<Scan />} />
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={view.grid}
          data-testid="menu-view-grid"
          // Giữ menu mở để bật/tắt nhiều mục liên tiếp.
          onSelect={(e) => {
            e.preventDefault();
          }}
          onCheckedChange={(grid) => {
            setView({ grid });
          }}
        >
          {t.view.grid}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={view.snap}
          data-testid="menu-view-snap"
          // Giữ menu mở để bật/tắt nhiều mục liên tiếp.
          onSelect={(e) => {
            e.preventDefault();
          }}
          onCheckedChange={(snap) => {
            setView({ snap });
          }}
        >
          {t.view.snap}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={view.rulers}
          data-testid="menu-view-rulers"
          // Giữ menu mở để bật/tắt nhiều mục liên tiếp.
          onSelect={(e) => {
            e.preventDefault();
          }}
          onCheckedChange={(rulers) => {
            setView({ rulers });
          }}
        >
          {t.view.rulers}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="menu-view-zen"
          onSelect={() => {
            runCommand('view.zen', context);
          }}
        >
          <EyeOff />
          <span className="flex-1">{t.view.zen}</span>
          <Kbd shortcut="\" />
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            getGlobalCommand('view.fullscreen')?.run();
          }}
        >
          <Maximize />
          <span className="flex-1">{fullscreen ? t.view.exitFullscreen : t.view.fullscreen}</span>
          <Kbd shortcut="Shift+F" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
