import type { MemoryBudgetConfig, MemoryUsage, SurfaceCategory } from '../core/types';

/**
 * Ngân sách bộ nhớ trung tâm (mục 5.11). Mỗi surface tốn w × h × 4 byte; history báo cáo
 * dung lượng tile của nó. Ước lượng này là nguồn sự thật duy nhất về bộ nhớ.
 *
 * Khi thiếu chỗ cho một cấp phát mới, MemoryBudget chạy chuỗi thu hồi theo thứ tự cố định
 * (mipmap → Below/Above cache → cache layer vector → nén history → bỏ bước history cũ nhất) rồi mới
 * từ chối. Dữ liệu layer không bao giờ bị thu hồi.
 */

export class MemoryBudgetError extends Error {
  constructor(
    readonly category: SurfaceCategory,
    readonly requestedBytes: number,
    /** `share`: vượt phần dành cho hạng mục; `total`: vượt tổng ngân sách. */
    readonly reason: 'share' | 'total' = 'total',
  ) {
    super(`Vượt ngân sách bộ nhớ (${category}, ${String(requestedBytes)} byte)`);
    this.name = 'MemoryBudgetError';
  }
}

/** Tỉ lệ tối đa theo hạng mục (mục 5.11): layer 60%, history 25%, phần còn lại co giãn. */
export const CATEGORY_SHARE: Readonly<Record<SurfaceCategory, number>> = {
  layer: 0.6,
  history: 0.25,
  cache: 1,
  temp: 1,
  fixed: 1,
};

/** Ngân sách khởi điểm theo tier (mục 5.11) — chốt lại sau benchmark cuối GĐ1. */
export const TIER_BUDGETS: Readonly<Record<MemoryBudgetConfig['tier'], MemoryBudgetConfig>> = {
  desktop: {
    tier: 'desktop',
    totalBytes: 1.5 * 1024 ** 3,
    maxDocumentSide: 8192,
    maxDocumentPixels: 8192 * 8192,
  },
  'low-memory': {
    tier: 'low-memory',
    totalBytes: 768 * 1024 ** 2,
    maxDocumentSide: 6000,
    maxDocumentPixels: 6000 * 6000,
  },
  ios: {
    tier: 'ios',
    totalBytes: 320 * 1024 ** 2,
    maxDocumentSide: 4096,
    maxDocumentPixels: 4096 * 4096,
  },
};

/**
 * Các bước của chuỗi thu hồi (mục 5.11), theo đúng thứ tự chạy. Bước 3 (cache layer vector) không
 * có hiện thực: layer vector vẽ trực tiếp mỗi frame, không có cache (ADR 0020).
 */
export const RECLAIM_STAGES = [
  'mipmap',
  'cache',
  'vector-cache',
  'history-compress',
  'history-drop',
] as const;
export type ReclaimStage = (typeof RECLAIM_STAGES)[number];

/**
 * Hàm thu hồi của một bước: giải phóng bộ nhớ để cấp phát thêm được `bytes` byte cho hạng mục
 * `category`. Không cần trả về số đã giải phóng — MemoryBudget tự kiểm tra lại sau mỗi bước.
 */
export type Reclaimer = (bytes: number, category: SurfaceCategory) => void;

/**
 * Bước được phép chạy cho từng hạng mục: dựng cache chỉ được bỏ mipmap (không bao giờ xóa lịch sử
 * hay cache khác chỉ để dựng một cache); mọi cấp phát khác chạy cả chuỗi.
 */
function stagesFor(category: SurfaceCategory): readonly ReclaimStage[] {
  return category === 'cache' ? ['mipmap'] : RECLAIM_STAGES;
}

const CATEGORIES: readonly SurfaceCategory[] = ['fixed', 'layer', 'history', 'cache', 'temp'];

/** Giới hạn phần lịch sử chỉnh được trong Cài đặt. */
export const MIN_HISTORY_SHARE = 0.1;
export const MAX_HISTORY_SHARE = 0.4;

/** Mức dùng của hạng mục layer (so với phần 60% của nó) bắt đầu cảnh báo gợi ý merge/flatten. */
export const LAYER_WARNING_RATIO = 0.9;

export function surfaceBytes(width: number, height: number): number {
  return Math.max(0, Math.ceil(width)) * Math.max(0, Math.ceil(height)) * 4;
}

export class MemoryBudget {
  private readonly used: Record<SurfaceCategory, number> = {
    fixed: 0,
    layer: 0,
    history: 0,
    cache: 0,
    temp: 0,
  };
  private live = 0;
  private readonly listeners = new Set<(usage: MemoryUsage) => void>();
  private readonly reclaimers = new Map<ReclaimStage, Set<Reclaimer>>();
  private reclaiming = false;
  private refusal: MemoryBudgetError | null = null;
  /** Phần dành cho lịch sử hoàn tác (Cài đặt — mục 7.3); mặc định `CATEGORY_SHARE.history`. */
  private historyShare = CATEGORY_SHARE.history;

  constructor(readonly config: MemoryBudgetConfig) {}

  get totalBytes(): number {
    return this.config.totalBytes;
  }

  get usedBytes(): number {
    let sum = 0;
    for (const category of CATEGORIES) sum += this.used[category];
    return sum;
  }

  get liveSurfaces(): number {
    return this.live;
  }

  usedBy(category: SurfaceCategory): number {
    return this.used[category];
  }

  limitFor(category: SurfaceCategory): number {
    const share = category === 'history' ? this.historyShare : CATEGORY_SHARE[category];
    return this.config.totalBytes * share;
  }

  get historyShareRatio(): number {
    return this.historyShare;
  }

  /** Đổi phần dành cho lịch sử (giới hạn 10–40%); người gọi tự cắt bớt lịch sử nếu vượt. */
  setHistoryShare(share: number): void {
    this.historyShare = Math.min(MAX_HISTORY_SHARE, Math.max(MIN_HISTORY_SHARE, share));
    this.notify();
  }

  /** Còn chỗ cho `bytes` trong hạng mục và trong tổng ngân sách? (không chạy chuỗi thu hồi) */
  canReserve(bytes: number, category: SurfaceCategory): boolean {
    if (bytes <= 0) return true;
    return (
      this.used[category] + bytes <= this.limitFor(category) &&
      this.usedBytes + bytes <= this.config.totalBytes
    );
  }

  /**
   * Giữ chỗ; nếu thiếu thì chạy chuỗi thu hồi rồi thử lại. Vẫn thiếu → ném MemoryBudgetError:
   * thao tác bị từ chối thay vì để tab crash.
   */
  reserve(bytes: number, category: SurfaceCategory): void {
    if (!this.canReserve(bytes, category)) this.reclaim(bytes, category);
    if (!this.canReserve(bytes, category)) {
      const reason = this.used[category] + bytes > this.limitFor(category) ? 'share' : 'total';
      const error = new MemoryBudgetError(category, bytes, reason);
      this.refusal = error;
      throw error;
    }
    this.used[category] += bytes;
    this.notify();
  }

  release(bytes: number, category: SurfaceCategory): void {
    this.used[category] = Math.max(0, this.used[category] - bytes);
    this.notify();
  }

  /**
   * Chuyển `bytes` đã giữ từ hạng mục này sang hạng mục khác — tổng không đổi, không kiểm tra phần
   * của hạng mục đích (layer dựng tạm khi biến đổi ảnh vào document — ADR 0025).
   */
  transfer(bytes: number, from: SurfaceCategory, to: SurfaceCategory): void {
    if (bytes <= 0 || from === to) return;
    const moved = Math.min(bytes, this.used[from]);
    this.used[from] -= moved;
    this.used[to] += moved;
    this.notify();
  }

  /** Đặt thẳng mức dùng của hạng mục tự quản. */
  setUsage(category: SurfaceCategory, bytes: number): void {
    this.used[category] = Math.max(0, bytes);
    this.notify();
  }

  trackSurface(delta: 1 | -1): void {
    this.live = Math.max(0, this.live + delta);
  }

  /** Đăng ký hàm thu hồi cho một bước của chuỗi; trả hàm hủy đăng ký. */
  addReclaimer(stage: ReclaimStage, reclaimer: Reclaimer): () => void {
    let set = this.reclaimers.get(stage);
    if (!set) {
      set = new Set();
      this.reclaimers.set(stage, set);
    }
    set.add(reclaimer);
    return () => {
      this.reclaimers.get(stage)?.delete(reclaimer);
    };
  }

  /**
   * Chạy chuỗi thu hồi (mục 5.11) cho tới khi đủ chỗ cấp phát thêm `bytes` cho `category`.
   * `all = true`: chạy hết chuỗi (trình duyệt từ chối tạo canvas dù ước lượng còn chỗ). Trả về đã
   * đủ chỗ chưa. Không chạy lồng nhau.
   */
  reclaim(bytes: number, category: SurfaceCategory, all = false): boolean {
    if (this.reclaiming) return this.canReserve(bytes, category);
    this.reclaiming = true;
    try {
      for (const stage of all ? RECLAIM_STAGES : stagesFor(category)) {
        if (!all && this.canReserve(bytes, category)) break;
        const set = this.reclaimers.get(stage);
        if (!set) continue;
        for (const reclaimer of [...set]) {
          reclaimer(bytes, category);
          if (!all && this.canReserve(bytes, category)) break;
        }
      }
    } finally {
      this.reclaiming = false;
    }
    return this.canReserve(bytes, category);
  }

  /** Lần từ chối cấp phát gần nhất (để chọn thông báo phù hợp), đọc xong thì xóa. */
  takeRefusal(): MemoryBudgetError | null {
    const refusal = this.refusal;
    this.refusal = null;
    return refusal;
  }

  /** Tỉ lệ dùng của hạng mục layer so với phần dành cho nó (0..1). */
  get layerRatio(): number {
    const limit = this.limitFor('layer');
    return limit > 0 ? this.used.layer / limit : 0;
  }

  /** Kích thước document có nằm trong giới hạn của tier không (mục 5.11). */
  allowsDocument(width: number, height: number): boolean {
    const { maxDocumentSide, maxDocumentPixels } = this.config;
    return (
      Number.isInteger(width) &&
      Number.isInteger(height) &&
      width >= 1 &&
      height >= 1 &&
      width <= maxDocumentSide &&
      height <= maxDocumentSide &&
      width * height <= maxDocumentPixels
    );
  }

  usage(): MemoryUsage {
    return {
      usedBytes: this.usedBytes,
      totalBytes: this.config.totalBytes,
      byCategory: { ...this.used },
      liveSurfaces: this.live,
    };
  }

  subscribe(listener: (usage: MemoryUsage) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    if (this.listeners.size === 0) return;
    const usage = this.usage();
    for (const listener of this.listeners) listener(usage);
  }
}
