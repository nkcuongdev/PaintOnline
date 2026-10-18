import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { displayPixel, drawOnCanvas, openEditorFromPreset, pasteImage } from './helpers';

/**
 * E2E GĐ3 (mục 9, 11.1): project, lưu trữ, autosave. Mốc Alpha — mở lại không mất bài.
 * Chạy trên Chromium, Firefox, WebKit với bản build production.
 */

async function waitSaved(page: Page): Promise<void> {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
    timeout: 15_000,
  });
}

function projectIdOf(page: Page): string {
  const match = /#\/project\/([0-9a-f-]{36})/.exec(page.url());
  if (!match?.[1]) throw new Error(`Không thấy id project trong ${page.url()}`);
  return match[1];
}

/** Đọc một store IndexedDB của app ngay trong trang. */
async function readStore<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open('paint-online');
        open.onerror = () => {
          reject(open.error ?? new Error('open'));
        };
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction(name, 'readonly').objectStore(name).getAll();
          request.onsuccess = () => {
            db.close();
            resolve(request.result as T[]);
          };
          request.onerror = () => {
            db.close();
            reject(request.error ?? new Error('read'));
          };
        };
      }),
    store,
  );
}

/** Ảnh nhiễu lớn (lượt lưu đầu mất thời gian mã hóa — dùng cho test đóng tab giữa lượt lưu). */
async function pasteNoise(page: Page, width: number, height: number): Promise<void> {
  await page.evaluate(
    async ([w, h]) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d');
      const image = ctx.createImageData(w, h);
      let seed = 1;
      for (let i = 0; i < image.data.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        image.data[i] = i % 4 === 3 ? 255 : seed >>> 24;
      }
      ctx.putImageData(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });
      if (!blob) throw new Error('no blob');
      const file = new File([blob], 'noise.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: dt });
      document.dispatchEvent(event);
    },
    [width, height] as const,
  );
}

test.describe('GĐ3 — autosave và mở lại', () => {
  test('vẽ → tự lưu → tải lại trang: đúng project, đúng nét vẽ, tiêu đề có dấu chưa lưu', async ({
    page,
  }) => {
    await openEditorFromPreset(page);
    await waitSaved(page);
    await expect(page).toHaveTitle(/^Ảnh mới 1080 × 1080 — Paint Online$/);
    await drawOnCanvas(page, [
      [0.3, 0.5],
      [0.5, 0.52],
      [0.7, 0.5],
    ]);
    // Thay đổi chưa lưu: "•" ở tiêu đề tab rồi tự lưu sau 1,5 s.
    await expect(page).toHaveTitle(/^• /);
    await waitSaved(page);
    await expect(page).toHaveTitle(/^Ảnh mới/);
    const before = await displayPixel(page, 0.5, 0.52);
    expect(before[0]).toBeLessThan(100);

    const id = projectIdOf(page);
    await page.reload();
    await expect(page.getByTestId('editor-screen')).toHaveAttribute('data-project-id', id);
    await waitSaved(page);
    await expect(page.getByTestId('undo')).toBeDisabled();
    await expect.poll(() => displayPixel(page, 0.5, 0.52)).toEqual(before);
    // Không báo nhầm "kết thúc đột ngột" khi tải lại bình thường.
    await expect(page.getByTestId('toast').filter({ hasText: /đột ngột/ })).toHaveCount(0);
  });

  test('Ctrl+S lưu ngay', async ({ page }) => {
    await openEditorFromPreset(page);
    await waitSaved(page);
    await drawOnCanvas(page, [
      [0.2, 0.2],
      [0.4, 0.3],
    ]);
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByTestId('toast').filter({ hasText: 'Đã lưu' })).toBeVisible();
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  });
});

test.describe('GĐ3 — trang chủ quản lý project', () => {
  test('lưới project: đổi tên, nhân bản, thùng rác, khôi phục, xóa vĩnh viễn', async ({ page }) => {
    // Luồng dài gồm nhiều lần lưu và mở dialog; WebKit trên runner CI có thể vượt 30 giây.
    test.slow();
    await openEditorFromPreset(page);
    await waitSaved(page);
    await page.getByTestId('back-to-home').click();
    const card = page.getByTestId('project-card');
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('project-thumbnail')).toBeVisible();

    // Đổi tên (tiếng Việt có dấu).
    await card.getByTestId('project-menu').click();
    await page.getByTestId('project-rename').click();
    await page.getByTestId('rename-input').fill('Sơ đồ kiến trúc');
    await page.getByTestId('rename-save').click();
    await expect(page.getByTestId('project-card-name')).toHaveText('Sơ đồ kiến trúc');

    // Nhân bản.
    await card.getByTestId('project-menu').click();
    await page.getByTestId('project-duplicate').click();
    await expect(page.getByTestId('project-card')).toHaveCount(2);
    await expect(page.getByTestId('project-card-name').first()).toHaveText(/Sơ đồ kiến trúc/);

    // Tìm kiếm không dấu.
    const search = page.getByTestId('project-search');
    await search.click();
    await search.fill('ban sao');
    await expect(search).toHaveValue('ban sao');
    await expect(page.getByTestId('project-card')).toHaveCount(1);
    await search.fill('');

    // Xóa mềm → thùng rác → khôi phục.
    await page.getByTestId('project-card').first().getByTestId('project-menu').click();
    await page.getByTestId('project-trash').click();
    await expect(page.getByTestId('project-card')).toHaveCount(1);
    await page.getByTestId('open-trash').click();
    await expect(page.getByTestId('trash-item')).toHaveCount(1);
    await expect(page.getByTestId('trash-item')).toContainText('Còn 7 ngày');
    await page.getByTestId('trash-restore').click();
    await expect(page.getByTestId('trash-item')).toHaveCount(0);

    // Xóa vĩnh viễn (có xác nhận).
    await page.getByTestId('close-trash').click();
    await page.getByTestId('project-card').first().getByTestId('project-menu').click();
    await page.getByTestId('project-trash').click();
    await page.getByTestId('open-trash').click();
    await page.getByTestId('trash-delete').click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('trash-item')).toHaveCount(0);
    await page.getByTestId('close-trash').click();
    await expect(page.getByTestId('project-card')).toHaveCount(1);
    const projects = await readStore<{ id: string }>(page, 'projects');
    expect(projects).toHaveLength(1);
  });

  test('preset tùy chỉnh', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('preset-custom').click();
    await page.getByTestId('new-image-width').fill('640');
    await page.getByTestId('new-image-height').fill('360');
    await page.getByTestId('new-image-create').click();
    await expect(page.getByTestId('status-size')).toHaveText(/640 × 360 px/);
  });
});

test.describe('GĐ3 — file .paint và xuất ảnh', () => {
  test('xuất .paint rồi nhập lại: project mới giống hệt', async ({ page }, testInfo) => {
    await page.goto('/');
    await pasteImage(page, 480, 320);
    await expect(page.getByTestId('editor-screen')).toBeVisible();
    // Ảnh dán mở ở chế độ Screenshot (tool island rút gọn — GĐ7): chọn Cọ bằng phím B.
    await page.keyboard.press('b');
    await drawOnCanvas(page, [
      [0.3, 0.4],
      [0.6, 0.45],
    ]);
    await waitSaved(page);
    const pixel = await displayPixel(page, 0.45, 0.425);

    await page.getByTestId('editor-menu').click();
    const download = page.waitForEvent('download');
    await page.getByTestId('menu-export-paint').click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.paint$/);
    const path = testInfo.outputPath('project.paint');
    await file.saveAs(path);
    // File ZIP chuẩn.
    expect(readFileSync(path).subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    await page.getByTestId('back-to-home').click();
    await page.getByTestId('file-input').setInputFiles(path);
    await expect(page.getByTestId('toast').filter({ hasText: 'Đã nhập project' })).toBeVisible();
    await expect(page.getByTestId('editor-screen')).toBeVisible();
    await expect(page.getByTestId('project-name')).toHaveText(/Ảnh dán/);
    await expect(page.getByTestId('status-size')).toHaveText(/480 × 320 px/);
    await expect.poll(() => displayPixel(page, 0.45, 0.425)).toEqual(pixel);
    await page.getByTestId('back-to-home').click();
    await expect(page.getByTestId('project-card')).toHaveCount(2);
  });

  test('project có Redact: cảnh báo trước khi xuất .paint', async ({ page }) => {
    await page.goto('/');
    await pasteImage(page, 480, 320);
    await page.getByTestId('tool-redact').click();
    await drawOnCanvas(page, [
      [0.3, 0.3],
      [0.5, 0.5],
    ]);
    await page.getByTestId('editor-menu').click();
    await page.getByTestId('menu-export-paint').click();
    await expect(page.getByTestId('paint-export-dialog')).toContainText('1 vùng che');
    const download = page.waitForEvent('download');
    await page.getByTestId('paint-export-bake').click();
    expect((await download).suggestedFilename()).toMatch(/\.paint$/);
  });

  test('file không phải .paint bị từ chối có thông báo', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('file-input').setInputFiles({
      name: 'gia.paint',
      mimeType: 'application/zip',
      buffer: Buffer.from('không phải zip'),
    });
    await expect(
      page.getByTestId('toast').filter({ hasText: /không phải file \.paint/ }),
    ).toBeVisible();
  });

  test('xuất JPG và WebP với chất lượng, tỉ lệ', async ({ page }, testInfo) => {
    await openEditorFromPreset(page);
    await page.keyboard.press('ControlOrMeta+Shift+s');
    const dialog = page.getByTestId('export-dialog');
    await expect(dialog).toBeVisible();

    await page.getByTestId('export-format-jpeg').click();
    await expect(page.getByTestId('export-background')).toBeVisible();
    await page.getByTestId('export-scale').getByRole('slider').focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('export-size')).toHaveText('540 × 540 px');
    await expect(page.getByTestId('export-estimate')).toHaveText(/≈/);
    let download = page.waitForEvent('download');
    await page.getByTestId('export-download').click();
    let file = await download;
    expect(file.suggestedFilename()).toMatch(/\.jpg$/);
    let path = testInfo.outputPath('out.jpg');
    await file.saveAs(path);
    expect(readFileSync(path).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));

    await page.keyboard.press('ControlOrMeta+Shift+s');
    await page.getByTestId('export-format-webp').click();
    await expect(page.getByTestId('export-estimate')).toHaveText(/≈/, { timeout: 15_000 });
    download = page.waitForEvent('download');
    await page.getByTestId('export-download').click();
    file = await download;
    expect(file.suggestedFilename()).toMatch(/\.webp$/);
    path = testInfo.outputPath('out.webp');
    await file.saveAs(path);
    const bytes = readFileSync(path);
    // WebP thật (WebKit không tự mã hóa WebP → bộ mã hóa WASM).
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
  });
});

test.describe('GĐ3 — an toàn dữ liệu (fault-injection, mục 11.1)', () => {
  test('hai tab cùng project: tab sau chỉ đọc, chuyển quyền chỉnh sửa được', async ({
    page,
    context,
  }) => {
    await openEditorFromPreset(page);
    await waitSaved(page);
    const second = await context.newPage();
    await second.goto(page.url());
    await expect(second.getByTestId('read-only-banner')).toBeVisible();
    await expect(second.getByTestId('save-status')).toHaveAttribute('data-status', 'readonly');
    await expect(second.getByTestId('tool-island')).toHaveCount(0);

    await second.getByTestId('take-over').click();
    await expect(second.getByTestId('read-only-banner')).toHaveCount(0);
    await expect(second.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    await expect(page.getByTestId('read-only-banner')).toBeVisible();
    await second.close();
  });

  test('đóng tab giữa lượt lưu: DB vẫn có một revision hợp lệ, mở lại được', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.getByTestId('start-screen').waitFor();
    await pasteNoise(page, 2400, 1600);
    await expect(page.getByTestId('editor-screen')).toBeVisible({ timeout: 20_000 });
    const id = projectIdOf(page);
    await waitSaved(page);
    // Ảnh dán mở ở chế độ Screenshot (tool island rút gọn — GĐ7): chọn Cọ bằng phím B.
    await page.keyboard.press('b');
    // Vẽ ở nửa dưới khung: tool island + Options bar (có thể xuống 2 dòng) phủ phần trên canvas.
    await drawOnCanvas(page, [
      [0.3, 0.5],
      [0.7, 0.85],
    ]);
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saving');
    await page.close({ runBeforeUnload: false });

    const reopened = await context.newPage();
    await reopened.goto(`/#/project/${id}`);
    await expect(reopened.getByTestId('editor-screen')).toBeVisible({ timeout: 20_000 });
    await expect(reopened.getByTestId('project-corrupt')).toHaveCount(0);
    await expect(reopened.getByTestId('status-size')).toHaveText(/2400 × 1600 px/);
    const [doc] = await readStore<{ rev: number }>(reopened, 'documents');
    const [meta] = await readStore<{ rev: number }>(reopened, 'projects');
    expect(doc?.rev).toBe(meta?.rev);
  });

  test('blob layer hỏng: mở được với layer trống và cảnh báo', async ({ page }) => {
    await openEditorFromPreset(page);
    await drawOnCanvas(page, [
      [0.3, 0.3],
      [0.6, 0.6],
    ]);
    await waitSaved(page);
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('paint-online');
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('layerBlobs', 'readwrite');
            const store = tx.objectStore('layerBlobs');
            const cursor = store.openCursor();
            cursor.onsuccess = () => {
              const c = cursor.result;
              if (!c) return;
              c.update({ ...c.value, png: new Uint8Array([137, 80, 78, 71, 1, 2, 3]).buffer });
              c.continue();
            };
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => {
              reject(tx.error ?? new Error('tx'));
            };
          };
        }),
    );
    await page.reload();
    await expect(page.getByTestId('editor-screen')).toBeVisible();
    await expect(page.getByTestId('toast').filter({ hasText: 'không đọc được' })).toBeVisible();
  });

  test('hết quota (Chromium: Storage.overrideQuotaForOrigin): báo, giữ dữ liệu, tự lưu lại khi có chỗ', async ({
    page,
    browserName,
    baseURL,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'CDP chỉ có trên Chromium; engine khác: test browser mode',
    );
    const cdp = await page.context().newCDPSession(page);
    await page.goto('/');
    await page.getByTestId('start-screen').waitFor();
    const origin = new URL(baseURL ?? '').origin;
    await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: 200_000 });
    await pasteNoise(page, 1600, 1000);
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'quota', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('quota-dialog')).toBeVisible();
    await cdp.send('Storage.overrideQuotaForOrigin', { origin });
    await page.getByTestId('quota-delete-checkpoints').click();
    await waitSaved(page);
  });

  test('phiên trước kết thúc đột ngột: banner khôi phục ghi thời điểm bản lưu', async ({
    page,
    context,
  }) => {
    await openEditorFromPreset(page);
    await waitSaved(page);
    // Giả lập crash: tab đóng mà không kịp ghi gì (localStorage và bản ghi phiên đều bị chặn).
    await page.evaluate(() => {
      Storage.prototype.setItem = () => undefined;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- gọi lại bằng apply với this đúng
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args) {
        if (this.name === 'session') throw new DOMException('crash', 'AbortError');
        return put.apply(this, args);
      } as typeof put;
    });
    await page.close({ runBeforeUnload: false });

    const home = await context.newPage();
    await home.goto('/');
    const banner = home.getByTestId('recovery-banner');
    await expect(banner).toContainText('kết thúc đột ngột');
    await expect(banner).toContainText(/lúc \d{2}:\d{2}/);
    await banner.getByTestId('recovery-continue').click();
    await expect(home.getByTestId('editor-screen')).toBeVisible();
    await expect(
      home.getByTestId('toast').filter({ hasText: /khôi phục bản lưu lúc/ }),
    ).toBeVisible();
  });

  test('rời trang bình thường: trang chủ đề nghị tiếp tục project đang làm', async ({ page }) => {
    await openEditorFromPreset(page);
    await waitSaved(page);
    // Rời app bình thường (pagehide chạy) rồi mở lại. Đóng hẳn tab rồi mở tab mới ngay lập tức thì
    // Firefox có thể chưa kịp đồng bộ localStorage của tab vừa đóng sang tab mới.
    await page.goto('about:blank');
    const home = page;
    await home.goto('/');
    const banner = home.getByTestId('recovery-banner');
    await expect(banner).toContainText('Bạn đang làm dở');
    await banner.getByTestId('recovery-dismiss').click();
    await expect(banner).toHaveCount(0);
  });
});
