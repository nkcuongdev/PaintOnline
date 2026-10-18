import { useEffect, useRef } from 'react';
import type { Editor } from '@/engine/core/Editor';

/** Cạnh dài của ảnh thu nhỏ (px thiết bị) — hiển thị 44 × 32 CSS px trên màn hình 2×. */
const THUMB_SIDE = 88;
/** Thumbnail cập nhật trễ sau khi nội dung đổi (mục 2: throttle 300 ms). */
const THUMB_DELAY_MS = 300;

interface LayerThumbnailProps {
  editor: Editor;
  layerId: string;
  contentRev: number;
  docWidth: number;
  docHeight: number;
}

/**
 * Ảnh thu nhỏ của một layer (P1). Engine dựng ImageBitmap (qua MemoryBudget); thẻ canvas ở đây chỉ
 * hiển thị bitmap đó bằng `bitmaprenderer` — chuyển quyền sở hữu, không vẽ, không sao chép.
 */
export function LayerThumbnail({
  editor,
  layerId,
  contentRev,
  docWidth,
  docHeight,
}: LayerThumbnailProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const first = useRef(true);

  useEffect(() => {
    let cancelled = false;
    const delay = first.current ? 0 : THUMB_DELAY_MS;
    first.current = false;
    const timer = window.setTimeout(() => {
      void editor.layers.thumbnail(layerId, THUMB_SIDE).then((bitmap) => {
        const canvas = ref.current;
        if (!bitmap) return;
        if (cancelled || !canvas) {
          bitmap.close();
          return;
        }
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('bitmaprenderer');
        if (ctx) ctx.transferFromImageBitmap(bitmap);
        else bitmap.close();
      });
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [editor, layerId, contentRev, docWidth, docHeight]);

  return (
    <div
      aria-hidden="true"
      className="flex h-8 w-11 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted"
    >
      <canvas
        ref={ref}
        width={docWidth >= docHeight ? 44 : Math.max(1, Math.round((44 * docWidth) / docHeight))}
        height={docHeight > docWidth ? 32 : Math.max(1, Math.round((44 * docHeight) / docWidth))}
        className="bg-checker max-h-full max-w-full"
      />
    </div>
  );
}
