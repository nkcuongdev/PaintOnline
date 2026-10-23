import {
  IMAGE_MIME,
  readDimensions,
  readJpegOrientation,
  sniffFormat,
  type ImageFormat,
  type ImageSize,
} from './imageHeader';
import { svgViewport } from './svgPreflight';
import { detectMemoryConfig } from '@/services/platform/deviceTier';

/**
 * Mở ảnh từ file, kéo thả, clipboard một cách an toàn (mục 10.2): mọi file coi là không đáng tin.
 * Giải mã trong Worker kèm timeout 10 giây — quá hạn thì Worker bị dừng hẳn, file độc hại hoặc
 * hỏng không làm treo giao diện. SVG chỉ rasterize qua <img> trên main thread.
 */

/** Bộ giải mã (WorkerPool); không có thì giải mã trên main thread. */
export interface ImageDecoder {
  decode(
    blob: Blob,
    options: { resizeWidth?: number; resizeHeight?: number },
    signal?: AbortSignal,
  ): Promise<ImageBitmap>;
}

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 16384;
export const DECODE_TIMEOUT_MS = 10_000;

export type ImportErrorCode =
  | 'empty'
  | 'unsupported'
  | 'fileTooLarge'
  | 'dimensionsTooLarge'
  | 'decodeFailed'
  | 'timeout'
  | 'unknownDimensions';

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode) {
    super(`Không mở được ảnh: ${code}`);
    this.name = 'ImportError';
  }
}

export interface DecodeLimits {
  /** Giới hạn của tier thiết bị (mục 5.11): vượt thì thu nhỏ ngay khi giải mã. */
  maxSide: number;
  maxPixels: number;
}

export interface DecodedImage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  format: ImageFormat;
  /** Đã thu nhỏ để vừa giới hạn thiết bị. */
  scaled: boolean;
  /** Kích thước gốc (nếu biết). */
  original: ImageSize | null;
}

/** Kích thước vừa giới hạn thiết bị, giữ tỉ lệ; null nếu không cần thu nhỏ. */
export function fitWithin(size: ImageSize, limits: DecodeLimits): ImageSize | null {
  const scale = Math.min(
    1,
    limits.maxSide / size.width,
    limits.maxSide / size.height,
    Math.sqrt(limits.maxPixels / (size.width * size.height)),
  );
  if (scale >= 1) return null;
  return {
    width: Math.max(1, Math.floor(size.width * scale)),
    height: Math.max(1, Math.floor(size.height * scale)),
  };
}

function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer = 0;
  return Promise.race([
    run(controller.signal),
    new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => {
        // Hủy tác vụ: WorkerPool dừng hẳn Worker đang giải mã.
        controller.abort();
        reject(new ImportError('timeout'));
      }, ms);
    }),
  ]).finally(() => {
    window.clearTimeout(timer);
  });
}

/**
 * SVG chỉ được rasterize qua <img> từ blob URL — không bao giờ chèn vào DOM nên script và tài
 * nguyên ngoài trong SVG không chạy (mục 10.2).
 */
async function decodeSvg(blob: Blob, target: ImageSize, signal: AbortSignal): Promise<ImageBitmap> {
  const aborted = () => signal.aborted;
  const url = URL.createObjectURL(new Blob([blob], { type: IMAGE_MIME.svg }));
  try {
    const img = new Image();
    img.width = target.width;
    img.height = target.height;
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    if (aborted()) throw new ImportError('timeout');
    const bitmap = await createImageBitmap(img, {
      resizeWidth: target.width,
      resizeHeight: target.height,
    });
    if (aborted()) {
      bitmap.close();
      throw new ImportError('timeout');
    }
    return bitmap;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function decodeImage(
  blob: Blob,
  limits: DecodeLimits,
  decoder: ImageDecoder | null = null,
): Promise<DecodedImage> {
  if (blob.size === 0) throw new ImportError('empty');
  if (blob.size > MAX_FILE_BYTES) throw new ImportError('fileTooLarge');

  let head = new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer());
  const format = sniffFormat(head);
  if (!format) throw new ImportError('unsupported');

  // Larger JPEG metadata/AVIF container can hide dimensions beyond the prefix.
  // Bound header parsing; refuse unknown dimensions instead of decoding blindly.
  if ((format === 'jpeg' && !readDimensions(head, format)) || format === 'avif')
    head = new Uint8Array(await blob.slice(0, 2 * 1024 * 1024).arrayBuffer());
  let rawSize = readDimensions(head, format);
  let svg: ReturnType<typeof svgViewport> = null;
  if (format === 'svg') {
    if (blob.size > 2 * 1024 * 1024) throw new ImportError('fileTooLarge');
    svg = svgViewport(await blob.text());
    rawSize = svg?.size ?? null;
  }
  if (!rawSize) throw new ImportError('unknownDimensions');
  const orientation = format === 'jpeg' ? readJpegOrientation(head) : 1;
  const declared =
    orientation !== null && orientation >= 5
      ? { width: rawSize.height, height: rawSize.width }
      : rawSize;
  if (declared.width > MAX_IMAGE_SIDE || declared.height > MAX_IMAGE_SIDE) {
    throw new ImportError('dimensionsTooLarge');
  }
  // Even native resize can allocate a full source bitmap internally. Cap the
  // source pixels before calling it; large photos remain supported within this cap.
  if (
    rawSize.width * rawSize.height >
    Math.min(MAX_IMAGE_SIDE ** 2, limits.maxPixels * 4, detectMemoryConfig().totalBytes / 16)
  )
    throw new ImportError('dimensionsTooLarge');
  const svgTarget = svg ? (fitWithin(svg.size, limits) ?? svg.size) : null;
  if (svg && svgTarget) {
    svg.root.setAttribute('width', String(svgTarget.width));
    svg.root.setAttribute('height', String(svgTarget.height));
    svg.root.style.setProperty('width', `${String(svgTarget.width)}px`, 'important');
    svg.root.style.setProperty('height', `${String(svgTarget.height)}px`, 'important');
    // Rasterize at the admitted viewport, with the original coordinate system.
    if (!svg.root.hasAttribute('viewBox'))
      svg.root.setAttribute('viewBox', `0 0 ${String(svg.size.width)} ${String(svg.size.height)}`);
    blob = new Blob([new XMLSerializer().serializeToString(svg.root)], { type: IMAGE_MIME.svg });
  }

  const decode = async (signal: AbortSignal): Promise<ImageBitmap> => {
    if (format === 'svg' && svgTarget) return decodeSvg(blob, svgTarget, signal);
    // Gắn MIME đúng theo magic bytes; xoay theo EXIF (ảnh chụp điện thoại — mục 10.1).
    const typed =
      blob.type === IMAGE_MIME[format] ? blob : new Blob([blob], { type: IMAGE_MIME[format] });
    const target = orientation !== null ? fitWithin(declared, limits) : null;
    if (decoder) {
      try {
        return await decoder.decode(
          typed,
          target ? { resizeWidth: target.width, resizeHeight: target.height } : {},
          signal,
        );
      } catch (error) {
        if (signal.aborted) throw error;
        // Worker không giải mã được (trình duyệt thiếu tùy chọn): thử lại trên main thread.
      }
    }
    if (target) {
      try {
        return await createImageBitmap(typed, {
          imageOrientation: 'from-image',
          resizeWidth: target.width,
          resizeHeight: target.height,
          resizeQuality: 'high',
        });
      } catch {
        // Trình duyệt không hỗ trợ resize khi decode: decode rồi thu nhỏ ở bước sau.
      }
    }
    return createImageBitmap(typed, { imageOrientation: 'from-image' });
  };

  let bitmap: ImageBitmap;
  try {
    bitmap = await withTimeout(async (signal) => {
      const result = await decode(signal);
      if (signal.aborted) {
        result.close();
        throw new ImportError('timeout');
      }
      return result;
    }, DECODE_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('decodeFailed');
  }

  if (bitmap.width > MAX_IMAGE_SIDE || bitmap.height > MAX_IMAGE_SIDE) {
    bitmap.close();
    throw new ImportError('dimensionsTooLarge');
  }

  // Kích thước thật sau khi xoay EXIF có thể khác header; kiểm tra lại với giới hạn thiết bị.
  const fit = fitWithin({ width: bitmap.width, height: bitmap.height }, limits);
  let scaled = false;
  if (fit) {
    try {
      const resized = await createImageBitmap(bitmap, {
        resizeWidth: fit.width,
        resizeHeight: fit.height,
        resizeQuality: 'high',
      });
      bitmap.close();
      bitmap = resized;
      scaled = true;
    } catch {
      bitmap.close();
      throw new ImportError('dimensionsTooLarge');
    }
  } else if (declared.width !== bitmap.width || declared.height !== bitmap.height) {
    scaled = declared.width * declared.height > bitmap.width * bitmap.height;
  }

  return { bitmap, width: bitmap.width, height: bitmap.height, format, scaled, original: declared };
}

/** Tên project gợi ý từ tên file (bỏ phần mở rộng). */
export function nameFromFile(file: File | Blob): string | null {
  if (!(file instanceof File) || !file.name) return null;
  const base = file.name.replace(/\.[^.]+$/, '').trim();
  return base.length > 0 ? base.slice(0, 120) : null;
}
