import { expect, test } from '@playwright/test';
import {
  displayPixel,
  drawOnCanvas,
  makePngBase64,
  openEditorFromPreset,
  pasteImage,
  waitForStartScreen,
} from './helpers';

/**
 * E2E GĐ1 (mục 9): Paint tối thiểu trong tab — mở hoặc dán ảnh, vẽ, tẩy, undo, export, copy.
 * Chạy trên Chromium, Firefox, WebKit.
 */

test.describe('GĐ1 — luồng dán → vẽ → copy', () => {
  test('dán ảnh ở trang chủ tạo document vừa khít ảnh, vẽ được, copy được', async ({
    page,
    context,
    browserName,
  }) => {
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    }
    await page.goto('/');
    await pasteImage(page, 640, 400);

    await expect(page.getByTestId('editor-screen')).toBeVisible();
    await expect(page.getByTestId('status-size')).toHaveText(/640 × 400 px/);
    await expect(page.getByTestId('project-name')).toHaveText(/Ảnh dán/);

    // Ảnh nhỏ hơn khung → hiển thị 100%.
    await expect(page.getByTestId('zoom-level')).toHaveText('100%');

    // Vẽ một nét ngang qua giữa ảnh bằng chuột thật.
    await expect(page.getByTestId('undo')).toBeDisabled();
    await drawOnCanvas(page, [
      [0.35, 0.6],
      [0.5, 0.62],
      [0.65, 0.6],
    ]);
    await expect(page.getByTestId('undo')).toBeEnabled();

    await page.getByTestId('copy-image').click();
    const toast = page.getByTestId('toast').last();
    await expect(toast).toBeVisible();

    if (browserName === 'chromium') {
      await expect(toast).toHaveText(/Đã copy/);
      const size = await page.evaluate(async () => {
        const items = await navigator.clipboard.read();
        const item = items[0];
        if (!item) return null;
        const bitmap = await createImageBitmap(await item.getType('image/png'));
        return [bitmap.width, bitmap.height];
      });
      expect(size).toEqual([640, 400]);
    } else {
      // Trình duyệt có thể không cho ghi ảnh trong môi trường tự động: copy hoặc tải file dự phòng.
      await expect(toast).toHaveText(/Đã copy|tải file PNG/);
    }
  });

  test('Ctrl+V khi clipboard không có ảnh: báo rõ, không tạo project', async ({ page }) => {
    await page.goto('/');
    await waitForStartScreen(page);
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'hello');
      const event = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'clipboardData', { value: dt });
      document.dispatchEvent(event);
    });
    await expect(page.getByTestId('toast')).toHaveText(/Clipboard không có ảnh/);
    await expect(page.getByTestId('start-screen')).toBeVisible();
  });
});

test.describe('GĐ1 — mở ảnh an toàn', () => {
  test('mở file PNG từ máy', async ({ page }) => {
    await page.goto('/');
    const base64 = await makePngBase64(page, 300, 200);
    await page.getByTestId('file-input').setInputFiles({
      name: 'bản vẽ.png',
      mimeType: 'image/png',
      buffer: Buffer.from(base64, 'base64'),
    });
    await expect(page.getByTestId('editor-screen')).toBeVisible();
    await expect(page.getByTestId('project-name')).toHaveText('bản vẽ');
    await expect(page.getByTestId('status-size')).toHaveText(/300 × 200 px/);
  });

  test('file giả mạo phần mở rộng .png bị từ chối (nhận diện bằng magic bytes)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('file-input').setInputFiles({
      name: 'virus.png',
      mimeType: 'image/png',
      buffer: Buffer.from('<html><script>alert(1)</script></html>'),
    });
    await expect(page.getByTestId('toast')).toHaveText(/Định dạng không được hỗ trợ/);
    await expect(page.getByTestId('start-screen')).toBeVisible();
  });
});

test.describe('GĐ1 — vẽ, tẩy, undo/redo, khung nhìn', () => {
  test('brush vẽ, eraser tẩy, Ctrl+Z / Ctrl+Shift+Z', async ({ page, browserName }) => {
    await openEditorFromPreset(page);
    const mod = browserName === 'webkit' && process.platform === 'darwin' ? 'Meta' : 'Control';

    // Điểm giữa khung canvas nằm trong ảnh vuông 1080 đã fit.
    expect(await displayPixel(page, 0.5, 0.6)).toEqual([255, 255, 255, 255]);

    await page.keyboard.press('b');
    await expect(page.getByTestId('tool-brush')).toHaveAttribute('aria-pressed', 'true');
    await drawOnCanvas(page, [
      [0.4, 0.6],
      [0.6, 0.6],
    ]);
    await expect
      .poll(async () => (await displayPixel(page, 0.5, 0.6)).slice(0, 3))
      .toEqual([0, 0, 0]);

    await page.keyboard.press('e');
    await expect(page.getByTestId('tool-eraser')).toHaveAttribute('aria-pressed', 'true');
    await drawOnCanvas(page, [
      [0.5, 0.5],
      [0.5, 0.7],
    ]);
    // Nền document là màu trắng: tẩy để lộ nền trắng.
    await expect.poll(async () => displayPixel(page, 0.5, 0.6)).toEqual([255, 255, 255, 255]);

    await page.keyboard.press(`${mod}+z`);
    await expect
      .poll(async () => (await displayPixel(page, 0.5, 0.6)).slice(0, 3))
      .toEqual([0, 0, 0]);
    await page.keyboard.press(`${mod}+z`);
    await expect.poll(async () => displayPixel(page, 0.5, 0.6)).toEqual([255, 255, 255, 255]);
    await expect(page.getByTestId('undo')).toBeDisabled();
    await page.keyboard.press(`${mod}+Shift+z`);
    await expect
      .poll(async () => (await displayPixel(page, 0.5, 0.6)).slice(0, 3))
      .toEqual([0, 0, 0]);
  });

  test('phím tắt khung nhìn và tool tạm thời', async ({ page }) => {
    await openEditorFromPreset(page);
    const zoom = page.getByTestId('zoom-level');
    await page.keyboard.press('Shift+0');
    await expect(zoom).toHaveText('100%');
    await page.keyboard.press('+');
    await expect(zoom).toHaveText('150%');
    await page.keyboard.press('-');
    await expect(zoom).toHaveText('100%');
    await page.keyboard.press('Shift+1');
    await expect(zoom).not.toHaveText('100%');

    // Giữ Space = Pan tạm thời, nhả ra quay về brush.
    await page.keyboard.down('Space');
    await expect(page.getByTestId('tool-pan')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.up('Space');
    await expect(page.getByTestId('tool-brush')).toHaveAttribute('aria-pressed', 'true');

    // [ ] đổi cỡ, số đổi độ mờ.
    await page.keyboard.press(']');
    await expect(page.getByTestId('options-bar')).toContainText('9 px');
    await page.keyboard.press('5');
    await expect(page.getByTestId('options-bar')).toContainText('50%');
  });

  test('Ctrl+wheel zoom ảnh quanh con trỏ, không zoom trang', async ({ page }) => {
    await openEditorFromPreset(page);
    const before = await page.getByTestId('zoom-level').textContent();
    const box = await page.getByTestId('canvas-view').boundingBox();
    if (!box) throw new Error('no canvas');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    await expect(page.getByTestId('zoom-level')).not.toHaveText(before ?? '');
    // Trang không bị zoom.
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
  });

  test('xuất PNG tải file đúng tên', async ({ page }) => {
    await openEditorFromPreset(page);
    await page.getByTestId('export-image').click();
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    await expect(page.getByTestId('export-estimate')).toHaveText(/≈/);
    const download = page.waitForEvent('download');
    await page.getByTestId('export-download').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('Ảnh mới 1080 × 1080.png');
  });
});
