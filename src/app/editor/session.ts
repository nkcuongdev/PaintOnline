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
import { Editor } from '@/engine/core/Editor';
import type { DocumentSpec } from '@/engine/core/Document';
import type { ID, NoticeCode, ToolId, ToolOptionsState, ViewData } from '@/engine/core/types';
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
import type { ProjectMode } from '@/services/storage/schema';
import { detectMemoryConfig } from '@/services/platform/deviceTier';
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
  editor: Editor;
  createdAt: number;
  autosave: Autosave | null;
  lock: ProjectLock | null;
  readOnly: boolean;
}

let current: OpenProject | null = null;
let instances = 0;
/** Project đóng mà chưa lưu được (lỗi/hết dung lượng): giữ trong tab để không mất bài. */
let retained = false;
let detach: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Tool options + màu mới nhất trong tab (mở project kế tiếp dùng tiếp). */
let latestOptions: Partial<ToolOptionsState> | null = null;

function createEditor(): Editor {
  const editor = new Editor({
    memory: detectMemoryConfig(),
    platform: platformFeatures,
    workers: sharedWorkerPool(),
    initialOptions: latestOptions ?? settings.value.toolOptions,
    layerName: (kind, n) =>
      format(kind === 'raster' ? t.layers.numbered : t.layers.annotationNumbered, { n }),
    layerCopyName: (name) => format(t.layers.copyName, { name }),
    backgroundName: () => t.layers.background,
  });
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
  saved: { rev: number; layers: ReadonlyMap<ID, number> } | undefined,
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
          return editor.isGestureActive || editor.busy;
        },
        serialize: () => editor.serialize(),
        captureLayers: (savedLayers) => editor.captureLayers(savedLayers),
        renderThumbnail: (side) => editor.renderThumbnail(side),
        view: () => editor.view,
      },
      saved,
      lastCheckpointAt,
      onStatus: (status) => {
        if (current === project) setStatus(status);
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
  detach = () => {
    for (const off of offs) off();
  };
}

function becomeReadOnly(project: OpenProject, reason: 'other-tab' | 'stolen'): void {
  if (project.readOnly) return;
  project.readOnly = true;
  project.autosave?.stop({ kind: 'readonly' });
  project.editor.setReadOnly(true);
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
}

/** Tạo editor + document, lưu ngay lần đầu. Trả về id, hoặc null nếu bị từ chối. */
export async function createProject(init: OpenProjectInit): Promise<string | null> {
  await initStorage();
  await closeCurrentProject({ discardUnsaved: true });
  const editor = createEditor();
  if (!createDocumentIn(editor, init.document)) return null;
  // Ảnh dán từ clipboard mở ở chế độ chú thích: Arrow được chọn sẵn (mục 7.4).
  if (init.mode === 'screenshot') editor.tools.setActive('arrow');
  const id = editor.document?.id ?? crypto.randomUUID();
  const lock = storageReady() ? await acquireProjectLock(id) : null;
  const project: OpenProject = {
    instance: ++instances,
    id,
    name: init.name,
    mode: init.mode ?? 'paint',
    editor,
    createdAt: Date.now(),
    autosave: null,
    lock,
    readOnly: false,
  };
  current = project;
  attach(project, undefined, null);
  emit();
  void sessionTracker.begin(id, null, editor.tools.selected);
  // Lưu ngay để project xuất hiện trong danh sách và còn nguyên khi tải lại trang.
  void project.autosave?.saveNow();
  return id;
}

// ---------------------------------------------------------------------------
// Mở project đã lưu
// ---------------------------------------------------------------------------

export type LoadResult =
  | { status: 'ready'; project: OpenProject }
  | { status: 'missing' }
  | { status: 'corrupt'; hasCheckpoint: boolean; checkpointAt: number | null }
  | { status: 'failed' };

const loading = new Map<ID, Promise<LoadResult>>();

/** Mở project theo id (hash route). Gọi lặp lại trong lúc đang mở trả về cùng promise. */
export function loadProject(id: ID, options: { lock?: ProjectLock } = {}): Promise<LoadResult> {
  if (current?.id === id) {
    // Mở lại project đang giữ trong tab (đóng mà chưa lưu được): tiếp tục làm việc bình thường.
    if (retained) {
      retained = false;
      emit();
    }
    return Promise.resolve({ status: 'ready', project: current });
  }
  let pending = loading.get(id);
  if (!pending) {
    pending = doLoad(id, options.lock).finally(() => {
      loading.delete(id);
    });
    loading.set(id, pending);
  }
  return pending;
}

async function doLoad(id: ID, givenLock: ProjectLock | undefined): Promise<LoadResult> {
  await initStorage();
  await closeCurrentProject({ discardUnsaved: true });
  if (!storageReady()) {
    givenLock?.release();
    return { status: 'missing' };
  }

  let loaded: LoadedProject;
  try {
    loaded = await repo.loadProject(id);
  } catch (error) {
    givenLock?.release();
    if (error instanceof ProjectNotFoundError) return { status: 'missing' };
    if (error instanceof CorruptProjectError) {
      const info = error.hasCheckpoint ? await repo.getCheckpointInfo(id).catch(() => null) : null;
      return {
        status: 'corrupt',
        hasCheckpoint: info !== null,
        checkpointAt: info?.createdAt ?? null,
      };
    }
    return { status: 'failed' };
  }

  const lock = givenLock ?? (await acquireProjectLock(id));
  const { images, failed } = await decodeLayerImages(loaded, codec());
  const { document: record, meta } = loaded;

  const previous = useProjectStore.getState().previousSession;
  const session = previous?.projectId === id ? previous : null;
  const spec = documentSpecFromRecord(record, images, id);

  const editor = createEditor();
  const ok = createDocumentIn(editor, spec, session?.viewport ?? record.viewport);
  if (!ok) {
    lock?.release();
    return { status: 'failed' };
  }
  const tool: ToolId | null = session?.activeTool ?? (meta.mode === 'screenshot' ? 'arrow' : null);
  if (tool) editor.tools.setActive(tool);

  const savedLayers = savedLayerRevs(record, images);
  const checkpoint = await repo.getCheckpointInfo(id).catch(() => null);
  const project: OpenProject = {
    instance: ++instances,
    id,
    name: meta.name,
    mode: meta.mode,
    editor,
    createdAt: meta.createdAt,
    autosave: null,
    lock,
    readOnly: lock === null,
  };
  current = project;
  attach(project, { rev: record.rev, layers: savedLayers }, checkpoint?.createdAt ?? null);
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
 * `discardUnsaved` (mở project khác).
 */
export async function closeCurrentProject(
  options: { discardUnsaved?: boolean } = {},
): Promise<boolean> {
  // Chờ lượt đóng đang chạy (vd. vừa về trang chủ) rồi mới quyết định với tùy chọn của lượt này.
  while (closing) await closing;
  if (!current) return true;
  const run = doClose(options).finally(() => {
    closing = null;
  });
  closing = run;
  return run;
}

async function doClose(options: { discardUnsaved?: boolean }): Promise<boolean> {
  const project = current;
  if (!project) return true;
  let saved = true;
  if (project.autosave && !project.readOnly) {
    saved = await project.autosave.close();
  }
  const status = useProjectStore.getState().saveStatus;
  const unsaved = !saved && status !== null && hasUnsavedWork(status);
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
  if (project.autosave.current.kind === 'error' || project.autosave.current.kind === 'quota') {
    return project.autosave.retry();
  }
  return project.autosave.saveNow('strict');
}

export function retrySave(): void {
  void current?.autosave?.retry();
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
export function hasUnsavedChanges(): boolean {
  if (!current) return false;
  const status = useProjectStore.getState().saveStatus;
  if (!status) return false;
  if (status.kind === 'unavailable') return (current.editor.document?.rev ?? 0) > 0;
  return hasUnsavedWork(status);
}

/**
 * "Chỉnh sửa ở tab này" (mục 10.1): xin tab đang giữ khóa lưu xong và nhả khóa; quá 5 giây thì
 * lấy hẳn khóa. Sau đó mở lại project từ DB để có bản mới nhất.
 */
export async function takeOverEditing(): Promise<void> {
  const project = current;
  if (!project?.readOnly) return;
  useProjectStore.setState({ takingOver: true });
  broadcast({ type: 'takeover-request', projectId: project.id, from: TAB_ID });
  const lock = await acquireProjectLock(project.id, { waitMs: 5000, stealOnTimeout: true });
  if (!lock) {
    useProjectStore.setState({ takingOver: false });
    toast('error', t.storage.takeoverFailed);
    return;
  }
  // Bản trong tab này đã cũ (tab kia vừa lưu xong): bỏ và mở lại từ DB với khóa vừa lấy.
  await closeCurrentProject({ discardUnsaved: true });
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
    await project.autosave?.saveNow('strict');
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

let snapshot: {
  project: OpenProject | null;
  name: string | null;
  mode: ProjectMode | null;
  retained: boolean;
} = {
  project: null,
  name: null,
  mode: null,
  retained: false,
};

function getSnapshot() {
  if (
    snapshot.project !== current ||
    snapshot.name !== (current?.name ?? null) ||
    snapshot.mode !== (current?.mode ?? null) ||
    snapshot.retained !== retained
  ) {
    snapshot = {
      project: current,
      name: current?.name ?? null,
      mode: current?.mode ?? null,
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

export function useRetainedProject(): OpenProject | null {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return snap.retained ? snap.project : null;
}
