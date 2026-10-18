import type { Rect, TextFont, TextObject } from '../../core/types';

/** Đo độ rộng chuỗi với một font CSS (Canvas `measureText`). */
export type MeasureText = (font: string, text: string) => number;

export interface TextLayout {
  lines: string[];
  /** Độ rộng từng dòng (px document). */
  widths: number[];
  /** Khung chữ chưa xoay, gốc tại `origin` (chưa gồm phần đệm nền). */
  box: Rect;
  /** Khoảng cách giữa hai dòng. */
  advance: number;
  /** Phần đệm của nền chữ quanh khung. */
  padding: number;
}

/** Chuỗi font CSS cho Canvas và textarea — cùng một chuỗi để hai bên đo giống nhau. */
export function fontCss(font: Readonly<TextFont>): string {
  const family = /^[\w-]+$/.test(font.family) ? font.family : `"${font.family.replace(/"/g, '')}"`;
  return `${font.italic ? 'italic ' : ''}${String(font.weight)} ${String(font.size)}px ${family}, sans-serif`;
}

/** Phần đệm của nền chữ (theo cỡ chữ). */
export function textPadding(size: number): number {
  return Math.round(size * 0.22 * 100) / 100;
}

let segmenter: Intl.Segmenter | null | undefined;

/** Tách chuỗi thành grapheme (ký tự người đọc thấy) — không cắt giữa dấu tiếng Việt tổ hợp. */
function graphemes(text: string): string[] {
  if (segmenter === undefined) {
    segmenter =
      typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter('vi', { granularity: 'grapheme' })
        : null;
  }
  if (!segmenter) return Array.from(text);
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

/**
 * Xuống dòng theo độ rộng khung: ngắt ở khoảng trắng; một từ dài hơn khung thì ngắt theo ký tự
 * (giống `overflow-wrap: break-word` của textarea). Khoảng trắng cuối dòng không tính độ rộng.
 */
export function wrapParagraph(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  if (text === '') return [''];
  const tokens = text.split(/(\s+)/).filter((token) => token !== '');
  const lines: string[] = [];
  let line = '';
  const flush = () => {
    lines.push(line.replace(/\s+$/, ''));
    line = '';
  };
  for (const token of tokens) {
    const isSpace = /^\s+$/.test(token);
    if (isSpace) {
      if (line !== '') line += token;
      continue;
    }
    const candidate = line + token;
    if (measure(candidate.replace(/\s+$/, '')) <= maxWidth || line === '') {
      if (line === '' && measure(token) > maxWidth) {
        // Từ dài hơn cả khung: ngắt theo ký tự.
        for (const g of graphemes(token)) {
          if (line !== '' && measure(line + g) > maxWidth) flush();
          line += g;
        }
      } else {
        line = candidate;
      }
      continue;
    }
    flush();
    if (measure(token) > maxWidth) {
      for (const g of graphemes(token)) {
        if (line !== '' && measure(line + g) > maxWidth) flush();
        line += g;
      }
    } else {
      line = token;
    }
  }
  lines.push(line.replace(/\s+$/, ''));
  return lines;
}

/** Bố cục chữ: các dòng, độ rộng và khung (mục 5.10). */
export function layoutText(obj: Readonly<TextObject>, measure: MeasureText): TextLayout {
  const font = fontCss(obj.font);
  const m = (text: string) => measure(font, text);
  const paragraphs = obj.text.split(/\r\n|\r|\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (obj.wrapWidth !== null && obj.wrapWidth > 0) {
      lines.push(...wrapParagraph(paragraph, obj.wrapWidth, m));
    } else {
      lines.push(paragraph);
    }
  }
  const widths = lines.map((line) => m(line));
  const advance = obj.font.size * obj.lineHeight;
  // Chữ rỗng vẫn có khung tối thiểu để thấy con trỏ và chọn được.
  const contentWidth = Math.max(obj.font.size * 0.5, ...widths);
  return {
    lines,
    widths,
    box: {
      x: obj.origin.x,
      y: obj.origin.y,
      width: obj.wrapWidth ?? contentWidth,
      height: Math.max(1, lines.length) * advance,
    },
    advance,
    padding: textPadding(obj.font.size),
  };
}
