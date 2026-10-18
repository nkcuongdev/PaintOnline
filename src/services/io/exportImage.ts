import type { Color } from '@/engine/core/types';
import type { ImageCodec } from '@/services/workers/codec';

/**
 * Xuất ảnh đã ghép (mục 2, 7.3): PNG/JPG/WebP, chất lượng, scale 0,5×–2×, nền cho JPG.
 * Safari không mã hóa WebP qua canvas và lặng lẽ trả PNG: kiểm tra `blob.type` sau khi mã hóa,
 * sai thì tải lười encoder WASM (mục 10.1).
 */

export type ExportFormat = 'png' | 'jpeg' | 'webp';

export const EXPORT_MIME: Readonly<
  Record<ExportFormat, 'image/png' | 'image/jpeg' | 'image/webp'>
> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export const EXPORT_EXTENSION: Readonly<Record<ExportFormat, string>> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
};

export const MIN_EXPORT_SCALE = 0.5;
export const MAX_EXPORT_SCALE = 2;

export interface ImageExportOptions {
  format: ExportFormat;
  /** 0..1 cho JPG/WebP. */
  quality: number;
  /** 0,5×–2×. */
  scale: number;
  /** Màu nền cho JPG (không có kênh alpha). */
  background: Color;
  /** Chỉ phần trong vùng chọn (mục 7.3). */
  selectionOnly: boolean;
  /** Gồm khung Làm đẹp nếu document đang bật (GĐ7). */
  beautify: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ImageExportOptions = {
  format: 'png',
  quality: 0.9,
  scale: 1,
  background: '#FFFFFFFF',
  selectionOnly: false,
  beautify: true,
};

/** Nguồn ảnh đã ghép (Editor.exportImage). */
export interface CompositeSource {
  exportImage(options: {
    type?: 'image/png' | 'image/jpeg' | 'image/webp';
    quality?: number;
    scale?: number;
    matte?: Color;
    selectionOnly?: boolean;
    beautify?: boolean;
  }): Promise<Blob>;
}

export function clampExportScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_EXPORT_SCALE, Math.max(MIN_EXPORT_SCALE, scale));
}

/** Kích thước ảnh xuất theo scale (cùng cách làm tròn với Engine). */
export function exportSize(
  width: number,
  height: number,
  scale: number,
): { width: number; height: number } {
  const s = clampExportScale(scale);
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}

export async function exportComposite(
  source: CompositeSource,
  options: ImageExportOptions,
  codec: Pick<ImageCodec, 'encodeWebp'>,
): Promise<Blob> {
  const type = EXPORT_MIME[options.format];
  const scale = clampExportScale(options.scale);
  const quality = Math.min(1, Math.max(0, options.quality));
  const blob = await source.exportImage({
    type,
    quality: options.format === 'png' ? undefined : quality,
    scale,
    matte: options.format === 'jpeg' ? options.background : undefined,
    selectionOnly: options.selectionOnly,
    beautify: options.beautify,
  });
  if (options.format !== 'webp' || blob.type === 'image/webp') return blob;
  // Trình duyệt trả định dạng khác (PNG) cho WebP: mã hóa lại bằng WASM từ ảnh không mất dữ liệu.
  const lossless =
    blob.type === 'image/png'
      ? blob
      : await source.exportImage({
          type: 'image/png',
          scale,
          selectionOnly: options.selectionOnly,
          beautify: options.beautify,
        });
  const bitmap = await createImageBitmap(lossless, { colorSpaceConversion: 'none' });
  return codec.encodeWebp(bitmap, quality);
}

/** "1,2 MB", "830 KB" — ước lượng dung lượng hiển thị trong hộp thoại. */
export function formatBytes(bytes: number): string {
  const nf = (n: number, digits: number) =>
    new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(n);
  if (bytes < 1024) return `${nf(bytes, 0)} B`;
  if (bytes < 1024 * 1024) return `${nf(bytes / 1024, 0)} KB`;
  if (bytes < 1024 ** 3) return `${nf(bytes / 1024 ** 2, 1)} MB`;
  return `${nf(bytes / 1024 ** 3, 2)} GB`;
}
