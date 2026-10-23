import { Editor } from '@/engine/core/Editor';
import { detectMemoryConfig } from '@/services/platform/deviceTier';
import { platformFeatures } from '@/services/platform/features';
import { decodeLayerImages, documentSpecFromRecord } from './restore';
import type { ProjectBundle, ProjectRepository } from './projectRepo';
import type { ImageCodec } from '@/services/workers/codec';
import { sharedWorkerPool } from '@/services/workers/pool';

async function verifiedCheckpoint(
  repo: ProjectRepository,
  id: string,
  codec: ImageCodec,
  signal?: AbortSignal,
  residentBytes = 0,
) {
  const bundle = await repo.readCheckpointBundle(id);
  const blobs = new Map(
    bundle.layers.map((l) => [l.layerId, { ...l, projectId: id, updatedAt: 0 }]),
  );
  const decoded = await decodeLayerImages(
    { document: bundle.document, blobs },
    codec,
    undefined,
    signal,
    {
      ...detectMemoryConfig(),
      totalBytes: Math.max(0, detectMemoryConfig().totalBytes - residentBytes),
    },
  );
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (decoded.failed)
    throw new Error('Checkpoint có layer không đọc được. Bản gốc và checkpoint được giữ nguyên.');
  return { bundle, images: decoded.images };
}

/** Preview owns and releases its disposable engine; no DB writes. */
export async function previewCheckpoint(
  repo: ProjectRepository,
  id: string,
  codec: ImageCodec,
  signal?: AbortSignal,
  residentBytes = 0,
): Promise<Blob> {
  const { bundle, images } = await verifiedCheckpoint(repo, id, codec, signal, residentBytes);
  const memory = detectMemoryConfig();
  memory.totalBytes = Math.max(0, memory.totalBytes - residentBytes);
  const editor = new Editor({
    memory,
    platform: platformFeatures,
    workers: sharedWorkerPool(),
  });
  try {
    if (!editor.createDocument(documentSpecFromRecord(bundle.document, images)))
      throw new Error('Không đủ bộ nhớ để xem checkpoint.');
    images.clear();
    const bitmap = await editor.renderThumbnail(320);
    if (signal?.aborted) {
      bitmap.close();
      throw new DOMException('Aborted', 'AbortError');
    }
    return await codec.encode(bitmap, { type: 'image/png' });
  } finally {
    images.clear();
    editor.dispose();
  }
}

/** Only publishes an independently validated copy, with a fresh id and no file link. */
export async function copyCheckpoint(
  repo: ProjectRepository,
  id: string,
  codec: ImageCodec,
  residentBytes = 0,
): Promise<string> {
  const { bundle, images } = await verifiedCheckpoint(repo, id, codec, undefined, residentBytes);
  images.clear();
  const copyId = crypto.randomUUID();
  await repo.createProject(copyId, bundle);
  return copyId;
}

export async function copyRecoveredBundle(
  repo: ProjectRepository,
  bundle: ProjectBundle,
): Promise<string> {
  const id = crypto.randomUUID();
  await repo.createProject(id, {
    ...bundle,
    meta: { ...bundle.meta, name: `${bundle.meta.name} — bản phục hồi thiếu layer` },
  });
  return id;
}
