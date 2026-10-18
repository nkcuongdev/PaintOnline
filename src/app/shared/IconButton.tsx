import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Kbd } from './Kbd';

type IconButtonProps = Omit<ComponentProps<typeof Button>, 'aria-label' | 'children' | 'size'> & {
  /** Nhãn cho trình đọc màn hình và tooltip (mục 7.8: mọi nút icon có aria-label). */
  label: string;
  /** Phím tắt hiện trong tooltip, dạng `Mod+Z`. */
  shortcut?: string;
  icon: ReactNode;
  tooltipSide?: ComponentProps<typeof TooltipContent>['side'];
  size?: 'sm' | 'md';
};

/** Nút chỉ có icon, kèm tooltip có phím tắt. */
export function IconButton({
  label,
  shortcut,
  icon,
  tooltipSide = 'bottom',
  size = 'md',
  variant = 'ghost',
  className,
  ...props
}: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size={size === 'sm' ? 'icon-xs' : 'icon-sm'}
          aria-label={label}
          aria-keyshortcuts={shortcut?.replace('Mod', 'Control')}
          className={cn('text-foreground/80 hover:text-foreground [&_svg]:size-[18px]', className)}
          {...props}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide} className="flex items-center gap-2">
        <span>{label}</span>
        {shortcut !== undefined && <Kbd shortcut={shortcut} tone="inverted" />}
      </TooltipContent>
    </Tooltip>
  );
}
