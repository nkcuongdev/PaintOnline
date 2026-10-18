import {
  CircleAlert,
  CircleDot,
  CloudCheck,
  CloudOff,
  HardDrive,
  LoaderCircle,
  Lock,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Kbd } from '@/app/shared/Kbd';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, t } from '@/i18n';
import { cn } from '@/lib/utils';
import type { SaveStatus } from '@/services/storage/saveStatus';
import { useProjectStore } from '@/stores/project';
import { openDialog } from '@/stores/ui';
import { formatTime, retrySave, saveCurrentProject, type OpenProject } from './session';

const ICONS: Readonly<Record<SaveStatus['kind'], ReactNode>> = {
  saved: <CloudCheck />,
  dirty: <CircleDot />,
  saving: <LoaderCircle className="animate-spin" />,
  error: <CircleAlert />,
  quota: <HardDrive />,
  readonly: <Lock />,
  unavailable: <CloudOff />,
};

function saveStatusLabel(status: SaveStatus): string {
  switch (status.kind) {
    case 'saved':
      return t.storage.saved;
    case 'dirty':
      return t.storage.dirty;
    case 'saving':
      return t.storage.saving;
    case 'error':
      return t.storage.error;
    case 'quota':
      return t.storage.quota;
    case 'readonly':
      return t.storage.readonly;
    case 'unavailable':
      return t.storage.unavailable;
  }
}

/**
 * Trạng thái lưu ở top bar (mục 6.6): Đã lưu · Có thay đổi chưa lưu · Đang lưu · Lỗi lưu (lý do +
 * Thử lại) · Chỉ đọc · Hết dung lượng · Không lưu tự động. Bấm để xem chi tiết hoặc lưu ngay.
 */
export function SaveStatusIndicator({ project }: { project: OpenProject }) {
  const status = useProjectStore((s) => s.saveStatus);
  if (!status) return null;
  const label = saveStatusLabel(status);
  const problem = status.kind === 'error' || status.kind === 'quota';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="save-status"
          data-status={status.kind}
          aria-label={`${t.storage.statusLabel}: ${label}`}
          onClick={(e) => {
            if (status.kind === 'quota') {
              e.preventDefault();
              openDialog({ kind: 'quota' });
            }
          }}
          className={cn(
            'flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-status text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0',
            problem && 'text-destructive hover:text-destructive',
            status.kind === 'readonly' && 'text-warning',
          )}
        >
          {ICONS[status.kind]}
          <span className="hidden truncate md:inline" aria-live="polite">
            {label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 text-sm" data-testid="save-status-details">
        <StatusDetails status={status} project={project} />
      </PopoverContent>
    </Popover>
  );
}

function StatusDetails({ status, project }: { status: SaveStatus; project: OpenProject }) {
  const backup = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        openDialog({ kind: 'paintExport', projectId: project.id });
      }}
    >
      {t.projects.exportPaint}
    </Button>
  );
  switch (status.kind) {
    case 'saved':
    case 'dirty':
    case 'saving':
      return (
        <div className="flex flex-col gap-3">
          <p className="font-medium">
            {status.kind === 'saved' && status.savedAt !== null
              ? format(t.storage.savedAt, { time: formatTime(status.savedAt) })
              : saveStatusLabel(status)}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            data-testid="save-now"
            disabled={status.kind === 'saving'}
            onClick={() => {
              void saveCurrentProject();
            }}
          >
            {t.storage.saveNow}
            <Kbd shortcut="Mod+S" className="ml-1" />
          </Button>
        </div>
      );
    case 'error':
      return (
        <div className="flex flex-col gap-2">
          <p className="font-medium text-destructive">{t.storage.error}</p>
          <p>{t.storage.errorReasons[status.reason]}</p>
          <p className="text-muted-foreground">{t.storage.errorHint}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {status.reason !== 'missing' && status.reason !== 'conflict' && (
              <Button size="sm" data-testid="save-retry" onClick={retrySave}>
                {t.storage.retry}
              </Button>
            )}
            {backup}
          </div>
        </div>
      );
    case 'quota':
      return null;
    case 'readonly':
      return <p>{t.storage.readOnlyBanner}</p>;
    case 'unavailable':
      return (
        <div className="flex flex-col gap-2">
          <p>{t.storage.unavailableHint}</p>
          <div>{backup}</div>
        </div>
      );
  }
}
