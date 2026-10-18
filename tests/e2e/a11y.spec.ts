import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openEditorFromPreset, pasteImage, waitForStartScreen } from './helpers';

/**
 * Nghiệm thu accessibility (GĐ8, mục 7.8): axe không còn lỗi nghiêm trọng (serious, critical) ở
 * trang chủ, editor chế độ Paint và Screenshot, các hộp thoại, Command Palette — cả hai theme.
 * Vùng canvas (role="application") là ảnh do người dùng vẽ: không kiểm tương phản bên trong.
 */

async function expectNoSeriousViolations(page: Page, label: string): Promise<void> {
  // Chờ hiệu ứng mở (fade/zoom 120–200 ms) xong: đang mờ dần thì axe đo sai độ tương phản.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.effect?.getTiming().iterations === Infinity || a.playState !== 'running'),
  );
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .exclude('[data-testid="canvas-view"]')
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const report = serious.map(
    (v) =>
      `${v.id} (${String(v.impact)}): ${v.help}\n${v.nodes
        .slice(0, 5)
        .map((n) => `  ${n.target.join(' ')} — ${n.failureSummary ?? ''}`)
        .join('\n')}`,
  );
  expect(report, `${label}: lỗi axe nghiêm trọng`).toEqual([]);
}

async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`accessibility — theme ${theme}`, () => {
    // Mỗi lượt quét axe 2–7 s; một test quét tới 4 màn hình.
    test.describe.configure({ timeout: 90_000 });
    test.beforeEach(async ({ page }) => {
      await setTheme(page, theme);
    });

    test('trung tâm hướng dẫn: trang chính, bài có ảnh và bảng, tìm kiếm', async ({ page }) => {
      await page.goto('/#/help');
      await expect(page.getByTestId('help-home')).toBeVisible();
      await expectNoSeriousViolations(page, 'trang chính hướng dẫn');
      await page.goto('/#/help/che-thong-tin');
      await expect(page.getByTestId('help-topic')).toBeVisible();
      await expectNoSeriousViolations(page, 'bài hướng dẫn');
      await page.getByTestId('help-search').fill('layer');
      await expect(page.getByTestId('help-search-results')).toBeVisible();
      await expectNoSeriousViolations(page, 'kết quả tìm kiếm');
    });

    test('trang chủ, Command Palette, Cài đặt, bảng phím tắt', async ({ page }) => {
      await page.goto('/');
      await waitForStartScreen(page);
      await expectNoSeriousViolations(page, 'trang chủ');
      await page.keyboard.press('Control+k');
      await expect(page.getByTestId('command-palette')).toBeVisible();
      await expectNoSeriousViolations(page, 'Command Palette');
      await page.keyboard.press('Escape');
      await page.getByTestId('settings-button').click();
      await expect(page.getByTestId('settings-dialog')).toBeVisible();
      await expectNoSeriousViolations(page, 'Cài đặt');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Shift+Slash');
      await expect(page.getByTestId('shortcuts-dialog')).toBeVisible();
      await expectNoSeriousViolations(page, 'bảng phím tắt');
    });

    test('editor chế độ Paint: panel Layers, menu, hộp thoại Xuất', async ({ page }) => {
      await openEditorFromPreset(page);
      await expectNoSeriousViolations(page, 'editor Paint');
      await page.getByTestId('view-menu').click();
      await expectNoSeriousViolations(page, 'menu Xem');
      await page.keyboard.press('Escape');
      await page.getByTestId('export-image').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectNoSeriousViolations(page, 'hộp thoại Xuất');
    });

    test('editor chế độ Screenshot: panel Làm đẹp, mini toolbar', async ({ page }) => {
      await page.goto('/');
      await pasteImage(page, 800, 500);
      await expect(page.getByTestId('editor-screen')).toHaveAttribute('data-mode', 'screenshot');
      await expectNoSeriousViolations(page, 'editor Screenshot');
      await page.getByTestId('tool-select').click();
      await page.keyboard.press('m');
      const box = await page.getByTestId('canvas-view').boundingBox();
      if (!box) throw new Error('no canvas');
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 5 });
      await page.mouse.up();
      await expect(page.getByTestId('mini-toolbar')).toBeVisible();
      await expectNoSeriousViolations(page, 'mini toolbar');
    });
  });
}
