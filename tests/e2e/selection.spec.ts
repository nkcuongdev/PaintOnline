import { expect, test, type Page } from '@playwright/test';
import { displayPixel, drawOnCanvas, makePngBase64, openEditorFromPreset } from './helpers';

/**
 * E2E GĐ5 (mục 9): chỉnh sửa ảnh cơ bản — vùng chọn, di chuyển pixel, copy-paste giữ đúng vị trí,
 * cắt xén bằng tool Crop, Resize/Canvas size/xoay qua menu Ảnh, thả ảnh vào editor thành layer mới.
 * Chạy trên Chromium, Firefox, WebKit với bản build production.
 */

/** Kéo chuột (tỉ lệ 0..1 của khung canvas), tùy chọn giữ phím bổ trợ. */
async function dragOnCanvas(
  page: Page,
  from: [number, number],
  to: [number, number],
  modifier?: 'Alt' | 'Shift',
): Promise<void> {
  if (modifier) await page.keyboard.down(modifier);
  await drawOnCanvas(page, [from, to]);
  if (modifier) await page.keyboard.up(modifier);
}

async function pressKey(page: Page, key: string): Promise<void> {
  await page.getByTestId('workspace').focus();
  await page.keyboard.press(key);
}

/** Pixel tối (nét đen) hay sáng (nền trắng) ở điểm trên khung canvas. */
async function isDark(page: Page, fx: number, fy: number): Promise<boolean> {
  const [r = 255] = await displayPixel(page, fx, fy);
  return r < 128;
}

/** Nét đen ngang giữa ảnh (cọ mặc định, nhiều lượt cho dày). */
async function drawBar(page: Page): Promise<void> {
  await pressKey(page, 'b');
  for (const y of [0.49, 0.5, 0.51]) {
    await drawOnCanvas(page, [
      [0.2, y],
      [0.8, y],
    ]);
  }
  await expect.poll(() => isDark(page, 0.3, 0.5)).toBe(true);
}

/** Phát sự kiện clipboard của trình duyệt (Ctrl+C/X/V đi qua sự kiện, không qua keydown). */
async function clipboardEvent(page: Page, type: 'copy' | 'cut' | 'paste'): Promise<void> {
  await page.evaluate((kind) => {
    const dt = new DataTransfer();
    const event = new ClipboardEvent(kind, { clipboardData: dt, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: dt });
    document.dispatchEvent(event);
  }, type);
}

async function statusSize(page: Page): Promise<string> {
  return (await page.getByTestId('status-size').textContent()) ?? '';
}

test.describe('GĐ5 — vùng chọn và biến đổi ảnh', () => {
  test.beforeEach(async ({ context, browserName }) => {
    // Ghi ảnh vào clipboard hệ thống (Chromium cần quyền; trình duyệt khác tải file PNG thay thế).
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    }
  });

  test('Marquee: kéo vùng chọn di chuyển pixel, Enter áp dụng, Ctrl+Z khôi phục', async ({
    page,
  }) => {
    await openEditorFromPreset(page);
    await drawBar(page);

    await pressKey(page, 'm');
    await expect(page.getByTestId('tool-marquee-rect')).toHaveAttribute('aria-pressed', 'true');
    await dragOnCanvas(page, [0.15, 0.4], [0.45, 0.6]);
    await expect(page.getByTestId('status-selection')).toBeVisible();

    // Kéo bên trong vùng chọn: pixel nổi, document chưa đổi cho tới khi áp dụng.
    await dragOnCanvas(page, [0.3, 0.5], [0.3, 0.8]);
    await expect(page.getByTestId('floating-commit')).toBeVisible();
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', /Nét cọ/);
    await expect.poll(() => isDark(page, 0.3, 0.8)).toBe(true);
    await expect.poll(() => isDark(page, 0.3, 0.5)).toBe(false);

    await pressKey(page, 'Enter');
    await expect(page.getByTestId('floating-commit')).toHaveCount(0);
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', /Di chuyển vùng chọn/);
    // Phần ngoài vùng chọn không đổi.
    await expect.poll(() => isDark(page, 0.6, 0.5)).toBe(true);

    await page.getByTestId('undo').click();
    await expect.poll(() => isDark(page, 0.3, 0.5)).toBe(true);
    await expect.poll(() => isDark(page, 0.3, 0.8)).toBe(false);
  });

  test('copy rồi dán: layer mới đúng vị trí cũ (nghiệm thu GĐ5)', async ({ page }) => {
    await openEditorFromPreset(page);
    await drawBar(page);
    await pressKey(page, 'm');
    await dragOnCanvas(page, [0.15, 0.4], [0.45, 0.6]);
    await expect(page.getByTestId('status-selection')).toBeVisible();

    await clipboardEvent(page, 'copy');
    await expect(page.getByText(/Đã copy vùng chọn|đã tải file PNG/)).toBeVisible();
    await clipboardEvent(page, 'paste');
    await expect(page.getByTestId('floating-commit')).toBeVisible();
    await pressKey(page, 'Enter');
    await expect(page.getByTestId('layer-row')).toHaveCount(2);
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', /Dán/);

    // Ẩn layer gốc: phần nét trong vùng chọn vẫn thấy đúng chỗ cũ (thuộc layer vừa dán), phần ngoài
    // vùng chọn biến mất.
    await page.getByTestId('layer-row').nth(1).getByTestId('layer-visibility').click();
    await expect.poll(() => isDark(page, 0.6, 0.5)).toBe(false);
    await expect.poll(() => isDark(page, 0.3, 0.5)).toBe(true);
  });

  test('chuột phải trong vùng chọn: menu vùng chọn — xóa vùng chọn', async ({ page }) => {
    await openEditorFromPreset(page);
    await drawBar(page);
    await pressKey(page, 'm');
    await dragOnCanvas(page, [0.15, 0.4], [0.45, 0.6]);
    const box = await page.getByTestId('canvas-view').boundingBox();
    if (!box) throw new Error('no canvas');
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5, { button: 'right' });
    await expect(page.getByTestId('canvas-menu')).toBeVisible();
    await page.getByTestId('menu-selection.delete').click();
    await expect.poll(() => isDark(page, 0.3, 0.5)).toBe(false);
    await expect.poll(() => isDark(page, 0.6, 0.5)).toBe(true);
  });

  test('Crop: kéo khung, Enter cắt xén; undo trả lại kích thước', async ({ page }) => {
    await openEditorFromPreset(page);
    expect(await statusSize(page)).toContain('1080 × 1080');
    await pressKey(page, 'c');
    await expect(page.getByTestId('tool-crop')).toHaveAttribute('aria-pressed', 'true');
    await dragOnCanvas(page, [0.2, 0.2], [0.6, 0.5]);
    await pressKey(page, 'Enter');
    await expect.poll(() => statusSize(page)).not.toContain('1080 × 1080');
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', /Cắt xén ảnh/);
    await page.getByTestId('undo').click();
    await expect.poll(() => statusSize(page)).toContain('1080 × 1080');
  });

  test('menu Ảnh: Resize giữ tỉ lệ, Canvas size có neo, xoay 90°', async ({ page }) => {
    await openEditorFromPreset(page);
    await page.getByTestId('image-menu').click();
    await page.getByTestId('menu-image.resize').click();
    await expect(page.getByTestId('resize-dialog')).toBeVisible();
    await page.getByTestId('resize-width').fill('540');
    await expect(page.getByTestId('resize-height')).toHaveValue('540');
    await page.getByTestId('resize-apply').click();
    await expect.poll(() => statusSize(page)).toContain('540 × 540');

    await page.getByTestId('image-menu').click();
    await page.getByTestId('menu-image.canvasSize').click();
    await expect(page.getByTestId('canvas-dialog')).toBeVisible();
    await page.getByTestId('canvas-width').fill('800');
    await page.getByTestId('canvas-anchor-nw').click();
    await page.getByTestId('canvas-apply').click();
    await expect.poll(() => statusSize(page)).toContain('800 × 540');

    await page.getByTestId('image-menu').click();
    await page.getByTestId('menu-image.rotateCw').click();
    await expect.poll(() => statusSize(page)).toContain('540 × 800');
    await page.getByTestId('undo').click();
    await expect.poll(() => statusSize(page)).toContain('800 × 540');
  });

  test('thả file ảnh vào editor: layer mới đang nổi giữa khung nhìn', async ({ page }) => {
    await openEditorFromPreset(page);
    const png = await makePngBase64(page, 200, 120);
    await page.evaluate((data) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'anh.png', { type: 'image/png' }));
      for (const type of ['dragenter', 'dragover', 'drop']) {
        const event = new DragEvent(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'dataTransfer', { value: dt });
        window.dispatchEvent(event);
      }
    }, png);
    await expect(page.getByTestId('floating-commit')).toBeVisible();
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('status-selection')).toContainText('200 × 120');
    await page.getByTestId('floating-commit').click();
    await expect(page.getByTestId('layer-row')).toHaveCount(2);
    // Ảnh xanh nằm giữa khung nhìn (ảnh vuông vừa khung: tâm canvas).
    await expect.poll(async () => (await displayPixel(page, 0.5, 0.5))[2]).toBeGreaterThan(150);
  });

  test('Đũa thần chọn vùng cùng màu; xuất chỉ vùng chọn', async ({ page }) => {
    await openEditorFromPreset(page);
    await drawBar(page);
    await pressKey(page, 'w');
    await drawOnCanvas(page, [[0.5, 0.35]]);
    // Nền trắng liền: chọn cả ảnh trừ nét (layer nền trong suốt — lấy mẫu trên layer).
    await expect(page.getByTestId('status-selection')).toBeVisible();
    await page.getByTestId('export-image').click();
    await expect(page.getByTestId('export-selection-only')).toBeVisible();
    await page.getByTestId('export-selection-only').check();
    await expect(page.getByTestId('export-size')).toBeVisible();
  });
});
