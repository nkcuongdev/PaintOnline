import { expect, test, type Page } from '@playwright/test';
import { drawOnCanvas, openEditorFromPreset, pasteImage, waitForStartScreen } from './helpers';

/**
 * E2E GĐ8+9 cho trình duyệt laptop (ADR 0028): Command Palette, bảng phím tắt, Cài đặt, Zen mode,
 * toàn màn hình, mini toolbar, bố cục laptop 1024–1279 px, lưới/thước/bám lưới, HUD cọ, bảng màu từ
 * ảnh, danh sách đối tượng, nhật ký lỗi, lưu nhanh ra file (File System Access API giả lập).
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

async function canvasPoint(page: Page, fx: number, fy: number): Promise<[number, number]> {
  const box = await page.getByTestId('canvas-view').boundingBox();
  if (!box) throw new Error('canvas-view không hiển thị');
  return [box.x + box.width * fx, box.y + box.height * fy];
}

test.describe('GĐ8+9 — trải nghiệm desktop', () => {
  test('Command Palette: Ctrl+K, tìm không dấu, chạy lệnh; `/` ở trang chủ mở project gần đây', async ({
    page,
  }) => {
    await openEditorFromPreset(page);
    await page.keyboard.press(`${MOD}+k`);
    const palette = page.getByTestId('command-palette');
    await expect(palette).toBeVisible();
    await page.getByTestId('palette-input').fill('lam mo');
    await expect(page.getByTestId('palette-item-filter.blur')).toBeVisible();
    await expect(page.getByTestId('palette-item-selection.transform')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(palette).toBeHidden();
    await expect(page.getByTestId('adjust-panel')).toBeVisible();
    await page.getByTestId('adjust-cancel').click();

    // Công cụ: phím tắt hiện bên cạnh; chọn tool qua palette.
    await page.keyboard.press(`${MOD}+k`);
    await page.getByTestId('palette-input').fill('mui ten');
    await page.getByTestId('palette-item-tool.arrow').click();
    await expect(page.getByTestId('tool-arrow')).toHaveAttribute('aria-pressed', 'true');

    // Trang chủ: `/` mở palette, có project vừa tạo trong "Project gần đây".
    await page.getByTestId('back-to-home').click();
    await waitForStartScreen(page);
    await page.keyboard.press('/');
    await expect(palette).toBeVisible();
    await expect(palette.locator('[data-testid^="palette-item-project:"]').first()).toBeVisible();
    await palette.locator('[data-testid^="palette-item-project:"]').first().click();
    await expect(page.getByTestId('editor-screen')).toBeVisible();
  });

  test('bảng phím tắt (`?`) và Cài đặt từ menu', async ({ page }) => {
    await openEditorFromPreset(page);
    await page.keyboard.press('Shift+Slash');
    const dialog = page.getByTestId('shortcuts-dialog');
    await expect(dialog).toBeVisible();
    await page.getByTestId('shortcuts-search').fill('zen');
    await expect(dialog.getByTestId('shortcut-row')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.getByTestId('editor-menu').click();
    await page.getByTestId('menu-settings').click();
    await expect(page.getByTestId('settings-dialog')).toBeVisible();
    await page.getByTestId('settings-theme').getByRole('radio', { name: 'Tối' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByTestId('settings-theme').getByRole('radio', { name: 'Sáng' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('tắt tự động lưu: chỉ lưu khi Ctrl+S; bật lại thì tự lưu', async ({ page }) => {
    await openEditorFromPreset(page);
    const status = page.getByTestId('save-status');
    await expect(status).toHaveAttribute('data-status', 'saved');
    await page.getByTestId('editor-menu').click();
    await page.getByTestId('menu-settings').click();
    await page.getByTestId('settings-autosave').getByRole('radio', { name: 'Tắt' }).click();
    await page.keyboard.press('Escape');

    await page.keyboard.press('b');
    await drawOnCanvas(page, [
      [0.3, 0.3],
      [0.6, 0.5],
    ]);
    await expect(status).toHaveAttribute('data-status', 'dirty');
    await page.waitForTimeout(2500);
    await expect(status).toHaveAttribute('data-status', 'dirty');
    await page.keyboard.press(`${MOD}+s`);
    await expect(status).toHaveAttribute('data-status', 'saved');

    await page.getByTestId('editor-menu').click();
    await page.getByTestId('menu-settings').click();
    await page.getByTestId('settings-autosave').getByRole('radio', { name: 'Bật' }).click();
    await page.keyboard.press('Escape');
    await drawOnCanvas(page, [
      [0.2, 0.7],
      [0.5, 0.8],
    ]);
    await expect(status).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });
  });

  test('Zen mode (`\\`) ẩn toàn bộ giao diện; nút nổi đưa lại', async ({ page }) => {
    await openEditorFromPreset(page);
    await page.keyboard.press('Backslash');
    await expect(page.getByTestId('editor-screen')).toHaveAttribute('data-zen', 'true');
    for (const id of ['top-bar', 'tool-island', 'right-panel', 'status-bar']) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    // Vẫn vẽ được và phím tắt vẫn chạy.
    await page.keyboard.press('b');
    await drawOnCanvas(page, [
      [0.2, 0.2],
      [0.4, 0.4],
    ]);
    await page.getByTestId('zen-exit').click();
    await expect(page.getByTestId('top-bar')).toBeVisible();
    await expect(page.getByTestId('undo')).toBeEnabled();
  });

  test('toàn màn hình bằng Shift+F', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Fullscreen API headless chỉ ổn định trên Chromium');
    await openEditorFromPreset(page);
    await page.locator('[data-testid=canvas-view]').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+F');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
    await expect(page.getByTestId('fullscreen-toggle')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('fullscreen-toggle').click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
  });
});

test.describe('GĐ8+9 — mini toolbar, bố cục laptop, lưới', () => {
  test('mini toolbar cạnh vùng chọn: Che thông tin thêm Redact; đối tượng: Xóa', async ({
    page,
  }) => {
    await page.goto('/');
    await pasteImage(page, 800, 500);
    await expect(page.getByTestId('editor-screen')).toBeVisible();
    await page.getByTestId('mode-paint').click();
    await page.keyboard.press('m');
    await drawOnCanvas(page, [
      [0.3, 0.3],
      [0.6, 0.55],
    ]);
    const bar = page.getByTestId('mini-toolbar');
    await expect(bar).toBeVisible();
    await bar.getByTestId('mini-selection.redact').click();
    await expect(bar).toBeHidden();
    // Đối tượng Redact mới nằm trong danh sách đối tượng của layer chú thích (mục 7.8).
    await expect(page.getByTestId('object-list').getByTestId('object-item')).toHaveCount(1);
    await expect(page.getByTestId('object-list')).toContainText('Che thông tin');

    // Chọn đối tượng từ danh sách → mini toolbar của đối tượng → Xóa.
    await page.getByTestId('object-item').first().click();
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
    await expect(bar).toBeVisible();
    await bar.getByTestId('mini-edit.delete').click();
    await expect(page.getByTestId('object-list')).toHaveCount(0);
  });

  test('khung laptop 1100 px: panel phải là ngăn nổi, tự đóng khi vẽ', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 720 });
    await openEditorFromPreset(page);
    await expect(page.getByTestId('right-panel')).toHaveCount(0);
    await page.getByTestId('panel-expand').click();
    const panel = page.getByTestId('right-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('data-overlay', 'true');
    await page.keyboard.press('b');
    await drawOnCanvas(page, [
      [0.1, 0.5],
      [0.3, 0.6],
    ]);
    await expect(panel).toHaveCount(0);
    // Top bar và tool island vừa khung.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('menu Xem: lưới, thước đo, bám lưới (nhớ sau khi tải lại)', async ({ page }) => {
    await openEditorFromPreset(page);
    await page.getByTestId('view-menu').click();
    await page.getByTestId('menu-view-rulers').click();
    await expect(page.getByTestId('rulers')).toBeVisible();
    // Menu vẫn mở: bật tiếp lưới.
    await page.getByTestId('menu-view-grid').click();
    await expect(page.getByTestId('menu-view-grid')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.getByTestId('rulers')).toBeVisible();
  });

  test('HUD: Alt + kéo chuột phải đổi cỡ cọ, không mở menu chuột phải', async ({ page }) => {
    await openEditorFromPreset(page);
    await page.keyboard.press('b');
    const size = page.getByTestId('option-size');
    const before = await size.textContent();
    const [x, y] = await canvasPoint(page, 0.5, 0.5);
    await page.mouse.move(x, y);
    await page.keyboard.down('Alt');
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(x + 60, y, { steps: 6 });
    await page.mouse.up({ button: 'right' });
    await page.keyboard.up('Alt');
    await expect(size).not.toHaveText(before ?? '');
    await expect(page.getByTestId('canvas-menu')).toHaveCount(0);
  });
});

test.describe('GĐ8+9 — dữ liệu', () => {
  test('bảng màu từ ảnh dán vào (mục 7.6)', async ({ page }) => {
    await page.goto('/');
    await pasteImage(page, 640, 400);
    await expect(page.getByTestId('editor-screen')).toBeVisible();
    await page.getByTestId('color-control').click();
    const palette = page.getByTestId('project-palette');
    await expect(palette).toBeVisible();
    // Ảnh mẫu: nền xanh #3B5BDB + khối trắng.
    await expect(palette.getByRole('button')).toHaveCount(2);
  });

  test('nhật ký lỗi: lỗi chưa xử lý hiện trong Cài đặt, tải được JSON', async ({ page }) => {
    await page.goto('/');
    await waitForStartScreen(page);
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('lỗi thử nghiệm E2E');
      }, 0);
    });
    await page.getByTestId('settings-button').click();
    await expect(page.getByTestId('error-log-count')).toContainText('1');
    const pending = page.waitForEvent('download');
    await page.getByTestId('error-log-download').click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(/^paint-online-errors-\d+\.json$/);
  });

  test('lưu nhanh ra file: chọn file một lần, Ctrl+S ghi đè (API giả lập)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'File System Access API chỉ có trên Chromium');
    // Giả lập hộp chọn file: ghi lại các lần ghi vào "file".
    await page.addInitScript(() => {
      const writes: number[] = [];
      (window as unknown as { __writes: number[] }).__writes = writes;
      const handle = {
        kind: 'file',
        name: 'bai-ve.paint',
        createWritable: () =>
          Promise.resolve({
            write: (blob: Blob) => {
              writes.push(blob.size);
              return Promise.resolve();
            },
            close: () => Promise.resolve(),
            abort: () => Promise.resolve(),
          }),
        queryPermission: () => Promise.resolve('granted'),
        requestPermission: () => Promise.resolve('granted'),
      };
      Object.defineProperty(window, 'showSaveFilePicker', {
        value: (options: { suggestedName?: string }) => {
          (window as unknown as { __suggested?: string }).__suggested = options.suggestedName;
          return Promise.resolve(handle);
        },
      });
    });
    await openEditorFromPreset(page);
    await page.getByTestId('editor-menu').click();
    await page.getByTestId('menu-save-file').click();
    await expect(page.getByTestId('toast').last()).toContainText('bai-ve.paint');
    // Tên gợi ý trong hộp chọn file có đúng một dấu chấm trước đuôi.
    const suggested = await page.evaluate(
      () => (window as unknown as { __suggested?: string }).__suggested,
    );
    expect(suggested).toMatch(/[^.]\.paint$/);
    const writes = () =>
      page.evaluate(() => (window as unknown as { __writes: number[] }).__writes);
    await expect.poll(async () => (await writes()).length).toBe(1);

    await page.keyboard.press('b');
    await drawOnCanvas(page, [
      [0.3, 0.3],
      [0.5, 0.6],
    ]);
    await page.keyboard.press(`${MOD}+s`);
    await expect.poll(async () => (await writes()).length).toBe(2);
    await page.getByTestId('editor-menu').click();
    await expect(page.getByTestId('linked-file')).toContainText('bai-ve.paint');
  });
});
