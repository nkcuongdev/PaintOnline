import type { FilterId, FilterStep } from '../core/types';

/**
 * Đặc tả tham số của các bước filter (mục 2, 5.8 — GĐ6): dải giá trị, mặc định, đơn vị; bước nào
 * không đổi ảnh; phần đệm (halo) cần đọc thêm quanh vùng kết quả. Dùng chung cho Engine (tính vùng
 * đọc, chia dải), Worker (chạy filter) và UI (sinh slider) — một nguồn sự thật.
 */

export interface FilterParamSpec {
  key: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit: 'percent' | 'degrees' | 'px';
}

export const FILTER_PARAMS: Readonly<Record<FilterId, readonly FilterParamSpec[]>> = {
  brightness: [{ key: 'amount', min: -100, max: 100, step: 1, default: 0, unit: 'percent' }],
  contrast: [{ key: 'amount', min: -100, max: 100, step: 1, default: 0, unit: 'percent' }],
  saturation: [{ key: 'amount', min: -100, max: 100, step: 1, default: 0, unit: 'percent' }],
  hue: [{ key: 'degrees', min: -180, max: 180, step: 1, default: 0, unit: 'degrees' }],
  grayscale: [],
  invert: [],
  sepia: [{ key: 'amount', min: 0, max: 100, step: 1, default: 100, unit: 'percent' }],
  blur: [{ key: 'radius', min: 0, max: 100, step: 0.5, default: 4, unit: 'px' }],
  sharpen: [
    { key: 'amount', min: 0, max: 500, step: 1, default: 100, unit: 'percent' },
    { key: 'radius', min: 0.5, max: 20, step: 0.5, default: 1.5, unit: 'px' },
  ],
  pixelate: [{ key: 'size', min: 2, max: 200, step: 1, default: 12, unit: 'px' }],
};

export const FILTER_IDS = Object.keys(FILTER_PARAMS) as FilterId[];

/** Bước filter với tham số mặc định. */
export function defaultStep(id: FilterId): FilterStep {
  const step: Record<string, unknown> = { id };
  for (const p of FILTER_PARAMS[id]) step[p.key] = p.default;
  return step as unknown as FilterStep;
}

/** Kẹp tham số vào dải hợp lệ (giá trị lạ → mặc định). */
export function normalizeStep(step: FilterStep): FilterStep {
  const raw = step as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { id: step.id };
  for (const p of FILTER_PARAMS[step.id]) {
    const value = raw[p.key];
    out[p.key] =
      typeof value === 'number' && Number.isFinite(value)
        ? Math.min(p.max, Math.max(p.min, value))
        : p.default;
  }
  return out as unknown as FilterStep;
}

/** Tham số của bước (giá trị số theo khóa) — UI đọc để hiện slider. */
export function stepParam(step: FilterStep, key: string): number {
  const value = (step as unknown as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : 0;
}

/**
 * Kích thước 3 hộp blur xấp xỉ Gauss có độ lệch chuẩn `sigma` (Kutskir, "Fastest Gaussian blur"),
 * trả về bán kính từng hộp (0 = hộp không làm gì). O(n) mỗi lượt, không phụ thuộc bán kính (mục 5.8).
 */
export function blurBoxes(sigma: number, passes = 3): number[] {
  if (!(sigma > 0)) return new Array<number>(passes).fill(0);
  const wIdeal = Math.sqrt((12 * sigma * sigma) / passes + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal =
    (12 * sigma * sigma - passes * wl * wl - 4 * passes * wl - 3 * passes) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const radii: number[] = [];
  for (let i = 0; i < passes; i++) radii.push(((i < m ? wl : wu) - 1) / 2);
  return radii;
}

/** Bước không đổi ảnh (bỏ qua khi chạy, không tạo bước history). */
export function isIdentityStep(step: FilterStep): boolean {
  switch (step.id) {
    case 'brightness':
    case 'contrast':
    case 'saturation':
    case 'sepia':
      return step.amount === 0;
    case 'hue':
      return step.degrees % 360 === 0;
    case 'grayscale':
    case 'invert':
      return false;
    case 'blur':
      return blurBoxes(step.radius).every((r) => r === 0);
    case 'sharpen':
      return step.amount === 0 || blurBoxes(step.radius).every((r) => r === 0);
    case 'pixelate':
      return step.size <= 1;
  }
}

/** Pipeline chỉ gồm bước không đổi ảnh. */
export function isIdentityPipeline(steps: readonly FilterStep[]): boolean {
  return steps.every(isIdentityStep);
}

/** Bước làm đổi alpha (blur, khảm) — layer khóa trong suốt cần giữ alpha gốc. */
export function changesAlpha(step: FilterStep): boolean {
  return step.id === 'blur' || step.id === 'pixelate';
}

/** Bước đọc pixel lân cận: vùng kết quả có thể lan ra ngoài nội dung layer. */
export function isSpatial(step: FilterStep): boolean {
  return step.id === 'blur' || step.id === 'sharpen' || step.id === 'pixelate';
}

/**
 * Phần đệm lớn nhất mà pipeline cùng loại có thể cần (tham số không gian ở mức tối đa) — đọc sẵn
 * pixel nguồn đủ rộng một lần cho cả lượt kéo slider.
 */
export function filterHaloMax(steps: readonly FilterStep[], scale = 1): number {
  return filterHalo(
    steps.map((step) => {
      if (!isSpatial(step)) return step;
      const max: Record<string, unknown> = { id: step.id };
      for (const p of FILTER_PARAMS[step.id]) max[p.key] = p.max;
      return max as unknown as FilterStep;
    }),
    scale,
  );
}

/**
 * Phần đệm (pixel của dữ liệu ở tỉ lệ `scale`) cần đọc quanh vùng kết quả để kết quả giống hệt khi
 * chạy cả ảnh một lần — cho phép chia dải và xem trước một vùng.
 */
export function filterHalo(steps: readonly FilterStep[], scale = 1): number {
  let halo = 0;
  for (const step of steps) {
    if (isIdentityStep(step)) continue;
    if (step.id === 'blur' || step.id === 'sharpen') {
      for (const r of blurBoxes(step.radius * scale)) halo += r;
    } else if (step.id === 'pixelate') {
      halo += Math.ceil(step.size * scale);
    }
  }
  return halo;
}
