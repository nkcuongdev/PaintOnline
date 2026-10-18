import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  Combine,
  CopyPlus,
  Ellipsis,
  Layers2,
  MessageSquarePlus,
  Pencil,
  Plus,
  Shapes,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { IconButton } from '@/app/shared/IconButton';
import { displayShortcut } from '@/commands';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Editor } from '@/engine/core/Editor';
import { format, t } from '@/i18n';
import { useDocumentStore } from '@/stores/document';
import { useProjectStore } from '@/stores/project';
import { LayerProperties } from './LayerProperties';
import { LayerRow } from './LayerRow';

/** Chỉ kéo theo chiều dọc của danh sách. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/**
 * Panel Layers (mục 2, 7.2): danh sách layer (trên cùng ở đầu) kéo thả được bằng chuột, cảm ứng và
 * bàn phím; thêm, nhân bản, xóa, Merge Down, Merge Visible, Flatten, Rasterize; thuộc tính của layer
 * hoạt động. Panel chỉ đọc bản sao trong documentStore và gọi Editor API.
 */
export function LayersPanel({ editor }: { editor: Editor }) {
  const doc = useDocumentStore((s) => s.doc);
  const readOnly = useProjectStore((s) => s.readOnly);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Hiển thị từ trên xuống: layer trên cùng ở đầu danh sách.
  const layers = useMemo(() => (doc ? [...doc.layers].reverse() : []), [doc]);
  const ids = useMemo(() => layers.map((l) => l.id), [layers]);

  const nameOf = (id: string | number) => layers.find((l) => l.id === id)?.name ?? '';
  const positionOf = (id: string | number) => ids.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => format(t.layers.dragStart, { name: nameOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? format(t.layers.dragOver, {
            name: nameOf(active.id),
            position: positionOf(over.id),
            total: ids.length,
          })
        : undefined,
    onDragEnd: ({ active, over }) =>
      format(t.layers.dragEnd, {
        name: nameOf(active.id),
        position: positionOf(over?.id ?? active.id),
        total: ids.length,
      }),
    onDragCancel: ({ active }) => format(t.layers.dragCancel, { name: nameOf(active.id) }),
  };

  if (!doc) return null;
  const active = doc.layers.find((l) => l.id === doc.activeLayerId) ?? doc.layers.at(-1);
  const activeIndex = active ? doc.layers.indexOf(active) : -1;
  const disabled = readOnly;

  const onDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    if (!over || dragged.id === over.id) return;
    const to = ids.indexOf(String(over.id));
    // Chỉ số hiển thị (trên → dưới) → chỉ số document (dưới → trên).
    if (to >= 0) editor.layers.move(String(dragged.id), ids.length - 1 - to);
  };

  const canMergeDown = active ? editor.layers.canMergeDown(active.id) : false;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="layers-panel">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[verticalOnly]}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: t.layers.dragInstructions },
        }}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul
            aria-label={t.layers.listLabel}
            className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-1"
            data-testid="layer-list"
          >
            {layers.map((layer) => (
              <LayerRow
                key={layer.id}
                editor={editor}
                layer={layer}
                active={layer.id === active?.id}
                docWidth={doc.width}
                docHeight={doc.height}
                disabled={disabled}
                renaming={renamingId === layer.id}
                onRenamingChange={(renaming) => {
                  setRenamingId(renaming ? layer.id : null);
                }}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-0.5 border-t px-2 py-1.5">
        <IconButton
          size="sm"
          label={t.layers.add}
          shortcut={displayShortcut('layer.new')}
          icon={<Plus />}
          tooltipSide="top"
          disabled={disabled}
          data-testid="layer-add"
          onClick={() => {
            editor.layers.add('raster');
          }}
        />
        <IconButton
          size="sm"
          label={t.layers.duplicate}
          shortcut={displayShortcut('layer.duplicate')}
          icon={<CopyPlus />}
          tooltipSide="top"
          disabled={disabled || !active}
          data-testid="layer-duplicate"
          onClick={() => {
            if (active) editor.layers.duplicate(active.id);
          }}
        />
        <IconButton
          size="sm"
          label={t.layers.mergeDown}
          shortcut={displayShortcut('layer.mergeDown')}
          icon={<ArrowDownToLine />}
          tooltipSide="top"
          disabled={disabled || !canMergeDown}
          data-testid="layer-merge-down"
          onClick={() => {
            if (active) editor.layers.mergeDown(active.id);
          }}
        />
        <IconButton
          size="sm"
          label={t.layers.remove}
          icon={<Trash2 />}
          tooltipSide="top"
          disabled={disabled || doc.layers.length <= 1}
          data-testid="layer-delete"
          onClick={() => {
            if (active) editor.layers.remove(active.id);
          }}
        />
        <div className="flex-1" />
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t.layers.more}
                  disabled={disabled}
                  data-testid="layer-menu"
                  className="text-foreground/80 [&_svg]:size-[18px]"
                >
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">{t.layers.more}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" side="top" className="w-64">
            <DropdownMenuItem
              data-testid="layer-add-annotation"
              onSelect={() => {
                editor.layers.add('vector');
              }}
            >
              <MessageSquarePlus />
              {t.layers.addAnnotation}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!active}
              data-testid="layer-rename"
              onSelect={() => {
                if (active) setRenamingId(active.id);
              }}
            >
              <Pencil />
              {t.layers.rename}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!active || activeIndex >= doc.layers.length - 1}
              data-testid="layer-move-up"
              onSelect={() => {
                if (active) editor.layers.move(active.id, activeIndex + 1);
              }}
            >
              <ArrowUp />
              {t.layers.moveUp}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!active || activeIndex <= 0}
              data-testid="layer-move-down"
              onSelect={() => {
                if (active) editor.layers.move(active.id, activeIndex - 1);
              }}
            >
              <ArrowDown />
              {t.layers.moveDown}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!editor.layers.canMergeVisible()}
              data-testid="layer-merge-visible"
              onSelect={() => {
                editor.layers.mergeVisible();
              }}
            >
              <Combine />
              {t.layers.mergeVisible}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!editor.layers.canFlatten()}
              data-testid="layer-flatten"
              title={t.layers.flattenHiddenNote}
              onSelect={() => {
                editor.layers.flatten();
              }}
            >
              <Layers2 />
              {t.layers.flatten}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={active?.kind !== 'vector'}
              data-testid="layer-rasterize"
              onSelect={() => {
                if (active) editor.layers.rasterize(active.id);
              }}
            >
              <Shapes />
              {t.layers.rasterize}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {active && <LayerProperties editor={editor} layer={active} disabled={disabled} />}
    </div>
  );
}
