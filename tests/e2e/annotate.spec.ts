import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { displayPixel, drawOnCanvas, openEditorFromPreset, pasteImage } from './helpers';

/**
 * E2E GĐ2 (mục 9): màu, hình khối, chữ và chú thích cơ bản. Chạy trên Chromium, Firefox, WebKit
 * với bản build production (Worker, CSP thật).
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

/** Điểm (tỉ lệ 0..1 của khung canvas) → tọa độ trang. */
async function canvasPoint(page: Page, fx: number, fy: number): Promise<[number, number]> {
  const box = await page.getByTestId('canvas-view').boundingBox();
  if (!box) throw new Error('canvas-view không hiển thị');
  return [box.x + box.width * fx, box.y + box.height * fy];
}

async function clickCanvas(
  page: Page,
  fx: number,
  fy: number,
  options: { button?: 'left' | 'right' } = {},
): Promise<void> {
  const [x, y] = await canvasPoint(page, fx, fy);
  await page.mouse.click(x, y, options);
}

/**
 * Điểm trên canvas (tỉ lệ khung) → tọa độ document, đọc từ "tờ giấy" Renderer đặt đúng khung
 * document trên màn hình.
 */
async function toDoc(
  page: Page,
  docWidth: number,
  fx: number,
  fy: number,
): Promise<[number, number]> {
  const [x, y] = await canvasPoint(page, fx, fy);
  const sheet = await page.locator('[data-testid=canvas-view] > div').first().boundingBox();
  if (!sheet) throw new Error('không thấy khung document');
  const scale = docWidth / sheet.width;
  return [(x - sheet.x) * scale, (y - sheet.y) * scale];
}

async function expectTool(page: Page, tool: string): Promise<void> {
  await expect(page.getByTestId(`tool-${tool}`)).toHaveAttribute('aria-pressed', 'true');
}

test.describe('GĐ2 — luồng screenshot: dán → chú thích → copy', () => {
  test('làm xong trong dưới 15 giây; ảnh copy đã nướng vùng che', async ({
    page,
    context,
    browserName,
  }) => {
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    }
    await page.goto('/');
    const started = Date.now();
    await pasteImage(page, 1000, 600);
    await expect(page.getByTestId('editor-screen')).toBeVisible();
    // Ảnh dán: chế độ chú thích, Arrow được chọn sẵn (mục 7.4).
    await expectTool(page, 'arrow');

    await drawOnCanvas(page, [
      [0.72, 0.72],
      [0.5, 0.5],
    ]);
    await page.keyboard.press('u');
    await expectTool(page, 'rect');
    await drawOnCanvas(page, [
      [0.3, 0.3],
      [0.45, 0.42],
    ]);
    await page.keyboard.press('k');
    await expectTool(page, 'redact');
    await drawOnCanvas(page, [
      [0.55, 0.3],
      [0.68, 0.38],
    ]);
    const [rx0, ry0] = await toDoc(page, 1000, 0.55, 0.3);
    const [rx1, ry1] = await toDoc(page, 1000, 0.68, 0.38);
    await page.keyboard.press('t');
    await expectTool(page, 'text');
    await clickCanvas(page, 0.3, 0.62);
    const editor = page.getByTestId('text-editor');
    await expect(editor).toBeFocused();
    await page.keyboard.type('Lỗi ở đây — cần sửa');
    await page.keyboard.press('Escape');
    await expect(editor).toBeHidden();

    await page.keyboard.press(`${MOD}+c`);
    const toast = page.getByTestId('toast').last();
    await expect(toast).toHaveText(/Đã copy|tải file PNG/);
    const elapsed = Date.now() - started;
    console.log(`[${browserName}] luồng dán → chú thích → copy: ${String(elapsed)} ms`);
    expect(elapsed, `thời gian luồng: ${String(elapsed)} ms`).toBeLessThan(15_000);

    // Vùng che được vẽ đen tuyệt đối trên màn hình.
    expect((await displayPixel(page, 0.6, 0.34)).slice(0, 3)).toEqual([0, 0, 0]);

    if (browserName === 'chromium') {
      await expect(toast).toHaveText(/Đã copy/);
      const region = [
        Math.ceil(rx0) + 2,
        Math.ceil(ry0) + 2,
        Math.floor(rx1) - 2,
        Math.floor(ry1) - 2,
      ];
      const result = await page.evaluate(async ([x0, y0, x1, y1]) => {
        const items = await navigator.clipboard.read();
        const item = items[0];
        if (!item) return null;
        const bitmap = await createImageBitmap(await item.getType('image/png'));
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(bitmap, 0, 0);
        // Mọi pixel trong vùng che phải đen tuyệt đối.
        const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
        let notBlack = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) notBlack++;
        }
        return { size: [bitmap.width, bitmap.height], notBlack, pixels: data.length / 4 };
      }, region);
      expect(result?.size).toEqual([1000, 600]);
      expect(result?.notBlack).toBe(0);
      expect(result?.pixels).toBeGreaterThan(1000);
    }
  });
});

test.describe('GĐ2 — chữ tiếng Việt (mục 9: đúng trên 3 engine)', () => {
  test('gõ tiếng Việt có dấu; phím chữ không bị phím tắt nuốt; sửa lại được', async ({ page }) => {
    await openEditorFromPreset(page);
    await page.keyboard.press('t');
    await clickCanvas(page, 0.25, 0.5);
    const editor = page.getByTestId('text-editor');
    await expect(editor).toBeFocused();
    // Có đủ các chữ trùng phím tắt tool (b, e, v, t, u, k, h, g, i…).
    const text = 'Bé vẽ tranh ở Huế: ăn, ấm, đỏ, ếch, ơi, ưa — Kết thúc';
    await page.keyboard.type(text);
    await expect(editor).toHaveValue(text);
    await expectTool(page, 'text');
    // Đổi kiểu chữ trên Options bar khi đang gõ: áp ngay, vẫn gõ tiếp được.
    await page.getByTestId('option-weight').getByRole('radio', { name: 'Đậm' }).click();
    await expect(editor).toBeFocused();
    await expect(editor).toHaveCSS('font-weight', '700');
    await page.keyboard.type(' 2');
    const typed = `${text} 2`;
    await expect(editor).toHaveValue(typed);
    await page.keyboard.press(`${MOD}+Enter`);
    await expect(editor).toBeHidden();

    // Chữ đã nằm trên canvas: chọn bằng tool Select rồi Enter để sửa lại.
    await page.keyboard.press('v');
    await expectTool(page, 'select');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('text-editor')).toHaveValue(typed);
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('text-editor')).toHaveValue(`${typed}!`);
    await page.keyboard.press('Escape');
    // Mỗi lần sửa là một bước undo.
    await page.keyboard.press(`${MOD}+z`);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('text-editor')).toHaveValue(typed);
  });
});

test.describe('GĐ2 — tool, màu, menu chuột phải', () => {
  test('phím tắt chọn tool (mục 7.7)', async ({ page }) => {
    await openEditorFromPreset(page);
    for (const [key, tool] of [
      ['v', 'select'],
      ['g', 'bucket'],
      ['i', 'eyedropper'],
      ['a', 'arrow'],
      ['u', 'rect'],
      ['t', 'text'],
      ['h', 'highlight'],
      ['k', 'redact'],
      ['p', 'pencil'],
      ['b', 'brush'],
    ] as const) {
      await page.keyboard.press(key);
      await expectTool(page, tool);
    }
    // U nhớ tool hình dùng gần nhất.
    await page.getByTestId('tool-shape-variants').click();
    await page.getByTestId('tool-option-ellipse').click();
    await page.keyboard.press('b');
    await page.keyboard.press('u');
    await expectTool(page, 'ellipse');
  });

  test('chọn màu từ bảng và mã hex; Paint Bucket tô qua Worker', async ({ page }) => {
    await openEditorFromPreset(page);
    await page.getByTestId('color-control').click();
    await expect(page.getByTestId('color-popover')).toBeVisible();
    await page.locator('#hex-input').fill('#e8590c');
    await page.locator('#hex-input').press('Enter');
    await expect(page.getByTestId('color-control')).toHaveAttribute('aria-label', /#E8590C/);
    await page.keyboard.press('Escape');
    // Popup có animation đóng: đợi tháo focus scope trước khi dùng phím tắt canvas.
    await expect(page.getByTestId('color-popover')).toBeHidden();
    await page.getByTestId('workspace').focus();

    await page.keyboard.press('g');
    await expectTool(page, 'bucket');
    await clickCanvas(page, 0.5, 0.6);
    await expect
      .poll(async () => (await displayPixel(page, 0.5, 0.6)).slice(0, 3), { timeout: 10_000 })
      .toEqual([232, 89, 12]);
    await expect(page.getByTestId('undo')).toBeEnabled();
    await page.getByTestId('workspace').focus();
    await page.keyboard.press(`${MOD}+z`);
    await expect.poll(async () => displayPixel(page, 0.5, 0.6)).toEqual([255, 255, 255, 255]);
  });

  test('menu chuột phải trên đối tượng: Xóa; trên vùng trống: Hoàn tác', async ({ page }) => {
    await openEditorFromPreset(page);
    await page.keyboard.press('u');
    await drawOnCanvas(page, [
      [0.35, 0.35],
      [0.6, 0.6],
    ]);
    await expect(page.getByTestId('object-props')).toBeVisible();
    // Chuột phải trên cạnh trái của hình.
    await clickCanvas(page, 0.35, 0.48, { button: 'right' });
    const menu = page.getByTestId('canvas-menu');
    await expect(menu).toBeVisible();
    await page.getByTestId('menu-edit.delete').click();
    await expect(menu).toBeHidden();
    await expect(page.getByTestId('object-props')).toBeHidden();

    await clickCanvas(page, 0.8, 0.8, { button: 'right' });
    await expect(page.getByTestId('menu-edit.undo')).toBeVisible();
    await page.getByTestId('menu-edit.undo').click();
    await expect(page.getByTestId('redo')).toBeEnabled();
  });

  test('menu chuột phải vùng trống: Xuất PNG tải ảnh PNG', async ({ page }, testInfo) => {
    await openEditorFromPreset(page);
    await clickCanvas(page, 0.5, 0.5, { button: 'right' });
    const item = page.getByTestId('menu-file.exportPng');
    await expect(item).toHaveText(/Xuất PNG/);
    const pending = page.waitForEvent('download');
    await item.click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(/[^.]\.png$/);
    const path = testInfo.outputPath('menu.png');
    await download.saveAs(path);
    expect(readFileSync(path).subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  test('cọ trên layer chú thích: hỏi chọn layer, vẽ trên layer mới', async ({ page }) => {
    await openEditorFromPreset(page);
    await page.keyboard.press('a');
    await drawOnCanvas(page, [
      [0.3, 0.3],
      [0.4, 0.4],
    ]);
    await page.keyboard.press('b');
    await drawOnCanvas(page, [
      [0.4, 0.62],
      [0.6, 0.62],
    ]);
    await expect(page.getByTestId('paint-target-dialog')).toBeVisible();
    await page.getByTestId('paint-target-new-layer').click();
    await expect(page.getByTestId('paint-target-dialog')).toBeHidden();
    await drawOnCanvas(page, [
      [0.4, 0.62],
      [0.6, 0.62],
    ]);
    await expect
      .poll(async () => (await displayPixel(page, 0.5, 0.62)).slice(0, 3))
      .toEqual([0, 0, 0]);
  });

  test('Eyedropper (I) lấy màu từ ảnh', async ({ page }) => {
    await page.goto('/');
    await pasteImage(page, 600, 400);
    await expect(page.getByTestId('editor-screen')).toBeVisible();
    await page.keyboard.press('i');
    // Ảnh dán mở ở chế độ Screenshot (tool island rút gọn, GĐ7): phím I vẫn chọn Lấy màu.
    await expect(page.getByTestId('options-bar')).toContainText('Click lấy màu chính');
    await clickCanvas(page, 0.5, 0.75);
    // Ảnh dán mẫu có nền #3B5BDB.
    await expect(page.getByTestId('color-control')).toHaveAttribute('aria-label', /#3B5BDB/);
  });
});
