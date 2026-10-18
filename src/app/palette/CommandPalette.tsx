import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import { useEffect, useMemo, type ReactNode } from 'react';
import { getCurrentProject } from '@/app/editor/session';
import { toolIcon } from '@/app/editor/toolIcons';
import { refreshProjects } from '@/app/projects';
import { navigate } from '@/app/router';
import { Kbd } from '@/app/shared/Kbd';
import {
  COMMANDS,
  displayShortcut,
  isEnabled,
  runCommand,
  type AppCommand,
  type CommandContext,
} from '@/commands';
import { GLOBAL_COMMANDS } from '@/commands/global';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { format, t } from '@/i18n';
import { useProjectStore } from '@/stores/project';
import { useUiStore } from '@/stores/ui';
import { paletteScore } from './score';

/** Số project gần đây hiện trong palette. */
const RECENT_PROJECTS = 8;

/** Lệnh chọn nhóm tool (M, G, U) dùng icon của biến thể đầu. */
const TOOL_ICON_ALIAS: Readonly<Record<string, string>> = {
  marquee: 'marquee-rect',
  fill: 'bucket',
  shapes: 'rect',
};

interface PaletteItem {
  id: string;
  label: string;
  shortcut?: string;
  disabled: boolean;
  icon?: ReactNode;
  run: () => void;
}

interface PaletteGroup {
  heading: string;
  items: PaletteItem[];
}

function groupOf(command: AppCommand): 'tools' | 'filters' | 'view' | 'commands' {
  if (command.id.startsWith('tool.')) return 'tools';
  if (command.id.startsWith('filter.')) return 'filters';
  if (command.id.startsWith('view.')) return 'view';
  return 'commands';
}

function editorGroups(ctx: CommandContext): Record<ReturnType<typeof groupOf>, PaletteItem[]> {
  const groups: Record<ReturnType<typeof groupOf>, PaletteItem[]> = {
    tools: [],
    filters: [],
    view: [],
    commands: [],
  };
  const seen = new Set<string>();
  for (const command of COMMANDS) {
    if (command.palette === false) continue;
    const label = command.label();
    // Hai lệnh cùng nhãn (vd. Enter: áp dụng biến đổi / sửa chữ): giữ lệnh đang dùng được.
    const key = `${groupOf(command)}:${label}`;
    const enabled = isEnabled(command, ctx);
    if (seen.has(key) && !enabled) continue;
    seen.add(key);
    const tool = command.id.startsWith('tool.') ? command.id.slice(5) : null;
    const Icon = tool ? toolIcon(TOOL_ICON_ALIAS[tool] ?? tool) : null;
    groups[groupOf(command)].push({
      id: command.id,
      label,
      shortcut: displayShortcut(command.id),
      disabled: !enabled,
      icon: Icon ? <Icon /> : undefined,
      run: () => {
        runCommand(command.id, ctx);
      },
    });
  }
  return groups;
}

function buildGroups(ctx: CommandContext | null, projects: PaletteItem[]): PaletteGroup[] {
  const app: PaletteItem[] = [];
  const view: PaletteItem[] = [];
  for (const command of GLOBAL_COMMANDS) {
    // Lệnh cấp ứng dụng không dùng được ở màn hình này (Về trang chủ khi đang ở trang chủ): ẩn.
    if (command.id === 'app.commandPalette' || (command.enabled && !command.enabled())) continue;
    const item: PaletteItem = {
      id: command.id,
      label: command.label(),
      shortcut: command.shortcuts?.[0],
      disabled: false,
      run: command.run,
    };
    (command.id.startsWith('view.') ? view : app).push(item);
  }
  if (!ctx) {
    return [
      { heading: t.palette.groupProjects, items: projects },
      { heading: t.palette.groupView, items: view },
      { heading: t.palette.groupApp, items: app },
    ];
  }
  const editor = editorGroups(ctx);
  return [
    { heading: t.palette.groupTools, items: editor.tools },
    { heading: t.palette.groupCommands, items: editor.commands },
    { heading: t.palette.groupFilters, items: editor.filters },
    { heading: t.palette.groupView, items: [...editor.view, ...view] },
    { heading: t.palette.groupApp, items: app },
    { heading: t.palette.groupProjects, items: projects },
  ];
}

/**
 * Command Palette (mục 7.6, Ctrl+K hoặc `/`): gõ để tìm mọi lệnh, công cụ, bộ lọc, project gần
 * đây; phím tắt hiện bên cạnh để người dùng học dần. Lệnh lấy từ Command Registry và lệnh cấp ứng
 * dụng — không có danh sách riêng.
 */
export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const projects = useProjectStore((s) => s.projects);

  useEffect(() => {
    if (open) void refreshProjects();
  }, [open]);

  const groups = useMemo(() => {
    if (!open) return [];
    const current = getCurrentProject();
    const ctx = current ? { project: current, editor: current.editor } : null;
    const recent = projects
      .filter((p) => p.deletedAt === undefined && p.id !== current?.id)
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, RECENT_PROJECTS)
      .map<PaletteItem>((p) => ({
        id: `project:${p.id}`,
        label: format(t.palette.openProject, { name: p.name }),
        disabled: false,
        run: () => {
          navigate({ name: 'project', projectId: p.id });
        },
      }));
    return buildGroups(ctx, recent).filter((group) => group.items.length > 0);
  }, [open, projects]);

  const select = (item: PaletteItem) => {
    setOpen(false);
    // Chạy sau khi palette đóng và trả focus: lệnh mở dialog khác không bị dialog đang đóng chặn.
    window.setTimeout(item.run, 0);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        data-testid="command-palette"
      >
        <DialogTitle className="sr-only">{t.palette.title}</DialogTitle>
        <DialogDescription className="sr-only">{t.palette.placeholder}</DialogDescription>
        <Command
          label={t.palette.title}
          loop
          filter={paletteScore}
          className="flex max-h-[min(28rem,70vh)] flex-col"
        >
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Command.Input
              autoFocus
              placeholder={t.palette.placeholder}
              data-testid="palette-input"
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="min-h-0 flex-1 overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t.palette.empty}
            </Command.Empty>
            {groups.map((group) => (
              <Command.Group
                key={group.heading}
                heading={group.heading}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {group.items.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={item.id}
                    keywords={[item.label]}
                    disabled={item.disabled}
                    data-testid={`palette-item-${item.id}`}
                    onSelect={() => {
                      select(item);
                    }}
                    className="flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none select-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
                  >
                    {item.icon}
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.disabled && (
                      <span className="text-xs text-muted-foreground">
                        {t.palette.disabledHint}
                      </span>
                    )}
                    {item.shortcut && <Kbd shortcut={item.shortcut} />}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
