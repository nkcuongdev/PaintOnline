import { expect, test, type Page } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { displayPixel, drawOnCanvas, openEditorFromPreset, waitForStartScreen } from './helpers';

async function sourceState(page: Page, id: string, damage?: 'png' | 'document') {
  return page.evaluate(
    async ({ id, damage }) => {
      const open = indexedDB.open('paint-online');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        open.onsuccess = () => {
          resolve(open.result);
        };
        open.onerror = () => {
          reject(open.error ?? new Error('open failed'));
        };
      });
      const tx = db.transaction(
        ['documents', 'layerBlobs', 'checkpoints'],
        damage ? 'readwrite' : 'readonly',
      );
      const get = <T>(request: IDBRequest<T>) =>
        new Promise<T>((resolve, reject) => {
          request.onsuccess = () => {
            resolve(request.result);
          };
          request.onerror = () => {
            reject(request.error ?? new Error('read failed'));
          };
        });
      const document = (await get(tx.objectStore('documents').get(id))) as {
        width: number;
        rev: number;
      };
      const layers = (await get(
        tx.objectStore('layerBlobs').getAll(IDBKeyRange.bound([id], [id, []])),
      )) as { png: ArrayBuffer }[];
      const checkpoint = (await get(tx.objectStore('checkpoints').get(id))) as
        | {
            rev: number;
            createdAt: number;
            layers: { png: ArrayBuffer }[];
          }
        | undefined;
      if (damage === 'document') tx.objectStore('documents').put({ ...document, width: 0 });
      if (damage === 'png')
        for (const layer of layers)
          tx.objectStore('layerBlobs').put({ ...layer, png: new Uint8Array([1, 2, 3]).buffer });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => {
          resolve();
        };
        tx.onerror = () => {
          reject(tx.error ?? new Error('transaction failed'));
        };
      });
      db.close();
      const fingerprint = (png: ArrayBuffer) => {
        let hash = 2166136261;
        for (const n of new Uint8Array(png)) hash = Math.imul(hash ^ n, 16777619);
        return [png.byteLength, hash >>> 0];
      };
      return {
        document,
        layers: layers.map((l) => fingerprint(l.png)),
        checkpoint: checkpoint
          ? {
              rev: checkpoint.rev,
              createdAt: checkpoint.createdAt,
              layers: checkpoint.layers.map((l) => fingerprint(l.png)),
            }
          : null,
      };
    },
    { id, damage },
  );
}

for (const damage of ['png', 'document'] as const) {
  test(`R03/E02: ${damage} damage → checkpoint preview → independent editable copy preserves the source`, async ({
    page,
  }) => {
    await openEditorFromPreset(page);
    await drawOnCanvas(page, [
      [0.3, 0.5],
      [0.6, 0.5],
    ]);
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    const pixel = await displayPixel(page, 0.45, 0.5);
    expect(pixel[0]).toBeLessThan(100);
    const id = (await page.getByTestId('editor-screen').getAttribute('data-project-id'))!;
    await page.getByTestId('back-to-home').click();
    await waitForStartScreen(page);
    // Home renders while the real close/save/checkpoint operation is settling.
    // Establish a good checkpoint before injecting damage into the source.
    await expect.poll(async () => (await sourceState(page, id)).checkpoint).not.toBeNull();
    await sourceState(page, id, damage);
    const original = await sourceState(page, id);
    await page.goto(`/#/project/${id}`);
    if (damage === 'png') await expect(page.getByTestId('recovery-protected')).toBeVisible();
    else await expect(page.getByTestId('project-corrupt')).toBeVisible();
    await page.getByTestId('view-checkpoint').click();
    await expect(page.getByTestId('checkpoint-image')).toBeVisible();
    await page.getByTestId('copy-checkpoint').click();
    await expect(page.getByTestId('editor-screen')).toBeVisible();
    await expect(page.getByTestId('editor-screen')).not.toHaveAttribute('data-project-id', id);
    await expect.poll(() => displayPixel(page, 0.45, 0.5)).toEqual(pixel);
    await drawOnCanvas(page, [
      [0.3, 0.75],
      [0.6, 0.75],
    ]);
    await page.getByTestId('back-to-home').click();
    await waitForStartScreen(page);
    expect(await sourceState(page, id)).toEqual(original);
    if (damage === 'png') {
      await page.goto(`/#/project/${id}`);
      await page.getByTestId('copy-degraded').click();
      await expect(page.getByTestId('editor-screen')).not.toHaveAttribute('data-project-id', id);
      await drawOnCanvas(page, [
        [0.3, 0.75],
        [0.6, 0.75],
      ]);
      await page.getByTestId('back-to-home').click();
      await waitForStartScreen(page);
      expect(await sourceState(page, id)).toEqual(original);
    }
  });
}

test('R02: oversized manifest dimensions and SVG reject clearly; existing project and editor remain usable', async ({
  page,
}) => {
  await openEditorFromPreset(page);
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  await page.getByTestId('back-to-home').click();
  await waitForStartScreen(page);
  const document = {
    schemaVersion: 1,
    projectId: 'rejected',
    rev: 0,
    width: 9000,
    height: 8,
    background: { kind: 'transparent' },
    activeLayerId: 'r',
    palette: [],
    viewport: { zoom: 1, panX: 0, panY: 0 },
    layers: [
      {
        id: 'r',
        kind: 'raster',
        name: 'empty',
        bounds: null,
        contentRev: 0,
        opacity: 1,
        blendMode: 'normal',
        visible: true,
        locked: false,
        alphaLocked: false,
      },
    ],
  };
  const buffer = zipSync({
    'manifest.json': strToU8(
      JSON.stringify({ format: 'paint-online', formatVersion: 1, document }),
    ),
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'too-large.paint',
    mimeType: 'application/zip',
    buffer: Buffer.from(buffer),
  });
  await expect(
    page.getByTestId('toast').filter({ hasText: 'vượt giới hạn của thiết bị' }),
  ).toBeVisible();
  await expect(page.getByTestId('project-card')).toHaveCount(1);
  await page.getByTestId('file-input').setInputFiles({
    name: 'huge.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100000" height="100000"/>'),
  });
  await expect(page.getByTestId('toast').filter({ hasText: 'ngân sách giải mã' })).toBeVisible();
  await page.getByTestId('project-card').click();
  await expect(page.getByTestId('editor-screen')).toBeVisible();
  await drawOnCanvas(page, [
    [0.3, 0.5],
    [0.6, 0.5],
  ]);
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
});
