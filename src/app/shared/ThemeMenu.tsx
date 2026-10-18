import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { format, t } from '@/i18n';
import {
  THEME_PREFERENCES,
  isThemePreference,
  resolveTheme,
  selectResolvedTheme,
  useUiStore,
  type ThemePreference,
} from '@/stores/ui';

const ICONS: Readonly<Record<ThemePreference, LucideIcon>> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

/** Menu đổi theme Sáng / Tối / Theo hệ thống. */
export function ThemeMenu() {
  const preference = useUiStore((state) => state.themePreference);
  const resolved = useUiStore(selectResolvedTheme);
  const setThemePreference = useUiStore((state) => state.setThemePreference);
  const announce = useUiStore((state) => state.announce);

  const [menuOpen, setMenuOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  // Đóng menu trả focus về nút; không bật tooltip vì lần focus đó cho tới khi rời chuột/focus.
  const [tooltipSuppressed, setTooltipSuppressed] = useState(false);

  const TriggerIcon = resolved === 'dark' ? Moon : Sun;

  const onChange = (value: string) => {
    if (!isThemePreference(value)) return;
    setThemePreference(value);
    const next = resolveTheme(value, useUiStore.getState().systemPrefersDark);
    announce(format(t.theme.changed, { theme: next === 'dark' ? t.theme.dark : t.theme.light }));
  };

  const onMenuOpenChange = (open: boolean) => {
    setMenuOpen(open);
    setTooltipOpen(false);
    if (!open) setTooltipSuppressed(true);
  };

  const releaseTooltip = () => {
    setTooltipSuppressed(false);
  };

  return (
    <DropdownMenu modal={false} open={menuOpen} onOpenChange={onMenuOpenChange}>
      <Tooltip open={tooltipOpen && !menuOpen && !tooltipSuppressed} onOpenChange={setTooltipOpen}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t.theme.menuLabel}
              data-testid="theme-menu-trigger"
              onPointerLeave={releaseTooltip}
              onBlur={releaseTooltip}
              className="text-foreground/80 hover:text-foreground [&_svg]:size-[18px]"
            >
              <TriggerIcon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t.theme.menuLabel}</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          {t.theme.label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={preference} onValueChange={onChange}>
          {THEME_PREFERENCES.map((value) => {
            const Icon = ICONS[value];
            return (
              <DropdownMenuRadioItem key={value} value={value} className="gap-2.5">
                <Icon className="text-muted-foreground" />
                {t.theme[value]}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
