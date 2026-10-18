import { ChevronDown } from 'lucide-react';
import { createElement, Fragment } from 'react';
import {
  displayShortcut,
  fillVariant,
  focusVariant,
  selectVariant,
  shapeVariant,
} from '@/commands';
import { Kbd } from '@/app/shared/Kbd';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Editor } from '@/engine/core/Editor';
import type { ToolId } from '@/engine/core/types';
import {
  FILL_TOOLS,
  FOCUS_TOOLS,
  getToolDefinition,
  MARQUEE_TOOLS,
  SCREENSHOT_TOOLS,
  SELECT_TOOLS,
  SHAPE_TOOLS,
  TOOL_DEFINITIONS,
} from '@/engine/tools/registry';
import type { ToolDefinition, ToolGroup } from '@/engine/tools/types';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useToolStore } from '@/stores/tool';
import { ColorControl } from './ColorControl';
import { toolIcon, toolLabel } from './toolIcons';

/** Thứ tự nhóm theo mục 7.2: Chọn │ Vẽ │ Hình │ Chữ, chú thích │ Khung nhìn │ Màu. */
const GROUP_ORDER: readonly ToolGroup[] = ['select', 'draw', 'shape', 'annotate', 'view'];

const GROUP_LABELS: Readonly<Record<ToolGroup, string>> = {
  select: t.tools.groupSelect,
  draw: t.tools.groupDraw,
  shape: t.tools.groupShape,
  annotate: t.tools.groupAnnotate,
  view: t.tools.groupView,
};

function groupTools(): ToolDefinition[][] {
  return GROUP_ORDER.map((g) => TOOL_DEFINITIONS.filter((d) => d.group === g)).filter(
    (g) => g.length > 0,
  );
}

/**
 * Tool island rút gọn của chế độ Screenshot (mục 7.3): Chọn │ Mũi tên, Khung, Bút dạ quang, Chữ,
 * Che thông tin, Số thứ tự, Spotlight, Phóng to vùng │ Cắt xén — thứ tự theo luồng chú thích.
 */
function screenshotGroups(): ToolDefinition[][] {
  const pick = (ids: readonly string[]) =>
    SCREENSHOT_TOOLS.filter((id) => ids.includes(id)).map(getToolDefinition);
  const annotate = SCREENSHOT_TOOLS.filter((id) => id !== 'select' && id !== 'crop');
  return [pick(['select']), annotate.map(getToolDefinition), pick(['crop'])];
}

/** Phím hiển thị: tool hình dùng chung phím U, Marquee dùng chung phím M, tool tô phím G. */
function toolShortcut(def: ToolDefinition): string | undefined {
  if (SHAPE_TOOLS.includes(def.id)) return displayShortcut('tool.shapes');
  if (MARQUEE_TOOLS.includes(def.id)) return displayShortcut('tool.marquee');
  if (FILL_TOOLS.includes(def.id)) return displayShortcut('tool.fill');
  if (def.id === 'pan') return 'Space';
  return displayShortcut(`tool.${def.id}`);
}

const BUTTON_CLASS =
  'flex size-10 shrink-0 items-center justify-center rounded-lg text-foreground/75 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring';
const PRESSED_CLASS =
  'bg-primary-soft text-primary-soft-foreground shadow-[inset_0_0_0_1px] shadow-primary/25 hover:bg-primary-soft hover:text-primary-soft-foreground';

function ToolButton({
  editor,
  def,
  active,
  selected,
  className,
}: {
  editor: Editor;
  def: ToolDefinition;
  active: ToolId;
  selected: ToolId;
  className?: string;
}) {
  // Nút sáng theo tool đang nhận sự kiện (gồm tool tạm thời khi giữ Space/Alt); tool đã chọn bên
  // dưới hiện viền nhẹ để biết sẽ quay về đâu khi nhả phím.
  const pressed = active === def.id;
  const underneath = selected === def.id && active !== selected;
  const label = toolLabel(def.id);
  const shortcut = toolShortcut(def);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          aria-keyshortcuts={shortcut?.replace('Mod', 'Control')}
          data-testid={`tool-${def.id}`}
          onClick={() => {
            editor.tools.setActive(def.id);
          }}
          className={cn(
            BUTTON_CLASS,
            pressed && PRESSED_CLASS,
            underneath && 'ring-1 ring-primary/40',
            className,
          )}
        >
          {createElement(toolIcon(def.icon))}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        <span>{label}</span>
        {shortcut !== undefined && <Kbd shortcut={shortcut} tone="inverted" />}
      </TooltipContent>
    </Tooltip>
  );
}

/** Nhóm tool dùng nút tách (mục 7.2): Chọn ▾, Tô ▾, Hình ▾, Làm nổi bật ▾. */
interface SplitGroup {
  tools: readonly ToolId[];
  remembered: () => ToolId;
  label: string;
  testId: string;
}

const SPLIT_GROUPS: readonly SplitGroup[] = [
  {
    tools: SELECT_TOOLS,
    remembered: selectVariant,
    label: t.tools.selectVariants,
    testId: 'tool-select-variants',
  },
  {
    tools: FILL_TOOLS,
    remembered: fillVariant,
    label: t.tools.fillVariants,
    testId: 'tool-fill-variants',
  },
  {
    // Chữ nhật, Elip, Đường thẳng, Đa giác dùng chung phím U: một nút, nhớ hình dùng gần nhất —
    // giữ tool island vừa khung 1280 px khi panel phải đang mở (GĐ7 thêm 3 tool chú thích).
    tools: SHAPE_TOOLS,
    remembered: shapeVariant,
    label: t.tools.shapeVariants,
    testId: 'tool-shape-variants',
  },
  {
    tools: FOCUS_TOOLS,
    remembered: focusVariant,
    label: t.tools.focusVariants,
    testId: 'tool-focus-variants',
  },
];

const SPLIT_TOOLS: readonly ToolId[] = SPLIT_GROUPS.flatMap((g) => g.tools);

/**
 * Nút tách (mục 7.2 "Chọn ▾"): click = biến thể đang nhớ, mũi tên = chọn biến thể (chọn đối tượng,
 * chữ nhật, elip, Lasso, Đũa thần; Tô màu, Gradient).
 */
function SplitButton({
  editor,
  group,
  active,
  selected,
}: {
  editor: Editor;
  group: SplitGroup;
  active: ToolId;
  selected: ToolId;
}) {
  const variant = group.tools.includes(selected) ? selected : group.remembered();
  return (
    <div className="flex items-center">
      <ToolButton
        editor={editor}
        def={getToolDefinition(variant)}
        active={active}
        selected={selected}
        className="rounded-r-none"
      />
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={group.label}
                data-testid={group.testId}
                className="flex h-10 w-4 shrink-0 items-center justify-center rounded-r-lg text-foreground/60 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronDown className="size-3" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{group.label}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="min-w-56">
          {group.tools.map((id) => {
            const def = getToolDefinition(id);
            const Icon = toolIcon(def.icon);
            const shortcut = toolShortcut(def);
            return (
              <DropdownMenuItem
                key={id}
                data-testid={`tool-option-${id}`}
                onSelect={() => {
                  editor.tools.setActive(id);
                }}
              >
                <Icon />
                <span className="flex-1">{toolLabel(id)}</span>
                {shortcut !== undefined && <Kbd shortcut={shortcut} />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * "Đảo nổi" công cụ (mục 7.1, 7.2): sinh từ registry tool — thêm tool mới không phải sửa file này.
 * Tooltip hiện phím tắt lấy từ Command Registry.
 */
export function ToolIsland({ editor, compact = false }: { editor: Editor; compact?: boolean }) {
  const active = useToolStore((s) => s.active);
  const selected = useToolStore((s) => s.selected);
  const groups = compact ? screenshotGroups() : groupTools();

  return (
    <div
      role="toolbar"
      aria-label={t.editor.toolsLabel}
      data-testid="tool-island"
      data-compact={compact ? 'true' : undefined}
      className="surface-glass pointer-events-auto flex h-[52px] max-w-full shrink-0 [scrollbar-width:none] items-center gap-0.5 overflow-x-auto rounded-xl px-1.5 shadow-island [&::-webkit-scrollbar]:hidden"
    >
      {groups.map((tools, gi) => (
        <Fragment key={tools[0]?.id ?? gi}>
          {gi > 0 && (
            <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-6" />
          )}
          <div
            role="group"
            aria-label={
              GROUP_LABELS[compact && gi === 1 ? 'annotate' : (tools[0]?.group ?? 'draw')]
            }
            className="flex items-center gap-0.5"
          >
            {tools.map((def) => {
              // Nút tách thay cho cả nhóm biến thể, đặt ở vị trí biến thể đầu tiên (giao diện
              // rút gọn không có biến thể).
              const split = compact ? undefined : SPLIT_GROUPS.find((g) => g.tools[0] === def.id);
              if (split) {
                return (
                  <SplitButton
                    key={def.id}
                    editor={editor}
                    group={split}
                    active={active}
                    selected={selected}
                  />
                );
              }
              if (!compact && SPLIT_TOOLS.includes(def.id)) return null;
              return (
                <ToolButton
                  key={def.id}
                  editor={editor}
                  def={def}
                  active={active}
                  selected={selected}
                />
              );
            })}
          </div>
        </Fragment>
      ))}
      <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-6" />
      <ColorControl editor={editor} />
    </div>
  );
}
