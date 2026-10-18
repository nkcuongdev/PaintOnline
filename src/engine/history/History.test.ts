import { describe, expect, it, vi } from 'vitest';
import type { Document } from '../core/Document';
import { MemoryBudget } from '../memory/MemoryBudget';
import { History } from './History';
import type { Archivable, CompressedPixels } from './archive';
import { loadInflater } from './archive';
import type { Command } from './types';

function fakeDoc(): Document {
  const doc = {
    rev: 0,
    bumpRev(): number {
      doc.rev++;
      return doc.rev;
    },
  };
  return doc as unknown as Document;
}

function counterCommand(
  state: { value: number },
  delta: number,
  bytes = 0,
  dispose: () => void = vi.fn(),
  budget?: MemoryBudget,
): Command {
  // Như TileStore: dữ liệu command tự giữ chỗ trong hạng mục history và trả lại khi dispose.
  if (budget && bytes > 0) budget.setUsage('history', budget.usedBy('history') + bytes);
  return {
    label: `+${String(delta)}`,
    timestamp: 0,
    execute: () => {
      state.value += delta;
    },
    undo: () => {
      state.value -= delta;
    },
    memoryBytes: () => bytes,
    dispose: () => {
      if (budget && bytes > 0) budget.setUsage('history', budget.usedBy('history') - bytes);
      dispose();
    },
  };
}

function budget(total = 1_000_000): MemoryBudget {
  return new MemoryBudget({
    tier: 'desktop',
    totalBytes: total,
    maxDocumentSide: 100,
    maxDocumentPixels: 10000,
  });
}

describe('History', () => {
  it('execute / undo / redo và tăng rev mỗi lần', () => {
    const state = { value: 0 };
    const doc = fakeDoc();
    const history = new History(budget());
    history.execute(counterCommand(state, 2), doc);
    history.execute(counterCommand(state, 3), doc);
    expect(state.value).toBe(5);
    expect(history.undo(doc)).not.toBeNull();
    expect(state.value).toBe(2);
    expect(history.redo(doc)).not.toBeNull();
    expect(state.value).toBe(5);
    expect(doc.rev).toBe(4);
  });

  it('command mới xóa nhánh redo và dispose nó', () => {
    const state = { value: 0 };
    const doc = fakeDoc();
    const history = new History(budget());
    const dispose = vi.fn();
    history.execute(counterCommand(state, 1, 0, dispose), doc);
    history.undo(doc);
    history.execute(counterCommand(state, 10), doc);
    expect(history.canRedo).toBe(false);
    expect(dispose).toHaveBeenCalled();
    expect(state.value).toBe(10);
  });

  it('giữ tối đa 100 bước', () => {
    const state = { value: 0 };
    const doc = fakeDoc();
    const history = new History(budget());
    for (let i = 0; i < 130; i++) history.execute(counterCommand(state, 1), doc);
    expect(history.steps).toBe(100);
    expect(history.summary().trimmed).toBe(true);
  });

  it('vượt 25% ngân sách thì bỏ bước cũ nhưng giữ ≥ 10 bước', () => {
    const state = { value: 0 };
    const doc = fakeDoc();
    const b = budget(1000); // history tối đa 250 byte
    const history = new History(b);
    for (let i = 0; i < 20; i++) history.execute(counterCommand(state, 1, 100, vi.fn(), b), doc);
    expect(history.steps).toBe(10);
    expect(b.usedBy('history')).toBe(1000);
  });

  it('makeRoom bỏ bước cũ để có chỗ, vẫn giữ tối thiểu 10 bước', () => {
    const state = { value: 0 };
    const doc = fakeDoc();
    const b = budget(4000); // history tối đa 1000 byte
    const history = new History(b);
    for (let i = 0; i < 12; i++) history.execute(counterCommand(state, 1, 50, vi.fn(), b), doc);
    expect(b.usedBy('history')).toBe(600);
    expect(history.makeRoom(500)).toBe(true);
    expect(b.usedBy('history')).toBeLessThanOrEqual(500);
    expect(history.steps).toBe(10);
    expect(history.makeRoom(10_000)).toBe(false);
    expect(history.steps).toBe(10);
  });

  it('báo cáo nhãn undo/redo', () => {
    const state = { value: 0 };
    const doc = fakeDoc();
    const onChange = vi.fn();
    const history = new History(budget(), { onChange });
    history.execute(counterCommand(state, 7), doc);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ canUndo: true, undoLabel: '+7', canRedo: false }),
    );
  });

  it('goTo nhảy tới bước bất kỳ, giữ nhánh redo để quay lại', () => {
    const state = { value: 0 };
    const doc = fakeDoc();
    const history = new History(budget());
    for (const delta of [1, 10, 100, 1000]) history.execute(counterCommand(state, delta), doc);
    expect(history.summary().entries.map((e) => e.label)).toEqual(['+1', '+10', '+100', '+1000']);
    expect(history.goTo(1, doc)).toBe(3);
    expect(state.value).toBe(1);
    expect(history.summary()).toMatchObject({ position: 1, steps: 1, canRedo: true });
    // Nhánh redo vẫn hiện trong danh sách (mờ ở panel).
    expect(history.summary().entries).toHaveLength(4);
    expect(history.goTo(3, doc)).toBe(2);
    expect(state.value).toBe(111);
    expect(history.goTo(0, doc)).toBe(3);
    expect(state.value).toBe(0);
    expect(history.goTo(99, doc)).toBe(4);
    expect(state.value).toBe(1111);
  });

  it('goTo dừng ở bước gặp lỗi, phần đã đi vẫn giữ', () => {
    const state = { value: 0 };
    const doc = fakeDoc();
    const history = new History(budget());
    history.execute(counterCommand(state, 1), doc);
    const failing = counterCommand(state, 2);
    failing.undo = () => {
      throw new Error('hết bộ nhớ');
    };
    history.execute(failing, doc);
    history.execute(counterCommand(state, 4), doc);
    expect(() => history.goTo(0, doc)).toThrow('hết bộ nhớ');
    expect(state.value).toBe(3);
  });

  it('chuỗi thu hồi của MemoryBudget bỏ bước cũ nhất (bước 5), giữ ≥ 10 bước', () => {
    const state = { value: 0 };
    const doc = fakeDoc();
    const b = budget(4000); // layer tối đa 2400, history 1000
    const history = new History(b);
    for (let i = 0; i < 15; i++) history.execute(counterCommand(state, 1, 100, vi.fn(), b), doc);
    expect(history.steps).toBe(10);
    // Cấp phát layer cần chỗ trong tổng ngân sách: History nhả bước cũ.
    b.reserve(2000, 'layer');
    expect(() => {
      b.reserve(1500, 'temp');
    }).toThrow();
    expect(history.steps).toBe(10);
    b.release(2000, 'layer');
  });

  it('nén dữ liệu bước cũ hơn 10 bước lúc rảnh; bước gần đây giữ nguyên', async () => {
    const state = { value: 0 };
    const doc = fakeDoc();
    const history = new History(budget(), { rawSteps: 2 });
    const items: FakeArchive[] = [];
    for (let i = 0; i < 5; i++) {
      const command = counterCommand(state, 1);
      const item = new FakeArchive();
      items.push(item);
      command.archivables = (old) => (old ? [item] : []);
      history.execute(command, doc);
    }
    history.setCompressor((bitmap) => {
      bitmap.close();
      return Promise.resolve(new Uint8Array([1, 2, 3]));
    });
    // Mỗi lượt nén chạy lúc rảnh (Node: setTimeout 300 ms) — chờ đủ lâu khi máy đang bận.
    await vi.waitFor(
      () => {
        expect(items.filter((i) => i.archived)).toHaveLength(3);
      },
      { timeout: 10_000, interval: 50 },
    );
    expect(items.map((i) => i.archived)).toEqual([true, true, true, false, false]);
    history.dispose();
  });

  it('undo trong lúc nén: không giải phóng surface đã quay lại document; redo vẫn nén được', async () => {
    await loadInflater();
    vi.useFakeTimers();
    const history = new History(budget());
    try {
      const doc = fakeDoc();
      const item = new FakeArchive();
      const adopt = vi.spyOn(item, 'adopt');
      const command = counterCommand({ value: 0 }, 1);
      command.archivables = () => [item];
      let complete!: (bytes: Uint8Array) => void;
      const pending = new Promise<Uint8Array>((resolve) => {
        complete = resolve;
      });
      const compress = vi.fn((bitmap: ImageBitmap) => {
        bitmap.close();
        return pending;
      });
      history.setCompressor(compress);
      history.execute(command, doc);
      await vi.advanceTimersByTimeAsync(300);
      expect(compress).toHaveBeenCalledOnce();

      history.undo(doc);
      complete(new Uint8Array([1, 2, 3]));
      await vi.advanceTimersByTimeAsync(300);
      expect(adopt).not.toHaveBeenCalled();
      expect(item.archived).toBe(false);

      history.redo(doc);
      await vi.advanceTimersByTimeAsync(300);
      expect(item.archived).toBe(true);
    } finally {
      history.dispose();
      vi.useRealTimers();
    }
  });
});

class FakeArchive implements Archivable {
  archived = false;
  snapshot() {
    return {
      band: () => Promise.resolve({ close: () => undefined } as ImageBitmap),
      version: 1,
      width: 1,
      height: 1,
    };
  }
  adopt(compressed: CompressedPixels, version: number): boolean {
    if (version !== 1 || compressed.bands[0]?.data.length !== 3) return false;
    this.archived = true;
    return true;
  }
}
