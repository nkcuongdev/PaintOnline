import { useSyncExternalStore } from 'react';
import {
  codec,
  ensurePersistence,
  initStorage,
  refreshStorageEstimate,
  repo,
  sessionTracker,
  settings,
  storageReady,
} from '@/app/storage';
import type { Editor } from '@/engine/core/Editor';
import type { DocumentSpec } from '@/engine/core/Document';
import type {
  Color,
  ID,
  NoticeCode,
  ToolId,
  ToolOptionsState,
  ViewData,
} from '@/engine/core/types';
import { format, t } from '@/i18n';
import { Autosave } from '@/services/storage/autosave';
import { broadcast, onChannelMessage, TAB_ID } from '@/services/storage/channel';
import { acquireProjectLock, type ProjectLock } from '@/services/storage/locks';
import {
  CorruptProjectError,
  ProjectNotFoundError,
  type LoadedProject,
} from '@/services/storage/projectRepo';
import { isStorageLow } from '@/services/storage/quota';
import {
  decodeLayerImages,
  documentSpecFromRecord,
  savedLayerRevs,
} from '@/services/storage/restore';
import { hasUnsavedWork, type SaveStatus } from '@/services/storage/saveStatus';
import { recordError, setInputProvider } from '@/services/diagnostics/errorLog';
import { useSettingsStore } from '@/stores/settings';
import type { ProjectMode, ProjectFileLink } from '@/services/storage/schema';
import { detectMemoryConfig } from '@/services/platform/deviceTier';
import { DecodeBudgetError } from '@/services/io/decodeBudget';
import { platformFeatures } from '@/services/platform/features';
import { sharedWorkerPool } from '@/services/workers/pool';
import { useProjectStore } from '@/stores/project';
import { toast } from '@/stores/ui';

/**
 * Vòng đời project đang mở (mục 6.6): tạo / mở từ IndexedDB / đóng, khóa ghi theo tab (Web
 * Locks), autosave, cài đặt, phiên làm việc. Mỗi lúc chỉ giữ một Editor để MemoryBudget phản ánh
 * đúng bộ nhớ của tab.
 */
export interface OpenProject {
  /** Số thứ tự lần mở trong tab (mở lại cùng project = Editor mới). */
  instance: number;
  id: string;
  name: string;
  mode: ProjectMode;
  /** Bảng màu project (màu chủ đạo của ảnh import gần nhất — mục 7.6). */
  palette: readonly Color[];
  /** File .paint gắn với project ("Lưu ra file" — Ctrl+S ghi đè vào đó). */
  fileLink: ProjectFileLink | null;
  editor: Editor;
  createdAt: number;
  autosave: Autosave | null;
  lock: ProjectLock | null;
  readOnly: boolean;
  /** Damaged source is never written by this session (including close/pagehide). */
  recovery?: { failed: number; checkpointAt: number | null };
}

let current: OpenProject | null = null;
let instances = 0;
/** Only the latest open/create/navigation request may publish its resources. */
let transition = 0;
let cancelOpening: (() => void) | null = null;
function advanceTransition(): number {
  transition++;
  cancelOpening?.();
  cancelOpening = null;
  return transition;
}
/** Project đóng mà chưa lưu được (lỗi/hết dung lượng): giữ trong tab để không mất bài. */
let retained = false;
let detach: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Tool options + màu mới nhất trong tab (mở project kế tiếp dùng tiếp). */
let latestOptions: Partial<ToolOptionsState> | null = null;

/**
 * Canvas Engine nằm trong chunk riêng, tải khi tạo/mở project đầu tiên — trang chủ khởi động
 * không phải tải engine (mục 11.3: JS khởi động ≤ 250 KB gzip).
 */
async function createEditor(): Promise<Editor> {
  const { Editor } = await import('@/engine/core/Editor');
  const editor = new Editor({
    memory: detectMemoryConfig(),
    platform: platformFeatures,
    workers: sharedWorkerPool(),
    initialOptions: latestOptions ?? settings.value.toolOptions,
    layerName: (kind, n) =>
      format(kind === 'raster' ? t.layers.numbered : t.layers.annotationNumbered, { n }),
    layerCopyName: (name) => format(t.layers.copyName, { name }),
    backgroundName: () => t.layers.background,
    reportError: (error) => {
      recordError('engine', error);
    },
  });
  const prefs = useSettingsStore.getState();
  editor.setHistoryShare(prefs.historyShare);
  editor.setGuides({ grid: prefs.view.grid, gridSize: prefs.view.gridSize, snap: prefs.view.snap });
  const policy = settings.value.paintPolicy;
  if (policy?.draw) editor.layers.setPaintPolicy('draw', policy.draw);
  if (policy?.modify) editor.layers.setPaintPolicy('modify', policy.modify);
  return editor;
}

/** Tạo document; null nếu bị từ chối (đã hiện thông báo) — editor đã được giải phóng. */
function createDocumentIn(editor: Editor, spec: DocumentSpec, view?: ViewData): boolean {
  const result: { refused: NoticeCode | null } = { refused: null };
  const off = editor.on('notice', ({ code }) => {
    result.refused = code;
  });
  const ok = editor.createDocument(spec, { view });
  off();
  if (!ok) {
    editor.dispose();
    toast('error', t.notices[result.refused ?? 'memory.refused']);
  }
  return ok;
}

function setStatus(status: SaveStatus | null): void {
  useProjectStore.setState({ saveStatus: status });
}

let warnedLowStorage = false;

/** Gắn autosave, cài đặt, phiên làm việc vào project vừa mở. */
function attach(
  project: OpenProject,
  saved: { rev: number; layers: ReadonlyMap<ID, number>; thumbnailRev: number | null } | undefined,
  lastCheckpointAt: number | null,
): void {
  const { editor } = project;
  const offs: (() => void)[] = [];

  if (storageReady()) {
    const autosave = new Autosave({
      projectId: project.id,
      meta: () => ({ name: project.name, mode: project.mode }),
      repo,
      codec: codec(),
      source: {
        get rev() {
          return editor.document?.rev ?? 0;
        },
        get blocked() {
          return editor.hasPendingDraft || editor.busy;
        },
        serialize: () => editor.serialize(),
        captureLayers: (savedLayers) => editor.captureLayers(savedLayers),
        renderThumbnail: (side) => editor.renderThumbnail(side),
        view: () => editor.view,
      },
      saved,
      lastCheckpointAt,
      onStatus: (status) => {
        if (current === project)
          setStatus(status.kind === 'saved' && editor.hasPendingDraft ? { kind: 'dirty' } : status);
        // Lỗi ghi (không phải hết dung lượng): ghi nhật ký lỗi cục bộ để chẩn đoán (mục 10.3).
        if (status.kind === 'error') recordError('storage', `autosave: ${status.reason}`);
      },
      onSaved: () => {
        void ensurePersistence();
        void refreshStorageEstimate().then(() => {
          if (!warnedLowStorage && isStorageLow(useProjectStore.getState().estimate)) {
            warnedLowStorage = true;
            toast('info', t.storage.lowWarning);
          }
        });
      },
    });
    project.autosave = autosave;
    const updateDraftStatus = () => {
      if (current !== project) return;
      const status = autosave.current;
      setStatus(status.kind === 'saved' && editor.hasPendingDraft ? { kind: 'dirty' } : status);
    };
    offs.push(
      editor.on('selectionChanged', updateDraftStatus),
      editor.on('textEditChanged', updateDraftStatus),
    );
    autosave.setAutomatic(useSettingsStore.getState().autosave);
    offs.push(
      editor.on('documentChanged', () => {
        autosave.notifyChange();
      }),
    );
    if (project.readOnly) autosave.stop({ kind: 'readonly' });
    setStatus(autosave.current);
  } else {
    setStatus({ kind: 'unavailable' });
  }

  const rememberOptions = () => {
    latestOptions = { ...editor.options.all(), ...editor.colors.state() };
    settings.setToolOptions(latestOptions);
  };
  offs.push(
    editor.on('toolOptionsChanged', rememberOptions),
    editor.on('colorsChanged', rememberOptions),
    editor.on('viewportChanged', () => {
      sessionTracker.update({ viewport: editor.view });
    }),
    editor.on('toolChanged', ({ tool, temporary }) => {
      if (!temporary) sessionTracker.update({ activeTool: tool });
    }),
  );
  if (project.lock) {
    offs.push(
      project.lock.onLost(() => {
        becomeReadOnly(project, 'stolen');
      }),
    );
  }
  editor.setReadOnly(project.readOnly);
  useProjectStore.setState({ readOnly: project.readOnly, takingOver: false });
  // Cài đặt đổi khi đang mở project: áp dụng ngay.
  offs.push(
    useSettingsStore.subscribe((state, prev) => {
      if (state.autosave !== prev.autosave) project.autosave?.setAutomatic(state.autosave);
      if (state.historyShare !== prev.historyShare) editor.setHistoryShare(state.historyShare);
      if (state.view !== prev.view) {
        const { grid, gridSize, snap } = state.view;
        editor.setGuides({ grid, gridSize, snap });
      }
    }),
  );
  // Lỗi xảy ra khi đang mở project kèm các thao tác gần nhất (mục 10.3).
  setInputProvider(() => editor.recentInput());
  offs.push(() => {
    setInputProvider(null);
  });
  detach = () => {
    for (const off of offs) off();
  };
}

function becomeReadOnly(project: OpenProject, reason: 'other-tab' | 'stolen'): void {
  if (project.readOnly) return;
  project.readOnly = true;
  const dirty = project.editor.hasPendingDraft || project.autosave?.isDirty;
  project.autosave?.stop(
    dirty ? (useProjectStore.getState().saveStatus ?? { kind: 'dirty' }) : { kind: 'readonly' },
  );
  project.editor.setReadOnly(true, { preserveDraft: true });
  project.lock?.release();
  project.lock = null;
  if (current === project) {
    useProjectStore.setState({ readOnly: true });
    toast('info', reason === 'stolen' ? t.storage.lockStolen : t.storage.handedOver);
  }
}

// ---------------------------------------------------------------------------
// Tạo project mới (preset, mở ảnh, dán, nhập .paint)
// ---------------------------------------------------------------------------

export interface OpenProjectInit {
  name: string;
  mode?: ProjectMode;
  document: DocumentSpec;
  palette?: readonly Color[];
}

/** Tạo editor + document, lưu ngay lần đầu. Trả về id, hoặc null nếu bị từ chối. */
export async function createProject(init: OpenProjectInit): Promise<string | null> {
  const generation = advanceTransition();
  await initStorage();
  if (generation !== transition) return null;
  const closed = await closeForTransition({}, generation);
  if (generation !== transition) return null;
  if (!closed) {
    toast('error', t.storage.transitionBlocked);
    return null;
  }
  if (generation !== transition) return null;
  let editor: Editor | null = null;
  let lock: ProjectLock | null = null;
  let published = false;
  const cleanup = () => {
    lock?.release();
    lock = null;
    editor?.dispose();
    editor = null;
  };
  cancelOpening = cleanup;
  try {
    editor = await createEditor();
    if (generation !== transition) return null;
    if (!createDocumentIn(editor, init.document)) {
      editor = null;
      return null;
    }
    // Ảnh dán từ clipboard mở ở chế độ chú thích: Arrow được chọn sẵn (mục 7.4).
    if (init.mode === 'screenshot') editor.tools.setActive('arrow');
    const id = editor.document?.id ?? crypto.randomUUID();
    lock = storageReady() ? await acquireProjectLock(id) : null;
    if (generation !== transition) return null;
    const project: OpenProject = {
      instance: ++instances,
      id,
      name: init.name,
      mode: init.mode ?? 'paint',
      palette: init.palette ?? [],
      fileLink: null,
      editor,
      createdAt: Date.now(),
      autosave: null,
      lock,
      readOnly: false,
    };
    current = project;
    attach(project, undefined, null);
    published = true;
    emit();
    void sessionTracker.begin(id, null, editor.tools.selected);
    // Lưu ngay để project xuất hiện trong danh sách và còn nguyên khi tải lại trang.
    void project.autosave?.saveNow().then((saved) => {
      if (saved && project.palette.length > 0) {
        void repo.setPalette(id, project.palette).catch(() => undefined);
      }
    });
    return id;
  } catch (error) {
    recordError('storage', error);
    return null;
  } finally {
    if (cancelOpening === cleanup) cancelOpening = null;
    if (!published) cleanup();
  }
}

// ---------------------------------------------------------------------------
// Mở project đã lưu
// ---------------------------------------------------------------------------

export type LoadResult =
  | { status: 'ready'; project: OpenProject }
  | { status: 'missing' }
  | { status: 'corrupt'; hasCheckpoint: boolean; checkpointAt: number | null }
  | { status: 'failed'; reason?: string }
  | { status: 'cancelled' }
  | { status: 'blocked' };

let loading: { id: ID; generation: number; promise: Promise<LoadResult> } | null = null;

/** Mở project theo id (hash route). Gọi lặp lại trong lúc đang mở trả về cùng promise. */
export function loadProject(
  id: ID,
  options: { lock?: ProjectLock; signal?: AbortSignal } = {},
): Promise<LoadResult> {
  if (options.signal?.aborted) {
    options.lock?.release();
    return Promise.resolve({ status: 'cancelled' });
  }
  if (loading?.id === id && loading.generation === transition && !options.signal && !options.lock)
    return loading.promise;
  const generation = advanceTransition();
  if (current?.id === id) {
    if (options.lock !== current.lock) options.lock?.release();
    // Mở lại project đang giữ trong tab (đóng mà chưa lưu được): tiếp tục làm việc bình thường.
    if (retained) {
      retained = false;
      emit();
    }
    return Promise.resolve({ status: 'ready', project: current });
  }
  const onAbort = () => {
    if (transition === generation) advanceTransition();
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const promise = doLoad(id, options.lock, generation).finally(() => {
    options.signal?.removeEventListener('abort', onAbort);
    if (loading?.generation === generation) loading = null;
  });
  loading = { id, generation, promise };
  return promise;
}

async function doLoad(
  id: ID,
  givenLock: ProjectLock | undefined,
  generation: number,
): Promise<LoadResult> {
  let lock = givenLock ?? null;
  let editor: Editor | null = null;
  let published = false;
  let offLost: (() => void) | null = null;
  const abort = new AbortController();
  const cleanup = () => {
    abort.abort();
    offLost?.();
    offLost = null;
    lock?.release();
    lock = null;
    editor?.dispose();
    editor = null;
  };
  cancelOpening = cleanup;
  const stale = () => generation !== transition;
  try {
    await initStorage();
    if (stale()) return { status: 'cancelled' };
    const closed = await closeForTransition({}, generation);
    if (stale()) return { status: 'cancelled' };
    if (!closed) {
      toast('error', t.storage.transitionBlocked);
      return { status: 'blocked' };
    }
    if (stale()) return { status: 'cancelled' };
    if (!storageReady()) {
      return { status: 'missing' };
    }

    let loaded: LoadedProject;
    try {
      loaded = await repo.loadProject(id, detectMemoryConfig());
    } catch (error) {
      if (stale()) return { status: 'cancelled' };
      if (error instanceof ProjectNotFoundError) return { status: 'missing' };
      if (error instanceof CorruptProjectError) {
        if (error.hasCheckpoint) await repo.protectCheckpoint(id);
        const info = error.hasCheckpoint
          ? await repo.getCheckpointInfo(id).catch(() => null)
          : null;
        if (stale()) return { status: 'cancelled' };
        return {
          status: 'corrupt',
          hasCheckpoint: info !== null,
          checkpointAt: info?.createdAt ?? null,
        };
      }
      return {
        status: 'failed',
        ...(error instanceof DecodeBudgetError ? { reason: error.message } : {}),
      };
    }

    if (stale()) return { status: 'cancelled' };
    lock = givenLock ?? (await acquireProjectLock(id));
    if (stale()) return { status: 'cancelled' };
    // Observe ownership while decode/checkpoint is pending, before attach installs
    // the published project's listener. A stolen opening must publish read-only.
    if (lock)
      offLost = lock.onLost(() => {
        lock = null;
      });
    const { images, failed } = await decodeLayerImages(loaded, codec(), undefined, abort.signal);
    if (stale()) return { status: 'cancelled' };
    if (failed > 0) await repo.protectCheckpoint(id);
    if (stale()) return { status: 'cancelled' };
    const { document: record, meta } = loaded;

    const previous = useProjectStore.getState().previousSession;
    const session = previous?.projectId === id ? previous : null;
    const spec = documentSpecFromRecord(record, images, id);

    editor = await createEditor();
    if (stale()) return { status: 'cancelled' };
    const ok = createDocumentIn(editor, spec, session?.viewport ?? record.viewport);
    if (!ok) {
      editor = null;
      return { status: 'failed' };
    }
    const tool: ToolId | null =
      session?.activeTool ?? (meta.mode === 'screenshot' ? 'arrow' : null);
    if (tool) editor.tools.setActive(tool);

    const savedLayers = savedLayerRevs(record, images);
    const checkpoint = await repo.getCheckpointInfo(id).catch(() => null);
    if (stale()) return { status: 'cancelled' };
    const project: OpenProject = {
      instance: ++instances,
      id,
      name: meta.name,
      mode: meta.mode,
      palette: meta.palette ?? [],
      fileLink: meta.fileLink ?? null,
      editor,
      createdAt: meta.createdAt,
      autosave: null,
      lock,
      readOnly: lock === null || failed > 0,
      ...(failed > 0 ? { recovery: { failed, checkpointAt: checkpoint?.createdAt ?? null } } : {}),
    };
    offLost?.();
    offLost = null;
    current = project;
    attach(
      project,
      { rev: record.rev, layers: savedLayers, thumbnailRev: loaded.thumbnailRev },
      checkpoint?.createdAt ?? null,
    );
    published = true;
    emit();

    void repo.touchOpened(id).catch(() => undefined);
    void sessionTracker.begin(id, editor.view, editor.tools.selected);
    if (session && !session.cleanExit) {
      toast('info', format(t.storage.recovered, { time: formatTime(meta.updatedAt) }));
    }
    if (session) useProjectStore.setState({ previousSession: null });
    if (failed > 0) toast('error', format(t.storage.layersUnreadable, { n: failed }));
    if (project.readOnly) toast('info', t.storage.openedReadOnly);
    return { status: 'ready', project };
  } catch (error) {
    recordError('storage', error);
    if (stale()) return { status: 'cancelled' };
    return {
      status: 'failed',
      ...(error instanceof DecodeBudgetError ? { reason: error.message } : {}),
    };
  } finally {
    if (cancelOpening === cleanup) cancelOpening = null;
    if (!published) cleanup();
  }
}

export function formatTime(epoch: number): string {
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(epoch),
  );
}

// ---------------------------------------------------------------------------
// Đóng project
// ---------------------------------------------------------------------------

let closing: Promise<boolean> | null = null;

/**
 * Đóng project đang mở: lưu bền vững (strict) + checkpoint, nhả khóa, giải phóng Editor. Nếu không
 * lưu được (lỗi, hết dung lượng), giữ project trong tab để người dùng còn tải .paint — trừ khi
 * `discardUnsaved` chỉ khi người dùng chủ động chọn Bỏ.
 */
export async function closeCurrentProject(
  options: { discardUnsaved?: boolean } = {},
): Promise<boolean> {
  const generation = advanceTransition();
  return closeForTransition(options, generation);
}

async function closeForTransition(
  options: { discardUnsaved?: boolean },
  generation: number,
): Promise<boolean> {
  // Chờ lượt đóng đang chạy (vd. vừa về trang chủ) rồi mới quyết định với tùy chọn của lượt này.
  while (closing) await closing;
  if (generation !== transition) return true;
  if (!current) return true;
  const run = doClose(options, generation).finally(() => {
    closing = null;
  });
  closing = run;
  return run;
}

async function doClose(
  options: { discardUnsaved?: boolean },
  generation: number,
): Promise<boolean> {
  const project = current;
  if (!project) return true;
  let saved = !hasUnsavedChanges();
  if (!project.readOnly) {
    try {
      saved =
        project.editor.prepareForOutput() && !!project.autosave && (await project.autosave.close());
      saved = saved && !hasUnsavedChanges();
    } catch (error) {
      recordError('storage', error);
      saved = false;
    }
  }
  if (generation !== transition) return saved;
  const unsaved = !saved;
  if (unsaved && !options.discardUnsaved) {
    retained = true;
    emit();
    return false;
  }
  if (unsaved) toast('error', format(t.storage.discarded, { name: project.name }));
  if (current !== project) return saved;
  detach?.();
  detach = null;
  project.autosave?.dispose();
  project.lock?.release();
  project.editor.dispose();
  current = null;
  retained = false;
  setStatus(null);
  useProjectStore.setState({ readOnly: false, takingOver: false });
  void sessionTracker.end();
  void settings.flush();
  emit();
  return saved;
}

/** Bỏ project chưa lưu được đang giữ trong tab (người dùng chọn "Bỏ"). */
export function discardRetainedProject(): void {
  if (!retained) return;
  void closeCurrentProject({ discardUnsaved: true });
}

// ---------------------------------------------------------------------------
// Thao tác trên project đang mở
// ---------------------------------------------------------------------------

export function getProject(id: string): OpenProject | null {
  return current?.id === id ? current : null;
}

export function getCurrentProject(): OpenProject | null {
  return current;
}

/** Project đóng mà chưa lưu được, còn giữ trong tab. */
export function getRetainedProject(): OpenProject | null {
  return retained ? current : null;
}

/** Ctrl+S: lưu ngay, bền vững. */
export async function saveCurrentProject(): Promise<boolean> {
  const project = current;
  if (!project?.autosave || project.readOnly) return false;
  try {
    if (!project.editor.prepareForOutput()) return false;
    let saved: boolean;
    if (project.autosave.current.kind === 'error' || project.autosave.current.kind === 'quota') {
      saved = await project.autosave.retry('strict');
    } else {
      saved = await project.autosave.saveNow('strict');
    }
    return current === project && saved && !hasUnsavedChanges();
  } catch (error) {
    recordError('storage', error);
    if (current === project) setStatus({ kind: 'error', reason: 'transient' });
    return false;
  }
}

export function retrySave(): void {
  void saveCurrentProject().catch((error: unknown) => {
    recordError('storage', error);
  });
}

export async function renameProject(id: ID, name: string): Promise<void> {
  const trimmed = name.trim().slice(0, 120);
  if (!trimmed) return;
  if (current?.id === id) {
    current.name = trimmed;
    emit();
  }
  if (storageReady()) await repo.rename(id, trimmed);
}

/**
 * Chuyển chế độ giao diện (mục 7.3): Screenshot (tool island rút gọn, Copy nổi bật, panel Làm đẹp)
 * ↔ Paint đầy đủ. Document không đổi; lưu vào metadata project để mở lại đúng chế độ.
 */
export async function setProjectMode(mode: ProjectMode): Promise<void> {
  const project = current;
  if (!project || project.mode === mode) return;
  project.mode = mode;
  emit();
  if (storageReady() && !project.readOnly) {
    await repo.setMode(project.id, mode).catch(() => undefined);
  }
}

/** Còn thay đổi có thể mất nếu đóng tab ngay. */
/** Gắn file .paint với project đang mở (lần "Lưu ra file" đầu tiên). */
export async function setProjectFileLink(link: ProjectFileLink | null): Promise<void> {
  const project = current;
  if (!project) return;
  project.fileLink = link;
  emit();
  if (storageReady() && !project.readOnly) {
    await repo.setFileLink(project.id, link).catch(() => undefined);
  }
}

/** Đặt bảng màu project (ảnh vừa dán/thả vào editor — mục 7.6). */
export async function setProjectPalette(palette: readonly Color[]): Promise<void> {
  const project = current;
  if (!project || palette.length === 0) return;
  project.palette = palette;
  emit();
  if (storageReady() && !project.readOnly) {
    await repo.setPalette(project.id, palette).catch(() => undefined);
  }
}

export function hasUnsavedChanges(): boolean {
  if (!current) return false;
  if (current.editor.hasPendingDraft || current.autosave?.isDirty) return true;
  const status = useProjectStore.getState().saveStatus;
  if (!status) return false;
  if (status.kind === 'unavailable') return !current.readOnly;
  return hasUnsavedWork(status);
}

/**
 * "Chỉnh sửa ở tab này" (mục 10.1): xin tab đang giữ khóa lưu xong và nhả khóa; quá 5 giây thì
 * báo thất bại, không tự cướp khóa. Sau đó mở lại project từ DB để có bản mới nhất.
 */
export async function takeOverEditing(): Promise<void> {
  const project = current;
  if (project?.recovery) return;
  if (!project?.readOnly || useProjectStore.getState().takingOver) return;
  if (hasUnsavedChanges()) {
    toast('error', t.storage.transitionBlocked);
    return;
  }
  useProjectStore.setState({ takingOver: true });
  const generation = transition;
  broadcast({ type: 'takeover-request', projectId: project.id, from: TAB_ID });
  const lock = await acquireProjectLock(project.id, { waitMs: 5000 });
  if (current !== project || transition !== generation) {
    lock?.release();
    return;
  }
  if (!lock) {
    useProjectStore.setState({ takingOver: false });
    toast('error', t.storage.takeoverFailed);
    return;
  }
  // Bản trong tab này đã cũ (tab kia vừa lưu xong): bỏ và mở lại từ DB với khóa vừa lấy.
  const close = closeCurrentProject({ discardUnsaved: true });
  const closingGeneration = transition;
  await close;
  if (transition !== closingGeneration) {
    lock.release();
    return;
  }
  const result = await loadProject(project.id, { lock });
  if (result.status !== 'ready') {
    useProjectStore.setState({ takingOver: false });
    toast('error', t.storage.takeoverFailed);
  }
}

// Tab khác xin quyền chỉnh sửa project mình đang giữ: lưu xong rồi nhả khóa, chuyển sang chỉ đọc.
onChannelMessage((message) => {
  if (message.type !== 'takeover-request') return;
  const project = current;
  if (project?.id !== message.projectId || project.readOnly) return;
  void (async () => {
    let saved = false;
    try {
      saved = await saveCurrentProject();
    } catch (error) {
      recordError('storage', error);
    }
    if (!saved || current !== project || hasUnsavedChanges()) {
      broadcast({ type: 'takeover-denied', projectId: project.id, to: message.from });
      return;
    }
    becomeReadOnly(project, 'other-tab');
    broadcast({ type: 'takeover-released', projectId: project.id, to: message.from });
  })();
});

// ---------------------------------------------------------------------------
// Sự kiện trang (mục 6.6, 7.9)
// ---------------------------------------------------------------------------

let lifecycleInstalled = false;
const QUOTA_RETRY_MS = 30_000;

/** Lưu khi tab ẩn / pagehide, đánh dấu thoát sạch, beforeunload khi còn thay đổi chưa lưu. */
export function installSessionLifecycle(): void {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    void current?.autosave?.saveNow();
    void settings.flush();
  });
  window.addEventListener('pagehide', () => {
    void current?.autosave?.saveNow();
    void settings.flush();
    sessionTracker.markCleanExit();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) sessionTracker.markResumed();
  });
  // Hết dung lượng: thử lại khi tab này hoặc tab khác giải phóng dung lượng, và định kỳ 30 s.
  onChannelMessage((message) => {
    if (message.type === 'storage-freed') current?.autosave?.resume();
  });
  window.setInterval(() => {
    current?.autosave?.resume();
  }, QUOTA_RETRY_MS);
  // Lớp bảo vệ phụ (mục 7.9): trình duyệt có thể bỏ qua beforeunload; lớp chính là lưu khi ẩn tab.
  window.addEventListener('beforeunload', (event) => {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
  });
}

// ---------------------------------------------------------------------------

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const NO_PALETTE: readonly Color[] = [];

let snapshot: {
  project: OpenProject | null;
  name: string | null;
  mode: ProjectMode | null;
  palette: readonly Color[];
  fileLink: ProjectFileLink | null;
  retained: boolean;
} = {
  project: null,
  name: null,
  mode: null,
  palette: [],
  fileLink: null,
  retained: false,
};

function getSnapshot() {
  if (
    snapshot.project !== current ||
    snapshot.name !== (current?.name ?? null) ||
    snapshot.mode !== (current?.mode ?? null) ||
    snapshot.palette !== (current?.palette ?? NO_PALETTE) ||
    snapshot.fileLink !== (current?.fileLink ?? null) ||
    snapshot.retained !== retained
  ) {
    snapshot = {
      project: current,
      name: current?.name ?? null,
      mode: current?.mode ?? null,
      palette: current?.palette ?? NO_PALETTE,
      fileLink: current?.fileLink ?? null,
      retained,
    };
  }
  return snapshot;
}

/** Project đang mở (cập nhật khi mở/đóng/đổi tên). */
export function useCurrentProject(): OpenProject | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).project;
}

/** Tên project đang mở (đổi tên cập nhật top bar, tiêu đề tab). */
export function useCurrentProjectName(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).name;
}

/** Chế độ giao diện của project đang mở (đổi khi chuyển Paint ↔ Screenshot). */
export function useProjectMode(): ProjectMode {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).mode ?? 'paint';
}

/** File .paint gắn với project đang mở ("Lưu ra file"). */
export function useProjectFileLink(): ProjectFileLink | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).fileLink;
}

/** Bảng màu project đang mở. */
export function useProjectPalette(): readonly Color[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).palette;
}

export function useRetainedProject(): OpenProject | null {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return snap.retained ? snap.project : null;
}
