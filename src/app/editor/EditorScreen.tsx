import {
  ArrowLeft,
  Camera,
  Copy,
  Download,
  Ellipsis,
  FileArchive,
  LoaderCircle,
  Lock,
  Paintbrush,
  PanelRightOpen,
  Redo2,
  Save,
  Undo2,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ExportDialog } from '@/app/dialogs/ExportDialog';
import { AdjustmentsPanel } from '@/app/dialogs/AdjustmentsPanel';
import { CanvasSizeDialog, ResizeImageDialog } from '@/app/dialogs/ImageSizeDialogs';
import { QuotaDialog } from '@/app/dialogs/QuotaDialog';
import { connectEditor } from '@/app/engine-bridge';
import { TopBar } from '@/app/layout/TopBar';
import { navigate } from '@/app/router';
import { AppMark } from '@/app/shared/AppLogo';
import { IconButton } from '@/app/shared/IconButton';
import { Kbd } from '@/app/shared/Kbd';
import { ThemeMenu } from '@/app/shared/ThemeMenu';
import { repo } from '@/app/storage';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { format, t } from '@/i18n';
import { shortcutKeys } from '@/app/shared/shortcut';
import { platformFeatures } from '@/services/platform/features';
import { useDocumentStore } from '@/stores/document';
import { useProjectStore } from '@/stores/project';
import { openDialog, toast, useUiStore } from '@/stores/ui';
import { copyProjectImage, downloadProjectImage } from './actions';
import { CanvasContextMenu } from './CanvasContextMenu';
import { CanvasView } from './CanvasView';
import { ImageDropZone } from './ImageDropZone';
import { AdjustMenu } from './AdjustMenu';
import { ImageMenu } from './ImageMenu';
import { EditorStatusBar } from './EditorStatusBar';
import { historyLabel } from './historyLabel';
import { OptionsBar } from './OptionsBar';
import { RightPanel } from './panels/RightPanel';
import { PaintTargetDialog } from './PaintTargetDialog';
import { ProjectMissing } from './ProjectMissing';
import { SaveStatusIndicator } from './SaveStatusIndicator';
import {
  formatTime,
  loadProject,
  saveCurrentProject,
  setProjectMode,
  takeOverEditing,
  useCurrentProject,
  useCurrentProjectName,
  useProjectMode,
  type LoadResult,
  type OpenProject,
} from './session';
import { TextEditOverlay } from './TextEditOverlay';
import { ToolIsland } from './ToolIsland';
import { useEditorShortcuts } from './useEditorShortcuts';

interface EditorScreenProps {
  projectId: string;
}

function shortcutText(shortcut: string): string {
  return shortcutKeys(shortcut, platformFeatures.isApple).join('');
}

function ReadOnlyBanner() {
  const readOnly = useProjectStore((s) => s.readOnly);
  const takingOver = useProjectStore((s) => s.takingOver);
  if (!readOnly) return null;
  return (
    <div
      role="status"
      data-testid="read-only-banner"
      className="pointer-events-auto flex items-center gap-3 rounded-xl border border-warning/40 bg-card/95 px-3 py-2 text-sm shadow-card backdrop-blur"
    >
      <Lock className="size-4 shrink-0 text-warning" />
      <span>{t.storage.readOnlyBanner}</span>
      <Button
        size="sm"
        variant="outline"
        disabled={takingOver}
        data-testid="take-over"
        onClick={() => {
          void takeOverEditing();
        }}
      >
        {takingOver && <LoaderCircle className="animate-spin" />}
        {takingOver ? t.storage.takingOver : t.storage.takeOver}
      </Button>
    </div>
  );
}

/**
 * Nút chính của chế độ Screenshot (mục 7.3): Copy nổi bật (Ctrl+C), Tải xuống PNG, và nút chuyển
 * sang chế độ Paint đầy đủ.
 */
function ScreenshotActions({ project }: { project: OpenProject }) {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            data-testid="mode-paint"
            onClick={() => {
              void setProjectMode('paint');
            }}
          >
            <Paintbrush />
            <span className="hidden lg:inline">{t.screenshot.toPaintShort}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t.screenshot.toPaint}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            data-testid="download-image"
            onClick={() => {
              void downloadProjectImage(project);
            }}
          >
            <Download />
            <span className="hidden sm:inline">{t.screenshot.download}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t.screenshot.download}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            className="px-4"
            data-testid="copy-image"
            onClick={() => {
              copyProjectImage(project);
            }}
          >
            <Copy />
            {t.screenshot.copy}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="flex items-center gap-2">
          {t.actions.copy}
          <Kbd shortcut="Mod+C" tone="inverted" />
        </TooltipContent>
      </Tooltip>
    </>
  );
}

function Editor({ project }: { project: OpenProject }) {
  const { editor } = project;
  const history = useDocumentStore((s) => s.history);
  const name = useCurrentProjectName() ?? project.name;
  const status = useProjectStore((s) => s.saveStatus);
  const readOnly = useProjectStore((s) => s.readOnly);
  const panelOpen = useUiStore((s) => s.rightPanel.open);
  // Chế độ Screenshot (mục 7.3): tool island rút gọn, Copy + Tải xuống nổi bật, panel Làm đẹp.
  const mode = useProjectMode();
  const screenshot = mode === 'screenshot';

  const chromeRef = useRef<HTMLDivElement>(null);
  const commandContext = useMemo(() => ({ project, editor }), [project, editor]);

  useEffect(() => connectEditor(editor), [editor]);
  useEditorShortcuts(project);

  // Hết dung lượng: mở hộp thoại gợi ý giải phóng dung lượng (mục 6.6).
  useEffect(() => {
    if (status?.kind === 'quota') openDialog({ kind: 'quota' });
  }, [status?.kind]);

  // Tool island + options bar nổi trên canvas: Fit chừa phần bị che (chạy trước khi canvas mount).
  useLayoutEffect(() => {
    const chrome = chromeRef.current;
    if (!chrome) return;
    const update = () => {
      editor.viewport.setInsets({ top: chrome.offsetTop + chrome.offsetHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(chrome);
    return () => {
      observer.disconnect();
    };
  }, [editor]);

  const undoLabel = historyLabel(history.undoLabel);
  const redoLabel = historyLabel(history.redoLabel);

  return (
    <div
      className="flex h-full flex-col"
      data-testid="editor-screen"
      data-project-id={project.id}
      data-mode={mode}
    >
      <TopBar
        start={
          <>
            <IconButton
              label={t.editor.backToHome}
              icon={<ArrowLeft />}
              data-testid="back-to-home"
              onClick={() => {
                navigate({ name: 'home' });
              }}
            />
            <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
            <AppMark className="mx-1 size-6 shrink-0" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="min-w-0 truncate rounded-md px-1.5 py-1 font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="project-name"
                  aria-label={`${t.editor.renameLabel}: ${name}`}
                  onClick={() => {
                    openDialog({ kind: 'rename', projectId: project.id, name });
                  }}
                >
                  {name}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t.editor.renameLabel}</TooltipContent>
            </Tooltip>
            <SaveStatusIndicator project={project} />
          </>
        }
        center={
          <>
            <IconButton
              label={undoLabel ? format(t.actions.undoNamed, { label: undoLabel }) : t.actions.undo}
              shortcut="Mod+Z"
              icon={<Undo2 />}
              disabled={!history.canUndo || readOnly}
              data-testid="undo"
              onClick={() => {
                editor.undo();
              }}
            />
            <IconButton
              label={redoLabel ? format(t.actions.redoNamed, { label: redoLabel }) : t.actions.redo}
              shortcut="Mod+Shift+Z"
              icon={<Redo2 />}
              disabled={!history.canRedo || readOnly}
              data-testid="redo"
              onClick={() => {
                editor.redo();
              }}
            />
            {!screenshot && (
              <>
                <Separator
                  orientation="vertical"
                  className="mx-1 data-[orientation=vertical]:h-5"
                />
                <ImageMenu context={commandContext} disabled={readOnly} />
                <AdjustMenu context={commandContext} disabled={readOnly} />
              </>
            )}
          </>
        }
        end={
          <>
            {screenshot ? (
              <ScreenshotActions project={project} />
            ) : (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid="copy-image"
                      onClick={() => {
                        copyProjectImage(project);
                      }}
                    >
                      <Copy />
                      <span className="hidden sm:inline">{t.actions.copy}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="flex items-center gap-2">
                    {t.actions.copy}
                    <Kbd shortcut="Mod+C" tone="inverted" />
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      data-testid="export-image"
                      onClick={() => {
                        openDialog({ kind: 'export' });
                      }}
                    >
                      <Download />
                      <span className="hidden sm:inline">{t.actions.exportShort}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="flex items-center gap-2">
                    {t.actions.export}
                    <Kbd shortcut="Mod+Shift+S" tone="inverted" />
                  </TooltipContent>
                </Tooltip>
              </>
            )}
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.editor.moreActions}
                      data-testid="editor-menu"
                    >
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t.editor.moreActions}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem
                  disabled={readOnly || status?.kind === 'unavailable'}
                  data-testid="menu-save"
                  onSelect={() => {
                    void saveCurrentProject().then((ok) => {
                      if (ok) toast('success', t.storage.savedToast);
                    });
                  }}
                >
                  <Save />
                  {t.actions.save}
                  <DropdownMenuShortcut>{shortcutText('Mod+S')}</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    openDialog({ kind: 'export' });
                  }}
                >
                  <Download />
                  {t.actions.export}
                  <DropdownMenuShortcut>{shortcutText('Mod+Shift+S')}</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid="menu-export-paint"
                  onSelect={() => {
                    openDialog({ kind: 'paintExport', projectId: project.id });
                  }}
                >
                  <FileArchive />
                  {t.projects.exportPaint}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-testid="menu-mode"
                  onSelect={() => {
                    void setProjectMode(screenshot ? 'paint' : 'screenshot');
                  }}
                >
                  {screenshot ? <Paintbrush /> : <Camera />}
                  {screenshot ? t.screenshot.toPaint : t.screenshot.toScreenshot}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
            {!panelOpen && (
              <IconButton
                label={t.panel.expand}
                icon={<PanelRightOpen />}
                data-testid="panel-expand"
                onClick={() => {
                  useUiStore.getState().setRightPanel({ open: true });
                }}
              />
            )}
            <ThemeMenu />
          </>
        }
      />

      <div className="flex min-h-0 flex-1">
        <main
          id="main"
          tabIndex={-1}
          aria-label={t.editor.workspaceLabel}
          data-testid="workspace"
          className="relative min-h-0 flex-1 overflow-hidden bg-workspace outline-none"
        >
          <CanvasView editor={editor} />
          <TextEditOverlay editor={editor} />
          <ImageDropZone project={project} />
          <CanvasContextMenu context={commandContext} />
          <AdjustmentsPanel editor={editor} />
          <div
            ref={chromeRef}
            className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-col items-center gap-2 px-3"
          >
            <ReadOnlyBanner />
            {!readOnly && <ToolIsland editor={editor} compact={screenshot} />}
            {!readOnly && <OptionsBar editor={editor} />}
          </div>
        </main>
        <RightPanel editor={editor} mode={mode} />
      </div>

      <EditorStatusBar editor={editor} />
      <PaintTargetDialog editor={editor} />
      <ExportDialog project={project} />
      <ResizeImageDialog editor={editor} />
      <CanvasSizeDialog editor={editor} />
      <QuotaDialog projectId={project.id} />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center bg-workspace p-6">{children}</div>;
}

function CorruptProject({
  projectId,
  checkpointAt,
  onRetry,
}: {
  projectId: string;
  checkpointAt: number | null;
  onRetry: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Centered>
      <div
        className="flex max-w-md flex-col items-center gap-3 text-center"
        data-testid="project-corrupt"
      >
        <h1 className="text-lg font-semibold">{t.editor.corruptTitle}</h1>
        <p className="text-muted-foreground">
          {checkpointAt !== null
            ? format(t.editor.corruptBody, { time: formatTime(checkpointAt) })
            : t.editor.corruptNoCheckpoint}
        </p>
        <div className="mt-2 flex gap-2">
          {checkpointAt !== null && (
            <Button
              disabled={busy}
              data-testid="open-checkpoint"
              onClick={() => {
                setBusy(true);
                repo.restoreCheckpoint(projectId).then(onRetry, () => {
                  setBusy(false);
                  toast('error', t.projects.actionFailed);
                });
              }}
            >
              {t.editor.openCheckpoint}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              navigate({ name: 'home' }, { replace: true });
            }}
          >
            {t.notFound.goHome}
          </Button>
        </div>
      </div>
    </Centered>
  );
}

/**
 * Editor (mục 7.2): mở project từ IndexedDB theo hash route, rồi hiện top bar, tool island +
 * options bar nổi trên canvas, ô gõ chữ, menu chuột phải, panel phải (Layers/History), thanh
 * trạng thái.
 */
export function EditorScreen({ projectId }: EditorScreenProps) {
  const [result, setResult] = useState<{ id: string; value: LoadResult } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadProject(projectId).then((value) => {
      if (!cancelled) setResult({ id: projectId, value });
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, attempt]);

  // Project đang mở thật sự (có thể được mở lại, vd. sau khi chuyển quyền chỉnh sửa sang tab này).
  const live = useCurrentProject();
  const current = result?.id === projectId ? result.value : null;
  const transitioning = current?.status === 'ready' && live?.id !== projectId;
  if (!current || transitioning) {
    return (
      <Centered>
        <p
          className="flex items-center gap-2 text-muted-foreground"
          data-testid="project-loading"
          role="status"
        >
          <LoaderCircle className="size-5 animate-spin" />
          {t.editor.loading}
        </p>
      </Centered>
    );
  }
  switch (current.status) {
    case 'ready': {
      const project = live?.id === projectId ? live : current.project;
      return <Editor key={project.instance} project={project} />;
    }
    case 'missing':
      return <ProjectMissing />;
    case 'corrupt':
      return (
        <CorruptProject
          projectId={projectId}
          checkpointAt={current.checkpointAt}
          onRetry={() => {
            setResult(null);
            setAttempt((n) => n + 1);
          }}
        />
      );
    case 'failed':
      return (
        <Centered>
          <div
            className="flex max-w-md flex-col items-center gap-3 text-center"
            data-testid="project-failed"
          >
            <h1 className="text-lg font-semibold">{t.editor.failedTitle}</h1>
            <p className="text-muted-foreground">{t.editor.failedBody}</p>
            <div className="mt-2 flex gap-2">
              <Button
                onClick={() => {
                  setResult(null);
                  setAttempt((n) => n + 1);
                }}
              >
                {t.editor.retry}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  navigate({ name: 'home' }, { replace: true });
                }}
              >
                {t.notFound.goHome}
              </Button>
            </div>
          </div>
        </Centered>
      );
  }
}
