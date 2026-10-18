import type { Document } from '../core/Document';
import type { FloodFillResult } from '../core/types';
import { isAllocationError } from '../memory/surfaces';
import { parseColor } from '../utils/color';
import { commitStroke, paintableLayer, startTileCapture } from './paint';
import type { DocPointerEvent, Tool, ToolContext, ToolDefinition } from './types';
import type { RasterLayer } from '../layers/layers';

/**
 * Paint Bucket (mục 5.8): đọc pixel của layer (hoặc ảnh đã ghép khi "lấy mẫu mọi layer"), tô loang
 * scanline trong Worker — UI không bị treo — rồi ghi vùng tô bằng một PaintCommand. Nếu document
 * đổi trong lúc Worker chạy (người dùng vẽ tiếp, undo…), kết quả cũ bị bỏ.
 */
function createBucket(ctx: ToolContext): Tool {
  const apply = (
    doc: Document,
    layer: RasterLayer,
    result: FloodFillResult,
    color: ReturnType<typeof parseColor>,
    composite: GlobalCompositeOperation,
  ) => {
    const { bounds, mask } = result;
    const image = new ImageData(bounds.width, bounds.height);
    // Ghi cả pixel 32 bit một lần (RGBA little-endian) — nhanh hơn ghi từng kênh.
    const out = new Uint32Array(image.data.buffer);
    const pixel = ((255 << 24) | (color.b << 16) | (color.g << 8) | color.r) >>> 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) out[i] = pixel;
    try {
      const buffer = ctx.strokeBuffer();
      buffer.write(bounds, image);
      const capture = startTileCapture(ctx, layer);
      capture.touch(bounds);
      commitStroke(ctx, {
        label: 'history.fill',
        layer,
        buffer,
        bounds,
        capture,
        opacity: color.a / 255,
        composite,
      });
      ctx.recycleStrokeBuffer(bounds);
    } catch (error) {
      if (!isAllocationError(error)) throw error;
      ctx.notify('memory.refused');
    }
    if (ctx.currentDocument === doc) ctx.invalidate(bounds);
  };

  return {
    cursor: () => ({ css: ctx.busy ? 'progress' : 'crosshair' }),

    onPointerDown(e: DocPointerEvent) {
      if (e.button !== 0 || ctx.busy) return;
      const doc = ctx.document;
      const x = Math.floor(e.x);
      const y = Math.floor(e.y);
      if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return;
      const layer = paintableLayer(ctx, 'modify', 'bucket');
      if (!layer) return;
      const o = ctx.options('bucket');
      const color = parseColor(ctx.colors().primary);
      const composite: GlobalCompositeOperation = layer.alphaLocked ? 'source-atop' : 'source-over';

      let sample: ImageData;
      try {
        sample = o.sampleAll
          ? ctx.readPixels(doc.bounds)
          : (layer.surface.read(doc.bounds) ?? new ImageData(doc.width, doc.height));
      } catch (error) {
        if (!isAllocationError(error)) throw error;
        ctx.notify('memory.refused');
        return;
      }

      const rev = doc.rev;
      ctx.setBusy(true);
      ctx.workers
        .floodFill({
          width: doc.width,
          height: doc.height,
          data: sample.data,
          x,
          y,
          tolerance: o.tolerance,
          contiguous: o.contiguous,
          expand: o.expand,
        })
        .then(
          (result) => {
            ctx.setBusy(false);
            // Document đã đổi trong lúc chờ: bỏ kết quả (không ghi lên trạng thái khác).
            if (ctx.currentDocument !== doc || doc.rev !== rev || !result) return;
            if (!doc.getLayer(layer.id)) return;
            apply(doc, layer, result, color, composite);
          },
          () => {
            ctx.setBusy(false);
            ctx.notify('fill.failed');
          },
        );
    },

    onPointerMove() {
      // Tô loang chỉ cần một click.
    },
    onPointerUp() {
      // Kết quả về từ Worker (bất đồng bộ).
    },
    onCancel() {
      // Không có thao tác kéo để hủy; kết quả cũ tự bị bỏ nếu document đổi.
    },
  };
}

export const bucketTool: ToolDefinition = {
  id: 'bucket',
  group: 'draw',
  icon: 'bucket',
  labelKey: 'bucket',
  shortcut: 'G',
  layerKinds: ['raster'],
  optionGroup: 'bucket',
  altEyedropper: true,
  create: createBucket,
};
