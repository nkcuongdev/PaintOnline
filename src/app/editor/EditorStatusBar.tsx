import { Gauge, LoaderCircle, Minus, MousePointer2, Plus, Ruler, SquareDashed } from 'lucide-react';
import { StatusBar } from '@/app/layout/StatusBar';
import { IconButton } from '@/app/shared/IconButton';
import { Kbd } from '@/app/shared/Kbd';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Editor } from '@/engine/core/Editor';
import { format, t } from '@/i18n';
import { selectMemoryRatio, useDocumentStore } from '@/stores/document';

/** Chỉ báo bộ nhớ hiện khi MemoryBudget vượt 70% (mục 7.2). */
const MEMORY_WARNING_RATIO = 0.7;
const PRESET_ZOOMS = [0.25, 0.5, 1, 2, 4, 8] as const;

function percent(zoom: number): string {
  const value = zoom * 100;
  return format(t.zoom.percent, {
    value: value >= 10 ? Math.round(value) : Math.round(value * 10) / 10,
  });
}

function megabytes(bytes: number): string {
  return `${String(Math.round(bytes / 1024 ** 2))} MB`;
}

export function EditorStatusBar({ editor }: { editor: Editor }) {
  const pointer = useDocumentStore((s) => s.pointer);
  const doc = useDocumentStore((s) => s.doc);
  const zoom = useDocumentStore((s) => s.viewport.zoom);
  const memoryRatio = useDocumentStore(selectMemoryRatio);
  const memory = useDocumentStore((s) => s.memory);
  const selection = useDocumentStore((s) => s.pixelSelection);
  const busy = useDocumentStore((s) => s.busy);

  const inside =
    pointer &&
    doc &&
    pointer.x >= 0 &&
    pointer.y >= 0 &&
    pointer.x < doc.width &&
    pointer.y < doc.height;

  return (
    <StatusBar
      start={
        <>
          <span className="flex min-w-24 items-center gap-1.5" data-testid="status-pointer">
            <MousePointer2 className="size-3.5" aria-hidden="true" />
            {inside
              ? format(t.status.pointer, { x: Math.floor(pointer.x), y: Math.floor(pointer.y) })
              : '—'}
          </span>
          {doc && (
            <span className="flex items-center gap-1.5" data-testid="status-size">
              <Ruler className="size-3.5" aria-hidden="true" />
              {format(t.status.documentSize, { width: doc.width, height: doc.height })}
            </span>
          )}
          {selection && (
            <span
              className="flex items-center gap-1.5"
              data-testid="status-selection"
              title={selection.floating ? t.status.floating : undefined}
            >
              <SquareDashed className="size-3.5" aria-hidden="true" />
              {format(t.status.selection, {
                width: selection.bounds.width,
                height: selection.bounds.height,
              })}
              {selection.floating && <span className="text-primary">· {t.status.floating}</span>}
            </span>
          )}
          {busy && (
            <span className="flex items-center gap-1.5" role="status" data-testid="status-busy">
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
              {t.status.busy}
            </span>
          )}
          {memory && memoryRatio > MEMORY_WARNING_RATIO && (
            <span
              className="flex items-center gap-1.5 font-medium text-warning"
              title={format(t.status.memoryHint, {
                used: megabytes(memory.usedBytes),
                total: megabytes(memory.totalBytes),
              })}
            >
              <Gauge className="size-3.5" aria-hidden="true" />
              {format(t.status.memory, { value: Math.round(memoryRatio * 100) })}
            </span>
          )}
        </>
      }
      end={
        <div className="flex items-center gap-0.5">
          <IconButton
            size="sm"
            label={t.zoom.zoomOut}
            shortcut="-"
            tooltipSide="top"
            icon={<Minus />}
            onClick={() => {
              editor.viewport.zoomStep(-1);
            }}
          />
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                aria-label={`${t.zoom.level}: ${percent(zoom)}`}
                data-testid="zoom-level"
                className="min-w-14 font-medium tabular-nums"
              >
                {percent(zoom)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="w-44">
              <DropdownMenuItem
                onSelect={() => {
                  editor.viewport.fit();
                }}
              >
                {t.zoom.fit}
                <Kbd shortcut="Shift+1" className="ml-auto" />
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  editor.viewport.fill();
                }}
              >
                {t.zoom.fill}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {PRESET_ZOOMS.map((z) => (
                <DropdownMenuItem
                  key={z}
                  onSelect={() => {
                    editor.viewport.zoomTo(z);
                  }}
                >
                  {percent(z)}
                  {z === 1 && <Kbd shortcut="Shift+0" className="ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <IconButton
            size="sm"
            label={t.zoom.zoomIn}
            shortcut="+"
            tooltipSide="top"
            icon={<Plus />}
            onClick={() => {
              editor.viewport.zoomStep(1);
            }}
          />
        </div>
      }
    />
  );
}
