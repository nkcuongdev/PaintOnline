/**
 * Nén lossless pixel của history (mục 5.6, ADR 0016): dữ liệu cũ nằm trên GPU (atlas tile, surface
 * của layer đã xóa khỏi document) được chụp bằng `createImageBitmap` (không đọc pixel trên main
 * thread), chuyển sang Worker để đọc RGBA và nén zlib, rồi giữ dạng byte trong RAM. Khi cần dùng lại
 * (undo/redo), giải nén đồng bộ bằng `fflate` và ghi lại bằng `putImageData` — đúng từng pixel
 * (getImageData → putImageData không lệch trên cả 3 engine, ADR 0021).
 *
 * Chụp và nén theo từng dải hàng ~4 MB (ADR 0025): đọc cả một layer lớn (24 MP = 96 MB) từ GPU một
 * lần làm GPU bận và màn hình đứng hình hơn 1 giây.
 */

/** Nén RGBA (không nhân trước) của bitmap thành zlib — hiện thực trong Worker (services/workers). */
export type PixelCompressor = (bitmap: ImageBitmap) => Promise<Uint8Array>;

/** Một dải hàng [y, y + height) đã nén. */
export interface CompressedBand {
  y: number;
  height: number;
  data: Uint8Array;
}

/** Pixel đã nén của một vùng `width × height`, theo từng dải hàng. */
export interface CompressedPixels {
  width: number;
  height: number;
  bands: CompressedBand[];
}

/** Dung lượng một dải chụp từ GPU để nén (byte RGBA). */
const BAND_BYTES = 4 * 1024 * 1024;

/** Số hàng mỗi dải cho ảnh rộng `width`. */
export function bandRows(width: number): number {
  return Math.max(1, Math.floor(BAND_BYTES / (Math.max(1, width) * 4)));
}

/** Tổng số byte nén. */
export function compressedBytes(compressed: Readonly<CompressedPixels>): number {
  let bytes = 0;
  for (const band of compressed.bands) bytes += band.data.byteLength;
  return bytes;
}

/** Ảnh chụp để nén: phiên bản dữ liệu + hàm chụp từng dải (gọi lần lượt, không chụp cả ảnh). */
export interface ArchiveSnapshot {
  version: number;
  width: number;
  height: number;
  band(y: number, height: number): Promise<ImageBitmap>;
}

/**
 * Dữ liệu history có thể nén: chụp nhanh (phiên bản + từng dải), rồi nhận bản nén nếu dữ liệu chưa
 * đổi kể từ lúc chụp.
 */
export interface Archivable {
  readonly archived: boolean;
  /** Ảnh chụp hiện tại để nén; null nếu không có gì để nén (đã nén, trống). */
  snapshot(): ArchiveSnapshot | null;
  /** Thay dữ liệu GPU bằng bản nén; false nếu dữ liệu đã đổi hoặc không đủ ngân sách. */
  adopt(compressed: CompressedPixels, version: number): boolean;
}

import type * as FflateModule from 'fflate';

type Fflate = typeof FflateModule;

let inflater: Fflate | null = null;
let loading: Promise<boolean> | null = null;

/** Tải bộ giải nén (lười, một lần). Phải xong trước khi nhận bản nén đầu tiên. */
export function loadInflater(): Promise<boolean> {
  loading ??= import('fflate').then(
    (module) => {
      inflater = module;
      return true;
    },
    () => {
      loading = null;
      return false;
    },
  );
  return loading;
}

export function inflaterReady(): boolean {
  return inflater !== null;
}

/** Giải nén đồng bộ về ImageData (đúng kích thước khai báo — không cấp phát thêm). */
export function inflatePixels(compressed: Readonly<CompressedPixels>): ImageData {
  if (!inflater) throw new Error('Bộ giải nén history chưa được tải');
  const { width, height } = compressed;
  const out = new Uint8ClampedArray(width * height * 4);
  const bytes = new Uint8Array(out.buffer);
  for (const band of compressed.bands) {
    const start = band.y * width * 4;
    inflater.unzlibSync(band.data, {
      out: bytes.subarray(start, start + band.height * width * 4),
    });
  }
  return new ImageData(out, width, height);
}
