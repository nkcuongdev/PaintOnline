import { t } from '@/i18n';
import { useUiStore } from '@/stores/ui';
import type { AppCommand, CommandContext } from '../registry';

/**
 * Lệnh layer (mục 7.7): Shift+N layer mới · Ctrl+J nhân bản (dự phòng Shift+J vì Ctrl+J mở
 * Downloads) · Ctrl+E gộp xuống (dự phòng Shift+E vì Ctrl+E đưa con trỏ vào ô tìm kiếm). Merge
 * Visible, Flatten không gán phím mặc định — dùng qua menu panel Layers.
 */

function activeId({ editor }: CommandContext): string | null {
  return editor.document?.activeLayerId ?? null;
}

export const layerCommands: AppCommand[] = [
  {
    id: 'layer.new',
    label: () => t.layers.add,
    shortcuts: ['Shift+N'],
    enabled: ({ editor }) => !editor.readOnly,
    run: ({ editor }) => {
      editor.layers.add('raster');
    },
  },
  {
    id: 'layer.newAnnotation',
    label: () => t.layers.addAnnotation,
    enabled: ({ editor }) => !editor.readOnly,
    run: ({ editor }) => {
      editor.layers.add('vector');
    },
  },
  {
    id: 'layer.duplicate',
    label: () => t.layers.duplicate,
    shortcuts: ['Mod+J', 'Shift+J'],
    enabled: (ctx) => !ctx.editor.readOnly && activeId(ctx) !== null,
    run: (ctx) => {
      const id = activeId(ctx);
      if (id) ctx.editor.layers.duplicate(id);
    },
  },
  {
    id: 'layer.mergeDown',
    label: () => t.layers.mergeDown,
    shortcuts: ['Mod+E', 'Shift+E'],
    enabled: (ctx) => {
      const id = activeId(ctx);
      return !ctx.editor.readOnly && id !== null && ctx.editor.layers.canMergeDown(id);
    },
    run: (ctx) => {
      const id = activeId(ctx);
      if (id) ctx.editor.layers.mergeDown(id);
    },
  },
  {
    id: 'layer.mergeVisible',
    label: () => t.layers.mergeVisible,
    enabled: ({ editor }) => !editor.readOnly && editor.layers.canMergeVisible(),
    run: ({ editor }) => {
      editor.layers.mergeVisible();
    },
  },
  {
    id: 'layer.flatten',
    label: () => t.layers.flatten,
    enabled: ({ editor }) => !editor.readOnly && editor.layers.canFlatten(),
    run: ({ editor }) => {
      editor.layers.flatten();
    },
  },
  {
    id: 'layer.delete',
    label: () => t.layers.remove,
    enabled: ({ editor }) => !editor.readOnly && (editor.document?.layers.length ?? 0) > 1,
    run: (ctx) => {
      const id = activeId(ctx);
      if (id) ctx.editor.layers.remove(id);
    },
  },
  {
    id: 'layer.rasterize',
    label: () => t.layers.rasterize,
    enabled: ({ editor }) => !editor.readOnly && editor.document?.activeLayer.kind === 'vector',
    run: (ctx) => {
      const id = activeId(ctx);
      if (id) ctx.editor.layers.rasterize(id);
    },
  },
  {
    id: 'view.togglePanel',
    label: () => t.panel.expand,
    run: () => {
      const { rightPanel, setRightPanel } = useUiStore.getState();
      setRightPanel({ open: !rightPanel.open });
    },
  },
];
