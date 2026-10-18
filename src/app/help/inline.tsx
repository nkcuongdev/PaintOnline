import { createElement, Fragment, type ReactNode } from 'react';
import { Kbd } from '@/app/shared/Kbd';
import { t } from '@/i18n';
import { helpIcon, toolIconOf } from './icons';
import {
  commandInfo,
  isToolId,
  parseInline,
  resolveHref,
  toolShortcut,
  type InlineToken,
} from './markup';

const CHIP =
  'mx-0.5 inline-flex items-baseline gap-1 rounded-md border border-border bg-card px-1.5 py-px align-baseline text-[0.9em] font-medium whitespace-nowrap text-foreground shadow-[0_1px_0_var(--border)] [&_svg]:size-[1.05em] [&_svg]:translate-y-[0.15em] [&_svg]:text-primary';

function renderToken(token: InlineToken, key: number): ReactNode {
  switch (token.kind) {
    case 'text':
      return <Fragment key={key}>{token.text}</Fragment>;
    case 'bold':
      return (
        <strong key={key} className="font-semibold text-foreground">
          {token.children.map(renderToken)}
        </strong>
      );
    case 'code':
      return (
        <code
          key={key}
          className="rounded bg-muted px-1 py-px font-mono text-[0.88em] text-foreground"
        >
          {token.text}
        </code>
      );
    case 'keys':
      return <Kbd key={key} shortcut={token.shortcut} className="mx-0.5 align-[0.1em]" />;
    case 'tool': {
      if (!isToolId(token.id)) return <Fragment key={key}>{token.id}</Fragment>;
      const shortcut = toolShortcut(token.id);
      return (
        <span key={key} className={CHIP} data-help-tool={token.id}>
          {createElement(toolIconOf(token.id), { 'aria-hidden': true })}
          {t.tools[token.id]}
          {shortcut && <Kbd shortcut={shortcut} className="ml-0.5 align-[0.05em]" />}
        </span>
      );
    }
    case 'cmd': {
      const info = commandInfo(token.id);
      if (!info) return <Fragment key={key}>{token.id}</Fragment>;
      return (
        <span key={key} className={CHIP}>
          {info.label}
          {info.shortcut && <Kbd shortcut={info.shortcut} className="ml-0.5 align-[0.05em]" />}
        </span>
      );
    }
    case 'ui':
      return (
        <span key={key} className={CHIP}>
          {token.text}
        </span>
      );
    case 'icon':
      return (
        <span
          key={key}
          className="mx-0.5 inline-flex size-[1.45em] translate-y-[0.3em] items-center justify-center rounded-md border border-border bg-card text-foreground/80 shadow-[0_1px_0_var(--border)] [&_svg]:size-[0.95em]"
        >
          {createElement(helpIcon(token.name), { 'aria-hidden': true })}
        </span>
      );
    case 'link': {
      const { url, external } = resolveHref(token.href);
      return (
        <a
          key={key}
          href={url}
          className="font-medium text-primary underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary dark:text-primary-soft-foreground"
          {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
        >
          {token.text}
        </a>
      );
    }
  }
}

/** Hiển thị chuỗi Rich của bài hướng dẫn. */
export function Inline({ text }: { text: string }) {
  return <>{parseInline(text).map(renderToken)}</>;
}
