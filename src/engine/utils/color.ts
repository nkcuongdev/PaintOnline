import type { Color } from '../core/types';

/** Màu dạng số 0..255 cho từng kênh. */
export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX_PATTERN = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isColor(value: unknown): value is Color {
  return typeof value === 'string' && HEX_PATTERN.test(value);
}

/**
 * Chuẩn hóa `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA` về `#RRGGBBAA` chữ hoa (quy ước mục 6).
 * Trả `null` nếu không hợp lệ.
 */
export function normalizeColor(value: string): Color | null {
  const match = HEX_PATTERN.exec(value.trim());
  if (!match) return null;
  let hex = match[1].toUpperCase();
  if (hex.length === 3 || hex.length === 4) {
    // Chỉ chứa ký tự hex ASCII nên tách theo ký tự là an toàn.
    hex = Array.from(hex, (c) => c + c).join('');
  }
  if (hex.length === 6) hex += 'FF';
  return `#${hex}`;
}

export function parseColor(color: Color): RGBA {
  const normalized = normalizeColor(color);
  if (normalized === null) throw new Error(`Màu không hợp lệ: ${color}`);
  const n = Number.parseInt(normalized.slice(1), 16);
  return {
    r: (n >>> 24) & 0xff,
    g: (n >>> 16) & 0xff,
    b: (n >>> 8) & 0xff,
    a: n & 0xff,
  };
}

function hex2(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

export function formatColor({ r, g, b, a }: RGBA): Color {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a)}`;
}

/** Chuỗi CSS dùng cho Canvas 2D (`fillStyle`, `strokeStyle`). */
export function colorToCss(color: Color): string {
  const { r, g, b, a } = parseColor(color);
  return a === 255 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${(a / 255).toFixed(4)})`;
}

/** Màu đặc (bỏ kênh alpha) — dùng khi opacity được áp dụng riêng. */
export function opaqueColor(color: Color): Color {
  return formatColor({ ...parseColor(color), a: 255 });
}
