import { displayShortcut, getCommand } from '@/commands';
import { getGlobalCommand } from '@/commands/global';
import { formatShortcut } from '@/app/shared/shortcut';
import type { ToolId } from '@/engine/core/types';
import { FILL_TOOLS, MARQUEE_TOOLS, SHAPE_TOOLS, TOOL_DEFINITIONS } from '@/engine/tools/registry';
import { t } from '@/i18n';
import { platformFeatures } from '@/services/platform/features';

/**
 * Cú pháp nội dòng của bài hướng dẫn (xem `Rich` trong types.ts). Tách thành token thuần để dùng
 * chung cho hiển thị (inline.tsx), tìm kiếm (search.ts) và test kiểm tra nội dung.
 */
export type InlineToken =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; children: InlineToken[] }
  | { kind: 'code'; text: string }
  | { kind: 'keys'; shortcut: string }
  | { kind: 'tool'; id: string }
  | { kind: 'cmd'; id: string }
  | { kind: 'ui'; text: string }
  | { kind: 'icon'; name: string }
  | { kind: 'link'; text: string; href: string };

const PATTERN =
  /\*\*(.+?)\*\*|`([^`]+)`|\[\[(.+?)\]\](?!\])|\{(tool|cmd|ui|icon):([^}]+)\}|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(source: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  for (const match of source.matchAll(PATTERN)) {
    const index = match.index;
    if (index > last) tokens.push({ kind: 'text', text: source.slice(last, index) });
    last = index + match[0].length;
    // Nhóm không khớp là undefined (kiểu của RegExp không thể hiện điều này).
    const [bold, code, keys, prefix, value, linkText, href] = match.slice(1) as (
      string | undefined
    )[];
    if (bold !== undefined) tokens.push({ kind: 'bold', children: parseInline(bold) });
    else if (code !== undefined) tokens.push({ kind: 'code', text: code });
    else if (keys !== undefined) tokens.push({ kind: 'keys', shortcut: keys });
    else if (prefix !== undefined && value !== undefined) {
      if (prefix === 'ui') tokens.push({ kind: 'ui', text: value });
      else if (prefix === 'icon') tokens.push({ kind: 'icon', name: value });
      else tokens.push({ kind: prefix === 'tool' ? 'tool' : 'cmd', id: value });
    } else if (linkText !== undefined && href !== undefined) {
      tokens.push({ kind: 'link', text: linkText, href });
    }
  }
  if (last < source.length) tokens.push({ kind: 'text', text: source.slice(last) });
  return tokens;
}

export function isToolId(id: string): id is ToolId {
  return TOOL_DEFINITIONS.some((d) => d.id === id);
}

/**
 * Phím tắt của công cụ như trên tool island: hình khối dùng chung U, kiểu chọn vùng dùng chung M,
 * tô màu/Gradient dùng chung G, Pan là giữ Space.
 */
export function toolShortcut(id: ToolId): string | undefined {
  if (SHAPE_TOOLS.includes(id)) return displayShortcut('tool.shapes');
  if (MARQUEE_TOOLS.includes(id)) return displayShortcut('tool.marquee');
  if (FILL_TOOLS.includes(id)) return displayShortcut('tool.fill');
  if (id === 'pan') return 'Space';
  return displayShortcut(`tool.${id}`);
}

/** Lệnh của editor hoặc lệnh cấp ứng dụng: nhãn và phím tắt hiển thị. */
export function commandInfo(id: string): { label: string; shortcut?: string } | null {
  const command = getCommand(id);
  if (command) return { label: command.label(), shortcut: displayShortcut(id) };
  const global = getGlobalCommand(id);
  if (global) return { label: global.label(), shortcut: global.shortcuts?.[0] };
  return null;
}

/** Liên kết nội bộ `ma-bai` / `ma-bai#ma-muc` → hash route; liên kết ngoài giữ nguyên. */
export function resolveHref(href: string): { url: string; external: boolean } {
  if (/^https?:\/\//.test(href)) return { url: href, external: true };
  const [topic = '', section] = href.split('#');
  return { url: section ? `#/help/${topic}/${section}` : `#/help/${topic}`, external: false };
}

/** Chữ thuần của chuỗi Rich (tìm kiếm, ước lượng thời gian đọc). */
export function toPlain(source: string): string {
  return parseInline(source).map(plainToken).join('');
}

function plainToken(token: InlineToken): string {
  switch (token.kind) {
    case 'text':
    case 'code':
    case 'ui':
    case 'link':
      return token.text;
    case 'bold':
      return token.children.map(plainToken).join('');
    case 'keys':
      return formatShortcut(token.shortcut, platformFeatures.isApple);
    case 'tool':
      return isToolId(token.id) ? t.tools[token.id] : token.id;
    case 'cmd':
      return commandInfo(token.id)?.label ?? token.id;
    case 'icon':
      return '';
  }
}
