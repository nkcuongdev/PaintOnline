import type { FlipAxis, RotateAngle } from '@/engine/document/ImageOps';
import { t } from '@/i18n';
import { openDialog } from '@/stores/ui';
import type { AppCommand, CommandContext } from '../registry';

/**
 * Biến đổi ảnh (mục 2, GĐ5): cắt xén theo vùng chọn, Trim, Resize, Canvas size, xoay, lật — cho cả
 * ảnh, layer hiện tại hoặc vùng chọn. Không gán phím mặc định; dùng qua menu Ảnh, menu chuột phải
 * và Command Palette (GĐ8).
 */

const writable = ({ editor }: CommandContext) => !editor.readOnly && !editor.image.busy;
const withSelection = (ctx: CommandContext) => writable(ctx) && ctx.editor.selection.hasSelection;

function rotateImage(id: string, angle: RotateAngle, label: () => string): AppCommand {
  return {
    id,
    label,
    enabled: writable,
    run: ({ editor }) => {
      void editor.image.rotate(angle, 'image');
    },
  };
}

function flipImage(id: string, axis: FlipAxis, label: () => string): AppCommand {
  return {
    id,
    label,
    enabled: writable,
    run: ({ editor }) => {
      void editor.image.flip(axis, 'image');
    },
  };
}

function rotateLayer(id: string, angle: RotateAngle, label: () => string): AppCommand {
  return {
    id,
    label,
    enabled: writable,
    run: ({ editor }) => {
      void editor.image.rotate(angle, 'layer');
    },
  };
}

function flipLayer(id: string, axis: FlipAxis, label: () => string): AppCommand {
  return {
    id,
    label,
    enabled: writable,
    run: ({ editor }) => {
      void editor.image.flip(axis, 'layer');
    },
  };
}

export const imageCommands: AppCommand[] = [
  {
    id: 'image.cropToSelection',
    label: () => t.menu.cropToSelection,
    enabled: withSelection,
    run: ({ editor }) => {
      void editor.image.cropToSelection();
    },
  },
  {
    id: 'image.trim',
    label: () => t.menu.trim,
    enabled: writable,
    run: ({ editor }) => {
      void editor.image.trim();
    },
  },
  {
    id: 'image.resize',
    label: () => t.menu.resize,
    enabled: writable,
    run: () => {
      openDialog({ kind: 'resizeImage' });
    },
  },
  {
    id: 'image.canvasSize',
    label: () => t.menu.canvasSize,
    enabled: writable,
    run: () => {
      openDialog({ kind: 'canvasSize' });
    },
  },
  rotateImage('image.rotateCw', 90, () => t.menu.rotateCw),
  rotateImage('image.rotateCcw', 270, () => t.menu.rotateCcw),
  rotateImage('image.rotate180', 180, () => t.menu.rotate180),
  flipImage('image.flipHorizontal', 'horizontal', () => t.menu.flipHorizontal),
  flipImage('image.flipVertical', 'vertical', () => t.menu.flipVertical),
  rotateLayer('layer.rotateCw', 90, () => t.menu.rotateLayerCw),
  rotateLayer('layer.rotateCcw', 270, () => t.menu.rotateLayerCcw),
  rotateLayer('layer.rotate180', 180, () => t.menu.rotateLayer180),
  flipLayer('layer.flipHorizontal', 'horizontal', () => t.menu.flipLayerHorizontal),
  flipLayer('layer.flipVertical', 'vertical', () => t.menu.flipLayerVertical),
  {
    id: 'selection.rotateCw',
    label: () => t.menu.rotateSelectionCw,
    enabled: withSelection,
    run: ({ editor }) => {
      editor.selection.rotate(1);
    },
  },
  {
    id: 'selection.rotateCcw',
    label: () => t.menu.rotateSelectionCcw,
    enabled: withSelection,
    run: ({ editor }) => {
      editor.selection.rotate(-1);
    },
  },
  {
    id: 'selection.flipHorizontal',
    label: () => t.menu.flipSelectionHorizontal,
    enabled: withSelection,
    run: ({ editor }) => {
      editor.selection.flip('horizontal');
    },
  },
  {
    id: 'selection.flipVertical',
    label: () => t.menu.flipSelectionVertical,
    enabled: withSelection,
    run: ({ editor }) => {
      editor.selection.flip('vertical');
    },
  },
];
