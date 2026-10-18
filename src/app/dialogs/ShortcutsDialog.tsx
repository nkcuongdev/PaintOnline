import { BookOpen, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { openHelp } from '@/app/help/open';
import { Kbd } from '@/app/shared/Kbd';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { t } from '@/i18n';
import { matchesSearch } from '@/lib/text';
import { useUiStore } from '@/stores/ui';
import { GROUP_ORDER, groupLabel, shortcutRows } from './shortcutRows';

/** Bảng phím tắt (mục 7.3): mở bằng `?`, tìm kiếm được, phím dự phòng ghi rõ. */
export function ShortcutsDialog() {
  const open = useUiStore((s) => s.dialog?.kind === 'shortcuts');
  const closeDialog = useUiStore((s) => s.closeDialog);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
    >
      {open && <ShortcutsContent />}
    </Dialog>
  );
}

function ShortcutsContent() {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => shortcutRows(), []);
  const visible = rows.filter(
    (row) => matchesSearch(row.label, query) || row.keys.some((k) => matchesSearch(k, query)),
  );
  return (
    <DialogContent
      closeLabel={t.actions.close}
      className="flex max-h-[min(40rem,85vh)] flex-col gap-3 sm:max-w-3xl"
      data-testid="shortcuts-dialog"
    >
      <DialogHeader>
        <DialogTitle>{t.shortcutsDialog.title}</DialogTitle>
        <DialogDescription>{t.shortcutsDialog.description}</DialogDescription>
      </DialogHeader>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          placeholder={t.shortcutsDialog.search}
          aria-label={t.shortcutsDialog.search}
          data-testid="shortcuts-search"
          className="pl-8"
        />
      </div>
      <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6" tabIndex={0}>
        {visible.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t.shortcutsDialog.empty}
          </p>
        )}
        <div className="grid gap-x-8 sm:grid-cols-2">
          {GROUP_ORDER.map((group) => {
            const items = visible.filter((row) => row.group === group);
            if (items.length === 0) return null;
            return (
              <section key={group} className="mb-4 break-inside-avoid">
                <h3 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {groupLabel(group)}
                </h3>
                <dl className="grid gap-1">
                  {items.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-start justify-between gap-3 text-sm"
                      data-testid="shortcut-row"
                    >
                      {/* Nhãn dài thì xuống dòng; cụm phím giữ ở hàng đầu và không quá 60% cột nên
                          không tràn sang cột bên cạnh. */}
                      <dt className="min-w-0">{row.label}</dt>
                      <dd className="flex max-w-[60%] shrink-0 flex-wrap items-center justify-end gap-1">
                        {row.keys.map((key, index) => (
                          <span key={key} className="flex items-center gap-1">
                            {/* Dấu `/` gọn hơn chữ "dự phòng"; mô tả hộp thoại giải thích nó. */}
                            {index > 0 && (
                              <span className="px-0.5 text-xs text-muted-foreground">
                                <span aria-hidden="true">/</span>
                                <span className="sr-only">{t.shortcutsDialog.or}</span>
                              </span>
                            )}
                            <Kbd shortcut={key} />
                          </span>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        data-testid="shortcuts-help"
        onClick={() => {
          useUiStore.getState().closeDialog();
          openHelp('phim-tat');
        }}
        className="flex items-center gap-1.5 self-start text-sm font-medium text-primary hover:underline dark:text-primary-soft-foreground"
      >
        <BookOpen className="size-4" />
        {t.help.fullGuide}
      </button>
    </DialogContent>
  );
}
