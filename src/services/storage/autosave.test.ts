import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentData, ID, LayerCapture } from '@/engine/core/types';
import type { ImageCodec } from '@/services/workers/codec';
import { Autosave, type AutosaveSource } from './autosave';
import {
  MissingLayerBlobError,
  StaleRevisionError,
  type ProjectRepository,
  type SaveRequest,
  type SaveResult,
} from './projectRepo';
import type { SaveStatus } from './saveStatus';

/**
 * Autosave (mục 6.6) với nguồn, repository và codec giả + đồng hồ giả: debounce 1,5 s / tối đa 10 s,
 * single-flight, savedRev chỉ đổi khi transaction xong, xử lý lỗi theo bảng ở 6.6.
 */

class FakeSource implements AutosaveSource {
  rev = 0;
  blocked = false;
  contentRev = 1;
  captureCalls: Map<ID, number>[] = [];

  serialize(): DocumentData {
    return {
      rev: this.rev,
      width: 100,
      height: 100,
      background: { kind: 'transparent' },
      activeLayerId: 'r1',
      palette: [],
      layers: [
        {
          id: 'r1',
          name: 'r1',
          kind: 'raster',
          visible: true,
          locked: false,
          alphaLocked: false,
          opacity: 1,
          blendMode: 'normal',
          contentRev: this.contentRev,
          bounds: { x: 0, y: 0, width: 10, height: 10 },
        },
      ],
    };
  }

  captureLayers(saved: ReadonlyMap<ID, number>): LayerCapture[] {
    this.captureCalls.push(new Map(saved));
    if (saved.get('r1') === this.contentRev) return [];
    return [
      {
        layerId: 'r1',
        contentRev: this.contentRev,
        bounds: { x: 0, y: 0, width: 10, height: 10 },
        bitmap: Promise.resolve(fakeBitmap()),
      },
    ];
  }

  renderThumbnail(): Promise<ImageBitmap> {
    return Promise.resolve(fakeBitmap());
  }

  view() {
    return { zoom: 1, panX: 0, panY: 0 };
  }

  change(): void {
    this.rev++;
    this.contentRev++;
  }
}

function fakeBitmap(): ImageBitmap {
  return { width: 10, height: 10, close: () => undefined };
}

function fakeCodec(overrides: Partial<ImageCodec> = {}): ImageCodec {
  return {
    encode: () => Promise.resolve(new Blob(['png'])),
    thumbnail: () => Promise.resolve(new Blob(['thumb'])),
    decode: () => Promise.reject(new Error('unused')),
    encodeLayer: () => Promise.resolve(new ArrayBuffer(8)),
    decodeLayer: () => Promise.reject(new Error('unused')),
    fillLayerRects: (png) => Promise.resolve(png),
    encodeWebp: () => Promise.reject(new Error('unused')),
    zip: () => Promise.reject(new Error('unused')),
    unzip: () => Promise.reject(new Error('unused')),
    palette: () => Promise.resolve([]),
    ...overrides,
  };
}

interface FakeRepo {
  saves: SaveRequest[];
  storedRev: number;
  generation: number;
  fail: ((request: SaveRequest) => Error | null) | null;
  checkpoints: number;
  checkpointWrites: number;
  closed: number;
  /** Giữ lượt ghi tới khi gọi resolve (lượt lưu chậm). */
  hold: boolean;
  release: () => void;
}

function fakeRepo(): { fake: FakeRepo; repo: ProjectRepository } {
  const fake: FakeRepo = {
    saves: [],
    storedRev: -1,
    generation: 1,
    fail: null,
    checkpoints: 1,
    checkpointWrites: 0,
    closed: 0,
    hold: false,
    release: () => undefined,
  };
  const repo = {
    db: {
      get generation() {
        return fake.generation;
      },
      close: () => {
        fake.closed++;
        fake.generation++;
        return Promise.resolve();
      },
    },
    async saveSnapshot(request: SaveRequest): Promise<SaveResult> {
      fake.saves.push(request);
      if (fake.hold) {
        await new Promise<void>((resolve) => {
          fake.release = resolve;
        });
      }
      const error = fake.fail?.(request);
      if (error) throw error;
      if (request.document.rev < fake.storedRev) {
        throw new StaleRevisionError(fake.storedRev, request.document.rev);
      }
      fake.storedRev = request.document.rev;
      return { rev: request.document.rev, sizeBytes: 1, savedAt: Date.now() };
    },
    deleteCheckpoints() {
      const n = fake.checkpoints;
      fake.checkpoints = 0;
      return Promise.resolve(n);
    },
    writeCheckpoint() {
      fake.checkpointWrites++;
      return Promise.resolve(null);
    },
  } as unknown as ProjectRepository;
  return { fake, repo };
}

function quotaError(): DOMException {
  return new DOMException('quota', 'QuotaExceededError');
}

describe('Autosave (mục 6.6)', () => {
  let source: FakeSource;
  let fake: FakeRepo;
  let repo: ProjectRepository;
  let statuses: SaveStatus['kind'][];

  const make = (options: Partial<ConstructorParameters<typeof Autosave>[0]> = {}) =>
    new Autosave({
      projectId: 'p1',
      meta: () => ({ name: 'Test', mode: 'paint' }),
      repo,
      codec: fakeCodec(),
      source,
      onStatus: (s) => statuses.push(s.kind),
      timers: {
        setTimeout: (fn, ms) => window.setTimeout(fn, ms),
        clearTimeout: (id) => {
          window.clearTimeout(id);
        },
        now: () => Date.now(),
      },
      ...options,
    });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    source = new FakeSource();
    ({ fake, repo } = fakeRepo());
    statuses = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('debounce 1,5 s sau thay đổi cuối', async () => {
    const autosave = make({ saved: { rev: 0, layers: new Map([['r1', 1]]) } });
    source.change();
    autosave.notifyChange();
    await vi.advanceTimersByTimeAsync(1000);
    source.change();
    autosave.notifyChange();
    await vi.advanceTimersByTimeAsync(1400);
    expect(fake.saves).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(fake.saves).toHaveLength(1);
    expect(fake.saves[0].document.rev).toBe(2);
    expect(autosave.current.kind).toBe('saved');
  });

  it('tắt tự động lưu (Cài đặt): không lưu theo debounce, vẫn lưu khi saveNow; bật lại thì lưu', async () => {
    const autosave = make({ saved: { rev: 0, layers: new Map([['r1', 1]]) } });
    autosave.setAutomatic(false);
    source.change();
    autosave.notifyChange();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fake.saves).toHaveLength(0);
    expect(autosave.current.kind).toBe('dirty');
    // Ctrl+S, tab ẩn, rời project vẫn lưu.
    await autosave.saveNow();
    expect(fake.saves).toHaveLength(1);
    source.change();
    autosave.notifyChange();
    autosave.setAutomatic(true);
    await vi.advanceTimersByTimeAsync(1600);
    expect(fake.saves).toHaveLength(2);
  });

  it('thao tác liên tục: tối đa 10 s một lần', async () => {
    const autosave = make({ saved: { rev: 0, layers: new Map() } });
    for (let t = 0; t < 12_000; t += 500) {
      source.change();
      autosave.notifyChange();
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(fake.saves.length).toBeGreaterThanOrEqual(1);
    expect(fake.saves[0].document.rev).toBeLessThanOrEqual(21);
  });

  it('chỉ mã hóa layer có contentRev mới; savedRev đặt sau khi ghi xong', async () => {
    const autosave = make({ saved: { rev: 0, layers: new Map([['r1', 1]]) } });
    source.rev = 1; // đổi document nhưng không đổi pixel
    await autosave.saveNow();
    expect(fake.saves[0].layers).toHaveLength(0);
    source.change();
    fake.hold = true;
    const pending = autosave.saveNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(autosave.lastSavedRev).toBe(1);
    expect(autosave.current.kind).toBe('saving');
    fake.release();
    await pending;
    expect(autosave.lastSavedRev).toBe(2);
    expect(fake.saves[1].layers.map((l) => l.layerId)).toEqual(['r1']);
  });

  it('single-flight: thay đổi trong lúc lưu được gộp vào một lượt kế tiếp', async () => {
    const autosave = make({ saved: { rev: 0, layers: new Map() } });
    source.change();
    fake.hold = true;
    const first = autosave.saveNow();
    await vi.advanceTimersByTimeAsync(0);
    source.change();
    void autosave.saveNow();
    source.change();
    void autosave.saveNow();
    expect(fake.saves).toHaveLength(1);
    fake.hold = false;
    fake.release();
    await first;
    expect(fake.saves.map((s) => s.document.rev)).toEqual([1, 3]);
    expect(autosave.current.kind).toBe('saved');
  });

  it('không chụp giữa chừng nét vẽ: chờ thao tác kết thúc', async () => {
    const autosave = make({ saved: { rev: 0, layers: new Map() } });
    source.change();
    source.blocked = true;
    const pending = autosave.saveNow();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.saves).toHaveLength(0);
    source.blocked = false;
    await vi.advanceTimersByTimeAsync(200);
    await pending;
    expect(fake.saves).toHaveLength(1);
  });

  it('lỗi tạm thời: thử lại sau 2 s, 5 s, 15 s rồi báo "Lỗi lưu"', async () => {
    const autosave = make({ saved: { rev: 0, layers: new Map() } });
    fake.fail = () => new DOMException('aborted', 'AbortError');
    source.change();
    await autosave.saveNow();
    expect(fake.saves).toHaveLength(1);
    expect(autosave.current.kind).toBe('dirty');
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.saves).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fake.saves).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fake.saves).toHaveLength(4);
    expect(autosave.current).toEqual({ kind: 'error', reason: 'transient' });
    // Không tự thử nữa; người dùng bấm "Thử lại" thì lưu được.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.saves).toHaveLength(4);
    fake.fail = null;
    expect(await autosave.retry()).toBe(true);
    expect(autosave.current.kind).toBe('saved');
  });

  it('hết quota: xóa checkpoint, thử lại một lần, vẫn hết thì dừng ở "Hết dung lượng"', async () => {
    const autosave = make({ saved: { rev: 0, layers: new Map() } });
    fake.fail = () => quotaError();
    source.change();
    await autosave.saveNow();
    expect(fake.checkpoints).toBe(0);
    expect(fake.saves).toHaveLength(2);
    expect(autosave.current.kind).toBe('quota');
    // Dừng autosave: thay đổi mới không tự lưu.
    source.change();
    autosave.notifyChange();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fake.saves).toHaveLength(2);
    // Dung lượng được giải phóng → tự thử lại.
    fake.fail = null;
    autosave.resume();
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => {
      expect(autosave.current.kind).toBe('saved');
    });
    expect(autosave.lastSavedRev).toBe(2);
  });

  it('kết nối DB bị đóng: mở lại một lần và lưu lại toàn bộ layer', async () => {
    const autosave = make({ saved: { rev: 0, layers: new Map([['r1', 1]]) } });
    let first = true;
    fake.fail = () => {
      if (!first) return null;
      first = false;
      return new DOMException('closing', 'InvalidStateError');
    };
    source.rev = 1;
    await autosave.saveNow();
    expect(fake.closed).toBe(1);
    expect(fake.saves).toHaveLength(2);
    // Lượt sau coi mọi layer là bẩn dù contentRev không đổi.
    expect(fake.saves[1].layers.map((l) => l.layerId)).toEqual(['r1']);
    expect(autosave.current.kind).toBe('saved');
  });

  it('DB thiếu pixel của layer "đã lưu": lưu lại toàn bộ', async () => {
    const autosave = make({ saved: { rev: 0, layers: new Map([['r1', 1]]) } });
    let first = true;
    fake.fail = () => {
      if (!first) return null;
      first = false;
      return new MissingLayerBlobError('r1');
    };
    source.rev = 1;
    await autosave.saveNow();
    expect(fake.saves[1].layers).toHaveLength(1);
    expect(autosave.current.kind).toBe('saved');
  });

  it('mã hóa thất bại: mã hóa lại từng layer một, vẫn lỗi thì "Lỗi lưu"', async () => {
    let calls = 0;
    const autosave = make({
      saved: { rev: 0, layers: new Map() },
      codec: fakeCodec({
        encodeLayer: () => {
          calls++;
          return Promise.reject(new Error('out of memory'));
        },
      }),
    });
    source.change();
    await autosave.saveNow();
    expect(calls).toBe(2);
    expect(fake.saves).toHaveLength(0);
    expect(autosave.current).toEqual({ kind: 'error', reason: 'encode' });
  });

  it('revision cũ hơn bản trong DB bị từ chối (tab khác đã ghi)', async () => {
    fake.storedRev = 10;
    const autosave = make({ saved: { rev: 0, layers: new Map() } });
    source.change();
    await autosave.saveNow();
    expect(autosave.current).toEqual({ kind: 'error', reason: 'conflict' });
    expect(autosave.lastSavedRev).toBe(0);
  });

  it('project mới: lượt lưu đầu tạo metadata; checkpoint sau 15 phút và khi đóng', async () => {
    const autosave = make({ lastCheckpointAt: Date.now() });
    expect(autosave.current.kind).toBe('dirty');
    await autosave.saveNow();
    expect(fake.saves[0].create).toBe(true);
    expect(fake.checkpointWrites).toBe(0);
    vi.setSystemTime(Date.now() + 15 * 60 * 1000);
    source.change();
    await autosave.saveNow();
    expect(fake.saves[1].create).toBe(false);
    expect(fake.checkpointWrites).toBe(1);
    source.change();
    expect(await autosave.close()).toBe(true);
    expect(fake.saves.at(-1)!.durability).toBe('strict');
    expect(fake.checkpointWrites).toBe(2);
  });

  it('chỉ đọc: không lưu', async () => {
    const autosave = make({ saved: { rev: 0, layers: new Map() } });
    autosave.stop();
    source.change();
    autosave.notifyChange();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fake.saves).toHaveLength(0);
    expect(statuses.at(-1)).toBe('readonly');
  });
});
