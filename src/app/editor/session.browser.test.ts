import { afterEach, describe, expect, it, vi } from 'vitest';
import { database, repo } from '@/app/storage';
import { useProjectStore } from '@/stores/project';
import { useSettingsStore } from '@/stores/settings';
import { drawStroke, pixelAt } from '@/engine/testing/helpers';
import { SurfaceAllocationError } from '@/engine/memory/surfaces';
import { mainThreadCodec } from '@/services/workers/codec';
import { buildProjectFile, readProjectFile } from '@/services/io/projectFile';
import { documentSpecFromRecord } from '@/services/storage/restore';
import { TAB_ID } from '@/services/storage/channel';
import { acquireProjectLock } from '@/services/storage/locks';
import {
  createProject,
  getCurrentProject,
  closeCurrentProject,
  getRetainedProject,
  hasUnsavedChanges,
  loadProject,
  saveCurrentProject,
} from './session';
import { exportProjectFile } from './actions';
import { useUiStore } from '@/stores/ui';

const init = {
  name: 'Isolated round1 regression',
  document: {
    width: 64,
    height: 64,
    background: { kind: 'color' as const, color: '#FFFFFFFF' as const },
    layers: [{ kind: 'raster' as const, name: 'Test' }],
  },
};
async function start() {
  const id = await createProject(init);
  expect(id).not.toBeNull();
  useSettingsStore.setState({ autosave: false });
  expect(await saveCurrentProject()).toBe(true);
  return getCurrentProject()!;
}
afterEach(async () => {
  vi.restoreAllMocks();
  database.faults = null;
  useProjectStore.setState({ storage: 'ready' });
  await closeCurrentProject({ discardUnsaved: true });
});

describe('A02 — failed transitions retain real document and lock', () => {
  it.each(['QuotaExceededError', 'UnknownError'])(
    '%s → Home → preset/load retains unsaved pixels; successful retry survives reopen',
    async (name) => {
      const p = await start();
      database.faults = {
        beforeCommit: ({ op, tx }) => {
          if (op === 'save') {
            tx.abort();
            throw new DOMException('test', name);
          }
        },
      };
      drawStroke(p.editor, [
        { x: 15, y: 20 },
        { x: 45, y: 20 },
      ]);
      expect(await saveCurrentProject()).toBe(false);
      expect(await closeCurrentProject()).toBe(false);
      expect(getRetainedProject()).toBe(p);
      expect(await createProject(init)).toBeNull();
      expect((await loadProject(crypto.randomUUID())).status).toBe('blocked');
      expect(getCurrentProject()).toBe(p);
      expect(p.lock).not.toBeNull();
      expect(p.readOnly).toBe(false);
      expect(hasUnsavedChanges()).toBe(true);
      expect(pixelAt(p.editor.readPixels(), 30, 20)[0]).toBeLessThan(10);
      expect((await repo.loadProject(p.id)).document.rev).toBe(0);
      database.faults = null;
      expect(await saveCurrentProject()).toBe(true);
      const before = [...p.editor.readPixels().data];
      expect(await closeCurrentProject()).toBe(true);
      const reopened = await loadProject(p.id);
      expect(reopened.status).toBe('ready');
      expect([...getCurrentProject()!.editor.readPixels().data]).toEqual(before);
    },
  );

  it('IndexedDB unavailable retains even initial rev 0; .paint remains exportable', async () => {
    await start();
    await closeCurrentProject();
    useProjectStore.setState({ storage: 'unavailable' });
    const id = await createProject(init);
    const p = getCurrentProject()!;
    expect(p.autosave).toBeNull();
    expect(p.editor.document!.rev).toBe(0);
    expect(hasUnsavedChanges()).toBe(true);
    expect(await closeCurrentProject()).toBe(false);
    expect(await createProject(init)).toBeNull();
    expect((await loadProject(crypto.randomUUID())).status).toBe('blocked');
    expect(getRetainedProject()?.id).toBe(id);
    const data = p.editor.serialize()!;
    const file = await buildProjectFile(
      {
        meta: { name: p.name, mode: p.mode },
        document: { ...data, schemaVersion: 1, projectId: p.id, viewport: p.editor.view },
        layers: [],
        thumbnail: null,
      },
      mainThreadCodec,
      { appVersion: 'test', bakeRedactions: false },
    );
    const restored = await readProjectFile(file, mainThreadCodec);
    expect(restored.document.background).toEqual(init.document.background);
    expect(getCurrentProject()).toBe(p);
  });

  it('rejected close keeps the editor, pixels and lock', async () => {
    const p = await start();
    drawStroke(p.editor, [
      { x: 15, y: 20 },
      { x: 45, y: 20 },
    ]);
    vi.spyOn(p.autosave!, 'close').mockRejectedValue(new Error('injected close failure'));
    expect(await closeCurrentProject()).toBe(false);
    expect(getRetainedProject()).toBe(p);
    expect(p.lock).not.toBeNull();
    expect(hasUnsavedChanges()).toBe(true);
  });
});

describe('A03/A04 — strict save and handoff', () => {
  it('slow save keeps ownership across a lock timeout; release occurs only after real persistence', async () => {
    const p = await start();
    drawStroke(p.editor, [
      { x: 15, y: 20 },
      { x: 45, y: 20 },
    ]);
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const persist = repo.saveSnapshot.bind(repo);
    const saving = vi.spyOn(repo, 'saveSnapshot').mockImplementation(async (input) => {
      await gate;
      return persist(input);
    });
    const other = new BroadcastChannel('paint-online');
    const response = new Promise<string>((resolve) => {
      other.onmessage = (event) => {
        const message = event.data as { type: string; to?: string };
        if (message.to === 'slow-requester') resolve(message.type);
      };
    });
    other.postMessage({ type: 'takeover-request', projectId: p.id, from: 'slow-requester' });
    await expect.poll(() => saving.mock.calls.length).toBeGreaterThan(0);
    expect(await acquireProjectLock(p.id, { waitMs: 40 })).toBeNull();
    expect(p.readOnly).toBe(false);
    expect(p.lock).not.toBeNull();
    expect(hasUnsavedChanges()).toBe(true);
    expect((await repo.loadProject(p.id)).document.rev).toBe(0);
    finish();
    expect(await response).toBe('takeover-released');
    other.close();
    expect(p.readOnly).toBe(true);
    expect((await repo.loadProject(p.id)).document.rev).toBe(p.editor.document!.rev);
  });
  it('.paint output refuses failed draft commit without writing a file; retry imports exact pixels', async () => {
    const p = await start();
    const image = new ImageData(8, 8);
    for (let i = 0; i < image.data.length; i += 4) image.data.set([255, 0, 0, 255], i);
    const bitmap = await createImageBitmap(image);
    p.editor.selection.paste(bitmap, { x: 16, y: 16 });
    bitmap.close();
    let exported: Blob | null = null;
    const write = vi.fn((blob: Blob) => {
      exported = blob;
      return Promise.resolve();
    });
    const handle = {
      name: 'isolated.paint',
      kind: 'file' as const,
      createWritable: () =>
        Promise.resolve({ write, close: () => Promise.resolve(), abort: () => Promise.resolve() }),
    };
    const allocation = vi.spyOn(p.editor.memory, 'reserve').mockImplementation(() => {
      throw new SurfaceAllocationError(64, 64);
    });
    useUiStore.setState({ toasts: [] });
    expect(await exportProjectFile(p.id, { bakeRedactions: false, handle })).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(p.editor.selection.isFloating).toBe(true);
    expect(useUiStore.getState().toasts.some((t) => t.kind === 'success')).toBe(false);
    allocation.mockRestore();
    expect(await exportProjectFile(p.id, { bakeRedactions: false, handle })).toBe(true);
    expect(write).toHaveBeenCalledOnce();
    expect(p.editor.selection.isFloating).toBe(false);
    const imported = await readProjectFile(exported!, mainThreadCodec);
    const layer = imported.document.layers.find((l) => l.kind === 'raster' && l.bounds);
    expect(layer).toBeDefined();
    const png = imported.layers.find((l) => l.layerId === layer!.id)!;
    const decoded = await mainThreadCodec.decodeLayer(png.png);
    expect(pixelAt(decoded, 20 - png.bounds.x, 20 - png.bounds.y)).toEqual([255, 0, 0, 255]);
  });
  it('Save applies a pasted draft; stored pixels survive a complete editor close/reopen', async () => {
    const p = await start();
    const image = new ImageData(8, 8);
    for (let i = 0; i < image.data.length; i += 4) image.data.set([255, 0, 0, 255], i);
    const bitmap = await createImageBitmap(image);
    p.editor.selection.paste(bitmap, { x: 16, y: 16 });
    bitmap.close();
    expect(hasUnsavedChanges()).toBe(true);
    expect(useProjectStore.getState().saveStatus?.kind).toBe('dirty');
    expect(await saveCurrentProject()).toBe(true);
    expect(p.editor.selection.isFloating).toBe(false);
    expect(hasUnsavedChanges()).toBe(false);
    expect(await closeCurrentProject()).toBe(true);
    await loadProject(p.id);
    expect(pixelAt(getCurrentProject()!.editor.readPixels(), 20, 20)).toEqual([255, 0, 0, 255]);
  });

  it('refused floating commit cannot report saved or close the editor', async () => {
    const p = await start();
    const bitmap = await createImageBitmap(new ImageData(8, 8));
    p.editor.selection.paste(bitmap, { x: 16, y: 16 });
    bitmap.close();
    vi.spyOn(p.editor.memory, 'reserve').mockImplementation(() => {
      throw new SurfaceAllocationError(64, 64);
    });
    expect(await saveCurrentProject()).toBe(false);
    expect(await closeCurrentProject()).toBe(false);
    expect(p.editor.selection.isFloating).toBe(true);
    expect(hasUnsavedChanges()).toBe(true);
    expect(getRetainedProject()).toBe(p);
    expect((await repo.loadProject(p.id)).document.rev).toBe(0);
  });

  it.each(['false', 'reject'])(
    'takeover with save %s sends denial and retains lock/dirty/error',
    async (failure) => {
      const p = await start();
      drawStroke(p.editor, [
        { x: 15, y: 20 },
        { x: 45, y: 20 },
      ]);
      const save = vi.spyOn(p.autosave!, 'saveNow');
      if (failure === 'reject') save.mockRejectedValue(new Error('injected rejection'));
      else save.mockResolvedValue(false);
      // onChannelMessage deliberately ignores same-tab broadcasts, so emulate delivery from another tab.
      const other = new BroadcastChannel('paint-online');
      other.postMessage({ type: 'takeover-request', projectId: p.id, from: 'test-requester' });
      // Observe the real response using the other endpoint.
      const received = await new Promise<string>((resolve) => {
        other.onmessage = (event) => {
          const message = event.data as { type: string; to?: string };
          if (message.to === 'test-requester') resolve(message.type);
        };
      });
      other.close();
      expect(received).toBe('takeover-denied');
      expect(p.readOnly).toBe(false);
      expect(p.lock).not.toBeNull();
      expect(hasUnsavedChanges()).toBe(true);
      expect(pixelAt(p.editor.readPixels(), 30, 20)[0]).toBeLessThan(10);
    },
  );

  it('successful handoff releases only after the latest pixels are in IndexedDB', async () => {
    const p = await start();
    drawStroke(p.editor, [
      { x: 15, y: 20 },
      { x: 45, y: 20 },
    ]);
    const other = new BroadcastChannel('paint-online');
    const received = new Promise<string>((resolve) => {
      other.onmessage = (event) => {
        const message = event.data as { type: string; to?: string };
        if (message.to === TAB_ID) resolve(message.type);
      };
    });
    other.postMessage({ type: 'takeover-request', projectId: p.id, from: TAB_ID });
    expect(await received).toBe('takeover-released');
    other.close();
    expect(p.readOnly).toBe(true);
    expect(p.lock).toBeNull();
    expect(hasUnsavedChanges()).toBe(false);
    const loaded = await repo.loadProject(p.id);
    const images = new Map(
      await Promise.all(
        [...loaded.blobs].map(
          async ([id, l]) => [id, await mainThreadCodec.decodeLayer(l.png)] as const,
        ),
      ),
    );
    expect(documentSpecFromRecord(loaded.document, images).rev).toBe(p.editor.document!.rev);
    const raster = [...images.values()][0];
    expect([...raster.data].some((v, i) => i % 4 === 0 && v < 10)).toBe(true);
  });
});
