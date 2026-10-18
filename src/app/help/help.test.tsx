import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getCommand } from '@/commands';
import { getGlobalCommand } from '@/commands/global';
import { TooltipProvider } from '@/components/ui/tooltip';
import { allTopics, CATEGORIES, findTopic, HOME, searchIndex } from './content';
import { HelpScreen } from './HelpScreen';
import { hasHelpIcon } from './icons';
import { isToolId, parseInline, type InlineToken } from './markup';
import { search } from './search';
import { shotBox, shotInfo, shotNames } from './shots';
import type { Block, FigureBlock, Topic } from './types';

/**
 * Kiểm tra nội dung hướng dẫn luôn khớp app: mỗi liên kết, ảnh minh họa, vùng đánh dấu, công cụ,
 * lệnh và icon mà bài viết nhắc tới phải tồn tại. Sửa tên công cụ, xóa lệnh hay chụp lại ảnh mà
 * quên cập nhật bài viết sẽ làm test này đỏ.
 */

/** Tên các file ảnh có trong public/guide/shots (Vite liệt kê lúc chạy test). */
const SHOT_FILES = new Set(
  Object.keys(import.meta.glob('../../../public/guide/shots/*.webp')).map((path) =>
    path.replace(/^.*\/(.+)\.webp$/, '$1'),
  ),
);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Mọi chuỗi Rich trong một khối. */
function richOf(block: Block): string[] {
  switch (block.type) {
    case 'p':
      return [block.text];
    case 'h2':
    case 'h3':
    case 'shortcuts':
      return [];
    case 'list':
      return [...block.items];
    case 'steps':
      return block.items.flatMap((item) =>
        typeof item === 'string'
          ? [item]
          : [item.text, ...(item.figure ? figureRich(item.figure) : [])],
      );
    case 'callout':
      return typeof block.text === 'string' ? [block.text] : [...block.text];
    case 'figure':
      return figureRich(block);
    case 'gallery':
      return block.items.flatMap(figureRich);
    case 'table':
      return block.rows.flat();
    case 'keys':
      return block.rows.flat();
    case 'options':
      return block.items.flat();
    case 'tools':
      return block.items.map((i) => i.text);
    case 'cards':
      return block.items.map((c) => c.text);
  }
}

function figureRich(figure: FigureBlock): string[] {
  return [figure.caption ?? '', ...(figure.markers ?? []).map((m) => m.label)];
}

function figuresOf(block: Block): FigureBlock[] {
  if (block.type === 'figure') return [block];
  if (block.type === 'gallery') return [...block.items];
  if (block.type === 'steps') {
    return block.items.flatMap((item) =>
      typeof item !== 'string' && item.figure ? [item.figure] : [],
    );
  }
  return [];
}

function tokens(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  const walk = (list: InlineToken[]) => {
    for (const token of list) {
      out.push(token);
      if (token.kind === 'bold') walk(token.children);
    }
  };
  walk(parseInline(text));
  return out;
}

const topics = allTopics();

function richTexts(topic: Topic): string[] {
  return topic.blocks.flatMap(richOf);
}

function sectionExists(topicId: string, section: string | undefined): boolean {
  const topic = findTopic(topicId);
  if (!topic) return false;
  return section === undefined || topic.blocks.some((b) => b.type === 'h2' && b.id === section);
}

describe('mục lục hướng dẫn', () => {
  it('mã bài là duy nhất và hợp lệ trong URL', () => {
    const ids = topics.map((topic) => topic.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(SLUG);
  });

  it('mã mục trong một bài là duy nhất', () => {
    for (const topic of topics) {
      const ids = topic.blocks.flatMap((b) => (b.type === 'h2' ? [b.id] : []));
      expect(new Set(ids).size, topic.id).toBe(ids.length);
      for (const id of ids) expect(id, topic.id).toMatch(SLUG);
    }
  });

  it('icon của chủ đề và bài tồn tại', () => {
    for (const category of CATEGORIES) expect(hasHelpIcon(category.icon), category.id).toBe(true);
    for (const topic of topics) expect(hasHelpIcon(topic.icon), topic.id).toBe(true);
  });

  it('bài liên quan và trang chính trỏ tới bài có thật', () => {
    for (const topic of topics) {
      for (const related of topic.related ?? []) {
        expect(findTopic(related), `${topic.id} → ${related}`).toBeDefined();
        expect(related, topic.id).not.toBe(topic.id);
      }
    }
    for (const { topic } of [...HOME.quickStart, ...HOME.popular]) {
      expect(findTopic(topic), topic).toBeDefined();
    }
  });
});

describe('nội dung bài viết', () => {
  it('liên kết nội bộ trỏ tới bài và mục có thật', () => {
    for (const topic of topics) {
      const hrefs = [
        ...richTexts(topic).flatMap((text) =>
          tokens(text).flatMap((t) => (t.kind === 'link' ? [t.href] : [])),
        ),
        ...topic.blocks.flatMap((b) =>
          b.type === 'cards' ? b.items.flatMap((c) => (c.link ? [c.link] : [])) : [],
        ),
      ];
      for (const href of hrefs) {
        if (/^https?:\/\//.test(href)) continue;
        const [target = '', section] = href.split('#');
        expect(sectionExists(target, section), `${topic.id}: ${href}`).toBe(true);
      }
    }
  });

  it('công cụ, lệnh và icon được nhắc tới đều tồn tại', () => {
    for (const topic of topics) {
      for (const text of richTexts(topic)) {
        for (const token of tokens(text)) {
          if (token.kind === 'tool')
            expect(isToolId(token.id), `${topic.id}: ${token.id}`).toBe(true);
          if (token.kind === 'cmd') {
            expect(
              getCommand(token.id) ?? getGlobalCommand(token.id),
              `${topic.id}: ${token.id}`,
            ).toBeDefined();
          }
          if (token.kind === 'icon')
            expect(hasHelpIcon(token.name), `${topic.id}: ${token.name}`).toBe(true);
          if (token.kind === 'keys') expect(token.shortcut.trim(), topic.id).not.toBe('');
        }
      }
      for (const block of topic.blocks) {
        if (block.type === 'tools') {
          for (const item of block.items) expect(isToolId(item.tool), topic.id).toBe(true);
        }
        if (block.type === 'cards') {
          for (const card of block.items)
            expect(hasHelpIcon(card.icon), `${topic.id}: ${card.icon}`).toBe(true);
        }
      }
    }
  });

  it('không còn cú pháp nội dòng viết sai (ngoặc thừa)', () => {
    for (const topic of topics) {
      for (const text of richTexts(topic)) {
        const plain = tokens(text)
          .filter((t) => t.kind === 'text')
          .map((t) => (t.kind === 'text' ? t.text : ''))
          .join('');
        expect(plain, topic.id).not.toMatch(/\[\[|\]\]|\{(tool|cmd|ui|icon):|\*\*/);
      }
    }
  });
});

describe('ảnh minh họa', () => {
  const figures = topics.flatMap((topic) =>
    topic.blocks.flatMap(figuresOf).map((figure) => ({ topic: topic.id, figure })),
  );

  it('mỗi ảnh có trong manifest và có file', () => {
    const used = [...figures.map((f) => f.figure.shot), ...HOME.quickStart.map((q) => q.shot)];
    for (const shot of used) {
      expect(shotInfo(shot), shot).toBeDefined();
      expect(SHOT_FILES.has(shot), shot).toBe(true);
    }
  });

  it('điểm đánh dấu trỏ tới vùng đã đo lúc chụp', () => {
    for (const { topic, figure } of figures) {
      for (const marker of figure.markers ?? []) {
        expect(marker.target !== undefined || marker.at !== undefined, topic).toBe(true);
        if (marker.target) {
          expect(
            shotBox(figure.shot, marker.target),
            `${topic}: ${figure.shot}.${marker.target}`,
          ).not.toBeNull();
        }
      }
    }
  });

  it('không có ảnh thừa (chụp nhưng không bài nào dùng)', () => {
    const used = new Set([
      ...figures.map((f) => f.figure.shot),
      ...HOME.quickStart.map((q) => q.shot),
    ]);
    expect(shotNames().filter((name) => !used.has(name))).toEqual([]);
  });
});

describe('tìm kiếm', () => {
  it('không phân biệt dấu và đưa bài đúng lên đầu', () => {
    expect(search(searchIndex(), 'che thong tin')[0]?.entry.topic.id).toBe('che-thong-tin');
    expect(search(searchIndex(), 'layer')[0]?.entry.topic.id).toBe('layer');
  });

  it('tìm thấy cả nội dung bên trong bài', () => {
    const ids = search(searchIndex(), 'lam mo').map((r) => r.entry.topic.id);
    expect(ids).toContain('bo-loc');
  });

  it('truy vấn rỗng không trả kết quả', () => {
    expect(search(searchIndex(), '   ')).toEqual([]);
  });
});

describe('HelpScreen', () => {
  afterEach(cleanup);

  const renderHelp = (topicId: string | null, section: string | null = null) =>
    render(
      <TooltipProvider>
        <HelpScreen topicId={topicId} section={section} />
      </TooltipProvider>,
    );

  it('trang chính liệt kê mọi chủ đề', () => {
    renderHelp(null);
    expect(screen.getAllByTestId('help-category')).toHaveLength(CATEGORIES.length);
  });

  it.each(topics.map((topic) => [topic.id, topic.title]))('hiển thị bài %s', (id, title) => {
    renderHelp(id);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeTruthy();
  });

  it('bài không tồn tại có thông báo riêng', () => {
    renderHelp('khong-co-bai-nay');
    expect(screen.getByTestId('help-not-found')).toBeTruthy();
  });
});
