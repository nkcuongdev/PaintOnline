import { CornerDownLeft, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { format, t } from '@/i18n';
import { cn } from '@/lib/utils';
import { searchIndex } from './content';
import { helpIcon } from './icons';
import { search, type SearchResult } from './search';
import { createElement } from 'react';

function resultHref(result: SearchResult): string {
  const { topic, section } = result.entry;
  return section ? `#/help/${topic.id}/${section.id}` : `#/help/${topic.id}`;
}

/**
 * Ô tìm trong hướng dẫn: kết quả hiện ngay khi gõ, mũi tên lên/xuống để chọn, Enter để mở, Esc để
 * xóa. Phím `/` đưa con trỏ vào ô (trên trang hướng dẫn `/` không mở Command Palette).
 */
export function HelpSearch({
  variant = 'bar',
  autoFocus = false,
  onNavigate,
}: {
  variant?: 'bar' | 'hero';
  autoFocus?: boolean;
  onNavigate?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = useMemo(() => search(searchIndex(), query), [query]);
  const hero = variant === 'hero';

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // `/` đưa con trỏ vào ô tìm kiếm (chỉ ô đầu tiên trên trang nhận phím).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      ) {
        return;
      }
      const first = document.querySelector<HTMLInputElement>('[data-help-search-input]');
      if (first !== inputRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  const go = (result: SearchResult | undefined) => {
    if (!result) return;
    window.location.hash = resultHref(result);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    onNavigate?.();
  };

  const showList = open && query.trim() !== '';

  return (
    <div className={cn('relative w-full', hero ? 'max-w-2xl' : 'max-w-[26rem]')}>
      <Search
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground',
          hero ? 'left-4 size-5' : 'left-2.5 size-4',
        )}
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        data-help-search-input
        data-testid={hero ? 'help-search-hero' : 'help-search'}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={t.help.searchLabel}
        placeholder={t.help.search}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          // Chờ click vào kết quả được xử lý trước khi đóng danh sách.
          window.setTimeout(() => {
            setOpen(false);
          }, 150);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(results.length - 1, i + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            go(results[active]);
          } else if (e.key === 'Escape') {
            if (query) {
              e.preventDefault();
              setQuery('');
            } else inputRef.current?.blur();
          }
        }}
        className={cn(
          'w-full rounded-lg border border-input bg-card text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 [&::-webkit-search-cancel-button]:hidden',
          hero ? 'h-13 pr-12 pl-12 text-base shadow-card' : 'h-8 pr-8 pl-8 text-sm',
        )}
      />
      {query ? (
        <button
          type="button"
          aria-label={t.actions.close}
          onMouseDown={(e) => {
            e.preventDefault();
            setQuery('');
          }}
          className={cn(
            'absolute top-1/2 flex -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground',
            hero ? 'right-3 size-8' : 'right-1.5 size-6',
          )}
        >
          <X className="size-4" />
        </button>
      ) : (
        <kbd
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-[5px] border bg-card font-sans font-medium text-muted-foreground shadow-[0_1px_0_var(--border)]',
            hero ? 'right-4 h-6 min-w-6 text-xs' : 'right-2 h-5 min-w-5 text-[0.6875rem]',
          )}
        >
          /
        </kbd>
      )}
      {showList && (
        <div
          id={listId}
          role="listbox"
          aria-label={t.help.searchLabel}
          data-testid="help-search-results"
          className="absolute inset-x-0 top-[calc(100%+6px)] z-50 max-h-[min(30rem,70vh)] overflow-y-auto rounded-xl border bg-popover p-1.5 text-left shadow-island"
        >
          <p className="px-2.5 pt-1 pb-1.5 text-xs text-muted-foreground">
            {results.length === 0
              ? format(t.help.searchEmpty, { query: query.trim() })
              : format(t.help.searchCount, { n: results.length })}
          </p>
          {results.map((result, index) => (
            <a
              key={`${result.entry.topic.id}-${result.entry.section?.id ?? ''}`}
              href={resultHref(result)}
              role="option"
              aria-selected={index === active}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={(e) => {
                e.preventDefault();
                go(result);
              }}
              onMouseEnter={() => {
                setActive(index);
              }}
              className={cn(
                'flex gap-3 rounded-lg px-2.5 py-2 outline-none',
                index === active && 'bg-accent',
              )}
            >
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-soft-foreground">
                {createElement(helpIcon(result.entry.topic.icon), {
                  className: 'size-4',
                  'aria-hidden': true,
                })}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {result.entry.topic.title}
                  {result.entry.section && (
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      › {result.entry.section.title}
                    </span>
                  )}
                </span>
                {result.snippet ? (
                  <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {result.snippet[0]}
                    <mark className="rounded-sm bg-primary/15 px-0.5 text-foreground">
                      {result.snippet[1]}
                    </mark>
                    {result.snippet[2]}
                  </span>
                ) : (
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {result.entry.topic.summary}
                  </span>
                )}
              </span>
              {index === active && (
                <CornerDownLeft className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
