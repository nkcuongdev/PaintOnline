import { FolderOpen, ImagePlus, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { Kbd } from '@/app/shared/Kbd';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { droppedFile } from '@/services/io/clipboard';

interface DropZoneProps {
  busy: 'image' | 'project' | null;
  /** Ảnh hoặc file .paint. */
  onFile: (file: File) => void;
}

/** Ô lớn "Dán ảnh, thả file, hoặc tạo mới" (mục 7.3). Dán bằng Ctrl+V do StartScreen lắng nghe. */
export function DropZone({ busy, onFile }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [before, after] = t.home.heroSubtitle.split('{shortcut}');

  const onDragOver = (e: DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = droppedFile(e.dataTransfer);
    if (file) onFile(file);
  };

  return (
    <section
      aria-labelledby="dropzone-title"
      aria-busy={busy !== null}
      data-testid="drop-zone"
      data-dragging={dragging || undefined}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
      className={cn(
        'group relative flex min-h-[19rem] flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-input bg-card px-6 py-10 text-center shadow-card transition-[border-color,background-color] duration-150',
        dragging && 'border-primary bg-primary-soft/60',
      )}
    >
      {/* Ánh sáng nền nhẹ theo màu nhấn */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_0%,color-mix(in_srgb,var(--primary)_10%,transparent),transparent)]"
      />

      <span className="relative mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary-soft text-primary-soft-foreground shadow-card ring-1 ring-primary/10">
        {busy !== null ? (
          <LoaderCircle className="size-8 animate-spin" strokeWidth={1.5} />
        ) : (
          <ImagePlus className="size-8" strokeWidth={1.5} />
        )}
      </span>

      <h2
        id="dropzone-title"
        className="relative text-xl font-semibold tracking-[-0.015em] sm:text-2xl"
      >
        {dragging
          ? t.home.dropHint
          : busy === 'image'
            ? t.home.importing
            : busy === 'project'
              ? t.home.importingProject
              : t.home.heroTitle}
      </h2>
      <p className="relative mt-2 max-w-md text-[0.875rem] text-muted-foreground">
        {before}
        <Kbd shortcut="Mod+V" className="mx-1 align-[-0.2em]" />
        {after}
      </p>

      <div className="relative mt-5 flex flex-wrap items-center justify-center gap-3">
        <Button
          variant="outline"
          disabled={busy !== null}
          data-testid="open-image"
          aria-label={t.home.openImageLabel}
          onClick={() => inputRef.current?.click()}
        >
          <FolderOpen />
          {t.home.openImage}
        </Button>
        <span className="rounded-full bg-muted px-3 py-1 text-status text-muted-foreground">
          {t.home.supportedFormatsWithPaint}
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif,image/svg+xml,.svg,.paint"
        className="hidden"
        data-testid="file-input"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />

      <p className="relative mt-auto flex items-center gap-1.5 pt-8 text-status text-muted-foreground">
        <ShieldCheck className="size-4 text-success" />
        {t.home.privacyNote}
      </p>
    </section>
  );
}
