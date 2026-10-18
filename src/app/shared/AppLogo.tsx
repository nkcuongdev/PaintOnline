import { useId } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

interface AppMarkProps {
  className?: string;
}

/** Biểu tượng ứng dụng — cùng hình với favicon. */
export function AppMark({ className }: AppMarkProps) {
  const gradientId = useId();
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-7 shrink-0', className)}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5c7cfa" />
          <stop offset="1" stopColor="#3b5bdb" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gradientId})`} />
      <path
        d="M7.5 21.5c2.6-.3 4.2-1.6 5.4-3.6 1.6-2.7 3.4-4.4 6.6-4.4"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M19.2 12.1 24.6 6.7a1.9 1.9 0 0 1 2.7 2.7l-5.4 5.4z" fill="#fff" fillOpacity=".92" />
      <circle cx="9" cy="10" r="2.2" fill="#ffd43b" />
    </svg>
  );
}

interface AppLogoProps {
  className?: string;
}

/** Biểu tượng + tên ứng dụng. */
export function AppLogo({ className }: AppLogoProps) {
  return (
    <span className={cn('flex items-center gap-2.5 select-none', className)}>
      <AppMark />
      <span className="text-[0.9375rem] font-semibold tracking-[-0.01em]">{t.app.name}</span>
    </span>
  );
}
