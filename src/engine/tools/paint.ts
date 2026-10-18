import type { PaintTargetKind, Rect, ToolId } from '../core/types';
import { PaintCommand } from '../history/commands/PaintCommand';
import { TileCapture } from '../history/tiles';
import type { RasterLayer } from '../layers/layers';
import type { GrowableSurface } from '../memory/GrowableSurface';
import { isAllocationError } from '../memory/surfaces';
import { intersectRect, isEmptyRect, roundOutRect } from '../utils/rect';
import type { ToolContext } from './types';

/**
 * Lấy layer raster để vẽ pixel, hoặc báo lý do không vẽ được. Nếu layer hoạt động là layer chú
 * thích, Editor áp dụng chính sách đã chọn (vẽ trên layer mới, dùng layer bên dưới, rasterize) hoặc
 * hỏi người dùng (mục 5.3).
 */
export function paintableLayer(
  ctx: ToolContext,
  kind: PaintTargetKind,
  tool: ToolId,
): RasterLayer | null {
  const layer = ctx.paintTarget(kind, tool);
  if (!layer) return null;
  if (layer.locked) {
    ctx.notify('layer.locked');
    return null;
  }
  if (!layer.visible) {
    ctx.notify('layer.hidden');
    return null;
  }
  return layer;
}

export interface CommitStrokeInit {
  label: string;
  layer: RasterLayer;
  buffer: GrowableSurface;
  /** Hình bao vùng nét (document, số thực). */
  bounds: Readonly<Rect>;
  /** Bản trước của các tile nét chạm, đã chụp dần trong lúc vẽ. */
  capture: TileCapture;
  opacity: number;
  composite: GlobalCompositeOperation;
}

/**
 * Ghép stroke buffer vào layer bằng một PaintCommand (snapshot tile trước → ghép → vào history),
 * mục 4.3 bước 5. Trả về vùng đã đổi (để vẽ lại), hoặc null nếu không có gì để commit.
 */
export function commitStroke(ctx: ToolContext, init: CommitStrokeInit): Rect | null {
  let area = intersectRect(roundOutRect(init.bounds), ctx.document.bounds);
  // Có vùng chọn: nét chỉ tác động bên trong (mục 5.5 — cắt stroke buffer bằng `destination-in`).
  const clip = ctx.selection.clip();
  if (clip) area = intersectRect(area, clip.bounds);
  const erasing = init.composite === 'destination-out' || init.composite === 'source-atop';
  // Không có gì để commit — hoặc tẩy/khóa trong suốt trên layer trống (không đổi pixel nào).
  if (isEmptyRect(area) || (erasing && init.layer.surface.isEmpty)) {
    init.capture.discard();
    return null;
  }
  if (clip) {
    const session = init.buffer.begin();
    if (session) {
      const c = session.ctx;
      c.beginPath();
      c.rect(area.x, area.y, area.width, area.height);
      c.clip();
      c.globalCompositeOperation = 'destination-in';
      clip.cover(c);
      session.end();
    }
  }

  const command = new PaintCommand({
    label: init.label,
    layerId: init.layer.id,
    area,
    store: init.capture.store,
    createStore: () => ctx.createTileStore(),
    captured: init.capture.tiles(),
    apply: (layer) => {
      if (!erasing) layer.surface.ensure(area);
      const src = init.buffer.region(area);
      const session = layer.surface.begin();
      if (!src || !session) {
        session?.end();
        return;
      }
      const c = session.ctx;
      c.globalAlpha = init.opacity;
      c.globalCompositeOperation = init.composite;
      c.drawImage(
        src.canvas,
        src.sx,
        src.sy,
        src.rect.width,
        src.rect.height,
        src.rect.x,
        src.rect.y,
        src.rect.width,
        src.rect.height,
      );
      session.end();
    },
  });

  try {
    ctx.execute(command);
  } catch (error) {
    // Command không vào history → trả bộ nhớ của kho tile.
    init.capture.discard();
    if (!isAllocationError(error)) throw error;
    ctx.notify('memory.refused');
    return null;
  }
  return area;
}

/** Bắt đầu chụp dần bản trước các tile của layer cho một nét vẽ. */
export function startTileCapture(ctx: ToolContext, layer: RasterLayer): TileCapture {
  return new TileCapture(ctx.createTileStore(), layer, ctx.document.bounds);
}
