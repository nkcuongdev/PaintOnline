import { CircleAlert, Info, Lightbulb, Link2, TriangleAlert, type LucideIcon } from 'lucide-react';
import { createElement, Fragment, useMemo } from 'react';
import { GROUP_ORDER, groupLabel, shortcutRows, type GroupId } from '@/app/dialogs/shortcutRows';
import { Kbd } from '@/app/shared/Kbd';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { Figure } from './Figure';
import { helpIcon, toolIconOf } from './icons';
import { Inline } from './inline';
import { resolveHref, toolShortcut } from './markup';
import type { Block, CalloutTone, Step } from './types';

const CALLOUTS: Readonly<
  Record<CalloutTone, { icon: LucideIcon; className: string; iconClass: string }>
> = {
  note: {
    icon: Info,
    className: 'border-primary/25 bg-primary-soft/55',
    iconClass: 'text-primary dark:text-primary-soft-foreground',
  },
  tip: {
    icon: Lightbulb,
    className: 'border-success/30 bg-success/[0.07]',
    iconClass: 'text-success',
  },
  warning: {
    icon: TriangleAlert,
    className: 'border-warning/35 bg-warning/[0.08]',
    iconClass: 'text-warning',
  },
  important: {
    icon: CircleAlert,
    className: 'border-destructive/30 bg-destructive/[0.06]',
    iconClass: 'text-destructive',
  },
};

function Callout({
  tone,
  title,
  text,
}: {
  tone: CalloutTone;
  title?: string;
  text: string | readonly string[];
}) {
  const style = CALLOUTS[tone];
  const paragraphs = typeof text === 'string' ? [text] : text;
  return (
    <aside
      className={cn('my-5 flex gap-3 rounded-xl border px-4 py-3.5', style.className)}
      data-help-callout={tone}
    >
      {createElement(style.icon, {
        className: cn('mt-0.5 size-[18px] shrink-0', style.iconClass),
        'aria-hidden': true,
      })}
      <div className="min-w-0 space-y-1.5 text-[0.9375rem] leading-relaxed">
        <p className={cn('font-semibold', style.iconClass)}>{title ?? t.help.callouts[tone]}</p>
        {paragraphs.map((p, i) => (
          <p key={i} className="text-foreground/90">
            <Inline text={p} />
          </p>
        ))}
      </div>
    </aside>
  );
}

function Steps({ items }: { items: readonly (string | Step)[] }) {
  return (
    <ol className="my-6 space-y-0" data-help-steps>
      {items.map((item, index) => {
        const step = typeof item === 'string' ? { text: item } : item;
        const last = index === items.length - 1;
        return (
          <li key={index} className="relative flex gap-4 pb-5">
            {!last && (
              <span
                aria-hidden="true"
                className="absolute top-8 bottom-0 left-[0.9375rem] w-px bg-border"
              />
            )}
            <span className="relative z-[1] flex size-[1.875rem] shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-[0_0_0_4px_var(--background)]">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 pt-1">
              {step.title && <p className="mb-0.5 font-semibold">{step.title}</p>}
              <p className="leading-relaxed text-foreground/90">
                <Inline text={step.text} />
              </p>
              {step.figure && <Figure figure={step.figure} />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ShortcutTable({ groups }: { groups: readonly GroupId[] }) {
  const rows = useMemo(() => shortcutRows(), []);
  return (
    <div className="my-6 grid gap-5 md:grid-cols-2" data-help-shortcuts>
      {GROUP_ORDER.filter((g) => groups.includes(g)).map((group) => (
        <section key={group} className="rounded-xl border bg-card p-4 shadow-card">
          <h4 className="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {groupLabel(group)}
          </h4>
          <dl className="grid gap-1.5">
            {rows
              .filter((row) => row.group === group)
              .map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3 text-sm">
                  <dt className="min-w-0">{row.label}</dt>
                  <dd className="flex max-w-[60%] shrink-0 flex-wrap items-center justify-end gap-1">
                    {row.keys.map((key, index) => (
                      <Fragment key={key}>
                        {index > 0 && <span className="text-xs text-muted-foreground">/</span>}
                        <Kbd shortcut={key} />
                      </Fragment>
                    ))}
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

function SectionHeading({ id, text, topic }: { id: string; text: string; topic: string }) {
  return (
    <h2
      id={id}
      className="group mt-12 mb-4 scroll-mt-20 border-t pt-8 text-[1.375rem] font-semibold tracking-[-0.015em] first:mt-2 first:border-t-0 first:pt-0"
    >
      {text}
      <a
        href={`#/help/${topic}/${id}`}
        aria-label={text}
        className="ml-2 inline-flex translate-y-0.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground hover:text-primary focus-visible:text-primary dark:hover:text-primary-soft-foreground"
      >
        <Link2 className="size-4" />
      </a>
    </h2>
  );
}

function renderBlock(block: Block, key: number, topic: string) {
  switch (block.type) {
    case 'p':
      return (
        <p key={key} className="my-4 leading-[1.75] text-foreground/90">
          <Inline text={block.text} />
        </p>
      );
    case 'h2':
      return <SectionHeading key={key} id={block.id} text={block.text} topic={topic} />;
    case 'h3':
      return (
        <h3 key={key} className="mt-8 mb-2 text-[1.0625rem] font-semibold">
          {block.text}
        </h3>
      );
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag
          key={key}
          className={cn(
            'my-4 space-y-2 pl-6 leading-relaxed text-foreground/90 marker:text-primary/70',
            block.ordered ? 'list-decimal' : 'list-disc',
          )}
        >
          {block.items.map((item, i) => (
            <li key={i} className="pl-1">
              <Inline text={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case 'steps':
      return <Steps key={key} items={block.items} />;
    case 'callout':
      return <Callout key={key} tone={block.tone} title={block.title} text={block.text} />;
    case 'figure':
      return <Figure key={key} figure={block} />;
    case 'gallery':
      return (
        <div key={key} className="my-2 grid gap-x-5 sm:grid-cols-2">
          {block.items.map((figure) => (
            <Figure key={figure.shot} figure={{ ...figure, size: 'full' }} />
          ))}
        </div>
      );
    case 'table':
      return (
        <div key={key} className="my-6 overflow-x-auto rounded-xl border shadow-card">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-muted/70">
              <tr>
                {block.head.map((h) => (
                  <th key={h} className="px-4 py-2.5 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-t align-top">
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className={cn('px-4 py-2.5 leading-relaxed', j === 0 && 'font-medium')}
                    >
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'shortcuts':
      return (
        <div key={key}>
          <p className="my-4 text-sm text-muted-foreground">{t.help.shortcutsIntro}</p>
          <ShortcutTable groups={block.groups} />
        </div>
      );
    case 'keys':
      return (
        <div key={key} className="my-6 overflow-hidden rounded-xl border bg-card shadow-card">
          <table className="w-full border-collapse text-sm">
            <thead className="sr-only">
              <tr>
                <th>{t.help.shortcutKey}</th>
                <th>{t.help.shortcutAction}</th>
              </tr>
            </thead>
            <tbody>
              {block.rows.map(([keys, action], i) => (
                <tr key={i} className="border-t align-top first:border-t-0">
                  <td className="w-[38%] px-4 py-2.5 font-medium whitespace-nowrap">
                    <Inline text={keys} />
                  </td>
                  <td className="px-4 py-2.5 leading-relaxed text-foreground/90">
                    <Inline text={action} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'tools':
      return (
        <div key={key} className="my-6 grid gap-3 sm:grid-cols-2" data-help-tools>
          {block.items.map(({ tool, text }) => {
            const shortcut = toolShortcut(tool);
            return (
              <div key={tool} className="flex gap-3 rounded-xl border bg-card p-3.5 shadow-card">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
                  {createElement(toolIconOf(tool), { className: 'size-5', 'aria-hidden': true })}
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {t.tools[tool]}
                    {shortcut ? (
                      <Kbd shortcut={shortcut} />
                    ) : (
                      <span className="text-xs font-normal text-muted-foreground">
                        {t.help.noShortcut}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                    <Inline text={text} />
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      );
    case 'options':
      return (
        <dl key={key} className="my-5 divide-y rounded-xl border bg-card shadow-card">
          {block.items.map(([name, text], i) => (
            <div key={i} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
              <dt className="font-semibold">
                <Inline text={name} />
              </dt>
              <dd className="text-sm leading-relaxed text-foreground/85">
                <Inline text={text} />
              </dd>
            </div>
          ))}
        </dl>
      );
    case 'cards':
      return (
        <div key={key} className="my-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {block.items.map((card) => {
            const body = (
              <>
                <span className="mb-2.5 flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
                  {createElement(helpIcon(card.icon), {
                    className: 'size-[18px]',
                    'aria-hidden': true,
                  })}
                </span>
                <p className="font-semibold">{card.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  <Inline text={card.text} />
                </p>
              </>
            );
            const className = 'block rounded-xl border bg-card p-4 shadow-card';
            return card.link ? (
              <a
                key={card.title}
                href={resolveHref(card.link).url}
                className={cn(
                  className,
                  'transition-shadow outline-none hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                {body}
              </a>
            ) : (
              <div key={card.title} className={className}>
                {body}
              </div>
            );
          })}
        </div>
      );
  }
}

/** Nội dung một bài: các khối theo thứ tự. */
export function TopicBlocks({ blocks, topic }: { blocks: readonly Block[]; topic: string }) {
  return <>{blocks.map((block, i) => renderBlock(block, i, topic))}</>;
}
