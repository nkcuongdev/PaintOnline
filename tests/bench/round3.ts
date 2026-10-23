import { Editor } from '@/engine/core/Editor';
import { MemoryBudget, TIER_BUDGETS } from '@/engine/memory/MemoryBudget';
import { detectPlatformFeatures } from '@/services/platform/features';
import { preflightDocument } from '@/services/io/decodeBudget';
import { buildProjectFile, countRedactions } from '@/services/io/projectFile';
import { Database } from '@/services/storage/db';
import { ProjectRepository } from '@/services/storage/projectRepo';
import { decodeLayerImages, documentSpecFromRecord } from '@/services/storage/restore';
import { sharedWorkerPool } from '@/services/workers/pool';

export async function measureSharing(editor: Editor) {
  const doc = editor.document;
  if (!doc) throw new Error('No document');
  // Add identical redaction/text coverage for both sizes, after the baseline
  // stroke/save measurements. Existing S annotations are kept.
  editor.tools.setActive('text');
  editor.dispatchPointer('down', { x: 30, y: 60 });
  editor.dispatchPointer('up', { x: 30, y: 60 });
  editor.text.commit('ROUND3-PRIVATE-TEXT');
  editor.tools.setActive('redact');
  editor.options.set('redact', { mode: 'solid' });
  editor.colors.setPrimary('#000000FF');
  editor.dispatchPointer('down', { x: 0, y: 0 });
  editor.dispatchPointer('move', { x: 500, y: 160 });
  editor.dispatchPointer('up', { x: 500, y: 160 });
  editor.objects.clearSelection();
  editor.flush();
  const codec = sharedWorkerPool();
  const data = editor.serialize();
  if (!data) throw new Error('No document');
  const record = { ...data, projectId: doc.id, schemaVersion: 1, viewport: editor.view };
  const admission = preflightDocument(record);
  const budgets = new Set<MemoryBudget>([editor.memory]);
  let peakTrackedEngineBytes = editor.memory.usedBytes;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- applied with the tracked budget as this below
  const reserve = MemoryBudget.prototype.reserve;
  MemoryBudget.prototype.reserve = function (
    this: MemoryBudget,
    ...args: Parameters<MemoryBudget['reserve']>
  ) {
    reserve.apply(this, args);
    budgets.add(this);
    peakTrackedEngineBytes = Math.max(
      peakTrackedEngineBytes,
      [...budgets].reduce((n, b) => n + b.usedBytes, 0),
    );
  };
  const started = performance.now();
  try {
    const layers = [];
    for (const capture of editor.captureLayers(new Map()))
      layers.push({
        layerId: capture.layerId,
        bounds: capture.bounds,
        contentRev: capture.contentRev,
        png: await codec.encodeLayer(await capture.bitmap),
      });
    const capturedMs = performance.now() - started;
    const file = await buildProjectFile(
      {
        meta: { name: 'Round3 sharing', mode: 'paint' },
        document: record,
        layers,
        thumbnail: null,
      },
      codec,
      { appVersion: 'bench', bakeRedactions: true, residentBytes: editor.memory.usedBytes },
    );
    const totalMs = performance.now() - started;
    const files = await codec.unzip(new Uint8Array(await file.arrayBuffer()), /./);
    const manifest = new TextDecoder().decode(files.get('manifest.json'));
    if (
      manifest.includes('ROUND3-PRIVATE-TEXT') ||
      !manifest.includes('shared-composite') ||
      files.size !== 3
    )
      throw new Error('Sharing data assertion failed');
    const shared = files.get('layers/shared-composite.png');
    if (!shared) throw new Error('Missing shared pixels');
    const pixels = await codec.decodeLayer(shared.slice().buffer);
    if ([...pixels.data.subarray(0, 4)].join(',') !== '0,0,0,255')
      throw new Error('Redaction pixel assertion failed');
    return {
      captureEncodeMs: Math.round(capturedMs),
      sharingBuildMs: Math.round(totalMs - capturedMs),
      totalMs: Math.round(totalMs),
      archiveBytes: file.size,
      redactions: countRedactions(record),
      peakTrackedEngineMiB: +(peakTrackedEngineBytes / 1024 ** 2).toFixed(1),
      decodedPixels: admission.decodedPixels,
      decodeAdmissionPeakMiB: +(admission.estimatedPeakBytes / 1024 ** 2).toFixed(1),
      memoryKind: 'engine accounting + separate decode estimate; not measured process RAM',
      safeManifest: true,
    };
  } finally {
    MemoryBudget.prototype.reserve = reserve;
  }
}

/** First iteration uses a new page, connection and worker pool; second reuses
 * modules/workers/connection. Timer starts after page modules load. */
export async function measureOpen(database: string, projectId: string) {
  if (!database.startsWith('paint-online-bench-'))
    throw new Error('Isolated benchmark DB required');
  const db = new Database(database);
  const repo = new ProjectRepository(db);
  const results = [];
  try {
    for (const kind of ['cold-page-worker-connection', 'warm'] as const) {
      const start = performance.now();
      const loaded = await repo.loadProject(projectId, TIER_BUDGETS.desktop);
      const { images, failed } = await decodeLayerImages(loaded, sharedWorkerPool());
      if (failed) throw new Error('Open decode failed');
      const editor = new Editor({
        memory: TIER_BUDGETS.desktop,
        platform: detectPlatformFeatures(),
        workers: sharedWorkerPool(),
      });
      try {
        if (!editor.createDocument(documentSpecFromRecord(loaded.document, images)))
          throw new Error('Open refused');
        images.clear();
        const pixel = editor.readPixels({ x: 0, y: 0, width: 1, height: 1 }).data;
        results.push({
          kind,
          ms: Math.round(performance.now() - start),
          pixel: [...pixel],
          engineMiB: +(editor.memory.usedBytes / 1024 ** 2).toFixed(1),
        });
      } finally {
        images.clear();
        editor.dispose();
      }
    }
    return results;
  } finally {
    await db.close();
  }
}
