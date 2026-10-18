import { stripDiacritics } from '@/lib/text';
import { toPlain } from './markup';
import type { Block, Topic } from './types';

/**
 * Tìm kiếm toàn văn trong hướng dẫn (không phân biệt hoa thường và dấu: "che thong tin" khớp
 * "Che thông tin"). Chỉ mục chia theo mục (h2) của từng bài để kết quả dẫn thẳng tới đúng mục.
 */

export interface SearchEntry {
  topic: Topic;
  category: string;
  /** null = phần mở đầu của bài. */
  section: { id: string; title: string } | null;
  text: string;
}

export interface SearchResult {
  entry: SearchEntry;
  score: number;
  /** Đoạn trích quanh chỗ khớp: [trước, khớp, sau]. */
  snippet: readonly [string, string, string] | null;
}

function normalize(text: string): string {
  return stripDiacritics(text.toLowerCase());
}

/** Chữ thuần của một khối (gồm chú thích ảnh, ô bảng, thẻ). */
export function blockText(block: Block): string {
  switch (block.type) {
    case 'p':
      return toPlain(block.text);
    case 'h2':
    case 'h3':
      return block.text;
    case 'list':
      return block.items.map(toPlain).join(' ');
    case 'steps':
      return block.items
        .map((item) =>
          typeof item === 'string'
            ? toPlain(item)
            : [
                item.title ?? '',
                toPlain(item.text),
                item.figure?.caption ? toPlain(item.figure.caption) : '',
              ].join(' '),
        )
        .join(' ');
    case 'callout':
      return [
        block.title ?? '',
        ...(typeof block.text === 'string' ? [block.text] : block.text).map(toPlain),
      ].join(' ');
    case 'figure':
      return [block.caption ?? '', ...(block.markers ?? []).map((m) => m.label)]
        .map(toPlain)
        .join(' ');
    case 'gallery':
      return block.items.map((f) => toPlain(f.caption ?? '')).join(' ');
    case 'table':
      return [block.head.join(' '), ...block.rows.map((r) => r.map(toPlain).join(' '))].join(' ');
    case 'shortcuts':
      return '';
    case 'keys':
      return block.rows.map(([k, a]) => `${toPlain(k)} ${toPlain(a)}`).join(' ');
    case 'tools':
      return block.items
        .map((i) => `{tool:${i.tool}} ${i.text}`)
        .map(toPlain)
        .join(' ');
    case 'options':
      return block.items.map(([n, d]) => `${toPlain(n)} ${toPlain(d)}`).join(' ');
    case 'cards':
      return block.items.map((c) => `${c.title} ${toPlain(c.text)}`).join(' ');
  }
}

export function topicText(topic: Topic): string {
  return topic.blocks.map(blockText).join(' ');
}

export function buildIndex(
  categories: readonly { title: string; topics: readonly Topic[] }[],
): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const category of categories) {
    for (const topic of category.topics) {
      let current: SearchEntry = { topic, category: category.title, section: null, text: '' };
      entries.push(current);
      for (const block of topic.blocks) {
        if (block.type === 'h2') {
          current = {
            topic,
            category: category.title,
            section: { id: block.id, title: block.text },
            text: '',
          };
          entries.push(current);
          continue;
        }
        current.text += ` ${blockText(block)}`;
      }
    }
  }
  for (const entry of entries) entry.text = entry.text.replace(/\s+/g, ' ').trim();
  return entries;
}

/** Vị trí khớp trên chuỗi đã chuẩn hóa → vị trí trên chuỗi gốc (bỏ dấu làm đổi độ dài). */
function findOriginal(text: string, query: string): [number, number] | null {
  let normalized = '';
  const map: number[] = [];
  let i = 0;
  for (const ch of text) {
    const n = normalize(ch);
    map.push(...Array<number>(n.length).fill(i));
    normalized += n;
    i += ch.length;
  }
  const at = normalized.indexOf(query);
  if (at < 0) return null;
  const start = map[at] ?? 0;
  const end = (map[at + query.length - 1] ?? start) + 1;
  return [start, end];
}

function snippetOf(text: string, query: string, words: readonly string[]): SearchResult['snippet'] {
  const hit =
    findOriginal(text, query) ?? words.map((w) => findOriginal(text, w)).find((h) => h !== null);
  if (!hit) return null;
  const [start, end] = hit;
  const from = Math.max(0, start - 60);
  const to = Math.min(text.length, end + 90);
  return [
    `${from > 0 ? '…' : ''}${text.slice(from, start)}`,
    text.slice(start, end),
    `${text.slice(end, to)}${to < text.length ? '…' : ''}`,
  ];
}

/** Từ có độ dài 1 (vd. "a") bỏ qua khi khớp từng từ, trừ khi truy vấn chỉ có từ đó. */
function wordsOf(query: string): string[] {
  const words = query.split(/\s+/).filter((w) => w.length > 0);
  const long = words.filter((w) => w.length > 1);
  return long.length > 0 ? long : words;
}

export function search(entries: readonly SearchEntry[], raw: string, limit = 24): SearchResult[] {
  const query = normalize(raw.trim()).replace(/\s+/g, ' ');
  if (query === '') return [];
  const words = wordsOf(query);
  const results: SearchResult[] = [];
  for (const entry of entries) {
    const title = normalize(entry.topic.title);
    const section = normalize(entry.section?.title ?? '');
    const body = normalize(entry.text);
    const intro = entry.section === null;
    const keywords = intro
      ? normalize(`${entry.topic.summary} ${(entry.topic.keywords ?? []).join(' ')}`)
      : '';
    const all = `${intro ? title : ''} ${section} ${keywords} ${body}`;
    if (!words.every((w) => all.includes(w))) continue;
    let score = 1;
    if (intro && title.includes(query))
      score += title === query ? 160 : title.startsWith(query) ? 120 : 90;
    if (section.includes(query)) score += 70;
    if (keywords.includes(query)) score += 50;
    // Từ khóa trùng khớp hẳn (vd. "layer") ưu tiên bài chuyên về chủ đề đó.
    if (intro && (entry.topic.keywords ?? []).some((k) => normalize(k) === query)) score += 40;
    if (body.includes(query)) score += 25;
    for (const w of words) {
      if (intro && title.includes(w)) score += 12;
      if (section.includes(w)) score += 8;
      if (keywords.includes(w)) score += 6;
    }
    results.push({ entry, score, snippet: snippetOf(entry.text, query, words) });
  }
  results.sort((a, b) => b.score - a.score);
  // Mỗi bài tối đa 3 kết quả để danh sách không bị một bài dài chiếm hết.
  const perTopic = new Map<string, number>();
  return results
    .filter((r) => {
      const n = perTopic.get(r.entry.topic.id) ?? 0;
      perTopic.set(r.entry.topic.id, n + 1);
      return n < 3;
    })
    .slice(0, limit);
}
