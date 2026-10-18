import { CloudOff, History, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { discardRetainedProject, formatTime, useRetainedProject } from '@/app/editor/session';
import { backupReminderVisible, dismissBackupReminder } from '@/app/projects';
import { navigate } from '@/app/router';
import { Button } from '@/components/ui/button';
import { format, t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/stores/project';
import { openDialog } from '@/stores/ui';

function Banner({
  icon,
  tone = 'default',
  title,
  body,
  actions,
  testId,
}: {
  icon: ReactNode;
  tone?: 'default' | 'warning' | 'danger';
  title: string;
  body?: string;
  actions?: ReactNode;
  testId: string;
}) {
  return (
    <section
      aria-label={title}
      data-testid={testId}
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-card',
        tone === 'warning' && 'border-warning/40',
        tone === 'danger' && 'border-destructive/40',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground [&_svg]:size-5',
          tone === 'warning' && 'bg-warning/10 text-warning',
          tone === 'danger' && 'bg-destructive/10 text-destructive',
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{title}</span>
        {body && <span className="text-sm text-muted-foreground">{body}</span>}
      </span>
      {actions && <span className="flex flex-wrap gap-2">{actions}</span>}
    </section>
  );
}

/**
 * Thông báo ở đầu trang chủ: IndexedDB không dùng được, khôi phục phiên (mục 7.3, 7.4), project
 * chưa lưu được còn giữ trong tab, nhắc sao lưu .paint (mục 6.6).
 */
export function HomeBanners() {
  const storage = useProjectStore((s) => s.storage);
  const previous = useProjectStore((s) => s.previousSession);
  const dismissed = useProjectStore((s) => s.recoveryDismissed);
  const projects = useProjectStore((s) => s.projects);
  const retained = useRetainedProject();
  const [backupHidden, setBackupHidden] = useState(false);

  const banners: ReactNode[] = [];

  if (storage === 'unavailable') {
    banners.push(
      <Banner
        key="unavailable"
        testId="storage-unavailable"
        tone="warning"
        icon={<CloudOff />}
        title={t.storage.unavailable}
        body={t.storage.unavailableBanner}
      />,
    );
  }

  if (retained) {
    banners.push(
      <Banner
        key="retained"
        testId="retained-project"
        tone="danger"
        icon={<TriangleAlert />}
        title={`${retained.name} — ${t.projects.unsavedCard}`}
        body={t.projects.unsavedCardHint}
        actions={
          <>
            <Button
              size="sm"
              onClick={() => {
                navigate({ name: 'project', projectId: retained.id });
              }}
            >
              {t.recovery.continue}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                openDialog({ kind: 'paintExport', projectId: retained.id });
              }}
            >
              {t.projects.exportPaint}
            </Button>
            <Button size="sm" variant="ghost" onClick={discardRetainedProject}>
              {t.projects.discard}
            </Button>
          </>
        }
      />,
    );
  }

  const recoverable =
    !dismissed && previous?.projectId
      ? projects.find((p) => p.id === previous.projectId && p.deletedAt === undefined)
      : undefined;
  if (previous && recoverable && !retained) {
    const unclean = !previous.cleanExit;
    banners.push(
      <Banner
        key="recovery"
        testId="recovery-banner"
        icon={<History />}
        title={
          unclean ? t.recovery.uncleanTitle : format(t.recovery.title, { name: recoverable.name })
        }
        body={
          unclean
            ? format(t.recovery.uncleanBody, {
                name: recoverable.name,
                time: formatTime(recoverable.updatedAt),
              })
            : undefined
        }
        actions={
          <>
            <Button
              size="sm"
              data-testid="recovery-continue"
              onClick={() => {
                navigate({ name: 'project', projectId: recoverable.id });
              }}
            >
              {t.recovery.continue}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="recovery-dismiss"
              onClick={() => {
                useProjectStore.setState({ recoveryDismissed: true, previousSession: null });
              }}
            >
              {t.recovery.dismiss}
            </Button>
          </>
        }
      />,
    );
  }

  const needBackup = backupHidden ? 0 : backupReminderVisible(projects);
  if (needBackup > 0) {
    banners.push(
      <Banner
        key="backup"
        testId="backup-reminder"
        tone="warning"
        icon={<ShieldAlert />}
        title={format(t.storage.backupReminder, { n: needBackup })}
        body={t.storage.backupReminderHint}
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              dismissBackupReminder();
              setBackupHidden(true);
            }}
          >
            {t.storage.dismiss}
          </Button>
        }
      />,
    );
  }

  if (banners.length === 0) return null;
  return <div className="flex flex-col gap-3">{banners}</div>;
}
