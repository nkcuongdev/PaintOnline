import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Eye, EyeOff, GripVertical, Lock, LockOpen, Shapes, SquareDashed } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import type { Editor } from '@/engine/core/Editor';
import type { LayerSummary } from '@/engine/core/types';
import { format, t } from '@/i18n';
import { cn } from '@/lib/utils';
import { LayerThumbnail } from './LayerThumbnail';

interface LayerRowProps {
  editor: Editor;
  layer: LayerSummary;
  active: boolean;
  docWidth: number;
  docHeight: number;
  disabled: boolean;
  /** Đang đổi tên (mở từ menu hoặc double-click). */
  renaming: boolean;
  onRenamingChange: (renaming: boolean) => void;
}

const toggleClass =
  'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4';

/**
 * Một dòng của panel Layers: tay nắm kéo thả (dnd-kit, có bàn phím), ẩn/hiện, ảnh thu nhỏ, tên (đổi
 * tại chỗ bằng double-click), khóa. Mọi thay đổi gọi Editor API — panel chỉ đọc bản sao trong store.
 */
export function LayerRow({
  editor,
  layer,
  active,
  docWidth,
  docHeight,
  disabled,
  renaming,
  onRenamingChange,
}: LayerRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: layer.id,
    disabled,
  });
  const commitRename = (value: string) => {
    onRenamingChange(false);
    editor.layers.setProps(layer.id, { name: value });
  };

  const onRenameKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename(e.currentTarget.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      // Esc hủy: blur xảy ra sau đó chỉ ghi lại tên cũ (không đổi gì).
      e.currentTarget.value = layer.name;
      onRenamingChange(false);
    }
  };

  const kindLabel = layer.kind === 'raster' ? t.layers.raster : t.layers.vector;
  const status = [
    kindLabel,
    layer.hasContent ? null : t.layers.empty,
    layer.visible ? null : t.layers.hiddenBadge,
    layer.locked ? t.layers.lockedBadge : null,
    layer.alphaLocked ? t.layers.alphaLock : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      data-testid="layer-row"
      data-layer-id={layer.id}
      data-active={active || undefined}
      className={cn(
        'group relative flex h-12 items-center gap-1 rounded-lg border border-transparent px-1 transition-colors',
        active ? 'border-primary/40 bg-primary-soft' : 'hover:bg-accent/60',
        isDragging && 'z-10 bg-card shadow-card',
        !layer.visible && 'opacity-60',
      )}
    >
      <button
        type="button"
        className={cn(toggleClass, 'w-5 cursor-grab active:cursor-grabbing')}
        aria-label={format(t.layers.selectNamed, { name: layer.name })}
        disabled={disabled}
        data-testid="layer-drag"
        {...attributes}
        {...listeners}
      >
        <GripVertical />
      </button>
      <button
        type="button"
        className={toggleClass}
        aria-label={layer.visible ? t.layers.hide : t.layers.show}
        aria-pressed={!layer.visible}
        title={layer.visible ? t.layers.hide : t.layers.show}
        disabled={disabled}
        data-testid="layer-visibility"
        onClick={() => {
          editor.layers.setProps(layer.id, { visible: !layer.visible });
        }}
      >
        {layer.visible ? <Eye /> : <EyeOff />}
      </button>

      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 pr-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-pressed={active}
        aria-label={`${layer.name} — ${status}`}
        data-testid="layer-select"
        onClick={() => {
          editor.layers.setActive(layer.id);
        }}
        onDoubleClick={() => {
          if (disabled) return;
          onRenamingChange(true);
        }}
      >
        <LayerThumbnail
          editor={editor}
          layerId={layer.id}
          contentRev={layer.contentRev}
          docWidth={docWidth}
          docHeight={docHeight}
        />
        {!renaming && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium" data-testid="layer-name">
              {layer.name}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {layer.kind === 'vector' ? (
                <Shapes className="size-3" aria-hidden="true" />
              ) : (
                <SquareDashed className="size-3" aria-hidden="true" />
              )}
              <span className="truncate">
                {layer.blendMode === 'normal' ? kindLabel : t.layers.blendModes[layer.blendMode]}
                {layer.opacity < 1 && ` · ${String(Math.round(layer.opacity * 100))}%`}
              </span>
            </span>
          </span>
        )}
      </button>
      {renaming && (
        <input
          ref={(node) => {
            node?.focus();
          }}
          aria-label={t.layers.renameLabel}
          data-testid="layer-rename-input"
          className="absolute inset-y-2 right-10 left-[6.75rem] rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          defaultValue={layer.name}
          maxLength={100}
          onKeyDown={onRenameKey}
          onBlur={(e) => {
            commitRename(e.currentTarget.value);
          }}
          onFocus={(e) => {
            e.currentTarget.select();
          }}
        />
      )}

      <button
        type="button"
        className={cn(
          toggleClass,
          !layer.locked && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
        aria-label={layer.locked ? t.layers.unlock : t.layers.lock}
        aria-pressed={layer.locked}
        title={layer.locked ? t.layers.unlock : t.layers.lock}
        disabled={disabled}
        data-testid="layer-lock"
        onClick={() => {
          editor.layers.setProps(layer.id, { locked: !layer.locked });
        }}
      >
        {layer.locked ? <Lock /> : <LockOpen />}
      </button>
    </li>
  );
}
