import {
  ArrowLeft,
  Camera,
  CircleHelp,
  Copy,
  Download,
  Ellipsis,
  EyeOff,
  FileArchive,
  HardDriveDownload,
  Keyboard,
  LoaderCircle,
  Lock,
  Maximize,
  Paintbrush,
  PanelRightOpen,
  Redo2,
  Save,
  Settings,
  Undo2,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ExportDialog } from '@/app/dialogs/ExportDialog';
import { AdjustmentsPanel } from '@/app/dialogs/AdjustmentsPanel';
import { CanvasSizeDialog, ResizeImageDialog } from '@/app/dialogs/ImageSizeDialogs';
import { QuotaDialog } from '@/app/dialogs/QuotaDialog';
import { connectEditor } from '@/app/engine-bridge';
import { FullscreenButton, PaletteButton } from '@/app/layout/AppButtons';
import { TopBar } from '@/app/layout/TopBar';
import { runCommand } from '@/commands';
import { getGlobalCommand } from '@/commands/global';
import { openHelp } from '@/app/help/open';
import { navigate } from '@/app/router';
import { AppMark } from '@/app/shared/AppLogo';
import { IconButton } from '@/app/shared/IconButton';
import { Kbd } from '@/app/shared/Kbd';
import { ThemeMenu } from '@/app/shared/ThemeMenu';
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
import { useSettingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';
import { openDialog, toast, useUiStore } from '@/stores/ui';
import { copyProjectImage, downloadProjectImage } from './actions';
import { CanvasContextMenu } from './CanvasContextMenu';
import { MiniToolbar } from './MiniToolbar';
import { RULER_SIZE } from './rulerTicks';
import { Rulers } from './Rulers';
import { ViewMenu } from './ViewMenu';
import { CanvasView } from './CanvasView';
import { ImageDropZone } from './ImageDropZone';
import { AdjustMenu } from './AdjustMenu';
import { ImageMenu } from './ImageMenu';
import { EditorStatusBar } from './EditorStatusBar';
import { historyLabel } from './historyLabel';
import { OptionsBar } from './OptionsBar';
import { setPanelVisible, usePanelVisibility } from './panelState';
import { RightPanel } from './panels/RightPanel';
import { PaintTargetDialog } from './PaintTargetDialog';
import { ProjectMissing } from './ProjectMissing';
import { CheckpointRecovery } from './CheckpointRecovery';
import { SaveStatusIndicator } from './SaveStatusIndicator';
import {
  formatTime,
  loadProject,
  saveCurrentProject,
  setProjectMode,
  takeOverEditing,
  useCurrentProject,
  useCurrentProjectName,
  useProjectFileLink,
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
  const project = useCurrentProject();
  const readOnly = useProjectStore((s) => s.readOnly);
  const takingOver = useProjectStore((s) => s.takingOver);
  if (!readOnly) return null;
  if (project?.recovery)
    return (
      <div
        role="status"
        data-testid="recovery-protected"
        className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-card/95 px-3 py-2 text-sm shadow-card"
      >
        <CheckpointRecovery
          projectId={project.id}
          checkpointAt={project.recovery.checkpointAt}
          project={project}
        />
      </div>
    );
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

/** Nút nổi duy nhất trong Zen mode (mục 7.6). */
function ZenExit() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="zen-exit"
          className="surface-glass absolute top-3 right-3 z-20 shadow-island"
          onClick={() => {
            useUiStore.getState().setZen(false);
          }}
        >
          <EyeOff />
          {t.view.zenExit}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {format(t.view.zenHint, { key: shortcutText('\\') })}
      </TooltipContent>
    </Tooltip>
  );
}

function Editor({ project }: { project: OpenProject }) {
  const { editor } = project;
  const history = useDocumentStore((s) => s.history);
  const name = useCurrentProjectName() ?? project.name;
  const status = useProjectStore((s) => s.saveStatus);
  const readOnly = useProjectStore((s) => s.readOnly);
  const { docked: panelDocked, visible: panelOpen } = usePanelVisibility();
  // Zen mode (mục 7.6): chỉ còn canvas và nút thoát.
  const zen = useUiStore((s) => s.zen);
  const fullscreen = useUiStore((s) => s.fullscreen);
  const fileLink = useProjectFileLink();
  // Thước đo (mục 2, P2): ẩn trong Zen mode.
  const rulers = useSettingsStore((s) => s.view.rulers) && !zen;
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
      // Tọa độ canvas: khi bật thước, canvas lùi xuống RULER_SIZE so với vùng làm việc.
      const top = chrome.offsetTop + chrome.offsetHeight - (rulers ? RULER_SIZE : 0);
      editor.viewport.setInsets({ top: zen ? 0 : Math.max(0, top) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(chrome);
    return () => {
      observer.disconnect();
    };
  }, [editor, zen, rulers]);

  // Laptop (mục 7.5): ngăn panel nổi tự đóng khi bắt đầu vẽ trên canvas.
  useEffect(() => {
    if (panelDocked || !panelOpen) return;
    const host = document.querySelector('[data-testid="canvas-view"]');
    const close = () => {
      setPanelVisible(false);
    };
    host?.addEventListener('pointerdown', close);
    return () => {
      host?.removeEventListener('pointerdown', close);
    };
  }, [panelDocked, panelOpen]);

  // Rời editor: thoát Zen mode (trang chủ không có nút thoát).
  useEffect(
    () => () => {
      useUiStore.getState().setZen(false);
    },
    [],
  );

  const undoLabel = historyLabel(history.undoLabel);
  const redoLabel = historyLabel(history.redoLabel);

  return (
    <div
      className="flex h-full flex-col"
      data-testid="editor-screen"
      data-project-id={project.id}
      data-mode={mode}
      data-zen={zen || undefined}
    >
      {!zen && (
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
                label={
                  undoLabel ? format(t.actions.undoNamed, { label: undoLabel }) : t.actions.undo
                }
                shortcut="Mod+Z"
                icon={<Undo2 />}
                disabled={!history.canUndo || readOnly}
                data-testid="undo"
                onClick={() => {
                  editor.undo();
                }}
              />
              <IconButton
                label={
                  redoLabel ? format(t.actions.redoNamed, { label: redoLabel }) : t.actions.redo
                }
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
                  <ViewMenu context={commandContext} />
                </>
              )}
              <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
              <PaletteButton />
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
                        <span className="hidden xl:inline">{t.actions.copy}</span>
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
              <DropdownMenu modal={false}>
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
                  <DropdownMenuItem
                    data-testid="menu-save-file"
                    disabled={readOnly}
                    onSelect={() => {
                      runCommand('file.saveToFile', commandContext);
                    }}
                  >
                    <HardDriveDownload />
                    <span className="flex-1">{t.fileSave.saveAs}</span>
                  </DropdownMenuItem>
                  {fileLink && (
                    <p
                      className="px-2 pb-1 text-xs text-muted-foreground"
                      data-testid="linked-file"
                    >
                      {format(t.fileSave.linked, { file: fileLink.name })}
                    </p>
                  )}
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
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    data-testid="menu-zen"
                    onSelect={() => {
                      runCommand('view.zen', commandContext);
                    }}
                  >
                    <EyeOff />
                    {t.view.zen}
                    <DropdownMenuShortcut>{shortcutText('\\')}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="menu-fullscreen"
                    onSelect={() => {
                      getGlobalCommand('view.fullscreen')?.run();
                    }}
                  >
                    <Maximize />
                    {fullscreen ? t.view.exitFullscreen : t.view.fullscreen}
                    <DropdownMenuShortcut>{shortcutText('Shift+F')}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="menu-shortcuts"
                    onSelect={() => {
                      openDialog({ kind: 'shortcuts' });
                    }}
                  >
                    <Keyboard />
                    {t.shortcutsDialog.title}
                    <DropdownMenuShortcut>?</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="menu-help"
                    onSelect={() => {
                      openHelp();
                    }}
                  >
                    <CircleHelp />
                    {t.help.title}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="menu-settings"
                    onSelect={() => {
                      openDialog({ kind: 'settings' });
                    }}
                  >
                    <Settings />
                    {t.settings.title}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
              <FullscreenButton />
              {!panelOpen && (
                <IconButton
                  label={t.panel.expand}
                  icon={<PanelRightOpen />}
                  data-testid="panel-expand"
                  onClick={() => {
                    setPanelVisible(true);
                  }}
                />
              )}
              <ThemeMenu />
            </>
          }
        />
      )}

      <div className="relative flex min-h-0 flex-1">
        <main
          id="main"
          tabIndex={-1}
          aria-label={t.editor.workspaceLabel}
          data-testid="workspace"
          className="relative min-h-0 flex-1 overflow-hidden bg-workspace outline-none"
        >
          {rulers && <Rulers editor={editor} />}
          {/* Canvas và các lớp đặt theo tọa độ canvas (ô gõ chữ, menu, mini toolbar) lùi vào khi bật thước. */}
          <div
            className="absolute inset-0"
            style={rulers ? { top: RULER_SIZE, left: RULER_SIZE } : undefined}
          >
            <CanvasView editor={editor} />
            <TextEditOverlay editor={editor} />
            <CanvasContextMenu context={commandContext} />
            {!zen && !readOnly && <MiniToolbar context={commandContext} />}
          </div>
          <ImageDropZone project={project} />
          <AdjustmentsPanel editor={editor} />
          <div
            ref={chromeRef}
            className={cn(
              '@container pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-col items-center gap-2 px-3',
              rulers && 'top-8',
            )}
          >
            <ReadOnlyBanner />
            {!readOnly && !zen && (
              // Options bar rộng cố định bằng tool island, căn giữa thẳng hàng: đổi lựa chọn không làm
              // thanh co giãn hay xê dịch. Ô bọc bỏ qua bề rộng nội dung của options bar (contain) nên
              // cột rộng theo tool island; nội dung dài thì xuống dòng.
              // Island rút gọn của Screenshot quá hẹp: options bar rộng bằng island đầy đủ (880 px).
              <div className="flex max-w-full flex-col gap-2">
                <ToolIsland editor={editor} compact={screenshot} />
                <div className="[contain:inline-size]">
                  <div
                    className={cn(
                      'ml-[calc((100%-var(--bar-width))/2)] w-(--bar-width) [--bar-width:100%]',
                      screenshot && '[--bar-width:min(max(100%,880px),100cqw)]',
                    )}
                  >
                    <OptionsBar editor={editor} />
                  </div>
                </div>
              </div>
            )}
          </div>
          {zen && <ZenExit />}
        </main>
        {!zen && <RightPanel editor={editor} mode={mode} />}
      </div>

      {!zen && <EditorStatusBar editor={editor} />}
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
}: {
  projectId: string;
  checkpointAt: number | null;
}) {
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
          <CheckpointRecovery projectId={projectId} checkpointAt={checkpointAt} />
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
    const controller = new AbortController();
    void loadProject(projectId, { signal: controller.signal }).then((value) => {
      if (!cancelled && value.status === 'blocked') {
        navigate({ name: 'home' }, { replace: true });
        return;
      }
      if (!cancelled) setResult({ id: projectId, value });
    });
    return () => {
      cancelled = true;
      controller.abort();
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
    case 'cancelled':
    case 'blocked':
      return null;
    case 'ready': {
      const project = live?.id === projectId ? live : current.project;
      return <Editor key={project.instance} project={project} />;
    }
    case 'missing':
      return <ProjectMissing />;
    case 'corrupt':
      return <CorruptProject projectId={projectId} checkpointAt={current.checkpointAt} />;
    case 'failed':
      return (
        <Centered>
          <div
            className="flex max-w-md flex-col items-center gap-3 text-center"
            data-testid="project-failed"
          >
            <h1 className="text-lg font-semibold">{t.editor.failedTitle}</h1>
            <p className="text-muted-foreground">{current.reason ?? t.editor.failedBody}</p>
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
