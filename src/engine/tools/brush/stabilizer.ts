import type { Point } from '../../core/types';

/**
 * Bộ làm mượt "dây kéo" (lazy rope, mục 5.5): đầu cọ chỉ di chuyển khi con trỏ kéo căng sợi dây
 * dài `length` px, nên rung tay nhỏ hơn độ dài dây không đi vào nét. `length = 0` = tắt.
 */
export class LazyRope {
  readonly tip: Point;

  constructor(
    start: Readonly<Point>,
    private readonly length: number,
  ) {
    this.tip = { x: start.x, y: start.y };
  }

  /** Đưa con trỏ tới `p`; trả true nếu đầu cọ đã di chuyển (vị trí mới ở `tip`). */
  pull(p: Readonly<Point>): boolean {
    const dx = p.x - this.tip.x;
    const dy = p.y - this.tip.y;
    const d = Math.hypot(dx, dy);
    if (d <= this.length) return false;
    const k = (d - this.length) / d;
    this.tip.x += dx * k;
    this.tip.y += dy * k;
    return true;
  }
}
