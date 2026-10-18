import { expect, test, type Page } from '@playwright/test';
import { displayPixel, drawOnCanvas, openEditorFromPreset } from './helpers';

/**
 * E2E GĐ4 (mục 9): làm việc nhiều layer như một app vẽ — panel Layers (thêm, đổi tên, ẩn/hiện,
 * blend, kéo thả bằng bàn phím, gộp), panel History (nhảy về bước bất kỳ), lưu và mở lại.
 * Chạy trên Chromium, Firefox, WebKit với bản build production.
 */

async function waitSaved(page: Page): Promise<void> {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
    timeout: 15_000,
  });
}

function rows(page: Page) {
  return page.getByTestId('layer-row');
}

async function rowNames(page: Page): Promise<string[]> {
  return page.getByTestId('layer-name').allTextContents();
}

/** Đặt màu chính bằng ô mã màu của bộ chọn màu. */
async function setPrimary(page: Page, hex: string): Promise<void> {
  await page.getByTestId('color-control').click();
  await expect(page.getByTestId('color-popover')).toBeVisible();
  await page.locator('#hex-input').fill(hex);
  await page.locator('#hex-input').press('Enter');
  await expect(page.getByTestId('color-control')).toHaveAttribute('aria-label', new RegExp(hex));
  await page.keyboard.press('Escape');
}

test.describe('GĐ4 — panel Layers và History', () => {
  test('thêm layer, vẽ, đổi tên, ẩn/hiện, blend, đổi thứ tự bằng bàn phím, gộp xuống, undo', async ({
    page,
  }) => {
    await openEditorFromPreset(page);
    await expect(page.getByTestId('right-panel')).toBeVisible();
    await expect(rows(page)).toHaveCount(1);

    // Nét đỏ trên layer nền.
    await drawOnCanvas(page, [
      [0.3, 0.5],
      [0.7, 0.5],
    ]);
    // Layer mới bằng phím tắt (Shift+N) khi focus ở vùng làm việc.
    await page.getByTestId('workspace').focus();
    await page.keyboard.press('Shift+N');
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).first()).toHaveAttribute('data-active', 'true');

    await setPrimary(page, '#2F9E44');
    await drawOnCanvas(page, [
      [0.5, 0.3],
      [0.5, 0.7],
    ]);
    // Nét xanh lá: kênh đỏ thấp (frame vẽ có thể chưa tới ngay sau khi nhả chuột).
    await expect.poll(async () => (await displayPixel(page, 0.5, 0.35))[0]).toBeLessThan(100);

    // Đổi tên bằng double-click.
    await rows(page).first().getByTestId('layer-select').dblclick();
    const input = page.getByTestId('layer-rename-input');
    await input.fill('Nét xanh');
    await input.press('Enter');
    await expect(rows(page).first().getByTestId('layer-name')).toHaveText('Nét xanh');

    // Ẩn layer → nét xanh biến mất; hiện lại.
    await rows(page).first().getByTestId('layer-visibility').click();
    await expect.poll(async () => (await displayPixel(page, 0.5, 0.35))[1]).toBeGreaterThan(240);
    await rows(page).first().getByTestId('layer-visibility').click();
    await expect.poll(async () => (await displayPixel(page, 0.5, 0.35))[0]).toBeLessThan(100);

    // Blend mode Multiply qua menu.
    await page.getByTestId('layer-blend').click();
    await page.getByTestId('blend-multiply').click();
    await expect(page.getByTestId('layer-blend')).toContainText('Multiply');
    // Menu đóng hẳn (Radix trả focus về nút mở menu sau hoạt ảnh) rồi mới dùng bàn phím.
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.getByTestId('layer-blend')).toBeFocused();

    // Kéo thả bằng bàn phím: nhấc layer trên cùng, đưa xuống dưới, thả.
    const names = await rowNames(page);
    await rows(page).first().getByTestId('layer-drag').focus();
    // dnd-kit di chuyển bằng hoạt ảnh: chờ một nhịp giữa các phím như người dùng thật.
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(250);
    await page.keyboard.press('Space');
    await expect.poll(() => rowNames(page)).toEqual([...names].reverse());

    // Gộp xuống: chọn lại layer trên cùng rồi gộp.
    await rows(page).first().getByTestId('layer-select').click();
    await page.getByTestId('layer-merge-down').click();
    await expect(rows(page)).toHaveCount(1);
    await page.getByTestId('workspace').focus();
    await page.keyboard.press('Control+Z');
    await expect(rows(page)).toHaveCount(2);
  });

  test('panel History: nhảy về bước bất kỳ rồi quay lại', async ({ page }) => {
    await openEditorFromPreset(page);
    await drawOnCanvas(page, [
      [0.3, 0.4],
      [0.7, 0.4],
    ]);
    await page.getByTestId('layer-add').click();
    await drawOnCanvas(page, [
      [0.3, 0.6],
      [0.7, 0.6],
    ]);
    await page.getByTestId('tab-history').click();
    const entries = page.getByTestId('history-entry');
    await expect(entries).toHaveCount(4);
    await expect(entries.nth(3)).toHaveAttribute('aria-current', 'step');

    await entries.nth(0).click();
    await expect(entries.nth(0)).toHaveAttribute('aria-current', 'step');
    await expect.poll(async () => (await displayPixel(page, 0.5, 0.4))[1]).toBeGreaterThan(240);
    await expect.poll(async () => (await displayPixel(page, 0.5, 0.6))[1]).toBeGreaterThan(240);

    await entries.nth(1).click();
    await expect.poll(async () => (await displayPixel(page, 0.5, 0.4))[1]).toBeLessThan(100);
    await expect.poll(async () => (await displayPixel(page, 0.5, 0.6))[1]).toBeGreaterThan(240);

    await entries.nth(3).click();
    await expect.poll(async () => (await displayPixel(page, 0.5, 0.6))[1]).toBeLessThan(100);
    await page.getByTestId('tab-layers').click();
    await expect(rows(page)).toHaveCount(2);
  });

  test('layer, thuộc tính và trạng thái panel được lưu và mở lại đúng', async ({ page }) => {
    await openEditorFromPreset(page);
    await drawOnCanvas(page, [
      [0.3, 0.5],
      [0.7, 0.5],
    ]);
    await page.getByTestId('layer-add').click();
    await drawOnCanvas(page, [
      [0.5, 0.3],
      [0.5, 0.7],
    ]);
    await page.getByTestId('layer-menu').click();
    await page.getByTestId('layer-add-annotation').click();
    await expect(rows(page)).toHaveCount(3);
    // Opacity 50% cho layer giữa bằng phím mũi tên trên slider.
    await rows(page).nth(1).getByTestId('layer-select').click();
    const thumb = page.getByTestId('layer-opacity').getByRole('slider');
    await thumb.focus();
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    await expect(page.getByTestId('layer-properties')).toContainText('50%');
    await rows(page).nth(2).getByTestId('layer-visibility').click();
    const names = await rowNames(page);
    await page.getByTestId('panel-collapse').click();
    await expect(page.getByTestId('right-panel')).toHaveCount(0);

    await waitSaved(page);
    await page.reload();
    await expect(page.getByTestId('editor-screen')).toBeVisible();
    // Panel thu gọn được nhớ; mở lại thấy đủ layer với đúng thuộc tính.
    await expect(page.getByTestId('panel-expand')).toBeVisible();
    await expect(page.getByTestId('right-panel')).toHaveCount(0);
    await page.getByTestId('panel-expand').click();
    await expect(rows(page)).toHaveCount(3);
    expect(await rowNames(page)).toEqual(names);
    await expect(rows(page).nth(1)).toContainText('50%');
    await expect(rows(page).nth(2).getByTestId('layer-visibility')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(rows(page).nth(0)).toContainText('Layer chú thích');
  });
});
