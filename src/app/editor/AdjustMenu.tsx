import {
  Aperture,
  ChevronDown,
  Contrast,
  Droplet,
  Grid2x2,
  Palette,
  SlidersHorizontal,
  Sparkles,
  SunMedium,
  SwatchBook,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { CommandContext } from '@/commands';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { t } from '@/i18n';
import { ADJUST_GROUP, FILTER_GROUP, type AdjustmentKind } from './adjustments';
import { CommandItem } from './ImageMenu';

const ICONS: Readonly<Record<AdjustmentKind, ReactNode>> = {
  brightnessContrast: <SunMedium />,
  hueSaturation: <Palette />,
  grayscale: <Contrast />,
  sepia: <SwatchBook />,
  invert: <Aperture />,
  blur: <Droplet />,
  sharpen: <Sparkles />,
  pixelate: <Grid2x2 />,
};

/**
 * Menu "Điều chỉnh" trên top bar (mục 2, 7.3): điều chỉnh màu (độ sáng/tương phản, sắc độ/độ bão
 * hòa, đen trắng, sepia, đảo màu) và bộ lọc (làm mờ, làm sắc nét, khảm). Mục là lệnh trong Command
 * Registry; áp dụng cho layer hoạt động, trong vùng chọn nếu có.
 */
export function AdjustMenu({ context, disabled }: { context: CommandContext; disabled: boolean }) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              data-testid="adjust-menu"
              aria-label={t.filters.menuLabel}
            >
              <SlidersHorizontal />
              <span className="hidden md:inline">{t.filters.menu}</span>
              <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t.filters.menuLabel}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-64" data-testid="adjust-menu-content">
        <DropdownMenuLabel>{t.filters.adjustGroup}</DropdownMenuLabel>
        {ADJUST_GROUP.map((kind) => (
          <CommandItem key={kind} id={`filter.${kind}`} context={context} icon={ICONS[kind]} />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t.filters.filterGroup}</DropdownMenuLabel>
        {FILTER_GROUP.map((kind) => (
          <CommandItem key={kind} id={`filter.${kind}`} context={context} icon={ICONS[kind]} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
