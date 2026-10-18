import { useMemo } from 'react';
import { toolIcon } from '@/app/editor/toolIcons';
import type { Editor } from '@/engine/core/Editor';
import type { LayerSummary } from '@/engine/core/types';
import { format, t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useDocumentStore } from '@/stores/document';
import { describeObject } from './describeObject';

/**
 * Danh sách đối tượng của layer chú thích đang chọn (mục 7.8): cách thay thế đọc được bằng trình đọc
 * màn hình cho nội dung canvas; bấm để chọn đối tượng (chuyển sang tool Chọn).
 */
export function ObjectList({ editor, layer }: { editor: Editor; layer: LayerSummary }) {
  const selected = useDocumentStore((s) => s.selection.objects);
  // `contentRev` đổi khi đối tượng của layer đổi.
  const { contentRev } = layer;
  const objects = useMemo(() => {
    if (contentRev < 0) return [];
    const container = editor.document?.getLayer(layer.id);
    return container?.kind === 'vector' ? [...container.objects] : [];
  }, [editor, layer.id, contentRev]);

  if (objects.length === 0) return null;
  const selectedIds = new Set(selected.map((o) => o.id));
  let step = 0;
  // Trên cùng (vẽ sau) hiện trước — cùng thứ tự với danh sách layer.
  const rows = objects.map((object) => ({
    object,
    label: describeObject(object, object.type === 'step' ? ++step : 0),
  }));
  rows.reverse();

  return (
    <section className="border-t px-2 pt-2 pb-1" aria-labelledby="object-list-title">
      <h3 id="object-list-title" className="px-1 pb-1 text-xs font-medium text-muted-foreground">
        {format(t.objectList.title, { count: objects.length })}
      </h3>
      <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto" data-testid="object-list">
        {rows.map(({ object, label }) => {
          const Icon = toolIcon(object.type);
          const isSelected = selectedIds.has(object.id);
          return (
            <li key={object.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                data-testid="object-item"
                onClick={() => {
                  if (editor.tools.selected !== 'select') editor.tools.setActive('select');
                  editor.objects.select([object.id]);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected && 'bg-primary/10 text-foreground',
                )}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 truncate">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
