import {
  bitmapToImageData,
  decodeBlob,
  decodeLayerPng,
  encodeBitmap,
  encodeLayerPng,
  encodeThumbnail,
  encodeWebpWasm,
  fillLayerRects,
  type DecodeOptions,
  type EncodeOptions,
  type FillRect,
} from './ops/encode';
import type { Color } from '@/engine/core/types';
import { paletteOfBitmap } from './ops/palette';
import { DEFAULT_UNZIP_LIMITS, unzipLimited, zipEntries, type ZipEntry } from './ops/zip';

/**
 * Mã hóa/giải mã/nén cho services (autosave, export, .paint). WorkerPool hiện thực bằng Worker;
 * `mainThreadCodec` chạy cùng các hàm thuần trên main thread — dùng làm fallback khi Worker không
 * có OffscreenCanvas (mục 11.4) và trong test.
 */
export interface ImageCodec {
  /** Pixel layer → PNG RGBA tự mã hóa (ADR 0021). Bitmap bị đóng/chuyển quyền sở hữu. */
  encodeLayer(bitmap: ImageBitmap): Promise<ArrayBuffer>;
  /** PNG của layer → RGBA không nhân trước (mở bằng putImageData — đúng từng pixel). */
  decodeLayer(png: ArrayBuffer, signal?: AbortSignal): Promise<ImageData>;
  /** Tô kín vùng trong PNG của layer (nướng Redact khi xuất .paint). */
  fillLayerRects(png: ArrayBuffer, rects: FillRect[]): Promise<ArrayBuffer>;
  /** Mã hóa bitmap bằng bộ mã hóa của trình duyệt (ảnh thu nhỏ, ảnh xuất). */
  encode(bitmap: ImageBitmap, options: EncodeOptions): Promise<Blob>;
  thumbnail(bitmap: ImageBitmap, maxSide: number): Promise<Blob>;
  /** Giải mã ảnh người dùng (mở file, dán). */
  decode(blob: Blob, options: DecodeOptions, signal?: AbortSignal): Promise<ImageBitmap>;
  /** WebP bằng WASM (Safari). */
  encodeWebp(bitmap: ImageBitmap, quality: number): Promise<Blob>;
  zip(entries: ZipEntry[]): Promise<Uint8Array>;
  /** Giải nén có giới hạn (mục 10.2); ném ZipError. */
  unzip(data: Uint8Array, accept: RegExp): Promise<Map<string, Uint8Array>>;
  /** Màu chủ đạo của ảnh mẫu đã thu nhỏ (bảng màu project — mục 7.6). Bitmap bị đóng. */
  palette(bitmap: ImageBitmap): Promise<Color[]>;
}

export const mainThreadCodec: ImageCodec = {
  encodeLayer: (bitmap) => encodeLayerPng(bitmap),
  decodeLayer: (png) => decodeLayerPng(png),
  fillLayerRects: (png, rects) => fillLayerRects(png, rects),
  encode: (bitmap, options) => encodeBitmap(bitmap, options),
  thumbnail: (bitmap, maxSide) => encodeThumbnail(bitmap, maxSide),
  decode: (blob, options) => decodeBlob(blob, options),
  encodeWebp: (bitmap, quality) => encodeWebpWasm(bitmapToImageData(bitmap), quality),
  zip: (entries) => Promise.resolve(zipEntries(entries)),
  unzip: (data, accept) =>
    Promise.resolve(
      unzipLimited(data, { ...DEFAULT_UNZIP_LIMITS, accept: (path) => accept.test(path) }),
    ),
  palette: (bitmap) => Promise.resolve(paletteOfBitmap(bitmap)),
};

export type { DecodeOptions, EncodeOptions, EncodeType, FillRect } from './ops/encode';
export type { ZipEntry } from './ops/zip';
