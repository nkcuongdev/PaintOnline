import { Editor } from '../core/Editor';
import type {
  DocumentBackground,
  MemoryBudgetConfig,
  PlatformFeatures,
  WorkerClient,
} from '../core/types';
import { TIER_BUDGETS } from '../memory/MemoryBudget';

/**
 * Tiện ích dùng chung cho test có canvas thật (browser mode) và benchmark.
 * Không phụ thuộc framework test.
 */

export const TEST_PLATFORM: PlatformFeatures = {
  isApple: false,
  offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
  coalescedEvents: false,
  predictedEvents: false,
};

/** Worker giả cho test không dùng tô loang. */
export const NO_WORKERS: WorkerClient = {
  floodFill: () => Promise.reject(new Error('Test này không có Worker')),
  buildMask: () => Promise.reject(new Error('Test này không có Worker')),
  alphaBounds: () => Promise.reject(new Error('Test này không có Worker')),
  applyFilter: () => Promise.reject(new Error('Test này không có Worker')),
};

export function createTestEditor(
  width: number,
  height: number,
  options: {
    background?: DocumentBackground;
    memory?: Partial<MemoryBudgetConfig>;
    workers?: WorkerClient;
  } = {},
): Editor {
  const editor = new Editor({
    memory: { ...TIER_BUDGETS.desktop, ...options.memory },
    platform: TEST_PLATFORM,
    workers: options.workers ?? NO_WORKERS,
    layerName: (kind, n) => `${kind === 'raster' ? 'Lớp' : 'Chú thích'} ${String(n)}`,
    layerCopyName: (name) => `${name} (bản sao)`,
    backgroundName: () => 'Nền',
  });
  editor.createDocument({
    width,
    height,
    background: options.background ?? { kind: 'transparent' },
    layers: [{ kind: 'raster', name: 'Lớp 1' }],
  });
  return editor;
}

/** PRNG có seed (mulberry32) — chuỗi nét vẽ ngẫu nhiên nhưng tái lập được. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Băm FNV-1a 32 bit của pixel — so sánh nhanh nhiều trạng thái mà không giữ cả ảnh. */
export function hashPixels(data: ImageData): string {
  let h = 0x811c9dc5;
  const px = data.data;
  for (const value of px) {
    h ^= value;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${String(data.width)}x${String(data.height)}:${h.toString(16)}`;
}

/** Số pixel khác nhau giữa hai ảnh cùng kích thước. */
export function diffPixels(a: ImageData, b: ImageData): number {
  if (a.width !== b.width || a.height !== b.height) return Number.POSITIVE_INFINITY;
  let diff = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      a.data[i] !== b.data[i] ||
      a.data[i + 1] !== b.data[i + 1] ||
      a.data[i + 2] !== b.data[i + 2] ||
      a.data[i + 3] !== b.data[i + 3]
    ) {
      diff++;
    }
  }
  return diff;
}

export function pixelAt(data: ImageData, x: number, y: number): [number, number, number, number] {
  const i = (Math.floor(y) * data.width + Math.floor(x)) * 4;
  return [data.data[i] ?? 0, data.data[i + 1] ?? 0, data.data[i + 2] ?? 0, data.data[i + 3] ?? 0];
}

/** Vẽ một nét qua các điểm (tọa độ document) bằng tool hiện tại; mỗi bước có 3 điểm coalesced. */
export function drawStroke(editor: Editor, points: readonly { x: number; y: number }[]): void {
  if (points.length === 0) return;
  const first = points[0];
  editor.dispatchPointer('down', { x: first.x, y: first.y });
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] ?? first;
    const b = points[i] ?? first;
    const coalesced = [1, 2, 3].map((k) => ({
      x: a.x + ((b.x - a.x) * k) / 3,
      y: a.y + ((b.y - a.y) * k) / 3,
      pressure: 0.5,
    }));
    editor.dispatchPointer('move', { x: b.x, y: b.y, points: coalesced });
  }
  const last = points.at(-1) ?? first;
  editor.dispatchPointer('up', { x: last.x, y: last.y });
}

/** Một nét ngẫu nhiên với tool/kích thước/màu/opacity ngẫu nhiên — dùng cho test 100 nét. */
export function randomStroke(
  editor: Editor,
  random: () => number,
  width: number,
  height: number,
): void {
  const tools = ['brush', 'brush', 'pencil', 'eraser'] as const;
  const tool = tools[Math.floor(random() * tools.length)] ?? 'brush';
  editor.tools.setActive(tool);
  if (tool === 'brush') {
    const soft = random() < 0.4;
    editor.options.set('brush', {
      preset: soft ? 'soft' : 'round',
      size: 1 + Math.round(random() * 60),
      opacity: Math.round((0.2 + random() * 0.8) * 100) / 100,
      flow: soft ? Math.round((0.3 + random() * 0.7) * 100) / 100 : 1,
    });
  } else if (tool === 'eraser') {
    editor.options.set('eraser', {
      size: 4 + Math.round(random() * 50),
      opacity: Math.round((0.3 + random() * 0.7) * 100) / 100,
      hardness: random() < 0.5 ? 1 : 0.4,
    });
  }
  const channel = () =>
    Math.floor(random() * 256)
      .toString(16)
      .padStart(2, '0');
  const alpha = random() < 0.3 ? channel() : 'ff';
  editor.colors.setPrimary(`#${channel()}${channel()}${channel()}${alpha}`);

  const n = 3 + Math.floor(random() * 15);
  let x = random() * width;
  let y = random() * height;
  const points = [{ x, y }];
  for (let i = 0; i < n; i++) {
    // Có lúc vượt ra ngoài khung document để kiểm tra phần bị cắt.
    x += (random() - 0.5) * width * 0.4;
    y += (random() - 0.5) * height * 0.4;
    points.push({ x, y });
  }
  drawStroke(editor, points);
}
