import { HardDrive, ShieldCheck } from 'lucide-react';
import { format, t } from '@/i18n';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/services/io/exportImage';
import { isStorageLow } from '@/services/storage/quota';
import { useProjectStore } from '@/stores/project';

/** Dung lượng đã dùng / quota và trạng thái lưu trữ bền vững (mục 6.6, 10.3). */
export function StorageMeter() {
  const estimate = useProjectStore((s) => s.estimate);
  if (!estimate || estimate.quota <= 0) return null;
  const ratio = Math.min(1, estimate.usage / estimate.quota);
  const low = isStorageLow(estimate);
  return (
    <div
      className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-status text-muted-foreground"
      data-testid="storage-meter"
      data-low={low || undefined}
    >
      <span className="flex items-center gap-1.5">
        <HardDrive className="size-3.5" aria-hidden="true" />
        <span className="sr-only">{t.storage.usageLabel}: </span>
        {format(t.storage.usage, {
          used: formatBytes(estimate.usage),
          quota: formatBytes(estimate.quota),
        })}
      </span>
      <span
        className="h-1.5 w-32 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={t.storage.usageLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <span
          className={cn('block h-full rounded-full bg-primary', low && 'bg-destructive')}
          style={{ width: `${String(Math.max(2, ratio * 100))}%` }}
        />
      </span>
      {estimate.persisted !== null && (
        <span className="flex items-center gap-1.5">
          {estimate.persisted && (
            <ShieldCheck className="size-3.5 text-success" aria-hidden="true" />
          )}
          {estimate.persisted ? t.storage.persisted : t.storage.notPersisted}
        </span>
      )}
    </div>
  );
}
