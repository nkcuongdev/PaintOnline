import { copySelection, pasteFromMenu } from '@/app/editor/clipboard';
import { copyProjectImage } from '@/app/editor/actions';
import { SELECT_TOOLS } from '@/engine/tools/registry';
import type { AlignMode } from '@/engine/tools/objects/ObjectController';
import { t } from '@/i18n';
import type { AppCommand, CommandContext } from '../registry';

/**
 * Lệnh chỉnh sửa (mục 7.7): undo/redo, copy/cắt/dán, xóa, chọn tất cả, bỏ chọn, đảo vùng chọn,
 * biến đổi vùng chọn, nudge, thứ tự đối tượng. Ctrl+C/X/V đi qua sự kiện copy/cut/paste của trình
 * duyệt (useEditorShortcuts); lệnh ở đây cho menu.
 */

const writable = ({ editor }: CommandContext) => !editor.readOnly && !editor.image.busy;
const hasPixelSelection = ({ editor }: CommandContext) => editor.selection.hasSelection;

const NUDGE = 1;
const NUDGE_LARGE = 10;

function nudge(id: string, dx: number, dy: number, key: string): AppCommand {
  return {
    id,
    label: () => t.history.moveObject,
    shortcuts: [key, `Shift+${key}`],
    repeat: true,
    palette: false,
    // Đối tượng vector đang chọn trước; không có thì dời pixel trong vùng chọn.
    enabled: ({ editor }) => editor.objects.hasSelection || editor.selection.hasSelection,
    run: ({ editor }, e) => {
      const step = e?.shiftKey ? NUDGE_LARGE : NUDGE;
      if (editor.objects.hasSelection) editor.objects.nudge(dx * step, dy * step);
      else editor.selection.nudge(dx * step, dy * step);
    },
  };
}

/** Căn chỉnh đối tượng (mục 2 — "căn chỉnh"): không gán phím mặc định. */
function align(id: string, mode: AlignMode, label: () => string): AppCommand {
  return {
    id,
    label,
    enabled: ({ editor }) => editor.objects.hasSelection && !editor.readOnly,
    run: ({ editor }) => {
      editor.objects.align(mode);
    },
  };
}

export const editCommands: AppCommand[] = [
  {
    id: 'edit.undo',
    label: () => t.actions.undo,
    shortcuts: ['Mod+Z'],
    repeat: true,
    enabled: ({ editor }) => editor.canUndo,
    run: ({ editor }) => {
      editor.undo();
    },
  },
  {
    id: 'edit.redo',
    label: () => t.actions.redo,
    shortcuts: ['Mod+Shift+Z', 'Mod+Y'],
    repeat: true,
    enabled: ({ editor }) => editor.canRedo,
    run: ({ editor }) => {
      editor.redo();
    },
  },
  {
    id: 'edit.copy',
    label: () => t.menu.copySelection,
    run: ({ project, editor }) => {
      if (!editor.selection.hasSelection || !copySelection(project, 'copy')) {
        copyProjectImage(project);
      }
    },
  },
  {
    id: 'edit.cut',
    label: () => t.menu.cutSelection,
    enabled: (ctx) => writable(ctx) && hasPixelSelection(ctx),
    run: ({ project }) => {
      copySelection(project, 'cut');
    },
  },
  {
    id: 'edit.paste',
    label: () => t.menu.paste,
    enabled: writable,
    run: ({ project }) => {
      void pasteFromMenu(project);
    },
  },
  {
    id: 'selection.copyMerged',
    label: () => t.menu.copyMerged,
    enabled: hasPixelSelection,
    run: ({ project }) => {
      copySelection(project, 'merged');
    },
  },
  {
    // Đối tượng vector đang chọn: xóa đối tượng; không có thì xóa pixel trong vùng chọn.
    id: 'edit.delete',
    label: () => t.menu.delete,
    shortcuts: ['Delete', 'Backspace'],
    enabled: ({ editor }) => editor.objects.hasSelection || editor.selection.hasSelection,
    run: ({ editor }) => {
      if (editor.objects.hasSelection) editor.objects.deleteSelected();
      else editor.selection.deleteContent();
    },
  },
  {
    // Esc: hủy thao tác đang kéo; nếu không có thì bỏ chọn (dự phòng cho Ctrl+D — mục 7.7).
    id: 'edit.escape',
    label: () => t.menu.deselect,
    shortcuts: ['Escape'],
    palette: false,
    enabled: ({ editor }) =>
      editor.isGestureActive || editor.objects.hasSelection || editor.selection.hasSelection,
    run: ({ editor }) => {
      if (editor.isGestureActive) editor.cancelGesture();
      else if (editor.selection.isFloating) editor.selection.cancel();
      else if (editor.objects.hasSelection) editor.objects.clearSelection();
      else editor.selection.deselect();
    },
  },
  {
    id: 'selection.all',
    label: () => t.menu.selectAll,
    shortcuts: ['Mod+A'],
    run: ({ editor }) => {
      editor.selection.selectAll();
    },
  },
  {
    // Ctrl+D có thể bị trình duyệt giành (thêm bookmark) — dự phòng Esc (mục 7.7).
    id: 'selection.deselect',
    label: () => t.menu.deselect,
    shortcuts: ['Mod+D'],
    enabled: hasPixelSelection,
    run: ({ editor }) => {
      editor.selection.deselect();
    },
  },
  {
    // Không gán phím mặc định (mục 7.7) — dùng qua menu.
    id: 'selection.invert',
    label: () => t.menu.invertSelection,
    enabled: hasPixelSelection,
    run: ({ editor }) => {
      editor.selection.invert();
    },
  },
  {
    id: 'selection.transform',
    label: () => t.menu.transformSelection,
    shortcuts: ['Shift+T'],
    enabled: writable,
    run: ({ editor }) => {
      // Handle biến đổi chỉ hiện ở tool chọn: đang ở tool khác thì chuyển sang Marquee.
      if (editor.selection.transform() && !SELECT_TOOLS.includes(editor.tools.selected)) {
        editor.tools.setActive('marquee-rect');
      }
    },
  },
  {
    id: 'selection.commit',
    label: () => t.menu.commitTransform,
    shortcuts: ['Enter'],
    enabled: ({ editor }) => editor.selection.isFloating,
    run: ({ editor }) => {
      editor.selection.commit();
    },
  },
  {
    id: 'selection.cancel',
    label: () => t.menu.cancelTransform,
    enabled: ({ editor }) => editor.selection.isFloating,
    run: ({ editor }) => {
      editor.selection.cancel();
    },
  },
  {
    id: 'selection.fill',
    label: () => t.menu.fillSelection,
    enabled: (ctx) => writable(ctx) && hasPixelSelection(ctx),
    run: ({ editor }) => {
      editor.selection.fill();
    },
  },
  {
    // Mini toolbar (mục 7.6): Redact phủ hình bao vùng chọn.
    id: 'selection.redact',
    label: () => t.menu.redactSelection,
    enabled: (ctx) => writable(ctx) && hasPixelSelection(ctx) && !ctx.editor.selection.isFloating,
    run: ({ editor }) => {
      editor.selection.redact();
    },
  },
  {
    id: 'selection.delete',
    label: () => t.menu.deleteSelection,
    enabled: (ctx) => writable(ctx) && hasPixelSelection(ctx),
    run: ({ editor }) => {
      editor.selection.deleteContent();
    },
  },
  {
    id: 'object.editText',
    label: () => t.history.editText,
    shortcuts: ['Enter'],
    enabled: ({ editor }) => {
      const ids = editor.objects.selection;
      return ids.length === 1 && editor.objects.get(ids[0] ?? '')?.type === 'text';
    },
    run: ({ editor }) => {
      editor.editSelectedText();
    },
  },
  {
    id: 'object.bringToFront',
    label: () => t.menu.bringToFront,
    enabled: ({ editor }) => editor.objects.hasSelection,
    run: ({ editor }) => {
      editor.objects.bringToFront();
    },
  },
  {
    id: 'object.sendToBack',
    label: () => t.menu.sendToBack,
    enabled: ({ editor }) => editor.objects.hasSelection,
    run: ({ editor }) => {
      editor.objects.sendToBack();
    },
  },
  align('object.alignLeft', 'left', () => t.menu.alignLeft),
  align('object.alignCenterX', 'centerX', () => t.menu.alignCenterX),
  align('object.alignRight', 'right', () => t.menu.alignRight),
  align('object.alignTop', 'top', () => t.menu.alignTop),
  align('object.alignCenterY', 'centerY', () => t.menu.alignCenterY),
  align('object.alignBottom', 'bottom', () => t.menu.alignBottom),
  nudge('object.nudgeLeft', -1, 0, 'ArrowLeft'),
  nudge('object.nudgeRight', 1, 0, 'ArrowRight'),
  nudge('object.nudgeUp', 0, -1, 'ArrowUp'),
  nudge('object.nudgeDown', 0, 1, 'ArrowDown'),
];
