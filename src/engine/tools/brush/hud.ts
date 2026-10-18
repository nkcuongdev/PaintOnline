import type { Point } from '../../core/types';
import type { Ctx2D } from '../../memory/surfaces';

/**
 * HUD chỉnh nhanh cọ (mục 7.6): giữ Alt + kéo chuột phải — kéo ngang đổi kích thước, kéo dọc đổi
 * độ cứng — hoặc `[` `]` (`Shift+[` `Shift+]`), có vòng tròn xem trước ngay trên canvas.
 */

export type HudGroup = 'brush' | 'eraser';

export interface BrushHudState {
  group: HudGroup;
  /** Tâm vòng tròn (CSS px trong khung canvas). */
  origin: Point;
  startSize: number;
  startHardness: number;
  /** Đang kéo (Alt + chuột phải); false = hiện thoáng qua sau khi bấm `[` `]`. */
  dragging: boolean;
}

/** Kéo dọc bao nhiêu CSS px thì độ cứng đổi từ 0 tới 1. */
const HARDNESS_TRAVEL = 200;

/**
 * Giá trị mới khi kéo: bán kính trên màn hình đi theo con trỏ (kéo ngang `dx` px → đường kính đổi
 * `2·dx / zoom` px ảnh); kéo lên làm cọ cứng hơn.
 */
export function hudValues(
  state: Readonly<BrushHudState>,
  pointer: Readonly<Point>,
  zoom: number,
): { size: number; hardness: number } {
  const dx = pointer.x - state.origin.x;
  const dy = pointer.y - state.origin.y;
  return {
    size: Math.max(1, Math.round(state.startSize + (2 * dx) / Math.max(zoom, 1e-6))),
    hardness: Math.min(1, Math.max(0, state.startHardness - dy / HARDNESS_TRAVEL)),
  };
}

/** Vẽ vòng tròn cỡ cọ, vòng trong theo độ cứng và nhãn số (overlay, CSS px). */
export function drawBrushHud(
  ctx: Ctx2D,
  origin: Readonly<Point>,
  size: number,
  hardness: number,
  zoom: number,
): void {
  const radius = Math.max(1, (size * zoom) / 2);
  ctx.save();
  // Vòng ngoài hai nét (trắng + đen) để thấy trên mọi nền ảnh.
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgb(255 255 255 / 0.9)';
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgb(0 0 0 / 0.85)';
  ctx.stroke();
  // Vùng lõi cứng: bán kính × độ cứng (cọ mềm có lõi nhỏ).
  if (hardness < 1) {
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgb(59 91 219 / 0.9)';
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, Math.max(0.5, radius * hardness), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Nhãn: "24 px · 60%".
  const label = `${String(size)} px · ${String(Math.round(hardness * 100))}%`;
  ctx.font = '600 12px Inter Variable, Inter, system-ui, sans-serif';
  const width = ctx.measureText(label).width + 16;
  const x = origin.x - width / 2;
  const y = origin.y + radius + 8;
  ctx.fillStyle = 'rgb(20 20 24 / 0.85)';
  ctx.beginPath();
  ctx.roundRect(x, y, width, 22, 11);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(label, origin.x, y + 11);
  ctx.restore();
}
