import { decodePngAsync, encodePngAsync, zlibAsync } from './png';
import { bakeRedactions, type RedactBake } from './redactBake';

/**
 * Mã hóa/giải mã ảnh (mục 5.8, 6.6): chạy trong Worker bằng OffscreenCanvas; cùng các hàm này
 * chạy được trên main thread (fallback khi Worker không có OffscreenCanvas, và trong test).
 * Không giữ state giữa các lần gọi, trừ cache WASM của encoder WebP.
 *
 * Pixel layer dùng PNG tự mã hóa từ RGBA (png.ts — ADR 0021) để lưu rồi mở lại đúng từng pixel;
 * ảnh thu nhỏ và ảnh xuất cho người dùng dùng bộ mã hóa của trình duyệt.
 */

export type EncodeType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface EncodeOptions {
  type: EncodeType;
  /** 0..1 cho JPG/WebP. */
  quality?: number;
}

export interface DecodeOptions {
  /** Thu nhỏ ngay khi giải mã (vượt giới hạn thiết bị — mục 10.2). */
  resizeWidth?: number;
  resizeHeight?: number;
  /**
   * 'image' (mặc định): ảnh người dùng — xoay theo EXIF (ảnh chụp điện thoại, mục 10.1).
   * 'layer': pixel layer đã lưu — đọc lại đúng từng giá trị, không xoay, không đổi hệ màu.
   */
  source?: 'image' | 'layer';
}

/** Một vùng cần tô kín (nướng Redact vào pixel khi xuất .paint — mục 10.2). */
/** Vùng che cần nướng vào layer (tô kín, khảm hoặc làm mờ — redactBake.ts). */
export type FillRect = RedactBake;

/** Môi trường không có OffscreenCanvas (vd. WebKit cũ trong Worker): pool chuyển sang main thread. */
export class CanvasUnsupportedError extends Error {
  constructor() {
    super('OffscreenCanvas không có trong môi trường này');
    this.name = 'CanvasUnsupportedError';
  }
}

export type Canvas2D = OffscreenCanvas | HTMLCanvasElement;

/** Canvas tạm: OffscreenCanvas nếu có, nếu không thì canvas DOM (chỉ trên main thread). */
export function scratchCanvas(width: number, height: number): Canvas2D {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') throw new CanvasUnsupportedError();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function context(
  canvas: Canvas2D,
  willReadFrequently = false,
): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  // Hợp kiểu OffscreenCanvas | HTMLCanvasElement làm getContext trả về union rộng hơn thực tế.
  const raw: unknown = canvas.getContext('2d', { willReadFrequently });
  const ctx = raw as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Không tạo được context 2D');
  return ctx;
}

async function toBlob(canvas: Canvas2D, options: EncodeOptions): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: options.type, quality: options.quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Không mã hóa được ảnh'));
      },
      options.type,
      options.quality,
    );
  });
}

export function free(canvas: Canvas2D): void {
  canvas.width = 0;
  canvas.height = 0;
}

/** Mã hóa ImageBitmap bằng bộ mã hóa của trình duyệt. Bitmap được đóng sau khi dùng. */
export async function encodeBitmap(bitmap: ImageBitmap, options: EncodeOptions): Promise<Blob> {
  const canvas = scratchCanvas(bitmap.width, bitmap.height);
  try {
    const ctx = context(canvas);
    ctx.drawImage(bitmap, 0, 0);
    return await toBlob(canvas, options);
  } finally {
    bitmap.close();
    free(canvas);
  }
}

/** Thu nhỏ rồi mã hóa (ảnh thu nhỏ cạnh dài `maxSide`). */
export async function encodeThumbnail(bitmap: ImageBitmap, maxSide: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = scratchCanvas(width, height);
  try {
    const ctx = context(canvas);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    // WebP nhỏ hơn; trình duyệt không mã hóa được WebP sẽ tự trả PNG — vẫn dùng được.
    return await toBlob(canvas, { type: 'image/webp', quality: 0.82 });
  } finally {
    bitmap.close();
    free(canvas);
  }
}

/** Giải mã Blob thành ImageBitmap (ảnh người dùng hoặc pixel layer đã lưu). */
export function decodeBlob(blob: Blob, options: DecodeOptions = {}): Promise<ImageBitmap> {
  const layer = options.source === 'layer';
  const base: ImageBitmapOptions = {
    imageOrientation: layer ? 'none' : 'from-image',
    colorSpaceConversion: layer ? 'none' : 'default',
  };
  if (options.resizeWidth && options.resizeHeight) {
    return createImageBitmap(blob, {
      ...base,
      resizeWidth: options.resizeWidth,
      resizeHeight: options.resizeHeight,
      resizeQuality: 'high',
    });
  }
  return createImageBitmap(blob, base);
}

/** Đọc RGBA (không nhân trước) của bitmap. Bitmap được đóng sau khi dùng. */
export function bitmapToImageData(bitmap: ImageBitmap): ImageData {
  const canvas = scratchCanvas(bitmap.width, bitmap.height);
  try {
    const ctx = context(canvas, true);
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
    free(canvas);
  }
}

/** Pixel history (atlas tile, layer đã xóa) → zlib của RGBA không nhân trước (mục 5.6). */
export async function compressBitmap(bitmap: ImageBitmap): Promise<Uint8Array> {
  return zlibAsync(bitmapToImageData(bitmap).data);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? (bytes.buffer as ArrayBuffer)
    : bytes.slice().buffer;
}

/**
 * Pixel layer → PNG (ADR 0021): đọc RGBA đúng như getImageData rồi tự mã hóa, nên mở lại bằng
 * putImageData cho đúng từng pixel trên mọi trình duyệt.
 */
export async function encodeLayerPng(bitmap: ImageBitmap): Promise<ArrayBuffer> {
  const image = bitmapToImageData(bitmap);
  return toArrayBuffer(await encodePngAsync(image.data, image.width, image.height));
}

/**
 * PNG của layer → RGBA. PNG do app ghi được giải mã bằng png.ts (đúng từng byte); PNG định dạng
 * khác (file .paint sửa tay) đi qua bộ giải mã của trình duyệt.
 */
export async function decodeLayerPng(png: ArrayBuffer): Promise<ImageData> {
  const decoded = await decodePngAsync(new Uint8Array(png));
  if (decoded) return new ImageData(decoded.data, decoded.width, decoded.height);
  const bitmap = await decodeBlob(new Blob([png], { type: 'image/png' }), { source: 'layer' });
  return bitmapToImageData(bitmap);
}

/**
 * Tô kín các vùng (tọa độ trong ảnh layer) bằng màu đặc rồi mã hóa lại — "Áp dụng vĩnh viễn vùng
 * che" khi xuất .paint: pixel gốc dưới Redact không còn trong file (mục 10.2).
 */
export async function fillLayerRects(
  png: ArrayBuffer,
  rects: readonly FillRect[],
): Promise<ArrayBuffer> {
  const image = await decodeLayerPng(png);
  bakeRedactions(image, rects);
  return toArrayBuffer(await encodePngAsync(image.data, image.width, image.height));
}

/**
 * Mã hóa WebP bằng WASM (@jsquash/webp, tải lười) — Safari không mã hóa WebP qua canvas và lặng
 * lẽ trả PNG (mục 3.3, 10.1). Đây là chỗ duy nhất v1 dùng WASM.
 */
export async function encodeWebpWasm(image: ImageData, quality: number): Promise<Blob> {
  const { default: encode } = await import('@jsquash/webp/encode');
  const buffer = await encode(image, {
    quality: Math.round(Math.min(1, Math.max(0, quality)) * 100),
  });
  return new Blob([buffer], { type: 'image/webp' });
}
