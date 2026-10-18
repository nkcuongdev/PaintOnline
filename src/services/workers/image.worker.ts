import { expose, transfer } from 'comlink';
import type {
  Color,
  FilterRequest,
  FloodFillRequest,
  FloodFillResult,
  MaskRequest,
  MaskResult,
  Rect,
} from '@/engine/core/types';
import {
  CanvasUnsupportedError,
  bitmapToImageData,
  compressBitmap,
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
import { applyFilter } from './ops/filters/pipeline';
import { floodFill } from './ops/floodFill';
import { paletteOfBitmap } from './ops/palette';
import { bitmapAlphaBounds, buildMask } from './ops/selection';
import { DEFAULT_UNZIP_LIMITS, unzipLimited, ZipError, zipEntries, type ZipEntry } from './ops/zip';

/**
 * Entry duy nhất của Worker xử lý ảnh (mục 5.8, 8). Chỉ nhận dữ liệu thuần (ArrayBuffer,
 * ImageBitmap chuyển quyền sở hữu; Blob sao chép tham chiếu), không giữ state giữa các lần gọi
 * (trừ cache WASM của encoder WebP), không truy cập DOM.
 */

function requireCanvas(): void {
  if (typeof OffscreenCanvas === 'undefined') throw new CanvasUnsupportedError();
}

export type UnzipResult =
  { ok: true; files: Record<string, Uint8Array> } | { ok: false; code: ZipError['code'] };

const api = {
  /** Worker có OffscreenCanvas để mã hóa ảnh không (WebKit cũ thì không). */
  hasCanvas(): boolean {
    return typeof OffscreenCanvas !== 'undefined';
  },

  floodFill(request: FloodFillRequest): FloodFillResult | null {
    const result = floodFill(request);
    return result ? transfer(result, [result.mask.buffer]) : null;
  },

  applyFilter(request: FilterRequest): Uint8ClampedArray<ArrayBuffer> {
    const out = applyFilter(request);
    return transfer(out, [out.buffer]);
  },

  async buildMask(request: MaskRequest): Promise<MaskResult | null> {
    requireCanvas();
    const result = await buildMask(request);
    if (!result) return null;
    const buffers: Transferable[] = [result.mask.data.buffer as ArrayBuffer];
    for (const line of result.outline) buffers.push(line.buffer as ArrayBuffer);
    if (result.bitmap) buffers.push(result.bitmap);
    return transfer(result, buffers);
  },

  alphaBounds(bitmap: ImageBitmap): Rect | null {
    requireCanvas();
    return bitmapAlphaBounds(bitmap);
  },

  async compressPixels(bitmap: ImageBitmap): Promise<Uint8Array> {
    requireCanvas();
    const data = await compressBitmap(bitmap);
    return transfer(data, [data.buffer as ArrayBuffer]);
  },

  encode(bitmap: ImageBitmap, options: EncodeOptions): Promise<Blob> {
    requireCanvas();
    return encodeBitmap(bitmap, options);
  },

  thumbnail(bitmap: ImageBitmap, maxSide: number): Promise<Blob> {
    requireCanvas();
    return encodeThumbnail(bitmap, maxSide);
  },

  palette(bitmap: ImageBitmap): Color[] {
    requireCanvas();
    return paletteOfBitmap(bitmap);
  },

  async decode(blob: Blob, options: DecodeOptions): Promise<ImageBitmap> {
    const bitmap = await decodeBlob(blob, options);
    return transfer(bitmap, [bitmap]);
  },

  async encodeLayer(bitmap: ImageBitmap): Promise<ArrayBuffer> {
    requireCanvas();
    const png = await encodeLayerPng(bitmap);
    return transfer(png, [png]);
  },

  async decodeLayer(png: ArrayBuffer): Promise<ImageData> {
    const image = await decodeLayerPng(png);
    return transfer(image, [image.data.buffer]);
  },

  async fillLayerRects(png: ArrayBuffer, rects: FillRect[]): Promise<ArrayBuffer> {
    const out = await fillLayerRects(png, rects);
    return transfer(out, [out]);
  },

  encodeWebp(bitmap: ImageBitmap, quality: number): Promise<Blob> {
    requireCanvas();
    return encodeWebpWasm(bitmapToImageData(bitmap), quality);
  },

  zip(entries: ZipEntry[]): Uint8Array {
    const data = zipEntries(entries);
    return transfer(data, [data.buffer]);
  },

  /** `accept`: biểu thức chính quy (dạng chuỗi) của đường dẫn cần giải nén. */
  unzip(data: Uint8Array, accept: string): UnzipResult {
    const pattern = new RegExp(accept);
    try {
      const files = unzipLimited(data, {
        ...DEFAULT_UNZIP_LIMITS,
        accept: (path) => pattern.test(path),
      });
      // Mỗi file một buffer riêng (mục lưu nguyên có thể là view chung một buffer) rồi chuyển.
      const record: Record<string, Uint8Array> = {};
      for (const [path, bytes] of files) record[path] = bytes.slice();
      return transfer(
        { ok: true, files: record },
        Object.values(record).map((f) => f.buffer as ArrayBuffer),
      );
    } catch (error) {
      if (error instanceof ZipError) return { ok: false, code: error.code };
      throw error;
    }
  },
};

export type ImageWorkerApi = typeof api;

expose(api);
