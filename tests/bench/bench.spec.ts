import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Chạy bộ benchmark trên bản build (mode bench) và kiểm tra ngưỡng BẮT BUỘC của mục 11.2 cho kịch
 * bản S và M. Kết quả ghi vào tests/bench/results/<trình duyệt>.json để cập nhật
 * docs/perf-baseline.md. Chạy bằng `npm run bench`.
 */

interface ScenarioResult {
  scenario: string;
  frameP95: number;
  frameMax: number;
  latencyP95: number;
  undoMs: number;
  redoMs: number;
  memoryMB: number;
  bucketMs: number;
  bucketFrameMax: number;
  saveFullMs: number;
  saveIncMs: number;
  saveFrameMax: number;
  saveLongTaskMax: number;
  openMs: number;
}

test.setTimeout(180_000);

test('benchmark kịch bản S và M', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const custom = process.env.BENCH_CUSTOM;
  await page.goto(
    `/tests/bench/index.html?${custom ? `custom=${custom}` : ''}${process.env.WARMUP ? `&warmup=${process.env.WARMUP}` : ''}${process.env.BENCH_PARAMS ? `&${process.env.BENCH_PARAMS}` : ''}`,
  );
  await page.waitForFunction(
    () => '__benchResults' in window || '__benchError' in window,
    undefined,
    { timeout: 170_000 },
  );
  const error = await page.evaluate(
    () => (window as unknown as { __benchError?: string }).__benchError,
  );
  expect(error).toBeUndefined();
  const results = await page.evaluate(
    () => (window as unknown as { __benchResults: ScenarioResult[] }).__benchResults,
  );

  mkdirSync('tests/bench/results', { recursive: true });
  writeFileSync(
    `tests/bench/results/${browserName}.json`,
    JSON.stringify(
      { browser: browserName, version: page.context().browser()?.version(), results },
      null,
      2,
    ),
  );
  console.table(results);
  console.log(
    'TIMELINE',
    await page.evaluate(() => (globalThis as { __timeline?: string }).__timeline),
  );

  // Ngưỡng bắt buộc (mục 11.2) cho S, M: frame p95 ≤ 33 ms, không frame nào > 200 ms,
  // độ trễ ≤ 50 ms, undo/redo một nét ≤ 200 ms.
  for (const r of results) {
    expect.soft(r.frameP95, `${r.scenario}: frame p95`).toBeLessThanOrEqual(33);
    expect.soft(r.frameMax, `${r.scenario}: frame dài nhất`).toBeLessThanOrEqual(200);
    expect.soft(r.latencyP95, `${r.scenario}: độ trễ p95`).toBeLessThanOrEqual(50);
    expect.soft(r.undoMs, `${r.scenario}: undo`).toBeLessThanOrEqual(200);
    expect.soft(r.redoMs, `${r.scenario}: redo`).toBeLessThanOrEqual(200);
    // Paint Bucket ≤ 1 s (M), UI không bị treo (không khung nào > 200 ms trong lúc tô).
    expect.soft(r.bucketMs, `${r.scenario}: Paint Bucket`).toBeLessThanOrEqual(1000);
    expect.soft(r.bucketFrameMax, `${r.scenario}: khung dài nhất khi tô`).toBeLessThanOrEqual(200);
    // Một lượt autosave: không long task > 100 ms, hoàn tất ≤ 3 s (M); mở project ≤ 3 s (M).
    expect.soft(r.saveLongTaskMax, `${r.scenario}: long task khi lưu`).toBeLessThanOrEqual(100);
    // Lượt lưu đầy đủ (mọi layer đều mới) là ngoại lệ của ngưỡng 3 s (ADR 0022): chỉ bắt hồi quy.
    expect.soft(r.saveFullMs, `${r.scenario}: lượt lưu đầy đủ`).toBeLessThanOrEqual(6000);
    expect.soft(r.saveIncMs, `${r.scenario}: lượt lưu sau một nét`).toBeLessThanOrEqual(3000);
    expect.soft(r.openMs, `${r.scenario}: mở project`).toBeLessThanOrEqual(3000);
  }
});

test('khởi động app: lần đầu và lần sau (đã cache)', async ({ page, browserName }) => {
  const measure = async () => {
    await page.goto('/');
    await expect(page.getByTestId('start-screen')).toBeVisible();
    return page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as
        PerformanceNavigationTiming | undefined;
      return {
        domContentLoaded: Math.round(nav?.domContentLoadedEventEnd ?? 0),
        load: Math.round(nav?.loadEventEnd ?? 0),
        ready: Math.round(performance.now()),
      };
    });
  };
  const first = await measure();
  const cached = await measure();
  console.log(browserName, 'khởi động', JSON.stringify({ first, cached }));
  mkdirSync('tests/bench/results', { recursive: true });
  writeFileSync(
    `tests/bench/results/${browserName}-startup.json`,
    JSON.stringify({ first, cached }, null, 2),
  );
  // Mục tiêu: lần đầu ≤ 2 s; bắt buộc: lần sau ≤ 1,5 s.
  expect.soft(cached.ready).toBeLessThanOrEqual(1500);
});
