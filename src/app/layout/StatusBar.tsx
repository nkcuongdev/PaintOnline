import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatusBarProps {
  start?: ReactNode;
  end?: ReactNode;
  className?: string;
}

/**
 * Thanh trạng thái cao 28 px, chữ 12 px (mục 7.1, 7.2): tọa độ con trỏ, kích thước ảnh,
 * vùng chọn, thanh zoom — các ô dữ liệu được nối với Engine từ GĐ1.
 */
export function StatusBar({ start, end, className }: StatusBarProps) {
  return (
    <footer
      data-testid="status-bar"
      className={cn(
        'flex h-7 shrink-0 items-center justify-between gap-4 border-t bg-background px-3 text-status text-muted-foreground tabular-nums',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-4">{start}</div>
      <div className="flex items-center gap-4">{end}</div>
    </footer>
  );
}
