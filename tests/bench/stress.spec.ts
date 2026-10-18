import { test } from '@playwright/test';

/**
 * Áp lực bộ nhớ canvas (mục 10.4): cấp phát canvas 3840×2160 có nội dung tới khi trình duyệt từ
 * chối hoặc chạm trần an toàn. Chỉ chạy tay (tốn ~1,8 GB RAM):
 * `STRESS=1 HEADED=1 npx playwright test -c playwright.bench.config.ts stress`.
 */
test.setTimeout(240_000);
test.skip(!process.env.STRESS, 'Chỉ chạy khi đặt STRESS=1');

test('áp lực bộ nhớ canvas 4K', async ({ page, browserName }) => {
  await page.goto('/tests/bench/index.html?scenario=none');
  const result = await page.evaluate(async () => {
    const cap = 1.75 * 1024 ** 3;
    const bytesPer = 3840 * 2160 * 4;
    const canvases: OffscreenCanvas[] = [];
    const display = new OffscreenCanvas(640, 360);
    const dctx = display.getContext('2d');
    let failure = '';
    while (canvases.length * bytesPer < cap) {
      try {
        const c = new OffscreenCanvas(3840, 2160);
        const ctx = c.getContext('2d');
        if (!ctx) {
          failure = 'getContext null';
          break;
        }
        ctx.fillStyle = `hsl(${String(canvases.length * 13)} 70% 50%)`;
        ctx.fillRect(0, 0, 3840, 2160);
        dctx?.drawImage(c, 0, 0, 640, 360);
        canvases.push(c);
        await new Promise((r) => setTimeout(r, 30));
      } catch (error) {
        failure = String(error);
        break;
      }
    }
    const reached = canvases.length * bytesPer;
    for (const c of canvases) {
      c.width = 0;
      c.height = 0;
    }
    return { count: canvases.length, reachedMB: Math.round(reached / 1024 ** 2), failure };
  });
  console.log(browserName, 'stress', JSON.stringify(result));
});
