import { expect, test, type Page } from '@playwright/test';
import { displayPixel, drawOnCanvas, openEditorFromPreset } from './helpers';

/**
 * E2E GĐ6 (mục 9): điều chỉnh và bộ lọc qua menu Điều chỉnh — bảng nổi xem trước trực tiếp, giữ để
 * so sánh, Hủy không đổi ảnh, Áp dụng thành một bước history; bộ lọc trong vùng chọn; tool Gradient.
 * Chạy trên Chromium, Firefox, WebKit với bản build production.
 */

async function pressKey(page: Page, key: string): Promise<void> {
  await page.getByTestId('workspace').focus();
  await page.keyboard.press(key);
}

async function red(page: Page, fx: number, fy: number): Promise<number> {
  const [r = 0] = await displayPixel(page, fx, fy);
  return r;
}

/** Nét đen ngang giữa ảnh trắng. */
async function drawBar(page: Page): Promise<void> {
  await pressKey(page, 'b');
  for (const y of [0.49, 0.5, 0.51]) {
    await drawOnCanvas(page, [
      [0.2, y],
      [0.8, y],
    ]);
  }
  await expect.poll(() => red(page, 0.3, 0.5)).toBeLessThan(60);
}

async function openAdjustment(page: Page, id: string): Promise<void> {
  await page.getByTestId('adjust-menu').click();
  await page.getByTestId(`menu-filter.${id}`).click();
}

/** Nhập giá trị tham số đầu tiên của bước `filter` (vd. `brightness`, `blur`). */
async function setParam(page: Page, filter: string, value: number): Promise<void> {
  await page.locator(`[data-testid^="filter-input-${filter}-"]`).first().fill(String(value));
}

test.describe('GĐ6 — điều chỉnh và bộ lọc', () => {
  // Ảnh vuông nằm giữa vùng làm việc (x ≈ 0,26–0,74): mẫu lấy trong khung ảnh. Nền trắng là màu nền
  // của document; nét đen nằm trên layer ảnh (filter tác động layer, không đổi màu nền).
  test('Đảo màu áp dụng ngay thành một bước; Ctrl+Z khôi phục', async ({ page }) => {
    await openEditorFromPreset(page);
    await drawBar(page);
    await openAdjustment(page, 'invert');
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', /Đảo màu/);
    await expect.poll(() => red(page, 0.4, 0.5)).toBeGreaterThan(200);
    await expect(page.getByTestId('adjust-panel')).toHaveCount(0);
    await pressKey(page, 'Control+z');
    await expect(page.getByTestId('redo')).toHaveAttribute('aria-label', /Đảo màu/);
    await expect.poll(() => red(page, 0.4, 0.5)).toBeLessThan(60);
  });

  test('Độ sáng/Tương phản: xem trước, giữ so sánh, Hủy không đổi ảnh, Áp dụng một bước', async ({
    page,
  }) => {
    await openEditorFromPreset(page);
    await drawBar(page);
    await openAdjustment(page, 'brightnessContrast');
    const panel = page.getByTestId('adjust-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('role', 'dialog');

    await setParam(page, 'brightness', 50);
    // Xem trước: nét đen sáng lên nửa thang; document chưa đổi (bước cuối vẫn là nét cọ).
    await expect.poll(() => red(page, 0.4, 0.5)).toBeGreaterThan(100);
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', /Nét cọ/);

    // Giữ nút so sánh: hiện ảnh gốc; thả ra: quay lại bản xem trước.
    await page.getByTestId('adjust-compare').hover();
    await page.mouse.down();
    await expect.poll(() => red(page, 0.4, 0.5)).toBeLessThan(60);
    await page.mouse.up();
    await expect.poll(() => red(page, 0.4, 0.5)).toBeGreaterThan(100);

    await page.getByTestId('adjust-cancel').click();
    await expect(panel).toHaveCount(0);
    await expect.poll(() => red(page, 0.4, 0.5)).toBeLessThan(60);
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', /Nét cọ/);

    await openAdjustment(page, 'brightnessContrast');
    await setParam(page, 'brightness', 50);
    await page.getByTestId('adjust-apply').click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', /Độ sáng\/Tương phản/);
    const value = await red(page, 0.4, 0.5);
    expect(value).toBeGreaterThan(100);
    expect(value).toBeLessThan(160);
  });

  test('Làm mờ chỉ tác động trong vùng chọn; Esc đóng bảng', async ({ page }) => {
    await openEditorFromPreset(page);
    await drawBar(page);
    await pressKey(page, 'm');
    await drawOnCanvas(page, [
      [0.05, 0.05],
      [0.5, 0.95],
    ]);
    await expect(page.getByTestId('status-selection')).toBeVisible();

    await openAdjustment(page, 'blur');
    await setParam(page, 'blur', 30);
    await expect(page.getByText('Chỉ tác động trong vùng chọn.')).toBeVisible();
    // Esc trong bảng: hủy, ảnh giữ nguyên.
    await page.getByTestId('filter-input-blur-radius').press('Escape');
    await expect(page.getByTestId('adjust-panel')).toHaveCount(0);

    await openAdjustment(page, 'blur');
    await setParam(page, 'blur', 30);
    await page.getByTestId('adjust-apply').click();
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', /Làm mờ/);
    // Ngay trên nét: trong vùng chọn bị nhòe (xám), ngoài vùng chọn vẫn trắng và nét vẫn đen.
    await expect.poll(() => red(page, 0.4, 0.465)).toBeLessThan(240);
    expect(await red(page, 0.65, 0.465)).toBeGreaterThan(250);
    expect(await red(page, 0.65, 0.5)).toBeLessThan(60);
  });

  test('Gradient: G chọn kiểu tô, G lần nữa đổi Tô màu ↔ Gradient; kéo tạo chuyển màu', async ({
    page,
  }) => {
    await openEditorFromPreset(page);
    await pressKey(page, 'g');
    await expect(page.getByTestId('tool-bucket')).toHaveAttribute('aria-pressed', 'true');
    await pressKey(page, 'g');
    await expect(page.getByTestId('tool-gradient')).toHaveAttribute('aria-pressed', 'true');
    await drawOnCanvas(page, [
      [0.1, 0.5],
      [0.9, 0.5],
    ]);
    await expect(page.getByTestId('undo')).toHaveAttribute('aria-label', /Chuyển màu/);
    // Màu chính đen → màu phụ trắng, tuyến tính theo chiều kéo.
    await expect.poll(() => red(page, 0.3, 0.4)).toBeLessThan(100);
    expect(await red(page, 0.7, 0.4)).toBeGreaterThan(150);
    const middle = await red(page, 0.5, 0.4);
    expect(middle).toBeGreaterThan(100);
    expect(middle).toBeLessThan(160);
  });
});
