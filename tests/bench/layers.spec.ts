import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';

/**
 * Benchmark quyết định của GĐ4 (mục 9, 10.4): kịch bản M và L với 5 và 20 layer, có và không có
 * Below/Above cache (bỏ cache nếu chênh lệch < 20%); pan ở zoom 25% kịch bản L có và không có
 * mipmap (bỏ nếu không cải thiện rõ). Chạy tay:
 * `BENCH_LAYERS=1 npm run bench -- layers` (thêm `HEADED=1` để dùng GPU thật).
 * Kết quả: tests/bench/results/<trình duyệt>-layers.json.
 */
test.skip(!process.env.BENCH_LAYERS, 'Chỉ chạy khi đặt BENCH_LAYERS=1');
test.setTimeout(1_800_000);

interface Row {
  scenario: string;
  layers: number;
  caches: boolean;
  mipmaps: boolean;
  frameP50: number;
  frameP95: number;
  frameMax: number;
  renderP95: number;
  latencyP95: number;
  panP95: number;
  pan25P95: number;
  pan25Mip: number;
  undoMs: number;
  cacheMB: number;
  layerMB: number;
  memoryMB: number;
  switchMs: number;
  switchWarmMs: number;
  notices: string;
}

const CONFIGS: { name: string; size: string; layers: number; cache: boolean; mip: boolean }[] = [];
for (const [name, size] of [
  ['M', '3840x2160'],
  ['L', '6000x4000'],
] as const) {
  for (const layers of [5, 20]) {
    for (const cache of [true, false]) CONFIGS.push({ name, size, layers, cache, mip: true });
  }
}
// Mipmap: pan ở zoom 25% kịch bản L, cache bật, có/không mipmap.
CONFIGS.push({ name: 'L', size: '6000x4000', layers: 5, cache: true, mip: false });
CONFIGS.push({ name: 'L', size: '6000x4000', layers: 20, cache: true, mip: false });

test('Below/Above cache và mipmap: M, L × 5, 20 layer', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const rows: Row[] = [];
  for (const c of CONFIGS) {
    const params = new URLSearchParams({
      custom: `${c.size}x${String(c.layers)}`,
      active: 'middle',
      quick: '1',
      cache: c.cache ? '1' : '0',
      mip: c.mip ? '1' : '0',
      warmup: process.env.WARMUP ?? '1000',
    });
    await page.goto(`/tests/bench/index.html?${params.toString()}`);
    await page.waitForFunction(
      () => '__benchResults' in window || '__benchError' in window,
      undefined,
      { timeout: 300_000 },
    );
    const error = await page.evaluate(
      () => (window as unknown as { __benchError?: string }).__benchError,
    );
    if (error) throw new Error(`${c.name}×${String(c.layers)}: ${error}`);
    const [result] = await page.evaluate(
      () => (window as unknown as { __benchResults: Row[] }).__benchResults,
    );
    if (!result) throw new Error('Không có kết quả');
    rows.push({ ...result, scenario: c.name, layers: c.layers });
    console.log(JSON.stringify(rows.at(-1)));
  }
  mkdirSync('tests/bench/results', { recursive: true });
  writeFileSync(
    `tests/bench/results/${browserName}-layers.json`,
    JSON.stringify(
      { browser: browserName, version: page.context().browser()?.version(), rows },
      null,
      2,
    ),
  );
  console.table(
    rows.map((r) => ({
      kịch_bản: `${r.scenario}×${String(r.layers)}`,
      cache: r.caches,
      mip: r.mipmaps,
      frameP95: r.frameP95,
      renderP95: r.renderP95,
      latencyP95: r.latencyP95,
      panP95: r.panP95,
      pan25P95: r.pan25P95,
      mip25: r.pan25Mip,
      undo: r.undoMs,
      switch: r.switchMs,
      switchWarm: r.switchWarmMs,
      notices: r.notices,
      cacheMB: r.cacheMB,
      layerMB: r.layerMB,
    })),
  );
});
