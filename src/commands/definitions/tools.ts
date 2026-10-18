import { supportsAltEyedropper } from '@/engine/core/Editor';
import type { ToolId } from '@/engine/core/types';
import {
  FILL_TOOLS,
  FOCUS_TOOLS,
  MARQUEE_TOOLS,
  SELECT_TOOLS,
  SHAPE_TOOLS,
  TOOL_DEFINITIONS,
} from '@/engine/tools/registry';
import { t } from '@/i18n';
import type { AppCommand, CommandContext } from '../registry';

/** Chọn tool, tool tạm thời khi giữ phím, kích thước/độ cứng/độ mờ cọ, đổi màu (mục 7.7). */

/** Tool hình dùng gần nhất — phím U chọn lại tool này. */
let lastShape: ToolId = 'rect';

/** Kiểu Marquee dùng gần nhất (M) và biến thể tool Chọn hiện trên nút tách của tool island. */
let lastMarquee: ToolId = 'marquee-rect';
let lastSelect: ToolId = 'select';
/** Kiểu tô dùng gần nhất (G): Tô màu hoặc Gradient. */
let lastFill: ToolId = 'bucket';
/** Kiểu làm nổi bật dùng gần nhất: Spotlight hoặc Phóng to vùng. */
let lastFocus: ToolId = 'spotlight';

export function rememberShapeTool(tool: ToolId): void {
  if (SHAPE_TOOLS.includes(tool)) lastShape = tool;
}

export function rememberSelectTool(tool: ToolId): void {
  if (MARQUEE_TOOLS.includes(tool)) lastMarquee = tool;
  if (SELECT_TOOLS.includes(tool)) lastSelect = tool;
  if (FILL_TOOLS.includes(tool)) lastFill = tool;
  if (FOCUS_TOOLS.includes(tool)) lastFocus = tool;
}

/** Biến thể tool Chọn đang hiện trên nút tách (mục 7.2: click = tool đang nhớ). */
export function selectVariant(): ToolId {
  return lastSelect;
}

/** Hình khối đang hiện trên nút tách "Hình ▾" (cũng là hình phím U chọn lại). */
export function shapeVariant(): ToolId {
  return lastShape;
}

/** Biến thể Làm nổi bật đang hiện trên nút tách. */
export function focusVariant(): ToolId {
  return lastFocus;
}

/** Biến thể tool tô đang hiện trên nút tách. */
export function fillVariant(): ToolId {
  return lastFill;
}

/** Nhóm option có kích thước/độ mờ/độ cứng của tool đang chọn. */
function brushGroup({ editor }: CommandContext): 'brush' | 'eraser' | null {
  const tool = editor.tools.selected;
  return tool === 'eraser' ? 'eraser' : tool === 'brush' ? 'brush' : null;
}

/** Bước đổi cỡ cọ theo `[` `]` — nhỏ khi cọ nhỏ, lớn khi cọ lớn. */
export function sizeStep(size: number): number {
  if (size < 10) return 1;
  if (size < 50) return 5;
  if (size < 100) return 10;
  return 25;
}

const toolCommands: AppCommand[] = TOOL_DEFINITIONS.filter(
  (def) =>
    def.shortcut !== undefined &&
    def.id !== 'pan' &&
    !MARQUEE_TOOLS.includes(def.id) &&
    !FILL_TOOLS.includes(def.id),
).map((def) => ({
  id: `tool.${def.id}`,
  label: () => t.tools[def.id],
  shortcuts: def.shortcut ? [def.shortcut] : [],
  run: ({ editor }) => {
    editor.tools.setActive(def.id);
  },
}));

export const toolsCommands: AppCommand[] = [
  ...toolCommands,
  {
    // M: Marquee dùng gần nhất; đang ở Marquee thì đổi chữ nhật ↔ elip.
    id: 'tool.marquee',
    label: () => t.tools.marquee,
    shortcuts: ['M'],
    run: ({ editor }) => {
      const current = editor.tools.selected;
      const next = MARQUEE_TOOLS.includes(current)
        ? current === 'marquee-rect'
          ? 'marquee-ellipse'
          : 'marquee-rect'
        : lastMarquee;
      editor.tools.setActive(next);
    },
  },
  {
    // G: kiểu tô dùng gần nhất; đang ở tool tô thì đổi Tô màu ↔ Gradient.
    id: 'tool.fill',
    label: () => t.tools.fillTools,
    shortcuts: ['G'],
    run: ({ editor }) => {
      const current = editor.tools.selected;
      const next = FILL_TOOLS.includes(current)
        ? current === 'bucket'
          ? 'gradient'
          : 'bucket'
        : lastFill;
      editor.tools.setActive(next);
    },
  },
  {
    id: 'tool.shapes',
    label: () => t.tools.shapes,
    shortcuts: ['U'],
    run: ({ editor }) => {
      editor.tools.setActive(lastShape);
    },
  },
  {
    // Giữ Space: Pan tạm thời, nhả ra quay lại tool cũ (mục 5.3).
    id: 'tool.panHold',
    palette: false,
    label: () => t.tools.pan,
    shortcuts: ['Space'],
    run: ({ editor }) => {
      editor.tools.pushTemporary('pan');
    },
    release: ({ editor }) => {
      editor.tools.popTemporary('pan');
    },
  },
  {
    // Giữ Alt: lấy màu tạm thời ở tool vẽ và hình (phím dự phòng: I — mục 7.7).
    id: 'tool.eyedropperHold',
    palette: false,
    label: () => t.tools.eyedropper,
    shortcuts: ['Alt'],
    enabled: ({ editor }) =>
      !editor.isGestureActive && supportsAltEyedropper(editor.tools.selected),
    run: ({ editor }) => {
      editor.tools.pushTemporary('eyedropper');
    },
    release: ({ editor }) => {
      editor.tools.popTemporary('eyedropper');
    },
  },
  {
    id: 'colors.swap',
    label: () => t.colors.swap,
    shortcuts: ['X'],
    run: ({ editor }) => {
      editor.colors.swap();
    },
  },
  {
    id: 'brush.sizeUp',
    label: () => t.toolOptions.size,
    shortcuts: [']'],
    repeat: true,
    enabled: (ctx) => brushGroup(ctx) !== null,
    run: (ctx) => {
      const group = brushGroup(ctx);
      if (!group) return;
      const size = ctx.editor.options.get(group).size;
      ctx.editor.options.set(group, { size: size + sizeStep(size) });
      ctx.editor.flashBrushHud();
    },
  },
  {
    id: 'brush.sizeDown',
    label: () => t.toolOptions.size,
    shortcuts: ['['],
    repeat: true,
    enabled: (ctx) => brushGroup(ctx) !== null,
    run: (ctx) => {
      const group = brushGroup(ctx);
      if (!group) return;
      const size = ctx.editor.options.get(group).size;
      ctx.editor.options.set(group, { size: size - sizeStep(size) });
      ctx.editor.flashBrushHud();
    },
  },
  {
    id: 'brush.hardnessUp',
    label: () => t.toolOptions.hardness,
    shortcuts: ['Shift+]'],
    repeat: true,
    enabled: (ctx) => brushGroup(ctx) !== null,
    run: (ctx) => {
      const group = brushGroup(ctx);
      if (!group) return;
      ctx.editor.options.set(group, { hardness: ctx.editor.options.get(group).hardness + 0.1 });
      ctx.editor.flashBrushHud();
    },
  },
  {
    id: 'brush.hardnessDown',
    label: () => t.toolOptions.hardness,
    shortcuts: ['Shift+['],
    repeat: true,
    enabled: (ctx) => brushGroup(ctx) !== null,
    run: (ctx) => {
      const group = brushGroup(ctx);
      if (!group) return;
      ctx.editor.options.set(group, { hardness: ctx.editor.options.get(group).hardness - 0.1 });
      ctx.editor.flashBrushHud();
    },
  },
  {
    // 1–9 → 10%–90%, 0 → 100% (mục 7.7).
    id: 'brush.opacity',
    palette: false,
    label: () => t.toolOptions.opacity,
    shortcuts: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    enabled: (ctx) => brushGroup(ctx) !== null,
    run: (ctx, e) => {
      const group = brushGroup(ctx);
      const digit = Number((e?.code ?? '').replace(/^(Digit|Numpad)/, ''));
      if (!group || !Number.isInteger(digit)) return;
      ctx.editor.options.set(group, { opacity: digit === 0 ? 1 : digit / 10 });
    },
  },
];
