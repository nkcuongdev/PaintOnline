import { ArrowLeft, FolderOpen, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ConfirmDialog } from '@/app/dialogs/ConfirmDialog';
import { deleteForever, emptyTrash, restoreProject } from '@/app/projects';
import { daysLeft, relativeTime } from '@/app/shared/time';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format, t } from '@/i18n';
import { TRASH_RETENTION_MS, type ProjectMeta } from '@/services/storage/schema';
import { selectActiveProjects, selectTrashedProjects, useProjectStore } from '@/stores/project';
import { ProjectCard } from './ProjectCard';
import { StorageMeter } from './StorageMeter';

type SortKey = 'updated' | 'created' | 'name' | 'size';
const SORT_KEYS: readonly SortKey[] = ['updated', 'created', 'name', 'size'];

const collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });

function sortProjects(projects: readonly ProjectMeta[], key: SortKey): ProjectMeta[] {
  const list = [...projects];
  switch (key) {
    case 'updated':
      return list.sort((a, b) => b.updatedAt - a.updatedAt);
    case 'created':
      return list.sort((a, b) => b.createdAt - a.createdAt);
    case 'name':
      return list.sort((a, b) => collator.compare(a.name, b.name));
    case 'size':
      return list.sort((a, b) => b.sizeBytes - a.sizeBytes);
  }
}

/** Bỏ dấu để tìm "anh dan" khớp "Ảnh dán". */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/** Mốc thời gian cho "x phút trước", cập nhật mỗi phút. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  return now;
}

/** Lưới project gần đây (mục 7.3): tìm kiếm, sắp xếp, mục Thùng rác. */
export function ProjectsSection() {
  const active = useProjectStore(useShallow(selectActiveProjects));
  const trashed = useProjectStore(useShallow(selectTrashedProjects));
  const loaded = useProjectStore((s) => s.listLoaded);
  const [view, setView] = useState<'projects' | 'trash'>('projects');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  const now = useNow();

  const visible = useMemo(() => {
    const q = fold(query.trim());
    const filtered = q ? active.filter((p) => fold(p.name).includes(q)) : active;
    return sortProjects(filtered, sort);
  }, [active, query, sort]);

  if (view === 'trash') {
    return (
      <TrashView
        projects={trashed}
        now={now}
        onBack={() => {
          setView('projects');
        }}
      />
    );
  }

  return (
    <section aria-labelledby="recent-title" data-testid="projects-section">
      <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
        <h2 id="recent-title" className="mr-auto text-[0.875rem] font-semibold">
          {t.home.recentSection}
          {active.length > 0 && (
            <span className="ml-2 font-normal text-muted-foreground">
              {format(t.projects.count, { n: active.length })}
            </span>
          )}
        </h2>
        {active.length > 0 && (
          <>
            <label className="relative">
              <span className="sr-only">{t.projects.searchLabel}</span>
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                data-testid="project-search"
                placeholder={t.projects.searchPlaceholder}
                onChange={(e) => {
                  setQuery(e.target.value);
                }}
                className="h-8 w-48 pl-8"
              />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="sr-only sm:not-sr-only">{t.projects.sortLabel}</span>
              <select
                value={sort}
                data-testid="project-sort"
                onChange={(e) => {
                  setSort(e.target.value as SortKey);
                }}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {SORT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {t.projects.sort[key]}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          data-testid="open-trash"
          onClick={() => {
            setView('trash');
          }}
        >
          <Trash2 />
          {trashed.length > 0
            ? format(t.projects.trashCount, { n: trashed.length })
            : t.projects.trash}
        </Button>
      </div>

      {!loaded ? null : active.length === 0 ? (
        <div
          data-testid="recent-empty"
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-card/50 px-6 py-12 text-center"
        >
          <span className="mb-1 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <FolderOpen className="size-5" />
          </span>
          <p className="font-medium">{t.home.recentEmptyTitle}</p>
          <p className="max-w-sm text-muted-foreground">{t.home.recentEmptyBody}</p>
        </div>
      ) : visible.length === 0 ? (
        <p className="px-1 py-8 text-center text-muted-foreground">
          {format(t.projects.noMatch, { query: query.trim() })}
        </p>
      ) : (
        <ul
          className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-4"
          data-testid="project-grid"
        >
          {visible.map((project) => (
            <ProjectCard key={project.id} project={project} now={now} />
          ))}
        </ul>
      )}
      <StorageMeter />
    </section>
  );
}

function TrashView({
  projects,
  now,
  onBack,
}: {
  projects: readonly ProjectMeta[];
  now: number;
  onBack: () => void;
}) {
  const [confirm, setConfirm] = useState<
    { kind: 'one'; project: ProjectMeta } | { kind: 'all' } | null
  >(null);
  const sorted = [...projects].sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

  return (
    <section aria-labelledby="trash-title" data-testid="trash-view">
      <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="close-trash">
          <ArrowLeft />
          {t.projects.backToProjects}
        </Button>
        <h2 id="trash-title" className="mr-auto text-[0.875rem] font-semibold">
          {t.projects.trash}
        </h2>
        {projects.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            data-testid="empty-trash"
            onClick={() => {
              setConfirm({ kind: 'all' });
            }}
          >
            <Trash2 />
            {t.projects.emptyTrash}
          </Button>
        )}
      </div>
      <p className="mb-3 px-1 text-sm text-muted-foreground">{t.projects.trashHint}</p>
      {sorted.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card/50 px-6 py-10 text-center text-muted-foreground">
          {t.projects.trashEmpty}
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-2xl border bg-card shadow-card">
          {sorted.map((project) => {
            const left = daysLeft(project.deletedAt ?? now, TRASH_RETENTION_MS, now);
            return (
              <li
                key={project.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
                data-testid="trash-item"
                data-project-id={project.id}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{project.name}</span>
                  <span className="text-status text-muted-foreground">
                    {relativeTime(project.deletedAt ?? now, now)} ·{' '}
                    {left > 0 ? format(t.projects.daysLeft, { n: left }) : t.projects.lastDay}
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="trash-restore"
                  onClick={() => {
                    void restoreProject(project);
                  }}
                >
                  <RotateCcw />
                  {t.projects.restore}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  data-testid="trash-delete"
                  onClick={() => {
                    setConfirm({ kind: 'one', project });
                  }}
                >
                  {t.projects.deleteForever}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={confirm !== null}
        destructive
        title={
          confirm?.kind === 'one'
            ? format(t.projects.confirmPurgeTitle, { name: confirm.project.name })
            : t.projects.confirmEmptyTitle
        }
        body={
          confirm?.kind === 'one'
            ? t.projects.confirmPurgeBody
            : format(t.projects.confirmEmptyBody, { n: projects.length })
        }
        confirmLabel={confirm?.kind === 'one' ? t.projects.deleteForever : t.projects.emptyTrash}
        onCancel={() => {
          setConfirm(null);
        }}
        onConfirm={() => {
          const target = confirm;
          setConfirm(null);
          if (target?.kind === 'one') void deleteForever(target.project);
          else void emptyTrash();
        }}
      />
      <StorageMeter />
    </section>
  );
}
