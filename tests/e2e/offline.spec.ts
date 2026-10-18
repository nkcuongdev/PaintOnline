import { expect, test, type Page } from '@playwright/test';
import { drawOnCanvas, pasteImage, waitForStartScreen } from './helpers';

/**
 * Nghiệm thu PWA (GĐ8+9 — ADR 0011, 0028): tắt mạng rồi reload vẫn dùng đầy đủ — mở trang chủ, mở
 * project đã lưu, tạo ảnh mới, vẽ, lưu, xuất. Service worker precache toàn bộ app shell.
 */

/** Chờ service worker kích hoạt và precache xong (lần đầu chưa điều khiển trang). */
async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active;
    if (!worker) throw new Error('service worker chưa kích hoạt');
  });
}

test.describe('GĐ8+9 — offline (PWA)', () => {
  test.beforeEach(({ browserName }) => {
    // Playwright WebKit không hỗ trợ service worker trên Windows/Linux.
    test.skip(browserName === 'webkit', 'Playwright WebKit không chạy service worker');
  });

  test('tắt mạng rồi reload: mở lại project, tạo ảnh mới, vẽ và lưu', async ({ page, context }) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await waitForStartScreen(page);
    await waitForServiceWorker(page);
    // Lần tải thứ hai: service worker đã điều khiển trang.
    await page.reload();
    await waitForStartScreen(page);
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);

    // Một project đã lưu trước khi mất mạng.
    await pasteImage(page, 640, 400);
    await expect(page.getByTestId('editor-screen')).toBeVisible();
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    const projectUrl = page.url();

    await context.setOffline(true);
    await page.reload();
    // Editor (chunk tải lười) + engine mở được từ cache.
    await expect(page.getByTestId('editor-screen')).toBeVisible();
    await expect(page.getByTestId('canvas-view')).toBeVisible();
    await page.keyboard.press('b');
    await drawOnCanvas(page, [
      [0.3, 0.3],
      [0.6, 0.6],
    ]);
    await expect(page.getByTestId('undo')).toBeEnabled();
    await page.keyboard.press('Control+s');
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');

    // Trang chủ và tạo ảnh mới khi vẫn mất mạng.
    await page.getByTestId('back-to-home').click();
    await waitForStartScreen(page);
    await page.getByTestId('preset-custom').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('editor-screen')).toBeVisible();
    expect(page.url()).not.toBe(projectUrl);

    // Hộp thoại tải lười (Cài đặt, Command Palette) cũng có trong cache.
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('command-palette')).toBeVisible();
    await page.keyboard.press('Escape');
    await context.setOffline(false);
  });

  test('manifest và icon dùng được để cài đặt (tùy chọn)', async ({ page }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const manifest = (await (await page.request.get(href ?? '')).json()) as {
      name: string;
      lang: string;
      display: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    expect(manifest.name).toBe('Paint Online');
    expect(manifest.lang).toBe('vi');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.map((i) => i.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512']),
    );
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      const res = await page.request.get(icon.src);
      expect(res.ok()).toBe(true);
    }
  });
});
