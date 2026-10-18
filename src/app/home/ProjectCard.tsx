import {
  Camera,
  Copy,
  Ellipsis,
  FileArchive,
  ImageIcon,
  Pencil,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { navigate } from '@/app/router';
import { duplicateProject, moveToTrash, needsBackup } from '@/app/projects';
import { relativeTime } from '@/app/shared/time';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { format, t } from '@/i18n';
import type { ProjectMeta } from '@/services/storage/schema';
import { useProjectStore } from '@/stores/project';
import { openDialog } from '@/stores/ui';

/** Thẻ project ở trang chủ (mục 7.3): ảnh thu nhỏ, tên, kích thước, lần sửa cuối, thao tác. */
export function ProjectCard({ project, now }: { project: ProjectMeta; now: number }) {
  const thumbnail = useProjectStore((s) => s.thumbnails[project.id]);
  const backup = needsBackup(project, now);
  const open = () => {
    navigate({ name: 'project', projectId: project.id });
  };

  return (
    <li
      className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-card transition-[box-shadow,border-color,transform] duration-150 ease-out-soft focus-within:border-primary/50 hover:-translate-y-px hover:border-primary/40 hover:shadow-card-hover"
      data-testid="project-card"
      data-project-id={project.id}
    >
      <button
        type="button"
        onClick={open}
        aria-label={format(t.projects.openNamed, { name: project.name })}
        className="flex flex-col text-left outline-none"
      >
        <span className="bg-checker relative flex aspect-[4/3] items-center justify-center overflow-hidden border-b">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt=""
              draggable={false}
              className="max-h-full max-w-full object-contain"
              data-testid="project-thumbnail"
            />
          ) : (
            <ImageIcon className="size-8 text-muted-foreground/60" aria-hidden="true" />
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5 px-3 pt-2.5 pr-10 pb-3">
          <span className="truncate font-medium" data-testid="project-card-name">
            {project.name}
          </span>
          <span className="truncate text-status text-muted-foreground">
            {format(t.home.sizeLabel, { width: project.width, height: project.height })} ·{' '}
            {format(t.projects.updated, { time: relativeTime(project.updatedAt, now) })}
          </span>
        </span>
      </button>

      <span className="pointer-events-none absolute top-2 left-2 flex gap-1">
        {project.mode === 'screenshot' && (
          <span className="flex items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 text-status shadow-card">
            <Camera className="size-3" aria-hidden="true" />
            {t.projects.screenshot}
          </span>
        )}
      </span>
      {backup && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-card/90 text-warning shadow-card"
              data-testid="backup-badge"
              aria-label={t.projects.notBackedUp}
              role="img"
            >
              <ShieldAlert className="size-3.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent>{t.projects.notBackedUp}</TooltipContent>
        </Tooltip>
      )}

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute right-1.5 bottom-2 text-muted-foreground"
            aria-label={format(t.projects.menuLabel, { name: project.name })}
            data-testid="project-menu"
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={open}>
            <ImageIcon />
            {t.projects.open}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="project-rename"
            onSelect={() => {
              openDialog({ kind: 'rename', projectId: project.id, name: project.name });
            }}
          >
            <Pencil />
            {t.projects.rename}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="project-duplicate"
            onSelect={() => {
              void duplicateProject(project);
            }}
          >
            <Copy />
            {t.projects.duplicate}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="project-export-paint"
            onSelect={() => {
              openDialog({ kind: 'paintExport', projectId: project.id });
            }}
          >
            <FileArchive />
            {t.projects.exportPaint}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            data-testid="project-trash"
            onSelect={() => {
              void moveToTrash(project);
            }}
          >
            <Trash2 />
            {t.projects.moveToTrash}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
