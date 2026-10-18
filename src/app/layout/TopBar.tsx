import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TopBarProps {
  /** Vùng trái: logo/menu, tên project. */
  start?: ReactNode;
  /** Vùng giữa: Undo/Redo, tìm lệnh. */
  center?: ReactNode;
  /** Vùng phải: theme, Export. */
  end?: ReactNode;
  className?: string;
}

/** Thanh trên cùng cao 48 px (mục 7.2), dùng chung cho Trang chủ và Editor. */
export function TopBar({ start, center, end, className }: TopBarProps) {
  return (
    <header
      data-testid="top-bar"
      className={cn(
        'surface-glass relative z-20 grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-x-0 border-t-0 px-2 sm:px-3',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-1">{start}</div>
      <div className="flex items-center gap-1">{center}</div>
      <div className="flex min-w-0 items-center justify-end gap-1">{end}</div>
    </header>
  );
}
