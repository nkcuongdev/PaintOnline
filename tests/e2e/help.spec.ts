import { expect, test } from '@playwright/test';
import { openEditorFromPreset, waitForStartScreen } from './helpers';

test.describe('Trung tâm hướng dẫn', () => {
  test('mở từ trang chủ, tìm không dấu, đọc bài có ảnh minh họa', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    await waitForStartScreen(page);
    await page.getByTestId('help-button').click();
    await expect(page.getByTestId('help-home')).toBeVisible();
    await expect(page).toHaveTitle(/Hướng dẫn sử dụng/);

    await page.getByTestId('help-search-hero').fill('che thong tin');
    const results = page.getByTestId('help-search-results');
    await expect(results.getByRole('option').first()).toContainText('Che thông tin');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/help\/che-thong-tin$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Che thông tin' })).toBeVisible();

    // Ảnh minh họa tải được dưới CSP của bản deploy.
    const image = page.locator('[data-help-shot] img').first();
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0);

    // Liên kết tới mục trong bài khác.
    await page.goto('/#/help/co-ve/phim-co');
    await expect(page.locator('#phim-co')).toBeInViewport();
    expect(errors).toEqual([]);
  });

  test('mở từ editor sang tab mới, project vẫn mở', async ({ page, context }) => {
    await openEditorFromPreset(page);
    await page.getByTestId('editor-menu').click();
    const [help] = await Promise.all([
      context.waitForEvent('page'),
      page.getByTestId('menu-help').click(),
    ]);
    await expect(help.getByTestId('help-home')).toBeVisible();
    await expect(page.getByTestId('editor-screen')).toBeVisible();
  });

  test('bài không tồn tại có thông báo riêng', async ({ page }) => {
    await page.goto('/#/help/khong-co-bai-nay');
    await expect(page.getByTestId('help-not-found')).toBeVisible();
  });
});
