import { Editor } from '@/engine/core/Editor';
import { detectMemoryConfig } from '@/services/platform/deviceTier';
import { platformFeatures } from '@/services/platform/features';
import { documentSpecFromRecord } from '@/services/storage/restore';
import { RECORD_SCHEMA_VERSION } from '@/services/storage/schema';
import type { ProjectBundle } from '@/services/storage/projectRepo';
import type { ImageCodec } from '@/services/workers/codec';
import { sharedWorkerPool } from '@/services/workers/pool';

/** Build a disposable rendering copy; never flatten or save the user's editor. */
export async function sharingBundle(
  bundle: ProjectBundle,
  codec: ImageCodec,
): Promise<ProjectBundle> {
  const record = { ...bundle.document, layers: bundle.document.layers.filter((l) => l.visible) };
  const images = new Map<string, ImageData>();
  // Decode only visible content, sequentially. Missing/broken inputs must fail closed.
  for (const layer of record.layers) {
    if (layer.kind !== 'raster' || !layer.bounds) continue;
    const encoded = bundle.layers.find((l) => l.layerId === layer.id);
    if (encoded?.contentRev !== layer.contentRev) throw new Error('Missing sharing layer');
    const image = await codec.decodeLayer(encoded.png.slice(0));
    if (image.width !== layer.bounds.width || image.height !== layer.bounds.height) {
      throw new Error('Invalid sharing layer');
    }
    images.set(layer.id, image);
  }
  const editor = new Editor({
    memory: detectMemoryConfig(),
    platform: platformFeatures,
    workers: sharedWorkerPool(),
  });
  try {
    const spec = documentSpecFromRecord(record, images);
    // With every source layer hidden, the sharing copy contains only the document background.
    if (
      !editor.createDocument({
        ...spec,
        layers: spec.layers.length ? spec.layers : [{ kind: 'raster', name: 'Shared image' }],
      })
    ) {
      throw new Error('Insufficient memory for sharing copy');
    }
    const png = await (await editor.exportImage({ type: 'image/png' })).arrayBuffer();
    const thumbnail = await codec.encode(await editor.renderThumbnail(320), { type: 'image/png' });
    const bounds = { x: 0, y: 0, width: record.width, height: record.height };
    const id = 'shared-composite';
    return {
      meta: { ...bundle.meta },
      document: {
        schemaVersion: RECORD_SCHEMA_VERSION,
        projectId: record.projectId,
        width: record.width,
        height: record.height,
        background: { kind: 'transparent' },
        activeLayerId: id,
        rev: 0,
        palette: [],
        viewport: record.viewport,
        beautify: record.beautify,
        layers: [
          {
            id,
            name: 'Shared image',
            kind: 'raster',
            visible: true,
            locked: false,
            alphaLocked: false,
            opacity: 1,
            blendMode: 'normal',
            contentRev: 0,
            bounds,
          },
        ],
      },
      layers: [{ layerId: id, png, bounds, contentRev: 0 }],
      thumbnail: { data: await thumbnail.arrayBuffer(), type: 'image/png' },
    };
  } finally {
    editor.dispose();
  }
}
