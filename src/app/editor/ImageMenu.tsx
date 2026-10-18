import {
  ChevronDown,
  Crop,
  Expand,
  FlipHorizontal2,
  FlipVertical2,
  ImageIcon,
  Layers,
  PaintBucket,
  RotateCcw,
  RotateCw,
  Scaling,
  Scan,
  SquareDashed,
  SquareDashedMousePointer,
  Trash2,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  displayShortcut,
  getCommand,
  isEnabled,
  runCommand,
  type CommandContext,
} from '@/commands';
import { Kbd } from '@/app/shared/Kbd';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { t } from '@/i18n';

/** Mục menu sinh từ Command Registry: nhãn, phím tắt, trạng thái bật/tắt (mục 4.1). */
export function CommandItem({
  id,
  context,
  icon,
  destructive,
}: {
  id: string;
  context: CommandContext;
  icon?: ReactNode;
  destructive?: boolean;
}) {
  const command = getCommand(id);
  if (!command) return null;
  const shortcut = displayShortcut(id);
  return (
    <DropdownMenuItem
      disabled={!isEnabled(command, context)}
      variant={destructive ? 'destructive' : 'default'}
      data-testid={`menu-${id}`}
      onSelect={() => {
        runCommand(id, context);
      }}
    >
      {icon}
      <span className="flex-1">{command.label()}</span>
      {shortcut && <Kbd shortcut={shortcut} />}
    </DropdownMenuItem>
  );
}

function RotateFlipItems({ context, prefix }: { context: CommandContext; prefix: string }) {
  return (
    <>
      <CommandItem id={`${prefix}.rotateCw`} context={context} icon={<RotateCw />} />
      <CommandItem id={`${prefix}.rotateCcw`} context={context} icon={<RotateCcw />} />
      {prefix !== 'selection' && (
        <CommandItem id={`${prefix}.rotate180`} context={context} icon={<RotateCw />} />
      )}
      <CommandItem id={`${prefix}.flipHorizontal`} context={context} icon={<FlipHorizontal2 />} />
      <CommandItem id={`${prefix}.flipVertical`} context={context} icon={<FlipVertical2 />} />
    </>
  );
}

/**
 * Menu "Ảnh" trên top bar (mục 7.2, 7.3): vùng chọn (chọn tất cả, đảo, biến đổi, tô, xóa, cắt xén
 * theo vùng chọn) và biến đổi ảnh (Trim, Resize, Canvas size, xoay, lật — cả ảnh, layer hoặc vùng
 * chọn). Mọi mục là lệnh trong Command Registry.
 */
export function ImageMenu({ context, disabled }: { context: CommandContext; disabled: boolean }) {
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              data-testid="image-menu"
              aria-label={t.menu.imageMenuLabel}
            >
              <ImageIcon />
              <span className="hidden md:inline">{t.menu.imageMenu}</span>
              <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t.menu.imageMenuLabel}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-72" data-testid="image-menu-content">
        <DropdownMenuLabel>{t.menu.selectionGroup}</DropdownMenuLabel>
        <CommandItem id="selection.all" context={context} icon={<SquareDashed />} />
        <CommandItem id="selection.deselect" context={context} icon={<X />} />
        <CommandItem id="selection.invert" context={context} icon={<SquareDashedMousePointer />} />
        <CommandItem id="selection.transform" context={context} icon={<Scaling />} />
        <CommandItem id="selection.fill" context={context} icon={<PaintBucket />} />
        <CommandItem id="selection.delete" context={context} icon={<Trash2 />} />
        <CommandItem id="image.cropToSelection" context={context} icon={<Crop />} />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-testid="menu-selection-rotate">
            <RotateCw />
            {t.menu.selectionRotateFlip}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64">
            <RotateFlipItems context={context} prefix="selection" />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t.menu.imageMenu}</DropdownMenuLabel>
        <CommandItem id="image.trim" context={context} icon={<Scan />} />
        <CommandItem id="image.resize" context={context} icon={<Scaling />} />
        <CommandItem id="image.canvasSize" context={context} icon={<Expand />} />
        <RotateFlipItems context={context} prefix="image" />
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-testid="menu-layer-transform">
            <Layers />
            {t.menu.layerTransform}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-60">
            <RotateFlipItems context={context} prefix="layer" />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
