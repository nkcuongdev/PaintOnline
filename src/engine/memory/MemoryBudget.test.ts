import { describe, expect, it, vi } from 'vitest';
import { MemoryBudget, MemoryBudgetError, surfaceBytes, TIER_BUDGETS } from './MemoryBudget';

const config = {
  tier: 'desktop' as const,
  totalBytes: 1000,
  maxDocumentSide: 100,
  maxDocumentPixels: 6000,
};

describe('MemoryBudget', () => {
  it('surface tốn w × h × 4 byte', () => {
    expect(surfaceBytes(256, 256)).toBe(262144);
  });

  it('layer tối đa 60% ngân sách', () => {
    const budget = new MemoryBudget(config);
    budget.reserve(600, 'layer');
    expect(budget.canReserve(1, 'layer')).toBe(false);
    expect(() => {
      budget.reserve(1, 'layer');
    }).toThrow(MemoryBudgetError);
    expect(budget.canReserve(300, 'cache')).toBe(true);
  });

  it('không vượt tổng ngân sách', () => {
    const budget = new MemoryBudget(config);
    budget.reserve(900, 'temp');
    expect(budget.canReserve(200, 'temp')).toBe(false);
    budget.release(900, 'temp');
    expect(budget.usedBytes).toBe(0);
  });

  it('báo cho listener khi dùng thay đổi', () => {
    const budget = new MemoryBudget(config);
    const listener = vi.fn();
    budget.subscribe(listener);
    budget.setUsage('history', 100);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ usedBytes: 100 }));
  });

  it('giới hạn kích thước document theo tier', () => {
    const budget = new MemoryBudget(config);
    expect(budget.allowsDocument(100, 60)).toBe(true);
    expect(budget.allowsDocument(101, 10)).toBe(false);
    expect(budget.allowsDocument(100, 61)).toBe(false); // vượt số pixel
    expect(budget.allowsDocument(10.5, 10)).toBe(false);
  });

  it('ngân sách khởi điểm theo tier (mục 5.11)', () => {
    expect(TIER_BUDGETS.desktop.maxDocumentSide).toBe(8192);
    expect(TIER_BUDGETS['low-memory'].maxDocumentSide).toBe(6000);
    expect(TIER_BUDGETS.ios.maxDocumentPixels).toBe(4096 * 4096);
  });

  it('chuỗi thu hồi chạy đúng thứ tự, dừng khi đủ chỗ (mục 5.11)', () => {
    const budget = new MemoryBudget(config);
    const order: string[] = [];
    budget.reserve(300, 'cache'); // mipmap
    budget.reserve(300, 'cache'); // Below/Above cache
    budget.reserve(200, 'history');
    budget.addReclaimer('history-drop', () => {
      order.push('history-drop');
    });
    budget.addReclaimer('cache', () => {
      order.push('cache');
      budget.release(300, 'cache');
    });
    let mipmaps = 300;
    budget.addReclaimer('mipmap', () => {
      order.push('mipmap');
      budget.release(mipmaps, 'cache');
      mipmaps = 0;
    });
    budget.reserve(400, 'layer');
    expect(order).toEqual(['mipmap']);
    budget.reserve(200, 'layer');
    expect(order).toEqual(['mipmap', 'mipmap', 'cache']);
    expect(budget.usedBy('layer')).toBe(600);
  });

  it('dựng cache chỉ được thu hồi mipmap; không đủ thì từ chối và ghi lý do', () => {
    const budget = new MemoryBudget(config);
    const cache = vi.fn();
    const drop = vi.fn();
    budget.addReclaimer('cache', cache);
    budget.addReclaimer('history-drop', drop);
    budget.reserve(900, 'temp');
    expect(() => {
      budget.reserve(200, 'cache');
    }).toThrow(MemoryBudgetError);
    expect(cache).not.toHaveBeenCalled();
    expect(drop).not.toHaveBeenCalled();
    expect(budget.takeRefusal()).toMatchObject({ category: 'cache', reason: 'total' });
    expect(budget.takeRefusal()).toBeNull();
  });

  it('vượt phần 60% của layer: lý do "share" (gợi ý Merge/Flatten)', () => {
    const budget = new MemoryBudget(config);
    budget.reserve(550, 'layer');
    expect(() => {
      budget.reserve(100, 'layer');
    }).toThrow(MemoryBudgetError);
    expect(budget.takeRefusal()?.reason).toBe('share');
    expect(budget.layerRatio).toBeCloseTo(550 / 600);
  });

  it('reclaim(all) chạy cả chuỗi kể cả khi ước lượng còn chỗ', () => {
    const budget = new MemoryBudget(config);
    const stages: string[] = [];
    for (const stage of ['mipmap', 'cache', 'history-compress', 'history-drop'] as const) {
      budget.addReclaimer(stage, () => stages.push(stage));
    }
    budget.reclaim(10, 'layer', true);
    expect(stages).toEqual(['mipmap', 'cache', 'history-compress', 'history-drop']);
  });
});
