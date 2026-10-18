import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, ChevronRight, Menu, X } from 'lucide-react';
import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { TopBar } from '@/app/layout/TopBar';
import { AppMark } from '@/app/shared/AppLogo';
import { Kbd } from '@/app/shared/Kbd';
import { ThemeMenu } from '@/app/shared/ThemeMenu';
import { Button } from '@/components/ui/button';
import { format, t } from '@/i18n';
import { cn } from '@/lib/utils';
import { TopicBlocks } from './blocks';
import { CATEGORIES, categoryOf, findTopic, HOME, neighbours, topicChars } from './content';
import { Figure } from './Figure';
import { HelpSearch } from './HelpSearch';
import { readingLabel } from './reading';
import { helpIcon } from './icons';
import { SHOTS_VERSION } from './shots';
import type { Topic } from './types';

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

/** Thanh điều hướng trái: chủ đề và bài. */
function Sidebar({ current, onNavigate }: { current: string | null; onNavigate?: () => void }) {
  return (
    <nav
      aria-label={t.help.contents}
      className="flex flex-col gap-5 px-3 py-5"
      data-testid="help-nav"
    >
      <a
        href="#/help"
        onClick={onNavigate}
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
          current === null && 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft',
        )}
      >
        <BookOpen className="size-4" aria-hidden="true" />
        {t.help.home}
      </a>
      {CATEGORIES.map((category) => (
        <div key={category.id}>
          <p className="mb-1 flex items-center gap-2 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {createElement(helpIcon(category.icon), { className: 'size-3.5', 'aria-hidden': true })}
            {category.title}
          </p>
          <ul className="flex flex-col">
            {category.topics.map((topic) => {
              const active = topic.id === current;
              return (
                <li key={topic.id}>
                  <a
                    href={`#/help/${topic.id}`}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block rounded-md border-l-2 border-transparent py-1.5 pr-2 pl-[1.375rem] text-[0.8125rem] leading-snug text-foreground/80 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                      active &&
                        'border-primary bg-primary-soft font-medium text-primary-soft-foreground hover:bg-primary-soft hover:text-primary-soft-foreground',
                    )}
                  >
                    {topic.title}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Mục lục "Trong bài này" bên phải, đánh dấu mục đang đọc. */
function OnThisPage({
  topic,
  scroller,
}: {
  topic: Topic;
  scroller: React.RefObject<HTMLElement | null>;
}) {
  const sections = topic.blocks.flatMap((b) => (b.type === 'h2' ? [b] : []));
  const [current, setCurrent] = useState<string | null>(sections[0]?.id ?? null);
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const update = () => {
      let id: string | null = sections[0]?.id ?? null;
      for (const section of sections) {
        const el = document.getElementById(section.id);
        if (el && el.getBoundingClientRect().top - root.getBoundingClientRect().top < 120) {
          id = section.id;
        }
      }
      setCurrent(id);
    };
    update();
    root.addEventListener('scroll', update, { passive: true });
    return () => {
      root.removeEventListener('scroll', update);
    };
  }, [scroller, sections]);
  if (sections.length < 2) return null;
  return (
    <nav aria-label={t.help.onThisPage} className="sticky top-6">
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {t.help.onThisPage}
      </p>
      <ul className="border-l">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#/help/${topic.id}/${section.id}`}
              className={cn(
                '-ml-px block border-l-2 border-transparent py-1 pl-3 text-[0.8125rem] leading-snug text-muted-foreground hover:text-foreground',
                current === section.id &&
                  'border-primary font-medium text-primary dark:text-primary-soft-foreground',
              )}
            >
              {section.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const LEVEL_STYLES = {
  basic: 'border border-success/40 text-success',
  advanced: 'bg-primary-soft text-primary-soft-foreground',
  tutorial: 'border border-warning/40 text-warning',
} as const;

function TopicPage({
  topic,
  scroller,
}: {
  topic: Topic;
  scroller: React.RefObject<HTMLElement | null>;
}) {
  const category = categoryOf(topic.id);
  const { previous, next } = neighbours(topic.id);
  const related = (topic.related ?? []).map(findTopic).filter((r): r is Topic => r !== undefined);
  return (
    <div className="mx-auto flex w-full max-w-[72rem] gap-10 px-5 pt-8 pb-20 sm:px-8 lg:px-10">
      <article
        className="min-w-0 flex-1 text-[0.9375rem]"
        data-testid="help-topic"
        data-topic={topic.id}
      >
        <nav
          aria-label="breadcrumb"
          className="mb-4 flex items-center gap-1 text-[0.8125rem] text-muted-foreground"
        >
          <a href="#/help" className="hover:text-foreground">
            {t.help.short}
          </a>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          <span>{category?.title}</span>
        </nav>
        <header className="mb-8">
          <div className="flex items-start gap-4">
            <span className="mt-1 hidden size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#5c7cfa] to-[#3b5bdb] text-white shadow-card sm:flex">
              {createElement(helpIcon(topic.icon), { className: 'size-6', 'aria-hidden': true })}
            </span>
            <div className="min-w-0">
              <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] sm:text-[2rem]">
                {topic.title}
              </h1>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                {topic.summary}
              </p>
              <p className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={cn('rounded-full px-2 py-0.5 font-medium', LEVEL_STYLES[topic.level])}
                >
                  {t.help.levels[topic.level]}
                </span>
                <span className="text-muted-foreground">{readingLabel(topicChars(topic.id))}</span>
              </p>
            </div>
          </div>
        </header>

        <TopicBlocks blocks={topic.blocks} topic={topic.id} />

        {related.length > 0 && (
          <section className="mt-14 border-t pt-8">
            <h2 className="mb-4 text-lg font-semibold">{t.help.related}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {related.map((r) => (
                <a
                  key={r.id}
                  href={`#/help/${r.id}`}
                  className="flex items-start gap-3 rounded-xl border bg-card p-3.5 shadow-card transition-shadow outline-none hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
                    {createElement(helpIcon(r.icon), { className: 'size-4', 'aria-hidden': true })}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{r.title}</span>
                    <span className="line-clamp-2 text-sm text-muted-foreground">{r.summary}</span>
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        <nav className="mt-10 grid gap-3 border-t pt-8 sm:grid-cols-2" aria-label={t.help.contents}>
          {previous ? (
            <a
              href={`#/help/${previous.id}`}
              className="group rounded-xl border p-4 outline-none hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowLeft className="size-3.5" /> {t.help.previous}
              </span>
              <span className="mt-1 block font-medium group-hover:text-primary dark:group-hover:text-primary-soft-foreground">
                {previous.title}
              </span>
            </a>
          ) : (
            <span />
          )}
          {next && (
            <a
              href={`#/help/${next.id}`}
              className="group rounded-xl border p-4 text-right outline-none hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                {t.help.next} <ArrowRight className="size-3.5" />
              </span>
              <span className="mt-1 block font-medium group-hover:text-primary dark:group-hover:text-primary-soft-foreground">
                {next.title}
              </span>
            </a>
          )}
        </nav>
        <p className="mt-8 text-xs text-muted-foreground">
          {format(t.help.version, { version: APP_VERSION })}
        </p>
      </article>
      <aside className="hidden w-56 shrink-0 xl:block">
        <OnThisPage topic={topic} scroller={scroller} />
      </aside>
    </div>
  );
}

/** Trang chính của hướng dẫn: tìm kiếm, bắt đầu nhanh, các chủ đề. */
function HelpHome() {
  const quick = useMemo(
    () =>
      HOME.quickStart
        .map(({ topic, shot }) => ({ topic: findTopic(topic), shot }))
        .filter((q): q is { topic: Topic; shot: string } => q.topic !== undefined),
    [],
  );
  return (
    <div className="pb-20" data-testid="help-home">
      <section className="relative overflow-hidden border-b bg-[radial-gradient(ellipse_at_top_left,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_60%),radial-gradient(ellipse_at_bottom_right,color-mix(in_srgb,#ffd43b_16%,transparent),transparent_55%)]">
        <div className="mx-auto flex max-w-5xl flex-col items-center px-5 py-14 text-center sm:px-8 sm:py-16">
          <AppMark className="mb-5 size-12" />
          <h1 className="text-[1.875rem] leading-tight font-semibold tracking-[-0.025em] sm:text-[2.375rem]">
            {t.help.heroTitle}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
            {t.help.heroBody}
          </p>
          <div className="mt-7 flex w-full justify-center">
            <HelpSearch variant="hero" />
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
            {HOME.popular.map(({ topic, label }) => (
              <a
                key={topic}
                href={`#/help/${topic}`}
                className="rounded-full border bg-card/80 px-3 py-1 text-foreground/80 shadow-xs hover:border-primary/40 hover:text-primary dark:hover:text-primary-soft-foreground"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <h2 className="mt-12 mb-5 text-xl font-semibold tracking-[-0.01em]">{t.help.quickStart}</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {quick.map(({ topic, shot }) => (
            <a
              key={topic.id}
              href={`#/help/${topic.id}`}
              className="group overflow-hidden rounded-2xl border bg-card shadow-card transition-shadow outline-none hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="pointer-events-none border-b bg-workspace [&_figure]:my-0 [&_figure_button]:rounded-none [&_figure_button]:border-0 [&_figure_button]:shadow-none">
                <Figure figure={{ type: 'figure', shot }} />
              </div>
              <div className="p-4">
                <p className="flex items-center gap-1.5 font-semibold group-hover:text-primary dark:group-hover:text-primary-soft-foreground">
                  {topic.title}
                  <ArrowUpRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {topic.summary}
                </p>
              </div>
            </a>
          ))}
        </div>

        <h2 className="mt-14 mb-5 text-xl font-semibold tracking-[-0.01em]">{t.help.categories}</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((category) => (
            <section
              key={category.id}
              className="flex flex-col rounded-2xl border bg-card p-5 shadow-card"
              data-testid="help-category"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                  {createElement(helpIcon(category.icon), {
                    className: 'size-5',
                    'aria-hidden': true,
                  })}
                </span>
                <div>
                  <h3 className="font-semibold">{category.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {format(t.help.topicsCount, { n: category.topics.length })}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {category.description}
              </p>
              <ul className="mt-3 flex flex-col gap-0.5 text-sm">
                {category.topics.map((topic) => (
                  <li key={topic.id}>
                    <a
                      href={`#/help/${topic.id}`}
                      className="flex items-center gap-1.5 rounded-md py-1 text-foreground/85 hover:text-primary dark:hover:text-primary-soft-foreground"
                    >
                      <ChevronRight
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      {topic.title}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="mt-14 rounded-2xl border bg-card p-6 shadow-card">
          <h2 className="text-lg font-semibold">{HOME.keysTitle}</h2>
          <div className="mt-4 grid gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {HOME.keys.map(([keys, label]) => (
              <div key={keys} className="flex items-center justify-between gap-3">
                <span className="text-foreground/85">{label}</span>
                <Kbd shortcut={keys} />
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm">
            <a
              href="#/help/phim-tat"
              className="font-medium text-primary hover:underline dark:text-primary-soft-foreground"
            >
              {HOME.keysLink}
            </a>
          </p>
        </section>
        <p className="mt-10 text-center text-xs text-muted-foreground">
          {format(t.help.version, { version: APP_VERSION })} ·{' '}
          {format(t.help.figureNote, { version: SHOTS_VERSION })}
        </p>
      </div>
    </div>
  );
}

function TopicNotFound() {
  return (
    <div
      className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center"
      data-testid="help-not-found"
    >
      <h1 className="text-lg font-semibold">{t.help.notFoundTitle}</h1>
      <p className="text-muted-foreground">{t.help.notFoundBody}</p>
      <div className="mt-2 w-full">
        <HelpSearch variant="hero" autoFocus />
      </div>
      <a
        href="#/help"
        className="mt-2 text-sm font-medium text-primary hover:underline dark:text-primary-soft-foreground"
      >
        {t.help.home}
      </a>
    </div>
  );
}

/**
 * Trung tâm hướng dẫn (`#/help`): trang chính, bài theo chủ đề, tìm kiếm toàn văn. Nội dung là dữ
 * liệu trong `content/`; ảnh minh họa chụp từ app thật bằng `npm run guide:shots`.
 */
export function HelpScreen({
  topicId,
  section,
}: {
  topicId: string | null;
  section: string | null;
}) {
  const scroller = useRef<HTMLElement>(null);
  const [navOpen, setNavOpen] = useState(false);
  const topic = topicId === null ? null : findTopic(topicId);

  useEffect(() => {
    document.title = `${topic ? topic.title : t.help.title} — ${t.app.name}`;
  }, [topic]);

  // Đổi bài: lên đầu trang; có mục: cuộn tới mục đó.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const target = section ? document.getElementById(section) : null;
    if (target) target.scrollIntoView({ block: 'start' });
    else root.scrollTop = 0;
  }, [topicId, section]);

  return (
    <div className="flex h-full flex-col" data-testid="help-screen">
      <TopBar
        start={
          <>
            <button
              type="button"
              aria-label={navOpen ? t.help.menuClose : t.help.menuToggle}
              className="flex size-8 items-center justify-center rounded-md hover:bg-accent lg:hidden"
              onClick={() => {
                setNavOpen((v) => !v);
              }}
            >
              {navOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <a
              href="#/help"
              className="flex min-w-0 items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-accent"
            >
              <AppMark />
              <span className="truncate text-[0.9375rem] font-semibold tracking-[-0.01em]">
                {t.app.name}
              </span>
              <span className="hidden rounded-md bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary-soft-foreground sm:inline">
                {t.help.short}
              </span>
            </a>
          </>
        }
        center={
          topic !== null || topicId !== null ? (
            <div className="hidden w-[22rem] md:block">
              <HelpSearch />
            </div>
          ) : null
        }
        end={
          <>
            <Button asChild size="sm" data-testid="help-open-app">
              <a href="#/">
                <span className="hidden sm:inline">{t.help.openApp}</span>
                <span className="sm:hidden">{t.help.openAppShort}</span>
              </a>
            </Button>
            <ThemeMenu />
          </>
        }
      />
      <div className="relative flex min-h-0 flex-1">
        <aside className="hidden w-[17rem] shrink-0 overflow-y-auto border-r bg-background lg:block">
          <Sidebar current={topic?.id ?? null} />
        </aside>
        {navOpen && (
          <div className="absolute inset-0 z-30 flex lg:hidden">
            <aside className="w-[min(20rem,86vw)] overflow-y-auto border-r bg-background shadow-island">
              <div className="px-4 pt-4">
                <HelpSearch
                  onNavigate={() => {
                    setNavOpen(false);
                  }}
                />
              </div>
              <Sidebar
                current={topic?.id ?? null}
                onNavigate={() => {
                  setNavOpen(false);
                }}
              />
            </aside>
            <button
              type="button"
              aria-label={t.help.menuClose}
              className="flex-1 bg-black/30"
              onClick={() => {
                setNavOpen(false);
              }}
            />
          </div>
        )}
        <main
          ref={scroller}
          id="main"
          tabIndex={-1}
          className="min-w-0 flex-1 overflow-y-auto scroll-smooth bg-background outline-none"
        >
          {topicId === null ? (
            <HelpHome />
          ) : topic ? (
            <TopicPage key={topic.id} topic={topic} scroller={scroller} />
          ) : (
            <TopicNotFound />
          )}
        </main>
      </div>
    </div>
  );
}
