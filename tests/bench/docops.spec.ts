import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Nghiệm thu GĐ5: crop/resize trên kịch bản L (6000 × 4000, 10 layer) hoàn thành mà UI không bị
 * treo — đo thời gian, khung dài nhất và long task dài nhất của cắt xén, Resize, xoay, Canvas size
 * và undo. `npm run bench -- docops` (thêm `HEADED=1` để dùng GPU thật; `DOCOPS=WxHxN` đổi kịch
 * bản). Kết quả: tests/bench/results/<trình duyệt>-docops.json.
 */

interface DocOpResult {
  op: string;
  ok: boolean;
  ms: number;
  frameMax: number;
  longTaskMax: number;
  repaintMs: number;
  repaintGap: number;
  size: string;
  notices: string;
}

/**
 * "UI không bị treo": trong lúc xử lý không khung nào dài hơn ngưỡng frame dài nhất của mục 11.2.
 * Lần vẽ lại đầu tiên sau khi mọi layer đổi được ghi riêng (repaint) — cùng chi phí với mở ảnh hoặc
 * đổi layer hoạt động trên ảnh lớn (ADR 0023, 0025).
 */
const MAX_FRAME_MS = 200;

test.setTimeout(300_000);

test('crop, resize, xoay, canvas size trên kịch bản L', async ({ page, browserName }) => {
  // Lỗi Engine (thao tác ảnh thất bại) in ra để khoanh vùng.
  page.on('console', (msg) => {
    if (msg.type() !== 'log' && msg.type() !== 'info') {
      console.log(`[${browserName}] ${msg.type()}: ${msg.text()}`);
    }
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(
    `/tests/bench/index.html?docops=${process.env.DOCOPS ?? '6000x4000x10'}${process.env.TRACE ? '&trace' : ''}`,
  );
  await page.waitForFunction(
    () => '__benchResults' in window || '__benchError' in window,
    undefined,
    { timeout: 280_000 },
  );
  const error = await page.evaluate(
    () => (window as unknown as { __benchError?: string }).__benchError,
  );
  expect(error).toBeUndefined();
  const results = await page.evaluate(
    () => (window as unknown as { __benchResults: DocOpResult[] }).__benchResults,
  );
  mkdirSync('tests/bench/results', { recursive: true });
  writeFileSync(
    `tests/bench/results/${browserName}-docops.json`,
    JSON.stringify(
      { browser: browserName, version: page.context().browser()?.version(), results },
      null,
      2,
    ),
  );
  console.table(results);
  if (process.env.TRACE) {
    const trace = await page.evaluate(() => (window as unknown as { __trace: string[] }).__trace);
    console.log(trace.join('\n'));
  }
  for (const r of results) {
    expect(r.ok, r.op).toBe(true);
    expect(r.frameMax, `${r.op}: khung dài nhất`).toBeLessThanOrEqual(MAX_FRAME_MS);
  }
});
