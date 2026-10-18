import { expect, test } from '@playwright/test';

/**
 * Smoke test GĐ0 (mục 9): trang có top bar, đổi theme được, hash route Home ↔ Editor,
 * reload giữ đúng route, không có lỗi console và không gọi mạng ra ngoài.
 */

test.describe('GĐ0 smoke', () => {
  test('trang chủ hiển thị top bar và không có lỗi console', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    const response = await page.goto('/');
    // Chạy dưới đúng CSP của bản deploy (public/_headers); vi phạm CSP sẽ hiện thành lỗi console.
    expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
    await expect(page.getByTestId('top-bar')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Bắt đầu nhanh' })).toBeVisible();
    await expect(page).toHaveTitle('Paint Online');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    expect(errors).toEqual([]);
  });

  // Đặt colorScheme ở cấp context thay vì page.emulateMedia(): với header COOP, Firefox tạo
  // browsing context mới khi điều hướng và bỏ mất giả lập đặt trên trang cũ.
  test('đổi theme và giữ lựa chọn sau khi reload', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'light' });
    const page = await context.newPage();
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).not.toHaveClass(/dark/);

    await page.getByTestId('theme-menu-trigger').click();
    await page.getByRole('menuitemradio', { name: 'Tối' }).click();
    await expect(html).toHaveClass(/dark/);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(27, 27, 30)');
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /favicon-dark\.svg$/);

    await page.reload();
    await expect(html).toHaveClass(/dark/);

    await page.getByTestId('theme-menu-trigger').click();
    await page.getByRole('menuitemradio', { name: 'Theo hệ thống' }).click();
    await expect(html).not.toHaveClass(/dark/);
    await context.close();
  });

  test('mặc định theo theme hệ thống', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await context.close();
  });

  test('preset mở editor, URL giữ đúng route khi reload, Back về trang chủ', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('preset-full-hd').click();

    await expect(page).toHaveURL(/#\/project\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('editor-screen')).toBeVisible();
    await expect(page.getByTestId('workspace')).toBeVisible();
    await expect(page.getByTestId('status-size')).toHaveText(/1920 × 1080 px/);
    const url = page.url();

    // GĐ3: project được lưu ngay khi tạo; reload mở lại đúng project từ IndexedDB.
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    await page.reload();
    expect(page.url()).toBe(url);
    await expect(page.getByTestId('editor-screen')).toBeVisible();
    await expect(page.getByTestId('status-size')).toHaveText(/1920 × 1080 px/);

    await page.goBack();
    await expect(page.getByTestId('start-screen')).toBeVisible();
  });

  test('không gọi mạng ra ngoài origin của app', async ({ page, baseURL }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(baseURL ?? '') && !url.startsWith('data:') && !url.startsWith('blob:')) {
        external.push(url);
      }
    });
    await page.goto('/');
    await page.getByTestId('preset-square').click();
    await expect(page.getByTestId('editor-screen')).toBeVisible();
    expect(external).toEqual([]);
  });
});
