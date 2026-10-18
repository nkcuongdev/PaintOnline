import type { Color } from '@/engine/core/types';
import { formatColor, parseColor } from '@/engine/utils/color';

/** HSV + alpha theo quy ước của react-colorful: h 0–360, s/v 0–100, a 0–1. */
export interface Hsva {
  h: number;
  s: number;
  v: number;
  a: number;
}

export function colorToHsva(color: Color): Hsva {
  const { r, g, b, a } = parseColor(color);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : (d / max) * 100, v: max * 100, a: a / 255 };
}

export function hsvaToColor({ h, s, v, a }: Hsva): Color {
  const sn = Math.min(100, Math.max(0, s)) / 100;
  const vn = Math.min(100, Math.max(0, v)) / 100;
  const c = vn * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = vn - c;
  return formatColor({
    r: (rgb[0] + m) * 255,
    g: (rgb[1] + m) * 255,
    b: (rgb[2] + m) * 255,
    a: Math.min(1, Math.max(0, a)) * 255,
  });
}

/** `#RRGGBBAA` → CSS hex cho swatch. */
export function cssHex(color: Color): string {
  return `#${color.slice(1, 9)}`;
}

/** Hiển thị gọn: bỏ `FF` cuối khi màu đục. */
export function shortHex(color: Color): string {
  return color.endsWith('FF') ? color.slice(0, 7) : color;
}
