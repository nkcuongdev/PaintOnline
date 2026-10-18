import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { drawOnCanvas, pasteImage } from './helpers';

/**
 * E2E GĐ7 (mục 9): Screenshot Editor hoàn chỉnh — chế độ Screenshot với giao diện rút gọn, Redact
 * khảm/làm mờ, Step badge, Spotlight, kiểu nhanh, panel Làm đẹp, Copy + Tải xuống nổi bật.
 * Nghiệm thu "luồng screenshot đầy đủ dưới 15 giây": tự động đo 5 lần trên mỗi trình duyệt (người
 * dùng tự đo thêm trên trình duyệt hằng ngày — docs/DEVELOPMENT.md).
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

async function expectTool(page: Page, tool: string): Promise<void> {
  await expect(page.getByTestId(`tool-${tool}`)).toHaveAttribute('aria-pressed', 'true');
}

async function clickCanvas(page: Page, fx: number, fy: number): Promise<void> {
  const box = await page.getByTestId('canvas-view').boundingBox();
  if (!box) throw new Error('canvas-view không hiển thị');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

/** Kích thước ảnh PNG đọc từ IHDR. */
function pngSize(bytes: Buffer): [number, number] {
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

/**
 * Luồng chuẩn (mục 7.4 + GĐ7): dán → mũi tên → khung → che (khảm) → chữ → 2 số thứ tự → bật Làm
 * đẹp → Copy. Trả thời gian từ lúc dán tới khi có thông báo đã copy.
 */
async function screenshotFlow(page: Page): Promise<number> {
  await page.goto('/');
  const started = Date.now();
  await pasteImage(page, 1000, 600);
  await expect(page.getByTestId('editor-screen')).toHaveAttribute('data-mode', 'screenshot');
  await expectTool(page, 'arrow');

  await drawOnCanvas(page, [
    [0.72, 0.72],
    [0.5, 0.5],
  ]);
  await page.keyboard.press('u');
  await drawOnCanvas(page, [
    [0.3, 0.3],
    [0.45, 0.42],
  ]);
  await page.keyboard.press('k');
  await page.getByTestId('option-mode').getByRole('radio', { name: 'Khảm' }).click();
  await drawOnCanvas(page, [
    [0.55, 0.3],
    [0.68, 0.38],
  ]);
  await page.keyboard.press('t');
  await clickCanvas(page, 0.3, 0.62);
  await expect(page.getByTestId('text-editor')).toBeFocused();
  await page.keyboard.type('Lỗi ở đây');
  await page.keyboard.press('Escape');
  await page.keyboard.press('n');
  await clickCanvas(page, 0.28, 0.27);
  await clickCanvas(page, 0.53, 0.27);
  await page.getByTestId('beautify-toggle').click();
  await expect(page.getByTestId('beautify-toggle')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('copy-image').click();
  await expect(page.getByTestId('toast').last()).toHaveText(/Đã copy|tải file PNG/);
  return Date.now() - started;
}

test.describe('GĐ7 — chế độ Screenshot', () => {
  test('luồng screenshot đầy đủ dưới 15 giây (đo 5 lần)', async ({
    page,
    context,
    browserName,
  }) => {
    test.setTimeout(180_000);
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    }
    const times: number[] = [];
    for (let run = 0; run < 5; run++) times.push(await screenshotFlow(page));
    console.log(`[${browserName}] luồng screenshot đầy đủ (ms): ${times.join(', ')}`);
    for (const ms of times) expect(ms, `một lượt mất ${String(ms)} ms`).toBeLessThan(15_000);
  });

  test('giao diện rút gọn: tool island, Copy + Tải xuống, panel Làm đẹp; đổi sang Paint và lưu lại', async ({
    page,
  }) => {
    await page.goto('/');
    await pasteImage(page, 800, 500);
    await expect(page.getByTestId('editor-screen')).toHaveAttribute('data-mode', 'screenshot');
    const island = page.getByTestId('tool-island');
    await expect(island).toHaveAttribute('data-compact', 'true');
    for (const tool of [
      'select',
      'arrow',
      'rect',
      'highlight',
      'text',
      'redact',
      'step',
      'spotlight',
      'crop',
    ]) {
      await expect(page.getByTestId(`tool-${tool}`)).toBeVisible();
    }
    await expect(page.getByTestId('tool-brush')).toHaveCount(0);
    await expect(page.getByTestId('download-image')).toBeVisible();
    await expect(page.getByTestId('beautify-panel')).toBeVisible();
    await expect(page.getByTestId('tab-layers')).toHaveCount(0);

    await page.getByTestId('mode-paint').click();
    await expect(page.getByTestId('editor-screen')).toHaveAttribute('data-mode', 'paint');
    await expect(page.getByTestId('tool-brush')).toBeVisible();
    await expect(page.getByTestId('tab-layers')).toBeVisible();
    // Chế độ được lưu cùng project: tải lại vẫn là Paint.
    await page.reload();
    await expect(page.getByTestId('editor-screen')).toHaveAttribute('data-mode', 'paint');
    await page.getByTestId('editor-menu').click();
    await page.getByTestId('menu-mode').click();
    await expect(page.getByTestId('editor-screen')).toHaveAttribute('data-mode', 'screenshot');
  });

  test('Tải xuống: PNG gồm khung Làm đẹp; Redact làm mờ có cảnh báo', async ({ page }) => {
    await page.goto('/');
    await pasteImage(page, 600, 400);
    await expect(page.getByTestId('editor-screen')).toHaveAttribute('data-mode', 'screenshot');
    await page.getByTestId('tool-redact').click();
    await page.getByTestId('option-mode').getByRole('radio', { name: 'Làm mờ' }).click();
    await expect(page.getByTestId('redact-blur-warning')).toBeVisible();
    await drawOnCanvas(page, [
      [0.4, 0.4],
      [0.6, 0.55],
    ]);
    await page.getByTestId('beautify-bg-sunset').click();
    await expect(page.getByTestId('beautify-toggle')).toHaveAttribute('aria-checked', 'true');

    const pending = page.waitForEvent('download');
    await page.getByTestId('download-image').click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    const path = await download.path();
    const [width, height] = pngSize(await readFile(path));
    expect([width, height]).toEqual([600 + 64 * 2, 400 + 64 * 2]);

    // Undo tắt khung: ảnh tải xuống trở lại kích thước gốc.
    await page.keyboard.press(`${MOD}+z`);
    await expect(page.getByTestId('beautify-toggle')).toHaveAttribute('aria-checked', 'false');
  });
});
