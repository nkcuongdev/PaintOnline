import type { AnnotationObject, ID, Point } from '../../core/types';
import { rendererFor } from '../../layers/objects/registry';
import type { HandleId } from '../../layers/objects/types';
import type { DocPointerEvent, ToolContext } from '../types';

/** Thao tác kéo đang diễn ra trên đối tượng (di chuyển hoặc kéo handle). */
export interface ObjectDrag {
  move(e: DocPointerEvent): void;
  end(): void;
  cancel(): void;
  readonly cursor: string;
}

/** Kéo ít hơn ngưỡng này (CSS px) được coi là click — không tạo bước history. */
const DRAG_THRESHOLD = 3;

export const HANDLE_CURSORS: Readonly<Record<string, string>> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  rotate: 'grab',
  control: 'move',
};

/**
 * Bắt đầu sửa đối tượng tại sự kiện `e`, nếu có: kéo handle của đối tượng đang chọn, hoặc kéo
 * đối tượng (đang chọn, hoặc bất kỳ khi `selectOnHit`). Trả null nếu không trúng gì — tool tự xử lý
 * (tạo đối tượng mới, chọn bằng khung kéo…).
 */
export function beginObjectDrag(
  ctx: ToolContext,
  e: DocPointerEvent,
  options: { selectOnHit: boolean },
): ObjectDrag | null {
  const objects = ctx.objects;
  const handleHit = objects.hitHandle({ x: e.screenX, y: e.screenY });
  if (handleHit) return dragHandle(ctx, handleHit.hit.object, handleHit.handle);

  const hit = objects.hitTest(e);
  if (!hit) return null;
  const isSelected = objects.selection.includes(hit.object.id);
  if (!isSelected) {
    if (!options.selectOnHit) return null;
    objects.select(e.shiftKey ? [...objects.selection, hit.object.id] : [hit.object.id]);
  } else if (e.shiftKey && options.selectOnHit) {
    // Shift + click vào đối tượng đang chọn: bỏ chọn nó.
    objects.select(objects.selection.filter((id) => id !== hit.object.id));
    return IDLE_DRAG;
  }
  return dragMove(ctx, e);
}

/** "Kéo" không làm gì (click chỉ đổi vùng chọn). */
const IDLE_DRAG: ObjectDrag = {
  move() {
    // Không di chuyển.
  },
  end() {
    // Không ghi gì vào history.
  },
  cancel() {
    // Không có bản nháp để hủy.
  },
  cursor: 'default',
};

function dragMove(ctx: ToolContext, e: DocPointerEvent): ObjectDrag {
  const start: Point = { x: e.x, y: e.y };
  const startScreen = { x: e.screenX, y: e.screenY };
  const originals = ctx.objects.selectedHits().map((h) => h.object);
  let moved = false;
  let current = new Map<ID, AnnotationObject | null>();

  return {
    cursor: 'move',
    move(ev) {
      if (
        !moved &&
        Math.hypot(ev.screenX - startScreen.x, ev.screenY - startScreen.y) < DRAG_THRESHOLD
      ) {
        return;
      }
      moved = true;
      let dx = ev.x - start.x;
      let dy = ev.y - start.y;
      // Shift: chỉ di chuyển theo phương ngang hoặc dọc.
      if (ev.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      current = new Map();
      for (const o of originals) {
        const next = rendererFor(o)?.translate(o, dx, dy);
        if (next) current.set(o.id, next);
      }
      ctx.objects.setOverrides(current);
    },
    end() {
      ctx.objects.setOverrides(null);
      if (!moved) return;
      ctx.objects.replace(
        [...current.values()].filter((o): o is AnnotationObject => o !== null),
        'history.moveObject',
      );
    },
    cancel() {
      ctx.objects.setOverrides(null);
    },
  };
}

function dragHandle(ctx: ToolContext, original: AnnotationObject, handle: HandleId): ObjectDrag {
  const renderer = rendererFor(original);
  let next: AnnotationObject = original;
  return {
    cursor: HANDLE_CURSORS[handle] ?? (handle.startsWith('p') ? 'move' : 'default'),
    move(ev) {
      if (!renderer) return;
      next = renderer.dragHandle(original, handle, ev, { shift: ev.shiftKey }, ctx.objectEnv);
      ctx.objects.setOverrides(new Map([[original.id, next]]));
    },
    end() {
      ctx.objects.setOverrides(null);
      if (next !== original) {
        ctx.objects.replace(
          [next],
          handle === 'rotate' ? 'history.rotateObject' : 'history.transformObject',
        );
      }
    },
    cancel() {
      ctx.objects.setOverrides(null);
    },
  };
}

/** Con trỏ chuột khi rê trên handle/đối tượng (không kéo). */
export function hoverCursor(
  ctx: ToolContext,
  screen: Readonly<Point>,
  doc: Readonly<Point>,
  selectAny: boolean,
): string | null {
  const handle = ctx.objects.hitHandle(screen);
  if (handle) return HANDLE_CURSORS[handle.handle] ?? 'move';
  const hit = ctx.objects.hitTest(doc);
  if (hit && (selectAny || ctx.objects.selection.includes(hit.object.id))) return 'move';
  return null;
}
