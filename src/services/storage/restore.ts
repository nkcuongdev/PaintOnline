import type { DocumentLayerSpec, DocumentSpec } from '@/engine/core/Document';
import type { ID } from '@/engine/core/types';
import type { ImageCodec } from '@/services/workers/codec';
import type { LoadedProject } from './projectRepo';
import type { DocumentRecord } from './schema';

/**
 * Dựng lại document từ bản lưu (mục 6.6 — "Khi tải"): giải mã pixel từng layer (Worker, timeout),
 * layer không đọc được thay bằng layer trống kèm cảnh báo — không chặn việc mở project.
 */

export const LAYER_DECODE_TIMEOUT_MS = 10_000;

export interface DecodedLayers {
  /** RGBA không nhân trước (mở bằng putImageData — đúng từng pixel, ADR 0021). */
  images: Map<ID, ImageData>;
  /** Số layer raster không đọc được (thiếu blob, lệch revision, hỏng, sai kích thước). */
  failed: number;
}

export async function decodeLayerImages(
  loaded: Pick<LoadedProject, 'document' | 'blobs'>,
  codec: Pick<ImageCodec, 'decodeLayer'>,
  timeoutMs = LAYER_DECODE_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<DecodedLayers> {
  const images = new Map<ID, ImageData>();
  let failed = 0;
  await Promise.all(
    loaded.document.layers.map(async (layer) => {
      if (signal?.aborted || layer.kind !== 'raster' || !layer.bounds) return;
      const record = loaded.blobs.get(layer.id);
      const bounds = layer.bounds;
      if (record?.contentRev !== layer.contentRev) {
        failed++;
        return;
      }
      const controller = new AbortController();
      const onAbort = () => {
        controller.abort();
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
      try {
        const image = await codec.decodeLayer(record.png, controller.signal);
        if (image.width !== bounds.width || image.height !== bounds.height) {
          failed++;
          return;
        }
        images.set(layer.id, image);
      } catch {
        failed++;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
    }),
  );
  return { images, failed };
}

/** DocumentSpec cho Editor.createDocument từ bản ghi + ảnh đã giải mã. */
export function documentSpecFromRecord(
  record: DocumentRecord,
  images: ReadonlyMap<ID, ImageData>,
  id: ID = record.projectId,
): DocumentSpec {
  return {
    id,
    width: record.width,
    height: record.height,
    background: record.background,
    palette: record.palette,
    activeLayerId: record.activeLayerId,
    rev: record.rev,
    beautify: record.beautify ?? null,
    layers: record.layers.map((layer): DocumentLayerSpec => {
      const base = {
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        locked: layer.locked,
        alphaLocked: layer.alphaLocked,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        contentRev: layer.contentRev,
      };
      if (layer.kind === 'vector') return { ...base, kind: 'vector', objects: layer.objects };
      const image = images.get(layer.id);
      return image && layer.bounds
        ? { ...base, kind: 'raster', image, origin: { x: layer.bounds.x, y: layer.bounds.y } }
        : { ...base, kind: 'raster' };
    }),
  };
}

/** contentRev của các layer đã có pixel hợp lệ trong DB (autosave không mã hóa lại). */
export function savedLayerRevs(
  record: DocumentRecord,
  images: ReadonlyMap<ID, ImageData>,
): Map<ID, number> {
  const saved = new Map<ID, number>();
  for (const layer of record.layers) {
    if (layer.kind === 'raster' && images.has(layer.id)) saved.set(layer.id, layer.contentRev);
  }
  return saved;
}
