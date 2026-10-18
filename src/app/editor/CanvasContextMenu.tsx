import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalJustifyCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  BringToFront,
  Check,
  ClipboardPaste,
  Copy,
  Crop,
  Download,
  FlipHorizontal2,
  FlipVertical2,
  Maximize,
  PaintBucket,
  Redo2,
  RotateCcw,
  RotateCw,
  Scaling,
  Scan,
  Scissors,
  SendToBack,
  SquareDashed,
  SquareDashedMousePointer,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { CommandContext } from '@/commands';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { t } from '@/i18n';
import { useUiStore } from '@/stores/ui';
import { CommandItem } from './ImageMenu';

/** Mục mở menu con căn chỉnh đối tượng. */
const ALIGN = 'submenu:align';
const ALIGN_ITEMS: readonly string[] = [
  'object.alignLeft',
  'object.alignCenterX',
  'object.alignRight',
  'object.alignTop',
  'object.alignCenterY',
  'object.alignBottom',
];

const OBJECT_ITEMS: readonly (string | null)[] = [
  'edit.delete',
  null,
  'object.bringToFront',
  'object.sendToBack',
  ALIGN,
  null,
  'file.copyImage',
];

/** Mục mở menu con xoay/lật vùng chọn. */
const ROTATE_FLIP = 'submenu:rotateFlip';
const ROTATE_FLIP_ITEMS: readonly string[] = [
  'selection.rotateCw',
  'selection.rotateCcw',
  'selection.flipHorizontal',
  'selection.flipVertical',
];

/** Bấm chuột phải trong vùng chọn pixel (mục 5.9: menu theo ngữ cảnh "trên vùng chọn"). */
const SELECTION_ITEMS: readonly (string | null)[] = [
  'selection.commit',
  'selection.cancel',
  'edit.copy',
  'edit.cut',
  'selection.copyMerged',
  null,
  'selection.delete',
  'selection.fill',
  'image.cropToSelection',
  null,
  'selection.transform',
  ROTATE_FLIP,
  null,
  'selection.invert',
  'selection.deselect',
];

const CANVAS_ITEMS: readonly (string | null)[] = [
  'edit.undo',
  'edit.redo',
  null,
  'edit.paste',
  'selection.all',
  null,
  'file.copyImage',
  'file.exportPng',
  null,
  'view.fit',
  'view.actualSize',
];

const ICONS: Readonly<Record<string, ReactNode>> = {
  'edit.delete': <Trash2 />,
  'object.bringToFront': <BringToFront />,
  'object.sendToBack': <SendToBack />,
  'file.copyImage': <Copy />,
  'file.exportPng': <Download />,
  'edit.undo': <Undo2 />,
  'edit.redo': <Redo2 />,
  'edit.copy': <Copy />,
  'edit.cut': <Scissors />,
  'edit.paste': <ClipboardPaste />,
  'selection.copyMerged': <Copy />,
  'selection.commit': <Check />,
  'selection.cancel': <X />,
  'selection.delete': <Trash2 />,
  'selection.fill': <PaintBucket />,
  'image.cropToSelection': <Crop />,
  'selection.transform': <Scaling />,
  'selection.rotateCw': <RotateCw />,
  'selection.rotateCcw': <RotateCcw />,
  'selection.flipHorizontal': <FlipHorizontal2 />,
  'selection.flipVertical': <FlipVertical2 />,
  'selection.invert': <SquareDashedMousePointer />,
  'selection.deselect': <X />,
  'selection.all': <SquareDashed />,
  'view.fit': <Maximize />,
  'object.alignLeft': <AlignStartVertical />,
  'object.alignCenterX': <AlignCenterVertical />,
  'object.alignRight': <AlignEndVertical />,
  'object.alignTop': <AlignStartHorizontal />,
  'object.alignCenterY': <AlignCenterHorizontal />,
  'object.alignBottom': <AlignEndHorizontal />,
  'view.actualSize': <Scan />,
};

/** Mục chỉ hiện khi dùng được (Áp dụng/Hủy chỉ có khi đang di chuyển pixel). */
const HIDE_WHEN_DISABLED = new Set(['selection.commit', 'selection.cancel']);

/**
 * Menu chuột phải trên canvas (mục 5.9): nội dung theo ngữ cảnh — trên đối tượng, trên vùng chọn
 * hoặc trên vùng trống; mục menu lấy nhãn, phím tắt và trạng thái từ Command Registry.
 */
export function CanvasContextMenu({ context }: { context: CommandContext }) {
  const menu = useUiStore((s) => s.canvasMenu);
  const close = useUiStore((s) => s.closeCanvasMenu);
  if (!menu) return null;
  const items = menu.onObject ? OBJECT_ITEMS : menu.onSelection ? SELECTION_ITEMS : CANVAS_ITEMS;
  const floating = context.editor.selection.isFloating;
  const visible = items.filter((id) => id === null || !HIDE_WHEN_DISABLED.has(id) || floating);

  return (
    <DropdownMenu
      key={menu.id}
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute size-px"
          style={{ left: menu.x, top: menu.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={2}
        collisionPadding={8}
        className="min-w-56"
        aria-label={
          menu.onObject
            ? t.menu.objectLabel
            : menu.onSelection
              ? t.menu.selectionLabel
              : t.menu.canvasLabel
        }
        data-testid="canvas-menu"
      >
        {visible.map((id, index) =>
          id === null ? (
            <DropdownMenuSeparator key={`sep-${String(index)}`} />
          ) : id === ALIGN ? (
            <DropdownMenuSub key={id}>
              <DropdownMenuSubTrigger data-testid="menu-object-align">
                <AlignHorizontalJustifyCenter />
                {t.menu.align}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-48">
                {ALIGN_ITEMS.map((item) => (
                  <CommandItem key={item} id={item} context={context} icon={ICONS[item]} />
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : id === ROTATE_FLIP ? (
            <DropdownMenuSub key={id}>
              <DropdownMenuSubTrigger data-testid="menu-selection-rotate-flip">
                <RotateCw />
                {t.menu.selectionRotateFlip}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-56">
                {ROTATE_FLIP_ITEMS.map((item) => (
                  <CommandItem key={item} id={item} context={context} icon={ICONS[item]} />
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : (
            <CommandItem
              key={id}
              id={id}
              context={context}
              icon={ICONS[id]}
              destructive={id === 'edit.delete' || id === 'selection.delete'}
            />
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
