import type { BlendMode } from '../core/types';

/**
 * Ảnh chuẩn cho visual test 16 blend mode (nghiệm thu GĐ4): hiện thực thuần JS các công thức của
 * W3C Compositing and Blending Level 1 (§5.8 hàm blend, §5.3 ghép source-over) — độc lập với trình
 * duyệt, nên so được kết quả của cả 3 engine với cùng một chuẩn.
 */

type RGB = [number, number, number];

function separable(mode: BlendMode, cb: number, cs: number): number {
  switch (mode) {
    case 'multiply':
      return cb * cs;
    case 'screen':
      return cb + cs - cb * cs;
    case 'overlay':
      return hardLight(cs, cb);
    case 'darken':
      return Math.min(cb, cs);
    case 'lighten':
      return Math.max(cb, cs);
    case 'color-dodge':
      if (cb === 0) return 0;
      if (cs >= 1) return 1;
      return Math.min(1, cb / (1 - cs));
    case 'color-burn':
      if (cb >= 1) return 1;
      if (cs <= 0) return 0;
      return 1 - Math.min(1, (1 - cb) / cs);
    case 'hard-light':
      return hardLight(cb, cs);
    case 'soft-light': {
      if (cs <= 0.5) return cb - (1 - 2 * cs) * cb * (1 - cb);
      const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
      return cb + (2 * cs - 1) * (d - cb);
    }
    case 'difference':
      return Math.abs(cb - cs);
    case 'exclusion':
      return cb + cs - 2 * cb * cs;
    default:
      return cs;
  }
}

function hardLight(cb: number, cs: number): number {
  return cs <= 0.5 ? cb * 2 * cs : separable('screen', cb, 2 * cs - 1);
}

function lum(c: RGB): number {
  return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
}

function clipColor(c: RGB): RGB {
  const l = lum(c);
  const n = Math.min(...c);
  const x = Math.max(...c);
  let out: RGB = [...c];
  if (n < 0) out = out.map((v) => l + ((v - l) * l) / (l - n)) as RGB;
  if (x > 1) out = out.map((v) => l + ((v - l) * (1 - l)) / (x - l)) as RGB;
  return out;
}

function setLum(c: RGB, l: number): RGB {
  const d = l - lum(c);
  return clipColor([c[0] + d, c[1] + d, c[2] + d]);
}

function sat(c: RGB): number {
  return Math.max(...c) - Math.min(...c);
}

function setSat(c: RGB, s: number): RGB {
  const order = [0, 1, 2].sort((a, b) => c[a] - c[b]);
  const [iMin, iMid, iMax] = order as [number, number, number];
  const out: RGB = [0, 0, 0];
  if (c[iMax] > c[iMin]) {
    out[iMid] = ((c[iMid] - c[iMin]) * s) / (c[iMax] - c[iMin]);
    out[iMax] = s;
  }
  out[iMin] = 0;
  return out;
}

function nonSeparable(mode: BlendMode, cb: RGB, cs: RGB): RGB {
  switch (mode) {
    case 'hue':
      return setLum(setSat(cs, sat(cb)), lum(cb));
    case 'saturation':
      return setLum(setSat(cb, sat(cs)), lum(cb));
    case 'color':
      return setLum(cs, lum(cb));
    default:
      return setLum(cb, lum(cs));
  }
}

const NON_SEPARABLE = new Set<BlendMode>(['hue', 'saturation', 'color', 'luminosity']);

/** B(Cb, Cs) cho một pixel (kênh 0..1). */
export function blendColor(mode: BlendMode, cb: RGB, cs: RGB): RGB {
  if (NON_SEPARABLE.has(mode)) return nonSeparable(mode, cb, cs);
  return [
    separable(mode, cb[0], cs[0]),
    separable(mode, cb[1], cs[1]),
    separable(mode, cb[2], cs[2]),
  ];
}

/**
 * Ghép nguồn (RGBA 8 bit, không nhân trước) lên nền theo blend mode với opacity của layer
 * (W3C §5.3 + §5.8): co = αs·(1 − αb)·Cs + αs·αb·B(Cb, Cs) + (1 − αs)·αb·Cb.
 */
export function referenceComposite(
  backdrop: ImageData,
  source: ImageData,
  mode: BlendMode,
  opacity: number,
): ImageData {
  const out = new ImageData(backdrop.width, backdrop.height);
  const b = backdrop.data;
  const s = source.data;
  for (let i = 0; i < b.length; i += 4) {
    const ab = (b[i + 3] ?? 0) / 255;
    const as = ((s[i + 3] ?? 0) / 255) * opacity;
    const cb: RGB = [(b[i] ?? 0) / 255, (b[i + 1] ?? 0) / 255, (b[i + 2] ?? 0) / 255];
    const cs: RGB = [(s[i] ?? 0) / 255, (s[i + 1] ?? 0) / 255, (s[i + 2] ?? 0) / 255];
    const mixed = blendColor(mode, cb, cs);
    const ao = as + ab * (1 - as);
    for (let k = 0; k < 3; k++) {
      const co = as * (1 - ab) * cs[k] + as * ab * mixed[k] + (1 - as) * ab * cb[k];
      out.data[i + k] = ao > 0 ? Math.round((co / ao) * 255) : 0;
    }
    out.data[i + 3] = Math.round(ao * 255);
  }
  return out;
}

export interface ImageDiff {
  /** Sai khác lớn nhất trên một kênh (0..255). */
  max: number;
  /** Sai khác trung bình mỗi kênh. */
  mean: number;
}

/** So hai ảnh cùng kích thước theo từng kênh RGBA. */
export function compareImages(a: ImageData, b: ImageData): ImageDiff {
  if (a.width !== b.width || a.height !== b.height) return { max: 255, mean: 255 };
  let max = 0;
  let sum = 0;
  for (let i = 0; i < a.data.length; i++) {
    const d = Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0));
    if (d > max) max = d;
    sum += d;
  }
  return { max, mean: sum / a.data.length };
}
