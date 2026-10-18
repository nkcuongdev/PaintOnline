import { afterEach, describe, expect, it } from 'vitest';
import type { Editor } from '@/engine/core/Editor';
import {
  createTestEditor,
  diffPixels,
  drawStroke,
  pixelAt,
  randomStroke,
  seededRandom,
} from '@/engine/testing/helpers';
import { buildProjectFile, readProjectFile, redactionFills } from '@/services/io/projectFile';
import { mainThreadCodec } from '@/services/workers/codec';
import { Autosave, type AutosaveSource } from './autosave';
import { Database } from './db';
import { acquireProjectLock } from './locks';
import { CorruptProjectError, ProjectRepository, StaleRevisionError } from './projectRepo';
import { decodeLayerImages, documentSpecFromRecord } from './restore';
import type { SaveStatus } from './saveStatus';

/**
 * Lưu trữ trên IndexedDB thật của Chromium, Firefox, WebKit (mục 11.1 — fault-injection lưu trữ):
 * round-trip đúng từng pixel và đối tượng, hủy transaction giữa chừng, giả lập hết quota, kết nối
 * DB bị đóng, blob hỏng khi tải, revision cũ, checkpoint, file .paint, khóa theo tab.
 * Nghiệm thu GĐ3: DB luôn chứa một revision hợp lệ.
 */

const editors: Editor[] = [];
const databases: Database[] = [];

afterEach(async () => {
  for (const editor of editors.splice(0)) editor.dispose();
  for (const db of databases.splice(0)) await db.destroy();
});

function track(editor: Editor): Editor {
  editors.push(editor);
  return editor;
}

function newRepo(): ProjectRepository {
  const db = new Database(`paint-online-test-${crypto.randomUUID()}`);
  databases.push(db);
  return new ProjectRepository(db);
}

function sourceOf(editor: Editor): AutosaveSource {
  return {
    get rev() {
      return editor.document?.rev ?? 0;
    },
    get blocked() {
      return editor.isGestureActive || editor.busy;
    },
    serialize: () => editor.serialize(),
    captureLayers: (saved) => editor.captureLayers(saved),
    renderThumbnail: (side) => editor.renderThumbnail(side),
    view: () => editor.view,
  };
}

function autosaveFor(
  editor: Editor,
  repo: ProjectRepository,
  statuses: SaveStatus[] = [],
  options: Partial<ConstructorParameters<typeof Autosave>[0]> = {},
): Autosave {
  const id = editor.document?.id ?? '';
  return new Autosave({
    projectId: id,
    meta: () => ({ name: 'Thử nghiệm', mode: 'paint' }),
    repo,
    codec: mainThreadCodec,
    source: sourceOf(editor),
    onStatus: (s) => statuses.push(s),
    retryDelaysMs: [10, 10, 10],
    ...options,
  });
}

async function load(
  repo: ProjectRepository,
  id: string,
): Promise<{ editor: Editor; failed: number }> {
  const loaded = await repo.loadProject(id);
  const { images, failed } = await decodeLayerImages(loaded, mainThreadCodec);
  const editor = track(createTestEditor(1, 1));
  expect(editor.createDocument(documentSpecFromRecord(loaded.document, images))).toBe(true);
  return { editor, failed };
}

/** Document có pixel bán trong suốt, layer lệch vị trí, layer chú thích nhiều loại đối tượng. */
function richEditor(): Editor {
  const editor = track(
    createTestEditor(700, 460, { background: { kind: 'color', color: '#F1F3F5FF' } }),
  );
  const random = seededRandom(7);
  for (let i = 0; i < 25; i++) randomStroke(editor, random, 700, 460);
  editor.colors.setPrimary('#E0313199');
  editor.colors.setSecondary('#228BE680');
  editor.tools.setActive('rect');
  editor.dispatchPointer('down', { x: 40.5, y: 30.25 });
  editor.dispatchPointer('move', { x: 300, y: 200 });
  editor.dispatchPointer('up', { x: 300, y: 200 });
  editor.tools.setActive('arrow');
  editor.dispatchPointer('down', { x: 500, y: 400 });
  editor.dispatchPointer('move', { x: 620, y: 80 });
  editor.dispatchPointer('up', { x: 620, y: 80 });
  editor.tools.setActive('redact');
  editor.dispatchPointer('down', { x: 100.3, y: 300.7 });
  editor.dispatchPointer('move', { x: 260.2, y: 360.4 });
  editor.dispatchPointer('up', { x: 260.2, y: 360.4 });
  return editor;
}

/** Chọn layer ảnh (sau richEditor layer chú thích đang hoạt động) rồi vẽ một nét brush. */
function paintOnRaster(editor: Editor, points: { x: number; y: number }[]): void {
  const raster = editor.document?.layers.find((l) => l.kind === 'raster');
  if (raster) editor.layers.setActive(raster.id);
  editor.tools.setActive('brush');
  const rev = editor.document?.rev;
  drawStroke(editor, points);
  expect(editor.document?.rev).not.toBe(rev);
}

function vectorObjects(editor: Editor) {
  return editor
    .serialize()
    ?.layers.flatMap((l) => (l.kind === 'vector' ? [{ id: l.id, objects: l.objects }] : []));
}

describe('Lưu trữ IndexedDB (mục 6.4, 6.6)', () => {
  it('lưu rồi mở lại: đúng từng pixel, đúng đối tượng, revision đếm tiếp', async () => {
    const repo = newRepo();
    const editor = richEditor();
    const before = editor.readPixels();
    const autosave = autosaveFor(editor, repo);
    expect(await autosave.saveNow('strict')).toBe(true);

    const id = editor.document?.id ?? '';
    const { editor: reopened, failed } = await load(repo, id);
    expect(failed).toBe(0);
    expect(diffPixels(reopened.readPixels(), before)).toBe(0);
    expect(vectorObjects(reopened)).toEqual(vectorObjects(editor));
    expect(reopened.document?.rev).toBe(editor.document?.rev);
    expect(reopened.document?.activeLayerId).toBe(editor.document?.activeLayerId);

    const meta = await repo.getMeta(id);
    expect(meta?.rev).toBe(editor.document?.rev);
    expect(meta?.layerCount).toBe(2);
    expect(await repo.getThumbnail(id)).not.toBeNull();
  });

  it('lượt lưu sau chỉ ghi layer đổi; layer bị xóa thì blob bị xóa cùng transaction', async () => {
    const repo = newRepo();
    const editor = richEditor();
    const autosave = autosaveFor(editor, repo);
    await autosave.saveNow();
    const id = editor.document?.id ?? '';
    // Rasterize layer chú thích (layer vector được thay bằng layer raster cùng vị trí).
    editor.tools.setActive('brush');
    editor.layers.setPaintPolicy('draw', 'rasterize');
    drawStroke(editor, [
      { x: 20, y: 20 },
      { x: 60, y: 60 },
    ]);
    await autosave.saveNow();
    const loaded = await repo.loadProject(id);
    const rasterIds = loaded.document.layers.filter((l) => l.kind === 'raster').map((l) => l.id);
    expect([...loaded.blobs.keys()].sort()).toEqual(rasterIds.sort());
    // Undo rasterize: blob của layer raster mới phải bị xóa.
    while (editor.undo()) {
      if (editor.document?.layers.some((l) => l.kind === 'vector')) break;
    }
    await autosave.saveNow();
    const after = await repo.loadProject(id);
    const ids = after.document.layers
      .filter((l) => l.kind === 'raster' && l.bounds)
      .map((l) => l.id);
    expect([...after.blobs.keys()].sort()).toEqual(ids.sort());
  });

  it('chụp rồi vẽ ngay: ảnh đã lưu không chứa nét vẽ sau (quyết định 10.4)', async () => {
    const editor = track(createTestEditor(300, 200));
    editor.colors.setPrimary('#1C7ED6FF');
    editor.options.set('brush', { size: 20, preset: 'round', opacity: 1 });
    paintOnRaster(editor, [
      { x: 20, y: 20 },
      { x: 120, y: 20 },
    ]);
    const captures = editor.captureLayers(new Map());
    // Nét vẽ ngay sau khi chụp — surface có thể bị cấp phát lại vì nét đi ra ngoài vùng cũ.
    editor.colors.setPrimary('#E03131FF');
    drawStroke(editor, [
      { x: 60, y: 150 },
      { x: 290, y: 190 },
    ]);
    expect(captures).toHaveLength(1);
    const capture = captures[0];
    const png = await mainThreadCodec.encodeLayer(await capture.bitmap);
    const image = await mainThreadCodec.decodeLayer(png);
    const restored = track(createTestEditor(300, 200));
    restored.createDocument({
      width: 300,
      height: 200,
      background: { kind: 'transparent' },
      layers: [{ kind: 'raster', name: 'x', image, origin: capture.bounds }],
    });
    const px = restored.readPixels();
    expect(pixelAt(px, 70, 20)[3]).toBe(255);
    expect(pixelAt(px, 180, 172)[3]).toBe(0);
  });

  it('hủy transaction giữa lượt lưu: DB giữ nguyên revision cũ đầy đủ, lượt sau thành công', async () => {
    const repo = newRepo();
    const editor = richEditor();
    const statuses: SaveStatus[] = [];
    const autosave = autosaveFor(editor, repo, statuses);
    await autosave.saveNow();
    const id = editor.document?.id ?? '';
    const savedRev = editor.document?.rev ?? 0;
    const savedPixels = editor.readPixels();

    paintOnRaster(editor, [
      { x: 0, y: 0 },
      { x: 699, y: 459 },
    ]);
    let aborts = 0;
    repo.db.faults = {
      beforeCommit: ({ op, tx }) => {
        if (op !== 'save') return;
        aborts++;
        tx.abort();
      },
    };
    expect(await autosave.saveNow()).toBe(false);
    expect(aborts).toBeGreaterThan(0);
    // DB vẫn là revision cũ, đọc được đầy đủ và đúng pixel.
    const { editor: old, failed } = await load(repo, id);
    expect(failed).toBe(0);
    expect(old.document?.rev).toBe(savedRev);
    expect(diffPixels(old.readPixels(), savedPixels)).toBe(0);

    repo.db.faults = null;
    await expect.poll(() => autosave.current.kind, { timeout: 2000 }).toBe('saved');
    const { editor: fresh } = await load(repo, id);
    expect(fresh.document?.rev).toBe(editor.document?.rev);
    expect(diffPixels(fresh.readPixels(), editor.readPixels())).toBe(0);
  });

  it('hết quota: trạng thái "Hết dung lượng", DB không đổi, dữ liệu vẫn trong bộ nhớ', async () => {
    const repo = newRepo();
    const editor = richEditor();
    const autosave = autosaveFor(editor, repo);
    await autosave.saveNow();
    await repo.writeCheckpoint(editor.document?.id ?? '');
    const id = editor.document?.id ?? '';
    const savedRev = editor.document?.rev ?? 0;
    repo.db.faults = {
      beforeCommit: ({ op }) => {
        if (op === 'save') throw new DOMException('Hết dung lượng', 'QuotaExceededError');
      },
    };
    paintOnRaster(editor, [
      { x: 10, y: 400 },
      { x: 600, y: 420 },
    ]);
    expect(await autosave.saveNow()).toBe(false);
    expect(autosave.current.kind).toBe('quota');
    // Checkpoint là thứ bị xóa đầu tiên.
    expect(await repo.getCheckpointInfo(id)).toBeNull();
    expect((await repo.loadProject(id)).document.rev).toBe(savedRev);
    // Giải phóng dung lượng → thử lại thành công.
    repo.db.faults = null;
    autosave.resume();
    await expect.poll(() => autosave.current.kind, { timeout: 2000 }).toBe('saved');
    expect((await repo.loadProject(id)).document.rev).toBe(editor.document?.rev);
  });

  it('kết nối DB bị đóng: mở lại và lưu lại toàn bộ layer', async () => {
    const repo = newRepo();
    const editor = richEditor();
    const autosave = autosaveFor(editor, repo);
    await autosave.saveNow();
    const id = editor.document?.id ?? '';
    // Trình duyệt đóng kết nối (versionchange/dọn dẹp) rồi DB mất blob của layer.
    await repo.db.close({ unexpected: true });
    const db = await repo.db.get();
    await db.clear('layerBlobs');
    paintOnRaster(editor, [
      { x: 30, y: 30 },
      { x: 40, y: 40 },
    ]);
    expect(await autosave.saveNow()).toBe(true);
    const { editor: reopened, failed } = await load(repo, id);
    expect(failed).toBe(0);
    expect(diffPixels(reopened.readPixels(), editor.readPixels())).toBe(0);
  });

  it('blob layer hỏng khi tải: layer trống kèm cảnh báo, vẫn mở được', async () => {
    const repo = newRepo();
    const editor = richEditor();
    await autosaveFor(editor, repo).saveNow();
    const id = editor.document?.id ?? '';
    const db = await repo.db.get();
    const blobs = await db.getAll('layerBlobs');
    const first = blobs[0];
    await db.put('layerBlobs', { ...first, png: new Uint8Array([1, 2, 3, 4]).buffer });
    const { editor: reopened, failed } = await load(repo, id);
    expect(failed).toBe(1);
    expect(reopened.document?.layers).toHaveLength(2);
  });

  it('revision cũ không ghi đè revision mới (lượt lưu chậm)', async () => {
    const repo = newRepo();
    const editor = richEditor();
    const autosave = autosaveFor(editor, repo);
    await autosave.saveNow();
    const id = editor.document?.id ?? '';
    const data = editor.serialize()!;
    const request = {
      projectId: id,
      name: 'x',
      mode: 'paint' as const,
      layers: [],
      thumbnail: null,
    };
    const document = { ...data, schemaVersion: 1, projectId: id, viewport: editor.view };
    await repo.saveSnapshot({ ...request, document: { ...document, rev: data.rev + 5 } });
    await expect(
      repo.saveSnapshot({ ...request, document: { ...document, rev: data.rev + 1 } }),
    ).rejects.toBeInstanceOf(StaleRevisionError);
    expect((await repo.loadProject(id)).document.rev).toBe(data.rev + 5);
  });

  it('bản lưu hỏng: đề nghị checkpoint; mở checkpoint khôi phục revision hợp lệ', async () => {
    const repo = newRepo();
    const editor = richEditor();
    const autosave = autosaveFor(editor, repo);
    await autosave.saveNow();
    const id = editor.document?.id ?? '';
    const pixels = editor.readPixels();
    const checkpoint = await repo.writeCheckpoint(id);
    expect(checkpoint?.rev).toBe(editor.document?.rev);
    const db = await repo.db.get();
    await db.put('documents', { projectId: id, rev: 999, garbage: true } as never);
    await expect(repo.loadProject(id)).rejects.toSatisfy(
      (e: unknown) => e instanceof CorruptProjectError && e.hasCheckpoint,
    );
    await repo.restoreCheckpoint(id);
    const { editor: restored } = await load(repo, id);
    expect(diffPixels(restored.readPixels(), pixels)).toBe(0);
    // Revision sau khôi phục lớn hơn mọi revision đã ghi.
    expect(restored.document?.rev).toBeGreaterThan(999);
  });

  it('thùng rác, nhân bản, xóa hẳn project quá 7 ngày', async () => {
    const repo = newRepo();
    const editor = richEditor();
    await autosaveFor(editor, repo).saveNow();
    const id = editor.document?.id ?? '';
    const copyId = crypto.randomUUID();
    await repo.duplicate(id, copyId, 'Bản sao');
    const { editor: copy } = await load(repo, copyId);
    expect(diffPixels(copy.readPixels(), editor.readPixels())).toBe(0);

    await repo.moveToTrash(id);
    await expect(repo.loadProject(id)).rejects.toThrow();
    await repo.restoreFromTrash(id);
    expect((await repo.getMeta(id))?.deletedAt).toBeUndefined();

    const old = new ProjectRepository(repo.db, () => Date.now() - 8 * 24 * 3600 * 1000);
    await old.moveToTrash(copyId);
    expect(await repo.purgeExpired()).toEqual([copyId]);
    expect(await repo.getMeta(copyId)).toBeNull();
    const db = await repo.db.get();
    expect(await db.getAll('layerBlobs', IDBKeyRange.bound([copyId], [copyId, []]))).toEqual([]);
    expect((await repo.listProjects()).map((p) => p.id)).toEqual([id]);
  });
});

describe('File .paint (mục 6.5, 10.2)', () => {
  it('round-trip giữ nguyên từng pixel và đối tượng', async () => {
    const repo = newRepo();
    const editor = richEditor();
    await autosaveFor(editor, repo).saveNow();
    const id = editor.document?.id ?? '';
    const bundle = await repo.readBundle(id);
    const file = await buildProjectFile(bundle, mainThreadCodec, {
      appVersion: 'test',
      bakeRedactions: false,
    });
    const imported = await readProjectFile(file, mainThreadCodec);
    expect(imported.meta.name).toBe('Thử nghiệm');
    const newId = crypto.randomUUID();
    await repo.createProject(newId, {
      ...imported,
      document: { ...imported.document, projectId: newId },
    });
    const { editor: reopened, failed } = await load(repo, newId);
    expect(failed).toBe(0);
    expect(diffPixels(reopened.readPixels(), editor.readPixels())).toBe(0);
    expect(vectorObjects(reopened)).toEqual(vectorObjects(editor));
  });

  it('"Áp dụng vĩnh viễn vùng che": file không còn pixel gốc dưới Redact', async () => {
    const repo = newRepo();
    const editor = richEditor();
    await autosaveFor(editor, repo).saveNow();
    const bundle = await repo.readBundle(editor.document?.id ?? '');
    const fills = redactionFills(bundle.document);
    expect(fills.size).toBe(1);
    const file = await buildProjectFile(bundle, mainThreadCodec, {
      appVersion: 'test',
      bakeRedactions: true,
    });
    const imported = await readProjectFile(file, mainThreadCodec);
    // Xóa layer chú thích: chỉ còn pixel của layer ảnh.
    const document = {
      ...imported.document,
      layers: imported.document.layers.filter((l) => l.kind === 'raster'),
    };
    const raster = document.layers[0];
    const png = imported.layers.find((l) => l.layerId === raster.id)!.png;
    const image = await mainThreadCodec.decodeLayer(png);
    const check = track(createTestEditor(700, 460));
    check.createDocument({
      width: 700,
      height: 460,
      background: { kind: 'transparent' },
      layers: [{ kind: 'raster', name: 'x', image, origin: { x: 0, y: 0 } }],
    });
    const px = check.readPixels({ x: 100, y: 300, width: 161, height: 61 });
    for (let i = 0; i < px.data.length; i += 4) {
      // Đặc, đúng màu Redact (#000000) — không còn pixel nào của nét vẽ gốc.
      expect([px.data[i], px.data[i + 1], px.data[i + 2], px.data[i + 3]]).toEqual([0, 0, 0, 255]);
    }
  });

  it('từ chối file không hợp lệ', async () => {
    const codes: string[] = [];
    const tryRead = async (blob: Blob) => {
      try {
        await readProjectFile(blob, mainThreadCodec);
        codes.push('ok');
      } catch (error) {
        codes.push((error as { code?: string }).code ?? 'other');
      }
    };
    await tryRead(new Blob(['xin chào']));
    const { zipEntries } = await import('@/services/workers/ops/zip');
    const enc = (s: string) => new TextEncoder().encode(s);
    await tryRead(
      new Blob([
        zipEntries([
          { path: 'manifest.json', data: enc('{"format":"x"}'), level: 6 },
        ]) as Uint8Array<ArrayBuffer>,
      ]),
    );
    await tryRead(
      new Blob([
        zipEntries([
          {
            path: 'manifest.json',
            data: enc('{"format":"paint-online","formatVersion":99,"document":{}}'),
            level: 6,
          },
        ]) as Uint8Array<ArrayBuffer>,
      ]),
    );
    await tryRead(
      new Blob([
        zipEntries([
          {
            path: 'manifest.json',
            data: enc('{"format":"paint-online","formatVersion":1,"document":{"layers":1}}'),
            level: 6,
          },
        ]) as Uint8Array<ArrayBuffer>,
      ]),
    );
    expect(codes).toEqual(['notPaintFile', 'notPaintFile', 'newerVersion', 'invalidManifest']);
  });
});

describe('Khóa project theo tab (mục 6.6, 10.1)', () => {
  it('chỉ một bên giữ khóa; nhả thì bên khác lấy được; steal làm bên cũ mất khóa', async () => {
    const id = crypto.randomUUID();
    const first = await acquireProjectLock(id);
    expect(first).not.toBeNull();
    expect(await acquireProjectLock(id)).toBeNull();
    first?.release();
    const second = await acquireProjectLock(id, { waitMs: 1000 });
    expect(second).not.toBeNull();
    let lost = false;
    second?.onLost(() => {
      lost = true;
    });
    const third = await acquireProjectLock(id, { waitMs: 50, stealOnTimeout: true });
    expect(third).not.toBeNull();
    await expect.poll(() => lost).toBe(true);
    third?.release();
  });
});
