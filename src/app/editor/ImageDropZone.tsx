import { ImagePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import { imageFileFrom, isPaintFileName } from '@/services/io/clipboard';
import { useProjectStore } from '@/stores/project';
import { dropImage } from './clipboard';
import type { OpenProject } from './session';

function hasFiles(e: DragEvent): boolean {
  return e.dataTransfer?.types.includes('Files') === true;
}

/**
 * Kéo thả ảnh vào editor đang mở (mục 2, 7.4): thêm thành layer mới đặt giữa khung nhìn, đang ở
 * trạng thái nổi để di chuyển ngay. Lắng nghe trên cả cửa sổ để thả được ở mọi chỗ trong editor;
 * hiện lớp phủ gợi ý trong lúc kéo.
 */
export function ImageDropZone({ project }: { project: OpenProject }) {
  const [active, setActive] = useState(false);
  const readOnly = useProjectStore((s) => s.readOnly);

  useEffect(() => {
    if (readOnly) return;
    let depth = 0;
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setActive(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setActive(false);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      depth = 0;
      setActive(false);
      if (!hasFiles(e)) return;
      e.preventDefault();
      const file = imageFileFrom(e.dataTransfer);
      if (!file || isPaintFileName(file.name)) return;
      void dropImage(project, file);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [project, readOnly]);

  if (!active) return null;
  return (
    <div
      className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/10"
      data-testid="image-drop-overlay"
    >
      <p className="flex items-center gap-2 rounded-xl bg-card/95 px-4 py-2.5 font-medium shadow-card">
        <ImagePlus className="size-5 text-primary" />
        {t.actions.dropImage}
      </p>
    </div>
  );
}
