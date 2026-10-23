import { expect, test, type Page } from '@playwright/test';
import type { DocumentRecord, LayerBlobRecord } from '../../src/services/storage/schema';
import {
  displayPixel,
  drawOnCanvas,
  makePngBase64,
  openEditorFromPreset,
  waitForStartScreen,
} from './helpers';

/** All faults live in Playwright's fresh contexts; never touch an existing browser profile. */
async function failSaves(page: Page, name: string | null) {
  await page.evaluate((failure) => {
    const state = window as typeof window & {
      round1SaveFault?: string | null;
      round1Patched?: boolean;
    };
    state.round1SaveFault = failure;
    if (state.round1Patched) return;
    state.round1Patched = true;
    // Intentionally borrow the native method and call it with the database receiver below.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, mode, options) {
      const names = typeof stores === 'string' ? [stores] : [...stores];
      if (state.round1SaveFault && mode === 'readwrite' && names.includes('documents')) {
        throw new DOMException('isolated regression fault', state.round1SaveFault);
      }
      return original.call(this, stores, mode, options);
    };
  }, name);
}
async function save(page: Page) {
  if (await page.getByTestId('quota-dialog').isVisible()) {
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('quota-dialog')).not.toBeVisible();
  }
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
}
async function storedPixels(page: Page, id: string) {
  return page.evaluate(async (projectId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const q = indexedDB.open('paint-online');
      q.onsuccess = () => {
        resolve(q.result);
      };
      q.onerror = () => {
        reject(q.error ?? new Error('IndexedDB open failed'));
      };
    });
    const read = <T>(store: string) =>
      new Promise<T[]>((resolve) => {
        const q = db.transaction(store).objectStore(store).getAll();
        q.onsuccess = () => {
          resolve(q.result as T[]);
        };
      });
    const doc = (await read<DocumentRecord>('documents')).find((d) => d.projectId === projectId)!;
    const blobs = (await read<LayerBlobRecord>('layerBlobs')).filter(
      (l) => l.projectId === projectId,
    );
    db.close();
    const pixels = [];
    for (const blob of blobs) {
      const bitmap = await createImageBitmap(new Blob([blob.png], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 2166136261,
        ink = 0;
      for (let i = 0; i < rgba.length; i++) {
        hash = Math.imul(hash ^ rgba[i], 16777619) >>> 0;
        if (i % 4 === 0 && rgba[i] < 100 && rgba[i + 3] > 0) ink++;
      }
      pixels.push({ id: blob.layerId, bounds: blob.bounds, hash, ink });
    }
    return { rev: doc.rev, pixels };
  }, id);
}
async function hasBluePixel(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="canvas-view"] canvas');
    if (!canvas) return false;
    const rgba = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < rgba.length; i += 4)
      if (rgba[i] === 59 && rgba[i + 1] === 91 && rgba[i + 2] === 219) return true;
    return false;
  });
}
async function pasteDraft(page: Page) {
  const data = await makePngBase64(page, 40, 40);
  await page.evaluate((base64) => {
    const dt = new DataTransfer();
    dt.items.add(
      new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], 'draft.png', {
        type: 'image/png',
      }),
    );
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: dt });
    document.dispatchEvent(event);
  }, data);
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'dirty');
}

async function drawAndReadBlackStroke(page: Page): Promise<number[]> {
  await drawOnCanvas(page, [
    [0.4, 0.5],
    [0.6, 0.5],
  ]);
  // Pointer-up commits the stroke before requestAnimationFrame paints the display canvas.
  // Capture the reference only after that frame, especially on WebKit CI runners.
  await expect.poll(() => displayPixel(page, 0.5, 0.5)).toEqual([0, 0, 0, 255]);
  return displayPixel(page, 0.5, 0.5);
}

test.describe('Đợt 1 — dữ liệu chưa lưu', () => {
  test('paste → Ctrl+S → reload retains the exact visible pasted pixel', async ({ page }) => {
    await openEditorFromPreset(page);
    await save(page);
    await pasteDraft(page);
    await expect.poll(() => hasBluePixel(page)).toBe(true);
    await save(page);
    const id = (await page.getByTestId('editor-screen').getAttribute('data-project-id'))!;
    const before = await storedPixels(page, id);
    expect(before.pixels.some((p) => p.ink > 0)).toBe(true);
    await page.reload();
    await expect(page.getByTestId('editor-screen')).toBeVisible();
    await expect.poll(() => hasBluePixel(page)).toBe(true);
    expect(await storedPixels(page, id)).toEqual(before);
  });

  for (const fault of ['QuotaExceededError', 'UnknownError']) {
    test(`${fault}: Home → preset/other project preserves work; recovery saves pixels`, async ({
      page,
    }) => {
      await openEditorFromPreset(page);
      await save(page);
      const other = page.url().split('/').at(-1)!;
      await page.getByTestId('back-to-home').click();
      await waitForStartScreen(page);
      await page.getByTestId('preset-square').click();
      await save(page);
      const current = await page.getByTestId('editor-screen').getAttribute('data-project-id');
      await failSaves(page, fault);
      const before = await drawAndReadBlackStroke(page);
      await page.keyboard.press('ControlOrMeta+s');
      if (fault === 'QuotaExceededError') {
        await expect(page.getByTestId('quota-dialog')).toBeVisible();
      }
      await page.keyboard.press('Escape');
      await page.getByTestId('back-to-home').click();
      await expect(page.getByTestId('retained-project')).toBeVisible();
      await page.getByTestId('preset-square').click();
      await expect(page.getByTestId('retained-project')).toBeVisible();
      await expect(page.getByTestId('project-card')).toHaveCount(2);
      await page
        .locator(`[data-testid="project-card"][data-project-id="${other}"]`)
        .getByTestId('project-card-name')
        .click();
      await expect(page.getByTestId('retained-project')).toBeVisible();
      const download = page.waitForEvent('download');
      await page
        .getByTestId('retained-project')
        .getByRole('button', { name: 'Tải bản sao lưu .paint', exact: true })
        .click();
      expect((await download).suggestedFilename()).toMatch(/\.paint$/);
      await page
        .getByTestId('retained-project')
        .getByRole('button', { name: 'Tiếp tục', exact: true })
        .click();
      await expect(page.getByTestId('editor-screen')).toHaveAttribute('data-project-id', current!);
      if (fault === 'QuotaExceededError') await page.keyboard.press('Escape');
      await expect.poll(() => displayPixel(page, 0.5, 0.5)).toEqual(before);
      await failSaves(page, null);
      await save(page);
      await page.reload();
      await expect(page.getByTestId('editor-screen')).toBeVisible();
      await expect.poll(() => displayPixel(page, 0.5, 0.5)).toEqual(before);
    });
  }

  test('two tabs: failed save refuses takeover past timeout; retry transfers persisted pixels', async ({
    page,
    context,
  }) => {
    await openEditorFromPreset(page);
    await save(page);
    const second = await context.newPage();
    await second.goto(page.url());
    await expect(second.getByTestId('read-only-banner')).toBeVisible();
    await failSaves(page, 'QuotaExceededError');
    await page.bringToFront();
    const before = await drawAndReadBlackStroke(page);
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByTestId('quota-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await second.getByTestId('take-over').click();
    await expect(second.getByTestId('take-over')).toBeEnabled({ timeout: 12_000 });
    await expect(second.getByTestId('read-only-banner')).toBeVisible();
    await expect(page.getByTestId('read-only-banner')).toHaveCount(0);
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'quota');
    await expect(page).toHaveTitle(/^• /);
    await expect.poll(() => displayPixel(page, 0.5, 0.5)).toEqual(before);
    await failSaves(page, null);
    await second.getByTestId('take-over').click();
    await expect(second.getByTestId('read-only-banner')).toHaveCount(0);
    await expect(page.getByTestId('read-only-banner')).toBeVisible();
    await expect.poll(() => displayPixel(second, 0.5, 0.5)).toEqual(before);
    const id = (await second.getByTestId('editor-screen').getAttribute('data-project-id'))!;
    const persisted = await storedPixels(second, id);
    expect(persisted.rev).toBeGreaterThan(0);
    expect(persisted.pixels.some((p) => p.ink > 0)).toBe(true);
    await second.reload();
    await expect(second.getByTestId('editor-screen')).toBeVisible();
    expect(await storedPixels(second, id)).toEqual(persisted);
  });
});
