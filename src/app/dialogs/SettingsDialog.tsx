import { Download, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { formatTime } from '@/app/editor/session';
import { Segmented } from '@/app/shared/Segmented';
import { refreshStorageEstimate, requestPersistenceNow } from '@/app/storage';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { format, t } from '@/i18n';
import { formatBytes } from '@/services/io/exportImage';
import { downloadBlob } from '@/services/io/download';
import {
  clearErrorLog,
  errorLog,
  errorLogBlob,
  subscribeErrorLog,
} from '@/services/diagnostics/errorLog';
import { detectMemoryConfig } from '@/services/platform/deviceTier';
import { useProjectStore } from '@/stores/project';
import { GRID_SIZES, useSettingsStore } from '@/stores/settings';
import { THEME_PREFERENCES, toast, useUiStore, type ThemePreference } from '@/stores/ui';

const HISTORY_SHARES = [0.1, 0.25, 0.4] as const;

function themeLabel(preference: ThemePreference): string {
  return preference === 'system'
    ? t.theme.system
    : preference === 'light'
      ? t.theme.light
      : t.theme.dark;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    // flex-col thay vì grid: cột grid lấy min-content của con làm bề rộng tối thiểu, nên một dòng
    // `truncate` dài (nhật ký lỗi) đẩy cả dialog phải cuộn ngang.
    <section className="flex flex-col gap-4 border-t pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/**
 * Cài đặt (mục 7.3): giao diện, ngôn ngữ, tự động lưu, quyền lưu trữ bền vững, bộ nhớ cho lịch sử
 * hoàn tác, lưới, nhật ký lỗi cục bộ (mục 10.3). Mục "chỉ vẽ bằng bút" thuộc phần cảm ứng đã hoãn
 * (ADR 0028).
 */
export function SettingsDialog() {
  const open = useUiStore((s) => s.dialog?.kind === 'settings');
  const closeDialog = useUiStore((s) => s.closeDialog);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
    >
      {open && <SettingsContent />}
    </Dialog>
  );
}

function SettingsContent() {
  const theme = useUiStore((s) => s.themePreference);
  const setTheme = useUiStore((s) => s.setThemePreference);
  const autosave = useSettingsStore((s) => s.autosave);
  const setAutosave = useSettingsStore((s) => s.setAutosave);
  const historyShare = useSettingsStore((s) => s.historyShare);
  const setHistoryShare = useSettingsStore((s) => s.setHistoryShare);
  const gridSize = useSettingsStore((s) => s.view.gridSize);
  const setView = useSettingsStore((s) => s.setView);
  const estimate = useProjectStore((s) => s.estimate);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    void refreshStorageEstimate();
  }, []);

  const totalMemory = formatBytes(detectMemoryConfig().totalBytes);

  return (
    <DialogContent
      closeLabel={t.actions.close}
      className="flex max-h-[min(44rem,90vh)] flex-col gap-4 sm:max-w-2xl"
      data-testid="settings-dialog"
    >
      <DialogHeader>
        <DialogTitle>{t.settings.title}</DialogTitle>
        <DialogDescription>{t.settings.description}</DialogDescription>
      </DialogHeader>
      <div className="-mx-6 flex min-h-0 flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto px-6 pb-1">
        <Section title={t.settings.appearance}>
          <Row label={t.settings.theme}>
            <Segmented
              label={t.settings.theme}
              value={theme}
              options={THEME_PREFERENCES.map((value) => ({ value, label: themeLabel(value) }))}
              onChange={setTheme}
              testId="settings-theme"
            />
          </Row>
          <Row
            label={t.settings.language}
            hint={t.settings.languageNote}
            htmlFor="settings-language"
          >
            <select
              id="settings-language"
              disabled
              className="h-8 rounded-md border bg-card px-2 text-sm"
              value="vi"
            >
              <option value="vi">{t.settings.languageVi}</option>
            </select>
          </Row>
        </Section>

        <Section title={t.settings.saving}>
          <Row label={t.settings.autosave} hint={t.settings.autosaveHint}>
            <Segmented
              label={t.settings.autosave}
              value={autosave ? 'on' : 'off'}
              options={[
                { value: 'on', label: t.common.on },
                { value: 'off', label: t.common.off },
              ]}
              onChange={(value) => {
                setAutosave(value === 'on');
              }}
              testId="settings-autosave"
            />
          </Row>
          <Row
            label={t.settings.persistence}
            hint={
              <>
                {estimate?.persisted === true
                  ? t.settings.persistenceGranted
                  : estimate?.persisted === false
                    ? t.settings.persistenceDenied
                    : t.settings.persistenceUnknown}
                {estimate && (
                  <>
                    {' '}
                    {format(t.settings.storageUsage, {
                      used: formatBytes(estimate.usage),
                      quota: formatBytes(estimate.quota),
                    })}
                  </>
                )}
              </>
            }
          >
            {estimate?.persisted === true ? (
              <span className="flex items-center gap-1.5 text-sm text-success">
                <ShieldCheck className="size-4" aria-hidden="true" />
                {t.common.on}
              </span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={requesting || estimate?.persisted === null}
                data-testid="settings-persist"
                onClick={() => {
                  setRequesting(true);
                  void requestPersistenceNow().finally(() => {
                    setRequesting(false);
                  });
                }}
              >
                {t.settings.persistenceRequest}
              </Button>
            )}
          </Row>
        </Section>

        <Section title={t.settings.memory}>
          <Row
            label={t.settings.historyBudget}
            hint={format(t.settings.historyBudgetHint, { total: totalMemory })}
          >
            <Segmented
              label={t.settings.historyBudget}
              value={HISTORY_SHARES.find((s) => Math.abs(s - historyShare) < 0.001) ?? 0.25}
              options={[
                { value: 0.1, label: t.settings.historyLow },
                { value: 0.25, label: t.settings.historyNormal },
                { value: 0.4, label: t.settings.historyHigh },
              ]}
              onChange={setHistoryShare}
              testId="settings-history"
            />
          </Row>
        </Section>

        <Section title={t.settings.view}>
          <Row label={t.settings.gridSize} htmlFor="settings-grid-size">
            <select
              id="settings-grid-size"
              data-testid="settings-grid-size"
              className="h-8 rounded-md border bg-card px-2 text-sm"
              value={gridSize}
              onChange={(e) => {
                setView({ gridSize: Number(e.target.value) });
              }}
            >
              {GRID_SIZES.map((size) => (
                <option key={size} value={size}>
                  {format(t.settings.gridSizeValue, { value: size })}
                </option>
              ))}
            </select>
          </Row>
        </Section>

        <ErrorLogSection />

        <p className="text-xs text-muted-foreground">
          {format(t.settings.about, { version: __APP_VERSION__ })}
        </p>
      </div>
    </DialogContent>
  );
}

function ErrorLogSection() {
  const entries = useSyncExternalStore(subscribeErrorLog, errorLog, errorLog);
  const recent = entries.slice(-5).reverse();
  return (
    <Section title={t.settings.errorLog}>
      <p className="text-xs text-muted-foreground">{t.settings.errorLogHint}</p>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="error-log-empty">
          {t.settings.errorLogEmpty}
        </p>
      ) : (
        <>
          <p className="text-sm" data-testid="error-log-count">
            {format(t.settings.errorLogCount, { count: entries.length })}
          </p>
          <ul className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-2 text-xs">
            {recent.map((entry) => (
              <li key={`${String(entry.at)}-${entry.message}`} className="flex gap-2">
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {formatTime(entry.at)}
                </span>
                <span className="min-w-0 truncate font-mono" title={entry.message}>
                  {entry.message}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={entries.length === 0}
          data-testid="error-log-download"
          onClick={() => {
            downloadBlob(errorLogBlob(), `paint-online-errors-${String(Date.now())}.json`);
          }}
        >
          <Download />
          {t.settings.errorLogDownload}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={entries.length === 0}
          data-testid="error-log-clear"
          onClick={() => {
            clearErrorLog();
            toast('success', t.settings.errorLogCleared);
          }}
        >
          <Trash2 />
          {t.settings.errorLogClear}
        </Button>
      </div>
    </Section>
  );
}
