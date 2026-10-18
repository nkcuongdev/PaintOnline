/**
 * Bộ benchmark (mục 11.2): phát lại input chuẩn trên Engine thật (canvas, renderer, history) theo
 * nhịp thời gian thật và đo frame time, độ trễ event → frame, undo/redo, bộ nhớ.
 *
 * Chạy: `npm run bench` (build mode bench + Playwright). Kết quả đặt ở `window.__benchResults`.
 * Kịch bản S và M ở GĐ1; L, XL đo ở GĐ4/GĐ9 khi có cache và panel layer.
 * GĐ2: layer chú thích của S có đối tượng thật (mũi tên, khung, chữ, highlight, che thông tin) và
 * đo Paint Bucket (mục 11.2: ≤ 1 s cho M, UI không treo).
 * GĐ3: một lượt autosave (toàn bộ layer và chỉ layer vừa vẽ) trên IndexedDB thật + Worker, long
 * task / khung dài nhất trong lúc lưu (≤ 100 ms), mở lại project (≤ 3 s cho M).
 * GĐ4 (mục 10.4): tham số `layers`, `cache=0`, `mip=0`, `active=middle` để so Below/Above cache và
 * mipmap; pan ở zoom 25%; `quick=1` bỏ Paint Bucket/lưu/mở (chỉ đo vẽ, pan, undo).
 * GĐ5: `docops=6000x4000x10` đo cắt xén, Resize, xoay, Canvas size và undo của chúng (nghiệm thu:
 * crop/resize trên kịch bản L hoàn thành mà UI không bị treo) — thời gian, khung dài nhất, long task.
 * GĐ6: `filters=3840x2160x5` (+ `only=blur,sharpen`, `repeat=3`, `trace`) đo xem trước filter khi
 * kéo slider (nghiệm thu: ≤ 100 ms mỗi lần cập nhật trên kịch bản M), rồi áp dụng full-res và undo.
 */
import { Editor } from '@/engine/core/Editor';
import type { DocumentLayerSpec } from '@/engine/core/Document';
import type { FilterStep } from '@/engine/core/types';
import { TIER_BUDGETS } from '@/engine/memory/MemoryBudget';
import { detectPlatformFeatures } from '@/services/platform/features';
import { Autosave } from '@/services/storage/autosave';
import { Database } from '@/services/storage/db';
import { ProjectRepository } from '@/services/storage/projectRepo';
import { decodeLayerImages, documentSpecFromRecord } from '@/services/storage/restore';
import { sharedWorkerPool } from '@/services/workers/pool';

export interface ScenarioResult {
  scenario: string;
  document: string;
  layers: number;
  /** Khoảng cách giữa các requestAnimationFrame khi đang vẽ (ms). */
  frameP50: number;
  frameP95: number;
  frameMax: number;
  /** Thời gian CPU của renderer mỗi frame (ms). */
  renderP95: number;
  /** Ước lượng độ trễ: sự kiện pointer → frame vẽ kế tiếp (ms). */
  latencyP50: number;
  latencyP95: number;
  /** Frame time khi pan liên tục. */
  panP95: number;
  /** Undo / redo một nét (gồm vẽ lại khung hình), ms. */
  undoMs: number;
  redoMs: number;
  /** Riêng phần hoán đổi tile của undo (không gồm vẽ lại), ms. */
  /** Xử lý pointermove lâu nhất và pointerup (gồm commit PaintCommand), ms. */
  moveMaxMs: number;
  commitMs: number;
  /** Frame p95 riêng nét cứng (trước mọi commit) và nét mềm (sau commit đầu). */
  hardP95: number;
  softP95: number;
  undoSwapMs: number;
  /** Số tile của nét vừa undo. */
  undoTiles: number;
  /** Bộ nhớ ước lượng của MemoryBudget, MB. */
  memoryMB: number;
  liveCanvases: number;
  strokes: number;
  /** Số đối tượng vector trong document khi đo. */
  objects: number;
  /** Paint Bucket tô toàn ảnh (trường hợp xấu nhất): từ click tới khi ảnh mới hiện ra, ms. */
  bucketMs: number;
  /** Khung dài nhất trong lúc tô (UI có bị treo không), ms. */
  bucketFrameMax: number;
  /** Diễn biến nét đầu: "khung dài nhất/số khung" mỗi 500 ms. */
  timeline: string;
  /** Lượt lưu đầu (mọi layer), ms. */
  saveFullMs: number;
  /** Lượt lưu sau một nét (một layer), ms. */
  saveIncMs: number;
  /** Khung dài nhất / long task dài nhất trên main thread trong lúc lưu, ms (-1: không đo được). */
  saveFrameMax: number;
  saveLongTaskMax: number;
  /** Mở lại project: đọc DB + giải mã + dựng document, ms. */
  openMs: number;
  /** Frame time khi pan ở zoom 25% (mipmap — mục 10.4). */
  pan25P95: number;
  /** Mức mipmap dùng khi pan ở zoom 25% (0 = không). */
  pan25Mip: number;
  /** Cấu hình render: Below/Above cache, mipmap, vị trí layer hoạt động. */
  caches: boolean;
  mipmaps: boolean;
  active: string;
  /** Bộ nhớ cache (Below/Above, mipmap) và layer khi đo, MB. */
  cacheMB: number;
  layerMB: number;
  /** Thông báo Engine phát trong lúc đo (từ chối vì thiếu bộ nhớ…). */
  notices: string;
  /** Frame ngay sau khi đổi layer hoạt động (cache phải dựng lại), ms — lớn nhất của 4 lần. */
  switchMs: number;
  /** Thời gian tới khi cache dựng dần xong sau khi đổi layer, ms. */
  switchWarmMs: number;
}

const HOST_W = 1280;
const HOST_H = 720;

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round((sorted[i] ?? 0) * 100) / 100;
}

const nextFrame = () =>
  new Promise<number>((resolve) => {
    requestAnimationFrame(resolve);
  });
const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Ảnh có nội dung (gradient + hình khối) — layer không trống như ảnh thật. */
async function contentImage(width: number, height: number, seed: number): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d');
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, `hsl(${String(seed * 47)} 70% 60% / 0.9)`);
  g.addColorStop(1, `hsl(${String(seed * 47 + 120)} 70% 40% / 0.6)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `hsl(${String((i * 31 + seed * 13) % 360)} 80% 50% / 0.5)`;
    ctx.fillRect(
      (((i * 97) % 100) / 100) * width,
      (((i * 53) % 100) / 100) * height,
      width / 12,
      height / 12,
    );
  }
  const bitmap = await createImageBitmap(canvas);
  canvas.width = 0;
  canvas.height = 0;
  return bitmap;
}

function fire(target: HTMLElement, type: string, x: number, y: number, buttons: number): void {
  const rect = target.getBoundingClientRect();
  target.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: rect.left + x,
      clientY: rect.top + y,
      button: 0,
      buttons,
      bubbles: true,
      cancelable: true,
    }),
  );
}

/**
 * Một nét dài `durationMs` theo đường Lissajous, sự kiện ở 120 Hz (chuột/bút hiện đại), đo khoảng
 * cách rAF và độ trễ từ lúc phát sự kiện tới frame kế tiếp.
 */
async function strokeFor(
  editor: Editor,
  overlay: HTMLElement,
  durationMs: number,
  phase: number,
): Promise<{
  frames: number[];
  renders: number[];
  latencies: number[];
  moveMax: number;
  upMs: number;
}> {
  const frames: number[] = [];
  const renders: number[] = [];
  const latencies: number[] = [];
  const pending: number[] = [];
  let lastFrame = 0;
  let running = true;
  let moveMax = 0;

  editor.onFrame((stats) => {
    if (!stats.painted) return;
    renders.push(stats.duration);
    const now = performance.now();
    for (const t of pending) latencies.push(now - t);
    pending.length = 0;
  });
  const loop = (t: number) => {
    if (!running) return;
    if (lastFrame) frames.push(t - lastFrame);
    lastFrame = t;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const cx = HOST_W / 2;
  const cy = HOST_H / 2;
  const point = (t: number) => ({
    x: cx + Math.sin(t * 2.1 + phase) * HOST_W * 0.35,
    y: cy + Math.sin(t * 3.3 + phase) * HOST_H * 0.3,
  });
  const start = performance.now();
  const p0 = point(0);
  fire(overlay, 'pointerdown', p0.x, p0.y, 1);
  while (performance.now() - start < durationMs) {
    await sleep(8);
    const t = (performance.now() - start) / 1000;
    const p = point(t);
    pending.push(performance.now());
    const m0 = performance.now();
    fire(overlay, 'pointermove', p.x, p.y, 1);
    moveMax = Math.max(moveMax, performance.now() - m0);
  }
  const pEnd = point((performance.now() - start) / 1000);
  const u0 = performance.now();
  fire(overlay, 'pointerup', pEnd.x, pEnd.y, 0);
  const upMs = performance.now() - u0;
  await nextFrame();
  await nextFrame();
  running = false;
  editor.onFrame(null);
  return { frames, renders, latencies, moveMax, upMs };
}

/** Pan liên tục ở zoom 25% (ảnh lớn: mipmap ½, ¼ — mục 5.2). */
async function panZoomedFor(
  editor: Editor,
  durationMs: number,
): Promise<{ frames: number[]; mip: number }> {
  const before = editor.viewport.state;
  editor.viewport.zoomTo(0.25);
  await nextFrame();
  await waitWarm(editor);
  const frames = await panFor(editor, durationMs);
  const mip = editor.renderCacheStats.mipLevel;
  editor.viewport.set(before);
  await nextFrame();
  return { frames, mip };
}

/** Chờ cache dựng dần xong (mục 5.2) — đo trạng thái ổn định, tối đa 15 s. */
async function waitWarm(editor: Editor): Promise<number> {
  const t0 = performance.now();
  while (performance.now() - t0 < 15_000) {
    editor.flush();
    if (!editor.renderCacheStats.warming) break;
    await sleep(50);
  }
  return Math.round(performance.now() - t0);
}

async function panFor(editor: Editor, durationMs: number): Promise<number[]> {
  const frames: number[] = [];
  const start = performance.now();
  let last = 0;
  let dir = 1;
  while (performance.now() - start < durationMs) {
    const t = await nextFrame();
    if (last) frames.push(t - last);
    last = t;
    editor.viewport.panBy(12 * dir, 6 * dir);
    if (Math.random() < 0.02) dir = -dir;
  }
  return frames;
}

/** Đối tượng chú thích như một ảnh chụp màn hình được chú thích thật (kịch bản S). */
function addAnnotations(editor: Editor, width: number, height: number): void {
  const drag = (
    tool: Parameters<Editor['tools']['setActive']>[0],
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ) => {
    editor.tools.setActive(tool);
    editor.dispatchPointer('down', { x: x0 * width, y: y0 * height });
    editor.dispatchPointer('move', { x: ((x0 + x1) / 2) * width, y: ((y0 + y1) / 2) * height });
    editor.dispatchPointer('up', { x: x1 * width, y: y1 * height });
  };
  for (let i = 0; i < 8; i++) drag('arrow', 0.1 + i * 0.1, 0.9, 0.15 + i * 0.1, 0.6);
  for (let i = 0; i < 6; i++) drag('rect', 0.05 + i * 0.15, 0.1, 0.15 + i * 0.15, 0.25);
  for (let i = 0; i < 4; i++) drag('highlight', 0.1 + i * 0.2, 0.3, 0.25 + i * 0.2, 0.34);
  for (let i = 0; i < 2; i++) drag('redact', 0.4 + i * 0.3, 0.45, 0.55 + i * 0.3, 0.5);
  editor.tools.setActive('text');
  for (let i = 0; i < 4; i++) {
    editor.dispatchPointer('down', { x: (0.1 + i * 0.22) * width, y: 0.4 * height });
    editor.dispatchPointer('up', { x: (0.1 + i * 0.22) * width, y: 0.4 * height });
    editor.text.commit(`Chú thích số ${String(i + 1)} — cần sửa`);
  }
  editor.objects.clearSelection();
}

/** Paint Bucket tô toàn ảnh trên layer hoạt động; đo tổng thời gian và khung dài nhất. */
async function measureBucket(
  editor: Editor,
  width: number,
  height: number,
): Promise<{ ms: number; frameMax: number }> {
  editor.tools.setActive('bucket');
  editor.options.set('bucket', { tolerance: 1, contiguous: true, sampleAll: false, expand: 0 });
  const before = editor.historySummary().undoLabel;
  const steps = editor.historySummary().steps;
  const gaps: number[] = [];
  let last = await nextFrame();
  let running = true;
  const loop = (t: number) => {
    gaps.push(t - last);
    last = t;
    if (running) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const notices: string[] = [];
  const off = editor.on('notice', ({ code }) => notices.push(code));
  const t0 = performance.now();
  editor.dispatchPointer('down', { x: width / 2, y: height / 2 });
  editor.dispatchPointer('up', { x: width / 2, y: height / 2 });
  while (editor.historySummary().steps === steps && editor.historySummary().undoLabel === before) {
    if (notices.length > 0 || performance.now() - t0 > 20_000) {
      off();
      running = false;
      throw new Error(
        `Paint Bucket không hoàn tất: ${notices.join(', ') || 'quá 20 s'} (busy=${String(editor.busy)})`,
      );
    }
    await nextFrame();
  }
  off();
  editor.flush();
  const ms = performance.now() - t0;
  await nextFrame();
  running = false;
  return { ms: Math.round(ms), frameMax: Math.round(Math.max(0, ...gaps)) };
}

/** Theo dõi khung hình và long task trong lúc chạy `task`. */
async function watchMainThread<T>(
  task: () => Promise<T>,
): Promise<{ value: T; frameMax: number; longTaskMax: number }> {
  const gaps: number[] = [];
  let last = await nextFrame();
  let running = true;
  const loop = (t: number) => {
    gaps.push(t - last);
    last = t;
    if (running) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  let longTaskMax = -1;
  let observer: PerformanceObserver | null = null;
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    longTaskMax = 0;
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTaskMax = Math.max(longTaskMax, entry.duration);
    });
    observer.observe({ type: 'longtask' });
  }
  const value = await task();
  await nextFrame();
  running = false;
  observer?.disconnect();
  return {
    value,
    frameMax: Math.round(Math.max(0, ...gaps)),
    longTaskMax: Math.round(longTaskMax),
  };
}

/** Autosave trên IndexedDB thật + Worker pool (mục 6.6, 11.2). */
async function measureSave(
  editor: Editor,
): Promise<
  Pick<ScenarioResult, 'saveFullMs' | 'saveIncMs' | 'saveFrameMax' | 'saveLongTaskMax' | 'openMs'>
> {
  const db = new Database(`paint-online-bench-${crypto.randomUUID()}`);
  const repo = new ProjectRepository(db);
  const projectId = editor.document?.id ?? crypto.randomUUID();
  const autosave = new Autosave({
    projectId,
    meta: () => ({ name: 'Bench', mode: 'paint' }),
    repo,
    codec: sharedWorkerPool(),
    source: {
      get rev() {
        return editor.document?.rev ?? 0;
      },
      get blocked() {
        return editor.isGestureActive || editor.busy;
      },
      serialize: () => editor.serialize(),
      captureLayers: (saved) => editor.captureLayers(saved),
      renderThumbnail: (side) => editor.renderThumbnail(side),
      view: () => editor.view,
    },
    onStatus: () => undefined,
  });
  try {
    await db.get();
    let t = performance.now();
    const full = await watchMainThread(() => autosave.saveNow());
    const saveFullMs = performance.now() - t;
    if (!full.value) throw new Error('Lượt lưu đầu thất bại');
    // Một nét ngắn trên layer đang hoạt động rồi lưu (chỉ layer đó được mã hóa lại).
    editor.tools.setActive('brush');
    editor.dispatchPointer('down', { x: 100, y: 100 });
    editor.dispatchPointer('move', { x: 300, y: 160 });
    editor.dispatchPointer('up', { x: 300, y: 160 });
    t = performance.now();
    const inc = await watchMainThread(() => autosave.saveNow());
    const saveIncMs = performance.now() - t;

    t = performance.now();
    const loaded = await repo.loadProject(projectId);
    const tLoad = performance.now();
    const { images } = await decodeLayerImages(loaded, sharedWorkerPool());
    const tDecode = performance.now();
    const reopened = new Editor({
      memory: TIER_BUDGETS.desktop,
      platform: detectPlatformFeatures(),
      workers: sharedWorkerPool(),
    });
    reopened.createDocument(documentSpecFromRecord(loaded.document, images));
    const tCreate = performance.now();
    reopened.readPixels({ x: 0, y: 0, width: 1, height: 1 });
    const openMs = performance.now() - t;
    // Chi tiết từng bước (GĐ9: khoanh vùng khi mở project chậm).
    console.info(
      `[bench] mở project: đọc DB ${(tLoad - t).toFixed(0)} ms, giải mã ${(tDecode - tLoad).toFixed(0)} ms, dựng document ${(tCreate - tDecode).toFixed(0)} ms, khung đầu ${(performance.now() - tCreate).toFixed(0)} ms`,
    );
    reopened.dispose();
    return {
      saveFullMs: Math.round(saveFullMs),
      saveIncMs: Math.round(saveIncMs),
      saveFrameMax: Math.max(full.frameMax, inc.frameMax),
      saveLongTaskMax: Math.max(full.longTaskMax, inc.longTaskMax),
      openMs: Math.round(openMs),
    };
  } finally {
    autosave.dispose();
    await db.destroy();
  }
}

/**
 * Layer của kịch bản: 5 layer đầu phủ kín; layer thêm (kịch bản 10, 20 layer) phủ 1/3 × 1/3 ảnh ở
 * vị trí khác nhau — như ảnh nhiều layer thật, và để L còn chỗ trong ngân sách layer (60% của
 * 1,5 GB). Người gọi đóng `bitmaps` sau khi tạo document.
 */
async function benchLayers(
  width: number,
  height: number,
  layerCount: number,
): Promise<{ layers: DocumentLayerSpec[]; bitmaps: ImageBitmap[] }> {
  const layers: DocumentLayerSpec[] = [];
  const bitmaps: ImageBitmap[] = [];
  for (let i = 0; i < layerCount; i++) {
    const full = i < 5;
    const w = full ? width : Math.round(width / 3);
    const h = full ? height : Math.round(height / 3);
    const image = await contentImage(w, h, i + 1);
    bitmaps.push(image);
    layers.push({
      kind: 'raster',
      name: `Layer ${String(i + 1)}`,
      image,
      origin: full
        ? undefined
        : { x: (((i * 37) % 60) / 100) * width, y: (((i * 53) % 60) / 100) * height },
      opacity: i === 0 ? 1 : 0.8,
    });
  }
  return { layers, bitmaps };
}

export interface DocOpResult {
  op: string;
  ok: boolean;
  /** Từ lúc bấm tới khi ảnh mới hiện ra, ms. */
  ms: number;
  /** Khung dài nhất / long task dài nhất trên main thread trong lúc xử lý (UI có bị treo không). */
  frameMax: number;
  longTaskMax: number;
  /**
   * Lần vẽ lại đầu tiên sau khi document đổi (mọi layer mới: cache, mipmap dựng lại): thời gian
   * CPU của frame và khoảng tới frame kế (gồm phần GPU), ms.
   */
  repaintMs: number;
  repaintGap: number;
  size: string;
  notices: string;
}

/**
 * GĐ5 — biến đổi ảnh trên kịch bản L (nghiệm thu: crop/resize hoàn thành mà UI không bị treo):
 * cắt xén 80%, Resize 50%, xoay 90°, Canvas size +10%, mỗi thao tác rồi undo.
 */
async function runDocOps(
  width: number,
  height: number,
  layerCount: number,
): Promise<DocOpResult[]> {
  const host = document.getElementById('host');
  if (!host) throw new Error('no host');
  const editor = new Editor({
    memory: TIER_BUDGETS.desktop,
    platform: detectPlatformFeatures(),
    workers: sharedWorkerPool(),
  });
  const { layers, bitmaps } = await benchLayers(width, height, layerCount);
  const ok = editor.createDocument({
    width,
    height,
    background: { kind: 'color', color: '#FFFFFFFF' },
    layers,
  });
  for (const b of bitmaps) b.close();
  if (!ok) throw new Error('Không tạo được document');
  const notices: string[] = [];
  editor.on('notice', ({ code }) => notices.push(code));
  editor.mount(host);
  await nextFrame();
  editor.viewport.fit();
  await sleep(1000);
  await waitWarm(editor);

  // ?trace: ghi khung hình dài và createImageBitmap (nén history, Trim) để khoanh điểm nghẽn.
  const trace: string[] = [];
  (window as unknown as { __trace: string[] }).__trace = trace;
  if (new URLSearchParams(location.search).has('trace')) {
    const t0 = performance.now();
    const stamp = () => String(Math.round(performance.now() - t0));
    const cib = window.createImageBitmap.bind(window) as unknown as (
      ...args: unknown[]
    ) => Promise<ImageBitmap>;
    window.createImageBitmap = async (...args: unknown[]) => {
      const t = performance.now();
      const out = await cib(...args);
      trace.push(
        `${stamp()} createImageBitmap ${String(out.width)}×${String(out.height)}: ${String(Math.round(performance.now() - t))} ms`,
      );
      return out;
    };
    const gapsLoop = (() => {
      let last = performance.now();
      const loop = (t: number) => {
        if (t - last > 50) trace.push(`${stamp()} frame gap ${String(Math.round(t - last))} ms`);
        last = t;
        requestAnimationFrame(loop);
      };
      return loop;
    })();
    requestAnimationFrame(gapsLoop);
  }

  const results: DocOpResult[] = [];
  const run = async (op: string, task: () => Promise<boolean> | boolean) => {
    trace.push(`— ${op}`);
    notices.length = 0;
    // Khung hình và long task trong lúc xử lý (tới khi command vào history) tách riêng với lần vẽ
    // lại đầu tiên sau đó.
    const frames: { t: number; gap: number }[] = [];
    let last = await nextFrame();
    let running = true;
    const loop = (now: number) => {
      frames.push({ t: now, gap: now - last });
      last = now;
      if (running) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    const longTasks: { start: number; duration: number }[] = [];
    const supported = PerformanceObserver.supportedEntryTypes.includes('longtask');
    const observer = supported
      ? new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            longTasks.push({ start: e.startTime, duration: e.duration });
          }
        })
      : null;
    observer?.observe({ type: 'longtask' });
    const t = performance.now();
    const ok = await task();
    const done = performance.now();
    editor.flush();
    const repaintMs = performance.now() - done;
    await nextFrame();
    await nextFrame();
    running = false;
    observer?.disconnect();
    const gapsUntil = frames.filter((f) => f.t <= done).map((f) => f.gap);
    const gapsAfter = frames.filter((f) => f.t > done).map((f) => f.gap);
    const doc = editor.document;
    results.push({
      op,
      ok,
      ms: Math.round(done - t),
      frameMax: Math.round(Math.max(0, ...gapsUntil)),
      longTaskMax: supported
        ? Math.round(Math.max(0, ...longTasks.filter((l) => l.start < done).map((l) => l.duration)))
        : -1,
      repaintMs: Math.round(repaintMs),
      repaintGap: Math.round(Math.max(0, ...gapsAfter)),
      size: doc ? `${String(doc.width)}×${String(doc.height)}` : '-',
      notices: [...new Set(notices)].join(','),
    });
    await sleep(300);
  };
  const crop = {
    x: Math.round(width * 0.1),
    y: Math.round(height * 0.1),
    width: Math.round(width * 0.8),
    height: Math.round(height * 0.8),
  };
  await run('crop 80%', () => editor.image.crop(crop));
  await run('undo crop', () => editor.undo());
  await run('resize 50%', () =>
    editor.image.resize(Math.round(width / 2), Math.round(height / 2), 'smooth'),
  );
  await run('undo resize', () => editor.undo());
  await run('rotate 90°', () => editor.image.rotate(90));
  await run('undo rotate', () => editor.undo());
  await run('canvas +10%', () =>
    editor.image.canvasSize(Math.round(width * 1.1), Math.round(height * 1.1), 'center'),
  );
  await run('undo canvas', () => editor.undo());
  editor.dispose();
  host.replaceChildren();
  return results;
}

export interface FilterBenchResult {
  filter: string;
  zoom: string;
  /** Số lần đổi tham số khi kéo slider (60 lần/giây) và số bản xem trước đã hiện. */
  updates: number;
  previews: number;
  /** Đổi tham số → frame có bản xem trước được vẽ, ms (mục 11.2: ≤ 100 bắt buộc, ≤ 50 mục tiêu). */
  latencyP50: number;
  latencyP95: number;
  latencyMax: number;
  /** Thả slider rồi đổi một lần: tới khi hiện, ms. */
  settleMs: number;
  /** Số lần dựng lại bản đầy đủ sau bản nháp (khi thả slider). */
  refines: number;
  /** Khung dài nhất khi kéo slider, ms. */
  dragFrameMax: number;
  /** Áp dụng full-res: thời gian, khung dài nhất, long task dài nhất, ms. */
  applyMs: number;
  applyFrameMax: number;
  applyLongTaskMax: number;
  undoMs: number;
  notices: string;
}

/** Pipeline và tham số thay đổi khi "kéo slider" (giá trị theo tiến trình 0..1). */
const FILTER_DRAGS: [string, (t: number) => FilterStep[]][] = [
  [
    'brightness+contrast',
    (t) => [
      { id: 'brightness', amount: Math.round(-40 + 80 * t) },
      { id: 'contrast', amount: 20 },
    ],
  ],
  [
    'hue+saturation',
    (t) => [
      { id: 'hue', degrees: Math.round(-150 + 300 * t) },
      { id: 'saturation', amount: 30 },
    ],
  ],
  ['sepia', (t) => [{ id: 'sepia', amount: Math.round(20 + 80 * t) }]],
  ['grayscale', () => [{ id: 'grayscale' }]],
  ['blur', (t) => [{ id: 'blur', radius: Math.round(2 + 38 * t) }]],
  ['sharpen', (t) => [{ id: 'sharpen', amount: Math.round(50 + 250 * t), radius: 2 }]],
  ['pixelate', (t) => [{ id: 'pixelate', size: Math.round(4 + 60 * t) }]],
];

/**
 * GĐ6 — xem trước filter khi kéo slider trên kịch bản M (nghiệm thu: ngưỡng xem trước của mục
 * 11.2 — ≤ 100 ms mỗi lần cập nhật). Mỗi pipeline: kéo 1,5 s (đổi tham số mỗi frame), ở mức zoom
 * vừa khung và 100%; rồi áp dụng full-res và undo.
 */
async function runFilters(
  width: number,
  height: number,
  layerCount: number,
): Promise<FilterBenchResult[]> {
  const host = document.getElementById('host');
  if (!host) throw new Error('no host');
  const editor = new Editor({
    memory: TIER_BUDGETS.desktop,
    platform: detectPlatformFeatures(),
    workers: sharedWorkerPool(),
  });
  const { layers, bitmaps } = await benchLayers(width, height, layerCount);
  const ok = editor.createDocument({
    width,
    height,
    background: { kind: 'color', color: '#FFFFFFFF' },
    layers,
  });
  for (const b of bitmaps) b.close();
  if (!ok) throw new Error('Không tạo được document');
  const notices: string[] = [];
  editor.on('notice', ({ code }) => notices.push(code));
  editor.mount(host);
  await nextFrame();
  editor.viewport.fit();
  await sleep(1000);
  await waitWarm(editor);
  const stats = editor.filters.previewStats;
  // ?trace: khoảng trống frame > 50 ms, getImageData chậm, long task — khoanh nguồn khựng.
  const trace: string[] = [];
  (window as unknown as { __trace: string[] }).__trace = trace;
  if (new URLSearchParams(location.search).has('trace')) {
    const t0 = performance.now();
    const stamp = () => String(Math.round(performance.now() - t0));
    for (const proto of [
      CanvasRenderingContext2D.prototype,
      OffscreenCanvasRenderingContext2D.prototype,
    ] as { getImageData: (...args: number[]) => ImageData }[]) {
      const original = proto.getImageData;
      proto.getImageData = function (this: unknown, ...args: number[]) {
        const t = performance.now();
        const out = original.apply(this, args);
        const ms = performance.now() - t;
        if (ms > 8)
          trace.push(
            `${stamp()} getImageData ${String(out.width)}×${String(out.height)}: ${String(Math.round(ms))} ms`,
          );
        return out;
      };
    }
    let last = performance.now();
    const loop = (t: number) => {
      if (t - last > 50) trace.push(`${stamp()} frame gap ${String(Math.round(t - last))} ms`);
      last = t;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          trace.push(
            `${String(Math.round(e.startTime - t0))} longtask ${String(Math.round(e.duration))} ms`,
          );
      }).observe({ type: 'longtask' });
    }
  }

  /** Chờ bản xem trước thứ `count` được vẽ lên màn hình; trả mốc frame đó. */
  const shown = async (count: number): Promise<number> => {
    const start = performance.now();
    while (stats.previews < count) {
      if (performance.now() - start > 10_000) throw new Error('Xem trước quá lâu');
      await nextFrame();
    }
    // Renderer vẽ ở frame kế tiếp sau khi kết quả sẵn sàng.
    await nextFrame();
    return performance.now();
  };

  const results: FilterBenchResult[] = [];
  // ?only=blur,sharpen — chỉ đo các pipeline này; ?repeat=3 — đo lặp để tách hiệu ứng khởi động.
  const params = new URLSearchParams(location.search);
  const only = params.get('only')?.split(',');
  const repeat = Number(params.get('repeat') ?? '1');
  const drags = FILTER_DRAGS.filter(([name]) => !only || only.some((o) => name.startsWith(o)));
  const plan = Array.from({ length: Math.max(1, repeat) }, () => drags).flat();
  for (const zoom of ['fit', '100%'] as const) {
    if (zoom === 'fit') editor.viewport.fit();
    else editor.viewport.zoomTo(1, { x: editor.viewport.width / 2, y: editor.viewport.height / 2 });
    await sleep(500);
    await waitWarm(editor);
    for (const [name, steps] of plan) {
      notices.length = 0;
      console.info(`[bench] ${name} @ ${zoom}`);
      trace.push(`— ${name} @ ${zoom}`);
      if (!editor.filters.begin(steps(0))) throw new Error(`Không mở được ${name}`);
      await shown(stats.previews + 1);
      await sleep(200);

      trace.push(`— ${name}: kéo slider`);
      // Kéo slider: đổi tham số mỗi frame trong 1,5 s. Độ trễ = từ lúc đổi tham số tới cuối frame
      // đầu tiên vẽ bản xem trước của nó (renderer báo qua onFrame).
      const latencies: number[] = [];
      const gaps: number[] = [];
      let measured = stats.shownAt;
      editor.onFrame((frame) => {
        if (!frame.painted || stats.shownAt === measured) return;
        measured = stats.shownAt;
        latencies.push(performance.now() - stats.requestedAt);
      });
      let updates = 0;
      const startPreviews = stats.previews;
      const startRefines = stats.refines;
      const t0 = await nextFrame();
      let last = t0;
      for (;;) {
        const now = await nextFrame();
        gaps.push(now - last);
        last = now;
        if (now - t0 > 1500) break;
        editor.filters.update(steps((now - t0) / 1500));
        updates++;
      }
      await shown(stats.previews + 1).catch(() => 0);
      editor.onFrame(null);
      await sleep(300);
      // Thả slider, đổi một lần: tới khi hiện.
      const before = stats.previews;
      const ts = performance.now();
      editor.filters.update(steps(0.37));
      const settleMs = (await shown(before + 1)) - ts;

      console.info(`[bench] ${name}: áp dụng`);
      trace.push(`— ${name}: áp dụng`);
      // Áp dụng full-res.
      const frames: number[] = [];
      let running = true;
      let prev = await nextFrame();
      const loop = (n: number) => {
        frames.push(n - prev);
        prev = n;
        if (running) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      const longTasks: number[] = [];
      const supported = PerformanceObserver.supportedEntryTypes.includes('longtask');
      const observer = supported
        ? new PerformanceObserver((list) => {
            for (const e of list.getEntries()) longTasks.push(e.duration);
          })
        : null;
      observer?.observe({ type: 'longtask' });
      const ta = performance.now();
      const applied = await editor.filters.apply();
      const applyMs = performance.now() - ta;
      await nextFrame();
      running = false;
      observer?.disconnect();
      await sleep(300);
      const tu = performance.now();
      if (applied) editor.undo();
      editor.flush();
      const undoMs = performance.now() - tu;
      await sleep(500);

      results.push({
        filter: name,
        zoom,
        updates,
        previews: stats.previews - startPreviews,
        latencyP50: percentile(latencies, 50),
        latencyP95: percentile(latencies, 95),
        latencyMax: Math.round(Math.max(0, ...latencies)),
        settleMs: Math.round(settleMs),
        refines: stats.refines - startRefines,
        dragFrameMax: Math.round(Math.max(0, ...gaps)),
        applyMs: applied ? Math.round(applyMs) : -1,
        applyFrameMax: Math.round(Math.max(0, ...frames)),
        applyLongTaskMax: supported ? Math.round(Math.max(0, ...longTasks)) : -1,
        undoMs: Math.round(undoMs),
        notices: [...new Set(notices)].join(','),
      });
    }
  }
  editor.dispose();
  host.replaceChildren();
  return results;
}

async function runScenario(
  name: string,
  width: number,
  height: number,
  layerCount: number,
): Promise<ScenarioResult> {
  const host = document.getElementById('host');
  if (!host) throw new Error('no host');
  const editor = new Editor({
    memory: TIER_BUDGETS.desktop,
    platform: detectPlatformFeatures(),
    workers: sharedWorkerPool(),
  });

  const params = new URLSearchParams(location.search);
  const quick = params.has('quick');
  const { layers, bitmaps } = await benchLayers(width, height, layerCount);
  if (name.startsWith('S')) layers.push({ kind: 'vector', name: 'Chú thích' });
  // Vẽ trên layer trên cùng có pixel (layer vector của S nằm trên — chọn layer raster).
  const ok = editor.createDocument({
    width,
    height,
    background: { kind: 'color', color: '#FFFFFFFF' },
    layers,
  });
  for (const b of bitmaps) b.close();
  if (!ok) throw new Error(`Không tạo được document ${name}`);
  if (name.startsWith('S') && !new URLSearchParams(location.search).has('noobjects')) {
    addAnnotations(editor, width, height);
  }
  const doc = editor.document;
  const rasters = doc?.layers.filter((l) => l.kind === 'raster') ?? [];
  const activeMode = params.get('active') === 'middle' ? 'middle' : 'top';
  const raster = activeMode === 'middle' ? rasters[Math.floor(rasters.length / 2)] : rasters.at(-1);
  if (doc && raster) doc.activeLayerId = raster.id;
  const caches = params.get('cache') !== '0';
  const mipmaps = params.get('mip') !== '0';
  editor.setRenderCacheOptions({ caches, mipmaps });

  const noticeCodes: string[] = [];
  editor.on('notice', ({ code }) => noticeCodes.push(code));
  editor.mount(host);
  await nextFrame();
  editor.viewport.fit();
  // Người dùng mở ảnh rồi mới bắt đầu vẽ: chờ trình duyệt tải texture layer lên GPU lần đầu
  // (chi phí đó thuộc chỉ số "Mở project", đo riêng ở GĐ3).
  await sleep(Number(new URLSearchParams(location.search).get('warmup') ?? 1000));
  await waitWarm(editor);
  await nextFrame();
  const overlay = host.querySelectorAll('canvas')[1] as HTMLElement;

  // Nét cứng (lineTo) rồi nét mềm (stamp) — 5 giây mỗi loại (mục 11.2: "nét vẽ 5 giây").
  editor.tools.setActive('brush');
  editor.options.set('brush', { preset: 'round', size: 24, opacity: 0.9 });
  const hard = await strokeFor(editor, overlay, 5000, 0);
  editor.options.set('brush', { preset: 'soft', size: 60, opacity: 0.7, flow: 0.6 });
  const soft = await strokeFor(editor, overlay, 5000, 1.3);

  // Undo/redo một nét: gồm cả vẽ lại khung hình.
  let t = performance.now();
  editor.undo();
  const undoSwapMs = performance.now() - t;
  editor.flush();
  const undoMs = performance.now() - t;
  t = performance.now();
  editor.redo();
  editor.flush();
  const redoMs = performance.now() - t;
  const undoTiles = Math.round(editor.memory.usedBy('history') / (256 * 256 * 4));

  await waitWarm(editor);
  const pan = await panFor(editor, 2000);
  const pan25 = await panZoomedFor(editor, 2000);
  const cacheMB = Math.round(editor.memory.usedBy('cache') / 1024 ** 2);
  // Đổi layer hoạt động: frame kế tiếp (cache phải dựng lại — vẽ trực tiếp, dựng dần lúc rảnh) và
  // thời gian tới khi cache dựng xong.
  let switchMs = 0;
  let switchWarmMs = 0;
  for (const target of [rasters[0], raster, rasters.at(-1), raster]) {
    if (!target) continue;
    editor.layers.setActive(target.id);
    const s0 = performance.now();
    editor.flush();
    switchMs = Math.max(switchMs, performance.now() - s0);
    switchWarmMs = Math.max(switchWarmMs, await waitWarm(editor));
  }
  const layerMB = Math.round(editor.memory.usedBy('layer') / 1024 ** 2);
  const fill = quick ? { ms: -1, frameMax: -1 } : await measureBucket(editor, width, height);
  const save = quick
    ? { saveFullMs: -1, saveIncMs: -1, saveFrameMax: -1, saveLongTaskMax: -1, openMs: -1 }
    : await measureSave(editor);

  // Diễn biến nét đầu (khung dài nhất / số khung mỗi 500 ms) — phát hiện giai đoạn "khởi động".
  const first = hard.frames;
  const timeline: string[] = [];
  let acc = 0;
  let bucket: number[] = [];
  for (const f of first) {
    acc += f;
    bucket.push(f);
    if (acc >= 500) {
      timeline.push(`${String(Math.round(Math.max(...bucket)))}/${String(bucket.length)}`);
      acc = 0;
      bucket = [];
    }
  }
  (globalThis as { __timeline?: string }).__timeline = timeline.join(' ');
  const frames = [...hard.frames, ...soft.frames];
  const usage = editor.memory.usage();
  const result: ScenarioResult = {
    scenario: name,
    document: `${String(width)}×${String(height)}`,
    layers: layerCount + (name.startsWith('S') ? 1 : 0),
    frameP50: percentile(frames, 50),
    frameP95: percentile(frames, 95),
    frameMax: Math.round(Math.max(0, ...frames) * 100) / 100,
    renderP95: percentile([...hard.renders, ...soft.renders], 95),
    latencyP50: percentile([...hard.latencies, ...soft.latencies], 50),
    latencyP95: percentile([...hard.latencies, ...soft.latencies], 95),
    panP95: percentile(pan, 95),
    undoMs: Math.round(undoMs * 100) / 100,
    redoMs: Math.round(redoMs * 100) / 100,
    moveMaxMs: Math.round(Math.max(hard.moveMax, soft.moveMax) * 10) / 10,
    commitMs: Math.round(Math.max(hard.upMs, soft.upMs) * 10) / 10,
    hardP95: percentile(hard.frames, 95),
    softP95: percentile(soft.frames, 95),
    undoSwapMs: Math.round(undoSwapMs * 100) / 100,
    undoTiles,
    memoryMB: Math.round(usage.usedBytes / 1024 ** 2),
    liveCanvases: usage.liveSurfaces,
    strokes: editor.historySummary().steps,
    objects: doc?.layers.reduce((n, l) => n + (l.kind === 'vector' ? l.objects.length : 0), 0) ?? 0,
    bucketMs: fill.ms,
    bucketFrameMax: fill.frameMax,
    timeline: timeline.join(' '),
    ...save,
    pan25P95: percentile(pan25.frames, 95),
    pan25Mip: pan25.mip,
    caches,
    mipmaps,
    active: activeMode,
    cacheMB,
    layerMB,
    notices: [...new Set(noticeCodes)].join(','),
    switchMs: Math.round(switchMs * 10) / 10,
    switchWarmMs,
  };
  editor.dispose();
  host.replaceChildren();
  return result;
}

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const filters = params.get('filters')?.split('x').map(Number);
  if (filters) {
    const results = await runFilters(filters[0] ?? 3840, filters[1] ?? 2160, filters[2] ?? 5);
    (window as unknown as { __benchResults: FilterBenchResult[] }).__benchResults = results;
    return;
  }
  const docops = params.get('docops')?.split('x').map(Number);
  if (docops) {
    const results = await runDocOps(docops[0] ?? 6000, docops[1] ?? 4000, docops[2] ?? 10);
    (window as unknown as { __benchResults: DocOpResult[] }).__benchResults = results;
    return;
  }
  const only = params.get('scenario');
  // ?custom=3840x2160x3 — kịch bản tùy chỉnh để khoanh vùng điểm nghẽn.
  const custom = params.get('custom')?.split('x').map(Number);
  const scenarios: [string, number, number, number][] = custom
    ? [[`C — ${params.get('custom') ?? ''}`, custom[0] ?? 1920, custom[1] ?? 1080, custom[2] ?? 1]]
    : [
        ['S — screenshot', 1920, 1080, 1],
        ['M — ảnh thường', 3840, 2160, 5],
      ];
  const results: ScenarioResult[] = [];
  const log = document.getElementById('log');
  for (const [name, w, h, layers] of scenarios) {
    if (only && !name.startsWith(only)) continue;
    if (log) log.textContent += `Đang chạy ${name}…\n`;
    results.push(await runScenario(name, w, h, layers));
  }
  if (log) log.textContent += JSON.stringify(results, null, 2);
  (window as unknown as { __benchResults: ScenarioResult[] }).__benchResults = results;
}

void main().catch((error: unknown) => {
  (window as unknown as { __benchError: string }).__benchError = String(error);
});
