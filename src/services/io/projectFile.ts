import * as v from 'valibot';
import type { ID, Rect } from '@/engine/core/types';
import { redactPixelRect } from '@/engine/layers/objects/annotate';
import { opaqueColor, parseColor } from '@/engine/utils/color';
import type { EncodedLayer, ProjectBundle } from '@/services/storage/projectRepo';
import {
  documentRecordSchema,
  NewerSchemaError,
  parseDocumentRecord,
  RecordValidationError,
  type DocumentRecord,
  type ProjectMode,
  type StoredImage,
} from '@/services/storage/schema';
import type { FillRect, ImageCodec, ZipEntry } from '@/services/workers/codec';
import { ZipError } from '@/services/workers/ops/zip';
import { readDimensions, sniffFormat } from './imageHeader';

/**
 * File `.paint` (mục 6.5): ZIP mở được bằng mọi công cụ giải nén.
 *
 *   manifest.json   { format: 'paint-online', formatVersion: 1, appVersion, exportedAt,
 *                     name?, mode?, document: DocumentRecord }
 *   layers/<id>.png một file cho mỗi layer raster có nội dung
 *   thumbnail.png   ảnh thu nhỏ
 *
 * Nhập coi file là không đáng tin (mục 10.2): ≤ 200 mục, ≤ 1 GB sau giải nén (đếm byte thật),
 * đường dẫn an toàn, manifest validate bằng valibot (loại trường lạ), mỗi ảnh layer kiểm tra
 * header + giải mã trong Worker có timeout trước khi nhận.
 */

export const PAINT_FORMAT = 'paint-online';
export const PAINT_FORMAT_VERSION = 1;
export const PAINT_EXTENSION = 'paint';
export const PAINT_MIME = 'application/zip';

/** File .paint tối đa (nén) — cùng trần với tổng dung lượng giải nén. */
export const MAX_PAINT_FILE_BYTES = 1024 * 1024 * 1024;
const DECODE_TIMEOUT_MS = 10_000;

const ENTRY_PATTERN = /^(manifest\.json|thumbnail\.png|layers\/[0-9A-Za-z-]{1,64}\.png)$/;

export type ProjectFileErrorCode =
  'notPaintFile' | 'tooLarge' | 'corrupt' | 'newerVersion' | 'invalidManifest' | 'invalidLayer';

export class ProjectFileError extends Error {
  constructor(
    readonly code: ProjectFileErrorCode,
    cause?: unknown,
  ) {
    super(`File .paint không hợp lệ: ${code}`, { cause });
    this.name = 'ProjectFileError';
  }
}

const manifestSchema = v.object({
  format: v.literal(PAINT_FORMAT),
  formatVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
  appVersion: v.optional(v.pipe(v.string(), v.maxLength(64))),
  exportedAt: v.optional(v.pipe(v.number(), v.finite())),
  name: v.optional(v.pipe(v.string(), v.maxLength(200))),
  mode: v.optional(v.picklist(['paint', 'screenshot'])),
  document: v.unknown(),
});

export interface PaintManifest {
  format: typeof PAINT_FORMAT;
  formatVersion: number;
  appVersion: string;
  exportedAt: number;
  name: string;
  mode: ProjectMode;
  document: DocumentRecord;
}

// ---------------------------------------------------------------------------
// Redact (mục 10.2): file .paint chứa ảnh gốc vì Redact không phá hủy
// ---------------------------------------------------------------------------

export function countRedactions(document: Pick<DocumentRecord, 'layers'>): number {
  let count = 0;
  for (const layer of document.layers) {
    if (layer.kind === 'vector') count += layer.objects.filter((o) => o.type === 'redact').length;
  }
  return count;
}

/**
 * Vùng cần tô kín trong từng layer raster (tọa độ trong ảnh của layer): mọi Redact của layer chú
 * thích phía trên layer đó, căn ra ngoài theo pixel nguyên như khi render.
 */
export function redactionFills(document: Pick<DocumentRecord, 'layers'>): Map<ID, FillRect[]> {
  const fills = new Map<ID, FillRect[]>();
  document.layers.forEach((layer, index) => {
    if (layer.kind !== 'vector') return;
    for (const obj of layer.objects) {
      if (obj.type !== 'redact') continue;
      const r = redactPixelRect(obj);
      const { r: red, g: green, b: blue } = parseColor(opaqueColor(obj.color));
      const rgba: FillRect['rgba'] = [red, green, blue, 255];
      for (const below of document.layers.slice(0, index)) {
        if (below.kind !== 'raster' || !below.bounds) continue;
        const local = intersectLocal(r, below.bounds);
        if (!local) continue;
        const list = fills.get(below.id) ?? [];
        list.push({ ...local, rgba });
        fills.set(below.id, list);
      }
    }
  });
  return fills;
}

function intersectLocal(r: Rect, bounds: Rect): Rect | null {
  const x0 = Math.max(r.x, bounds.x);
  const y0 = Math.max(r.y, bounds.y);
  const x1 = Math.min(r.x + r.width, bounds.x + bounds.width);
  const y1 = Math.min(r.y + r.height, bounds.y + bounds.height);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0 - bounds.x, y: y0 - bounds.y, width: x1 - x0, height: y1 - y0 };
}

// ---------------------------------------------------------------------------
// Xuất
// ---------------------------------------------------------------------------

export interface BuildOptions {
  appVersion: string;
  /** "Áp dụng vĩnh viễn vùng che trước khi xuất": pixel dưới Redact bị thay hẳn trong file. */
  bakeRedactions: boolean;
  now?: number;
}

export async function buildProjectFile(
  bundle: ProjectBundle,
  codec: ImageCodec,
  options: BuildOptions,
): Promise<Blob> {
  const fills = options.bakeRedactions
    ? redactionFills(bundle.document)
    : new Map<ID, FillRect[]>();
  const layers = await Promise.all(
    bundle.layers.map(async (layer) => {
      const rects = fills.get(layer.layerId);
      const png = rects?.length ? await codec.fillLayerRects(layer.png, rects) : layer.png;
      return { ...layer, png };
    }),
  );
  const manifest: PaintManifest = {
    format: PAINT_FORMAT,
    formatVersion: PAINT_FORMAT_VERSION,
    appVersion: options.appVersion,
    exportedAt: options.now ?? Date.now(),
    name: bundle.meta.name,
    mode: bundle.meta.mode,
    document: bundle.document,
  };
  const entries: ZipEntry[] = [
    {
      path: 'manifest.json',
      data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
      level: 6,
    },
  ];
  for (const layer of layers) {
    entries.push({
      path: `layers/${layer.layerId}.png`,
      data: new Uint8Array(layer.png),
      level: 0,
    });
  }
  const thumbnail = bundle.thumbnail ? await thumbnailPng(bundle.thumbnail, codec) : null;
  if (thumbnail) entries.push({ path: 'thumbnail.png', data: thumbnail, level: 0 });
  const zipped = await codec.zip(entries);
  return new Blob([zipped as Uint8Array<ArrayBuffer>], { type: PAINT_MIME });
}

/** Ảnh thu nhỏ trong DB có thể là WebP: file .paint luôn dùng thumbnail.png (mục 6.5). */
async function thumbnailPng(image: StoredImage, codec: ImageCodec): Promise<Uint8Array | null> {
  if (image.type === 'image/png') return new Uint8Array(image.data);
  try {
    const bitmap = await createImageBitmap(new Blob([image.data], { type: image.type }));
    const png = await codec.encode(bitmap, { type: 'image/png' });
    return new Uint8Array(await png.arrayBuffer());
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Nhập
// ---------------------------------------------------------------------------

export interface ImportedProject extends ProjectBundle {
  meta: { name: string; mode: ProjectMode };
}

/** Tên project từ tên file `<tên>.paint`. */
export function nameFromProjectFile(file: Blob): string | null {
  if (!(file instanceof File)) return null;
  const base = file.name.replace(/\.paint$/i, '').trim();
  return base ? base.slice(0, 120) : null;
}

export { isPaintFileName } from './clipboard';

/**
 * Đọc và kiểm tra file .paint. Trả về dữ liệu sẵn sàng tạo project mới (id do người gọi cấp).
 * Ném ProjectFileError.
 */
export async function readProjectFile(file: Blob, codec: ImageCodec): Promise<ImportedProject> {
  if (file.size === 0) throw new ProjectFileError('notPaintFile');
  if (file.size > MAX_PAINT_FILE_BYTES) throw new ProjectFileError('tooLarge');

  let files: Map<string, Uint8Array>;
  try {
    files = await codec.unzip(new Uint8Array(await file.arrayBuffer()), ENTRY_PATTERN);
  } catch (error) {
    if (error instanceof ZipError) {
      throw new ProjectFileError(
        error.code === 'notZip'
          ? 'notPaintFile'
          : error.code === 'tooLarge' || error.code === 'tooManyEntries'
            ? 'tooLarge'
            : 'corrupt',
        error,
      );
    }
    throw new ProjectFileError('corrupt', error);
  }

  const manifestBytes = files.get('manifest.json');
  if (!manifestBytes) throw new ProjectFileError('notPaintFile');
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes));
  } catch (error) {
    throw new ProjectFileError('invalidManifest', error);
  }
  const header = v.safeParse(manifestSchema, raw);
  if (!header.success) {
    const format = typeof raw === 'object' && raw !== null && 'format' in raw ? raw.format : null;
    throw new ProjectFileError(format === PAINT_FORMAT ? 'invalidManifest' : 'notPaintFile');
  }
  if (header.output.formatVersion > PAINT_FORMAT_VERSION) {
    throw new ProjectFileError('newerVersion');
  }

  let document: DocumentRecord;
  try {
    document = parseDocumentRecord(header.output.document);
  } catch (error) {
    if (error instanceof NewerSchemaError) throw new ProjectFileError('newerVersion', error);
    if (error instanceof RecordValidationError)
      throw new ProjectFileError('invalidManifest', error);
    throw error;
  }

  const layers: EncodedLayer[] = [];
  for (const layer of document.layers) {
    if (layer.kind !== 'raster' || !layer.bounds) continue;
    const bytes = files.get(`layers/${layer.id}.png`);
    if (!bytes) throw new ProjectFileError('invalidLayer');
    const png = await validateLayerPng(bytes, layer.bounds, codec);
    layers.push({ layerId: layer.id, png, bounds: layer.bounds, contentRev: layer.contentRev });
  }

  let thumbnail: StoredImage | null = null;
  const thumbBytes = files.get('thumbnail.png');
  if (thumbBytes && sniffFormat(thumbBytes.subarray(0, 64)) === 'png') {
    thumbnail = { data: copyBuffer(thumbBytes), type: 'image/png' };
  }

  return {
    meta: {
      name: nonEmpty(header.output.name) ?? nameFromProjectFile(file) ?? 'Project',
      mode: header.output.mode ?? 'paint',
    },
    document,
    layers,
    thumbnail,
  };
}

/** Header PNG khớp kích thước layer, rồi giải mã thật (Worker, timeout 10 s) để chắc chắn đọc được. */
function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

async function validateLayerPng(
  bytes: Uint8Array,
  bounds: Rect,
  codec: ImageCodec,
): Promise<ArrayBuffer> {
  const head = bytes.subarray(0, 64);
  if (sniffFormat(head) !== 'png') throw new ProjectFileError('invalidLayer');
  const size = readDimensions(head, 'png');
  if (size?.width !== bounds.width || size.height !== bounds.height) {
    throw new ProjectFileError('invalidLayer');
  }
  const png = copyBuffer(bytes);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, DECODE_TIMEOUT_MS);
  try {
    const image = await codec.decodeLayer(png.slice(0), controller.signal);
    if (image.width !== bounds.width || image.height !== bounds.height) {
      throw new ProjectFileError('invalidLayer');
    }
    return png;
  } catch (error) {
    if (error instanceof ProjectFileError) throw error;
    throw new ProjectFileError('invalidLayer', error);
  } finally {
    clearTimeout(timer);
  }
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/** Kiểm tra nhanh một DocumentRecord có hợp lệ theo schema (test, công cụ). */
export function isValidDocumentRecord(value: unknown): boolean {
  return v.is(documentRecordSchema, value);
}
