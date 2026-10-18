import type { Rect, SpotlightObject } from '../../core/types';
import type { Ctx2D } from '../../memory/surfaces';
import { dragBox, insideBox, RESIZE_ONLY_HANDLES, translateRect } from './box';
import { aaPad } from './draw';
import { rectCenter } from './geometry';
import type { ObjectRenderer } from './types';

/**
 * Spotlight (mục 2, GĐ7): làm tối mọi thứ bên dưới, trừ vùng sáng (chữ nhật hoặc elip). Nhiều
 * Spotlight trong cùng layer gộp thành MỘT lớp làm tối có nhiều vùng sáng (độ tối lớn nhất) — vùng
 * sáng không bị Spotlight khác làm tối chồng lên. Đối tượng đứng sau trong layer (mũi tên, chữ vẽ
 * sau) và layer phía trên không bị làm tối.
 */

export const SPOTLIGHT_MIN_DIM = 0.2;
export const SPOTLIGHT_MAX_DIM = 0.9;

function traceHole(ctx: Ctx2D, spot: SpotlightObject): void {
  const r = spot.rect;
  if (spot.shape === 'ellipse') {
    const c = rectCenter(r);
    ctx.ellipse(c.x, c.y, r.width / 2, r.height / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.rect(r.x, r.y, r.width, r.height);
  }
}

/**
 * Vẽ lớp làm tối của một nhóm Spotlight: vùng tối = khung document trừ hợp các vùng sáng. Mỗi vùng
 * sáng thêm một lần clip evenodd (khung − vùng sáng); các clip giao nhau cho đúng phần bù của hợp.
 */
export function drawSpotlights(
  ctx: Ctx2D,
  spots: readonly SpotlightObject[],
  bounds: Readonly<Rect> | null,
): void {
  if (!bounds || spots.length === 0) return;
  const dim = Math.max(...spots.map((s) => Math.min(1, Math.max(0, s.dim) * s.opacity)));
  if (dim <= 0) return;
  ctx.save();
  for (const spot of spots) {
    ctx.beginPath();
    ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    traceHole(ctx, spot);
    ctx.clip('evenodd');
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(0, 0, 0, ${String(dim)})`;
  ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.restore();
}

export const spotlightRenderer: ObjectRenderer<SpotlightObject> = {
  draw(ctx, obj, env) {
    drawSpotlights(ctx, [obj], env.documentBounds?.() ?? null);
  },
  // Phần làm tối phủ cả document: vùng vẽ lại là cả khung (thiếu khung thì chỉ vùng sáng).
  bounds: (obj, env) => aaPad(env.documentBounds?.() ?? obj.rect, 0),
  hitTest: (obj, p, tolerance) => insideBox(p, obj.rect, 0, tolerance),
  frame: (obj) => ({ kind: 'box', rect: obj.rect, rotation: 0, handles: RESIZE_ONLY_HANDLES }),
  translate: (obj, dx, dy) => ({ ...obj, rect: translateRect(obj.rect, dx, dy) }),
  dragHandle(start, handle, p, mods) {
    const next = dragBox(start.rect, 0, handle, p, mods);
    return { ...start, rect: next.rect, rotation: 0 };
  },
};
