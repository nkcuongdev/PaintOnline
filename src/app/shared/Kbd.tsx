import { cn } from '@/lib/utils';
import { platformFeatures } from '@/services/platform/features';
import { formatShortcut, shortcutKeys } from './shortcut';

interface KbdProps {
  /** Dạng `Mod+Shift+S`. */
  shortcut: string;
  className?: string;
  /** `inverted` dùng trên nền tối của tooltip. */
  tone?: 'default' | 'inverted';
}

/** Hiển thị phím tắt bằng các ô <kbd>, tự đổi Ctrl ↔ ⌘ theo nền tảng. */
export function Kbd({ shortcut, className, tone = 'default' }: KbdProps) {
  const { isApple } = platformFeatures;
  return (
    <kbd className={cn('inline-flex items-center gap-0.5 font-sans', className)}>
      {/* Trình đọc màn hình đọc cả tổ hợp ("Ctrl+K"), không đọc từng ô. */}
      <span className="sr-only">{formatShortcut(shortcut, isApple)}</span>
      {shortcutKeys(shortcut, isApple).map((key, index) => (
        <span
          key={`${String(index)}-${key}`}
          aria-hidden="true"
          className={cn(
            'inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] px-1 text-[0.6875rem] leading-none font-medium',
            tone === 'default'
              ? 'border border-border bg-card text-muted-foreground shadow-[0_1px_0_var(--border)]'
              : 'bg-background/15 text-background',
          )}
        >
          {key}
        </span>
      ))}
    </kbd>
  );
}
