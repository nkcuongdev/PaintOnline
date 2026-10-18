import { Circle, CircleDot, Info } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Editor } from '@/engine/core/Editor';
import { format, t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useDocumentStore } from '@/stores/document';
import { useProjectStore } from '@/stores/project';
import { historyLabel } from '../historyLabel';

const timeFormat = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });

/**
 * Panel History (mục 2, 5.6): danh sách bước từ cũ đến mới, click để nhảy về bất kỳ bước nào. Các
 * bước đã hoàn tác (nhánh redo) vẫn hiện mờ để làm lại; làm thao tác mới thì nhánh đó bị bỏ.
 */
export function HistoryPanel({ editor }: { editor: Editor }) {
  const history = useDocumentStore((s) => s.history);
  const readOnly = useProjectStore((s) => s.readOnly);
  const currentRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' });
  }, [history.position, history.entries.length]);

  const item = (position: number, text: string, time: number | null, aria: string) => {
    const current = history.position === position;
    const undone = position > history.position;
    return (
      <li key={position}>
        <button
          ref={current ? currentRef : undefined}
          type="button"
          disabled={readOnly}
          aria-current={current ? 'step' : undefined}
          aria-label={undone ? `${aria} (${t.historyPanel.undone})` : aria}
          data-testid="history-entry"
          data-position={position}
          data-undone={undone || undefined}
          onClick={() => {
            editor.historyGoTo(position);
          }}
          className={cn(
            'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none',
            current &&
              'bg-primary-soft font-medium text-primary-soft-foreground hover:bg-primary-soft',
            undone && 'text-muted-foreground italic',
          )}
        >
          {current ? (
            <CircleDot className="size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <Circle className="size-3.5 shrink-0 opacity-40" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1 truncate">{text}</span>
          {time !== null && (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {timeFormat.format(time)}
            </span>
          )}
        </button>
      </li>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="history-panel">
      {history.trimmed && (
        <p className="mx-2 mt-1 flex gap-2 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {t.historyPanel.trimmed}
        </p>
      )}
      <ol
        aria-label={t.historyPanel.listLabel}
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-1"
        data-testid="history-list"
      >
        {item(
          0,
          history.trimmed ? t.historyPanel.oldest : t.historyPanel.original,
          null,
          t.historyPanel.jumpToOriginal,
        )}
        {history.entries.map((entry, i) => {
          const text = historyLabel(entry.label) ?? entry.label;
          return item(i + 1, text, entry.timestamp, format(t.historyPanel.jumpTo, { label: text }));
        })}
      </ol>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">{t.historyPanel.note}</p>
    </div>
  );
}
