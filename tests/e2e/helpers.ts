import { expect, type Page } from '@playwright/test';

/** Tạo ảnh PNG trong trang (giống ảnh chụp màn hình) và trả về base64. */
export async function makePngBase64(page: Page, width: number, height: number): Promise<string> {
  return page.evaluate(
    async ([w, h]) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d');
      ctx.fillStyle = '#3b5bdb';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(
        Math.round(w * 0.1),
        Math.round(h * 0.1),
        Math.round(w * 0.3),
        Math.round(h * 0.2),
      );
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });
      if (!blob) throw new Error('no blob');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary);
    },
    [width, height] as const,
  );
}

/** Chờ trang chủ render và gắn xong listener (useEffect chạy trước frame kế tiếp). */
export async function waitForStartScreen(page: Page): Promise<void> {
  await expect(page.getByTestId('start-screen')).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 0);
        });
      }),
  );
}

/** Mô phỏng Ctrl+V một ảnh: phát sự kiện `paste` có DataTransfer chứa file PNG. */
export async function pasteImage(page: Page, width: number, height: number): Promise<void> {
  await waitForStartScreen(page);
  const base64 = await makePngBase64(page, width, height);
  await page.evaluate((data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const file = new File([bytes], 'screenshot.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const event = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    // Sự kiện tổng hợp: WebKit bỏ qua clipboardData, Firefox sao chép DataTransfer và làm rơi
    // file — gắn thẳng DataTransfer để mô phỏng đúng thao tác dán thật.
    Object.defineProperty(event, 'clipboardData', { value: dt });
    document.dispatchEvent(event);
  }, base64);
}

/** Kéo chuột qua các điểm (tỉ lệ 0..1 của khung canvas). */
export async function drawOnCanvas(page: Page, points: readonly [number, number][]): Promise<void> {
  const box = await page.getByTestId('canvas-view').boundingBox();
  if (!box) throw new Error('canvas-view không hiển thị');
  const at = ([fx, fy]: [number, number]) =>
    [box.x + box.width * fx, box.y + box.height * fy] as const;
  const [first, ...rest] = points;
  if (!first) return;
  await page.mouse.move(...at(first));
  await page.mouse.down();
  for (const p of rest) await page.mouse.move(...at(p), { steps: 8 });
  await page.mouse.up();
}

/** Đọc pixel của display canvas tại điểm (tỉ lệ 0..1 của khung canvas). */
export async function displayPixel(page: Page, fx: number, fy: number): Promise<number[]> {
  return page.evaluate(
    ([x, y]) => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid=canvas-view] canvas');
      if (!canvas) return [];
      const ctx = canvas.getContext('2d');
      const px = Math.floor(canvas.width * x);
      const py = Math.floor(canvas.height * y);
      return [...(ctx?.getImageData(px, py, 1, 1).data ?? [])];
    },
    [fx, fy] as const,
  );
}

export async function openEditorFromPreset(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('preset-square').click();
  await expect(page.getByTestId('editor-screen')).toBeVisible();
  // Engine đã mount: display + overlay canvas nằm trong khung.
  await expect(page.locator('[data-testid=canvas-view] canvas')).toHaveCount(2);
}
