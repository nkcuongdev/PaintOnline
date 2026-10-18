import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Nghiệm thu GĐ6: ngưỡng xem trước filter của mục 11.2 cho kịch bản M (3840 × 2160, 5 layer) —
 * mỗi lần cập nhật khi kéo slider ≤ 100 ms (mục tiêu ≤ 50 ms). Kéo slider 1,5 s cho từng pipeline ở
 * mức zoom vừa khung và 100%, rồi áp dụng full-res và undo. `npm run bench -- filters` (thêm
 * `HEADED=1` để dùng GPU thật; `FILTERS=WxHxN` đổi kịch bản). Kết quả:
 * tests/bench/results/<trình duyệt>-filters.json.
 */

interface FilterBenchResult {
  filter: string;
  zoom: string;
  updates: number;
  previews: number;
  latencyP50: number;
  latencyP95: number;
  latencyMax: number;
  settleMs: number;
  refines: number;
  dragFrameMax: number;
  applyMs: number;
  applyFrameMax: number;
  applyLongTaskMax: number;
  undoMs: number;
  notices: string;
}

/** Mục 11.2 — bắt buộc: ≤ 100 ms mỗi lần cập nhật xem trước. */
const MAX_PREVIEW_MS = 100;
/** Áp dụng full-res không làm treo UI (ngưỡng khung dài nhất của mục 11.2). */
const MAX_FRAME_MS = 200;

test.setTimeout(600_000);

test('xem trước filter khi kéo slider trên kịch bản M', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  page.on('console', (message) => {
    if (message.text().startsWith('[bench]')) console.log(message.text());
  });
  const extra = new URLSearchParams();
  if (process.env.ONLY) extra.set('only', process.env.ONLY);
  if (process.env.REPEAT) extra.set('repeat', process.env.REPEAT);
  if (process.env.TRACE) extra.set('trace', '1');
  await page.goto(
    `/tests/bench/index.html?filters=${process.env.FILTERS ?? '3840x2160x5'}&${extra.toString()}`,
  );
  await page.waitForFunction(
    () => '__benchResults' in window || '__benchError' in window,
    undefined,
    { timeout: 580_000 },
  );
  const error = await page.evaluate(
    () => (window as unknown as { __benchError?: string }).__benchError,
  );
  expect(error).toBeUndefined();
  const results = await page.evaluate(
    () => (window as unknown as { __benchResults: FilterBenchResult[] }).__benchResults,
  );
  mkdirSync('tests/bench/results', { recursive: true });
  writeFileSync(
    `tests/bench/results/${browserName}-filters.json`,
    JSON.stringify(
      { browser: browserName, version: page.context().browser()?.version(), results },
      null,
      2,
    ),
  );
  console.table(results);
  if (process.env.TRACE) {
    const trace = await page.evaluate(() => (window as unknown as { __trace: string[] }).__trace);
    for (const line of trace) console.log(line);
  }
  for (const r of results) {
    const name = `${r.filter} @ ${r.zoom}`;
    expect(r.previews, `${name}: số bản xem trước`).toBeGreaterThan(5);
    expect(r.latencyP95, `${name}: độ trễ xem trước p95`).toBeLessThanOrEqual(MAX_PREVIEW_MS);
    expect(r.settleMs, `${name}: xem trước sau khi thả slider`).toBeLessThanOrEqual(MAX_PREVIEW_MS);
    expect(r.applyMs, `${name}: áp dụng`).toBeGreaterThan(0);
    expect(r.applyFrameMax, `${name}: khung dài nhất khi áp dụng`).toBeLessThanOrEqual(
      MAX_FRAME_MS,
    );
  }
});
