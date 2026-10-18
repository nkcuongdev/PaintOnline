import { cn } from '@/lib/utils';

interface SegmentedProps<T extends string | number> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  testId?: string;
  className?: string;
}

/** Nhóm lựa chọn dạng nút liền nhau (radiogroup) — cùng kiểu với Options bar. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  testId,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-testid={testId}
      className={cn('flex w-fit rounded-lg bg-muted p-0.5', className)}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={checked}
            data-value={String(option.value)}
            onClick={() => {
              onChange(option.value);
            }}
            className={cn(
              'h-7 rounded-md px-2.5 text-sm text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              checked && 'bg-card font-medium text-foreground shadow-sm',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
