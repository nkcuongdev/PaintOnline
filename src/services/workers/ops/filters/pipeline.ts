import type { FilterId, FilterRequest, FilterStep } from '@/engine/core/types';
import { changesAlpha, isIdentityStep, normalizeStep } from '@/engine/filters/spec';
import { blur } from './blur';
import { brightness } from './brightness';
import { contrast } from './contrast';
import { grayscale } from './grayscale';
import { hue } from './hue';
import { invert } from './invert';
import { pixelate } from './pixelate';
import { saturation } from './saturation';
import { sepia } from './sepia';
import { sharpen } from './sharpen';
import {
  applyLut,
  composeLut,
  type FilterContext,
  type FilterImage,
  type FilterImpl,
} from './types';

/** Bảng filter: mỗi filter một file, thêm filter mới không chạm phần còn lại (mục 8). */
const FILTERS: { readonly [K in FilterId]: FilterImpl<Extract<FilterStep, { id: K }>> } = {
  brightness,
  contrast,
  saturation,
  hue,
  grayscale,
  invert,
  sepia,
  blur,
  sharpen,
  pixelate,
};

/**
 * Chạy pipeline trên ảnh tại chỗ: bước không đổi ảnh bị bỏ, các LUT liền nhau được gộp thành một
 * lượt; layer khóa trong suốt giữ nguyên alpha gốc.
 */
export function runPipeline(
  image: FilterImage,
  steps: readonly FilterStep[],
  context: FilterContext,
  lockAlpha = false,
): void {
  const active = steps.map(normalizeStep).filter((step) => !isIdentityStep(step));
  let alpha: Uint8ClampedArray | null = null;
  if (lockAlpha && active.some(changesAlpha)) {
    alpha = new Uint8ClampedArray(image.width * image.height);
    for (let i = 0, p = 3; i < alpha.length; i++, p += 4) alpha[i] = image.data[p] ?? 0;
  }
  let lut: Uint8ClampedArray | null = null;
  for (const step of active) {
    const impl = FILTERS[step.id] as FilterImpl;
    if (impl.lut) {
      const next = impl.lut(step);
      lut = lut ? composeLut(lut, next) : next;
      continue;
    }
    if (lut) {
      applyLut(image, lut);
      lut = null;
    }
    impl.apply?.(image, step, context);
  }
  if (lut) applyLut(image, lut);
  if (alpha) {
    for (let i = 0, p = 3; i < alpha.length; i++, p += 4) image.data[p] = alpha[i] ?? 0;
  }
}

/** Hàm của Worker (mục 5.8): chạy pipeline trên vùng đọc, trả RGBA của phần `core`. */
export function applyFilter(request: FilterRequest): Uint8ClampedArray<ArrayBuffer> {
  const image: FilterImage = { width: request.width, height: request.height, data: request.data };
  runPipeline(
    image,
    request.steps,
    { originX: request.originX, originY: request.originY, scale: request.scale },
    request.lockAlpha,
  );
  const { core } = request;
  if (core.x === 0 && core.y === 0 && core.width === image.width && core.height === image.height) {
    return request.data;
  }
  const out = new Uint8ClampedArray(core.width * core.height * 4);
  const rowBytes = core.width * 4;
  for (let y = 0; y < core.height; y++) {
    const from = ((core.y + y) * image.width + core.x) * 4;
    out.set(image.data.subarray(from, from + rowBytes), y * rowBytes);
  }
  return out;
}
