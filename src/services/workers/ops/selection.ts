import type { MaskData, MaskRequest, MaskResult, Rect, SelectionShape } from '@/engine/core/types';
import { alphaBoundsOf, buildMaskData, traceMask } from '@/engine/selection/maskOps';
import { traceShape } from '@/engine/selection/shape';
import { bitmapToImageData, context, free, scratchCanvas, type Canvas2D } from './encode';

/**
 * Việc nặng của vùng chọn và biến đổi ảnh (mục 5.7, 5.8): dựng mask + dò viền, tìm hình bao vùng
 * có pixel (Trim). Chạy trong Worker có OffscreenCanvas; cùng hàm chạy trên
 * main thread khi Worker không có canvas (WebKit cũ) và trong test.
 */

/** Vẽ hình vùng chọn thành alpha bằng canvas (khử răng cưa của trình duyệt). */
function rasterizeShape(shape: SelectionShape, bounds: Rect): Uint8Array {
  const canvas = scratchCanvas(bounds.width, bounds.height);
  try {
    const ctx = context(canvas, true);
    ctx.setTransform(1, 0, 0, 1, -bounds.x, -bounds.y);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    traceShape(ctx, shape);
    ctx.fill('nonzero');
    const rgba = ctx.getImageData(0, 0, bounds.width, bounds.height).data;
    const out = new Uint8Array(bounds.width * bounds.height);
    for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4 + 3] ?? 0;
    return out;
  } finally {
    free(canvas);
  }
}

async function toBitmap(canvas: Canvas2D): Promise<ImageBitmap> {
  if ('transferToImageBitmap' in canvas) return canvas.transferToImageBitmap();
  try {
    return await createImageBitmap(canvas);
  } finally {
    free(canvas);
  }
}

/** Ảnh alpha của mask (vẽ được bằng drawImage, dùng cho `destination-in/out`). */
async function maskBitmap(mask: MaskData): Promise<ImageBitmap> {
  const { width, height } = mask.bounds;
  const canvas = scratchCanvas(width, height);
  const ctx = context(canvas);
  const image = new ImageData(width, height);
  const px = image.data;
  for (let i = 0; i < mask.data.length; i++) px[i * 4 + 3] = mask.data[i] ?? 0;
  ctx.putImageData(image, 0, 0);
  return toBitmap(canvas);
}

/** Dựng mask vùng chọn + viền marching ants (mục 5.7). */
export async function buildMask(request: MaskRequest): Promise<MaskResult | null> {
  const mask = buildMaskData(request, rasterizeShape);
  if (!mask) return null;
  return { mask, bitmap: await maskBitmap(mask), outline: traceMask(mask) };
}

/** Hình bao vùng có alpha > 0 (Trim). Bitmap được đóng sau khi dùng. */
export function bitmapAlphaBounds(bitmap: ImageBitmap): Rect | null {
  const image = bitmapToImageData(bitmap);
  return alphaBoundsOf(image.data, image.width, image.height);
}
