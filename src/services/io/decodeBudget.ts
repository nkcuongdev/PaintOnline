import type { MemoryBudgetConfig } from '@/engine/core/types';
import { detectMemoryConfig } from '@/services/platform/deviceTier';
import type { DocumentRecord } from '@/services/storage/schema';
import { readDimensions, sniffFormat } from './imageHeader';

export const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
export const MAX_THUMBNAIL_SIDE = 320;
export const MAX_LAYER_DECODES = 2;

export class DecodeBudgetError extends Error {
  constructor(readonly reason: 'dimensions' | 'pixels' | 'manifest' | 'geometry' | 'archive') {
    super(
      {
        dimensions: 'Kích thước project vượt giới hạn của thiết bị này.',
        pixels: 'Tổng pixel giải mã của các layer vượt ngân sách bộ nhớ an toàn của thiết bị.',
        manifest: 'Dữ liệu manifest quá lớn (tối đa 8 MiB).',
        geometry: 'Dữ liệu đối tượng vượt giới hạn hình học hoặc số lượng an toàn.',
        archive: 'Dữ liệu project/file .paint vượt ngân sách buffer nhập/mở an toàn của thiết bị.',
      }[reason],
    );
    this.name = 'DecodeBudgetError';
  }
}

/** Admission estimate, not measured RAM: retained RGBA + destination surfaces,
 * two active decoder scratch buffers, and a document-sized render buffer.
 * No allocation is made here. This supplements (never increases) MemoryBudget. */
export function preflightDocument(
  record: Pick<DocumentRecord, 'width' | 'height' | 'layers'>,
  config: MemoryBudgetConfig = detectMemoryConfig(),
): { decodedPixels: number; estimatedPeakBytes: number } {
  const { width, height } = record;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > config.maxDocumentSide ||
    height > config.maxDocumentSide ||
    width * height > config.maxDocumentPixels
  )
    throw new DecodeBudgetError('dimensions');
  let decodedPixels = 0;
  let largest = 0;
  let objects = 0;
  let points = 0;
  let text = 0;
  for (const layer of record.layers) {
    if (layer.kind === 'raster') {
      const b = layer.bounds;
      if (!b) continue;
      if (
        ![b.x, b.y, b.width, b.height].every(Number.isSafeInteger) ||
        b.x < 0 ||
        b.y < 0 ||
        b.width < 1 ||
        b.height < 1 ||
        b.x + b.width > width ||
        b.y + b.height > height
      )
        throw new DecodeBudgetError('dimensions');
      decodedPixels += b.width * b.height;
      largest = Math.max(largest, b.width * b.height);
    } else {
      objects += layer.objects.length;
      for (const object of layer.objects) {
        if (object.type === 'polygon') points += object.points.length;
        if (object.type === 'text') text += object.text.length;
        // Bound all numeric geometry, including magnifier sources and view-like
        // rotations. Prevent enormous scratch surfaces from tiny manifests.
        const inspect = (value: unknown): void => {
          if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > 1_000_000))
            throw new DecodeBudgetError('geometry');
          if (value && typeof value === 'object')
            for (const child of Object.values(value)) inspect(child);
        };
        inspect(object);
      }
    }
  }
  if (objects > 20_000 || points > 100_000 || text > 1_000_000)
    throw new DecodeBudgetError('geometry');
  const estimatedPeakBytes = (2 * decodedPixels + MAX_LAYER_DECODES * largest + width * height) * 4;
  if (decodedPixels * 4 > config.totalBytes * 0.6 || estimatedPeakBytes > config.totalBytes)
    throw new DecodeBudgetError('pixels');
  return { decodedPixels, estimatedPeakBytes };
}

/** Header must agree BEFORE calling any native/custom PNG decoder. */
export function matchesPng(png: ArrayBuffer, width: number, height: number): boolean {
  const head = new Uint8Array(png, 0, Math.min(64, png.byteLength));
  const size = sniffFormat(head) === 'png' ? readDimensions(head, 'png') : null;
  return size?.width === width && size.height === height;
}

export function validThumbnail(png: ArrayBuffer): boolean {
  const head = new Uint8Array(png, 0, Math.min(64, png.byteLength));
  const size = sniffFormat(head) === 'png' ? readDimensions(head, 'png') : null;
  return !!size && size.width <= MAX_THUMBNAIL_SIDE && size.height <= MAX_THUMBNAIL_SIDE;
}

export function validStoredThumbnail(data: ArrayBuffer): boolean {
  if (data.byteLength > 4 * 1024 * 1024) return false;
  const head = new Uint8Array(data, 0, Math.min(64, data.byteLength));
  const format = sniffFormat(head);
  const size = format && readDimensions(head, format);
  return !!size && size.width <= MAX_THUMBNAIL_SIDE && size.height <= MAX_THUMBNAIL_SIDE;
}
