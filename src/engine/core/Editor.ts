import { History } from '../history/History';
import {
  AddLayerCommand,
  RasterizeLayerCommand,
  type LayerProps,
} from '../history/commands/LayerCommand';
import { GrowableSurface } from '../memory/GrowableSurface';
import { STROKE_GROWTH_MARGIN } from '../tools/brush/BrushStroke';
import { TileStore } from '../history/TileStore';
import type { Command } from '../history/types';
import { InputManager, type InputHandlers } from '../input/InputManager';
import { InputRecorder, type RecordedEvent, type Recording } from '../input/recorder';
import { LayerManager } from '../layers/LayerManager';
import { RasterLayer, touchContent, type VectorLayer } from '../layers/layers';
import { ObjectEnvironment } from '../layers/objects/env';
import { rendererFor } from '../layers/objects/registry';
import { LAYER_WARNING_RATIO, MemoryBudget } from '../memory/MemoryBudget';
import { createSurface, isAllocationError, ScratchPool } from '../memory/surfaces';
import { BackdropEffects } from '../render/backdrop';
import {
  beautifyFrame,
  BEAUTIFY_DEFAULTS,
  clipToImage,
  normalizeBeautify,
  paintBeautifyFrame,
} from '../render/beautify';
import { BeautifyCommand } from '../history/commands/BeautifyCommand';
import { compositeDocument, drawObjects, type ObjectRenderState } from '../render/Compositor';
import type { RenderCacheOptions, RenderCacheStats } from '../render/layerCaches';
import { Renderer, type Appearance, type FrameStats } from '../render/Renderer';
import { redactObject } from '../tools/objects/shapes';
import { drawBrushHud, hudValues, type BrushHudState, type HudGroup } from '../tools/brush/hud';
import { ObjectController, type AlignMode } from '../tools/objects/ObjectController';
import { TextSession } from '../tools/objects/TextSession';
import { getToolDefinition, SELECT_TOOLS } from '../tools/registry';
import { ImageOps, type CanvasAnchor, type FlipAxis, type RotateAngle } from '../document/ImageOps';
import { FilterRunner } from '../filters/FilterRunner';
import { SelectionManager, type ClipboardCapture } from '../selection/SelectionManager';
import { ToolManager } from '../tools/ToolManager';
import type { DocPointerEvent, PointerSample, StrokePreview, ToolContext } from '../tools/types';
import { intersectRect, isEmptyRect, unionRect } from '../utils/rect';
import { Viewport } from '../viewport/Viewport';
import { Document, type DocumentSpec } from './Document';
import { EventBus, type Unsubscribe } from './EventBus';
import {
  createColorsAPI,
  createOptionsAPI,
  OPTION_SCHEMAS,
  validateOptions,
  type ColorsAPI,
  type OptionsAPI,
  type SetColorOptions,
} from './options';
import type {
  AnnotationObject,
  BeautifySettings,
  Color,
  DocumentData,
  EditorEvents,
  FilterSessionSummary,
  GuideSettings,
  FilterStep,
  ID,
  MemoryBudgetConfig,
  NoticeCode,
  OptionGroupId,
  PaintTargetChoice,
  PaintTargetKind,
  PaintTargetPolicy,
  PlatformFeatures,
  LayerCapture,
  Point,
  Rect,
  ResampleQuality,
  SelectionMode,
  SelectionShape,
  SelectionSummary,
  TextEditState,
  ToolId,
  ToolOptionsMap,
  ToolOptionsState,
  ViewData,
  WorkerClient,
} from './types';

/** Nhịp marching ants (ms mỗi bước 1 px). */
const ANTS_INTERVAL_MS = 120;
/** Tool nhận tọa độ bám lưới (tool hình học, vùng chọn hình học, cắt xén, gradient, chữ). */
const SNAP_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>([
  'select',
  'marquee-rect',
  'marquee-ellipse',
  'crop',
  'gradient',
  'rect',
  'ellipse',
  'line',
  'arrow',
  'polygon',
  'text',
  'highlight',
  'redact',
  'step',
  'spotlight',
  'magnifier',
]);
/** Thời gian hiện vòng tròn cỡ cọ sau khi bấm `[` `]`. */
const BRUSH_HUD_FLASH_MS = 700;
/** Số sự kiện input gần nhất giữ trong "hộp đen" (mục 10.3) — khoảng vài nét vẽ. */
const BLACK_BOX_EVENTS = 1500;

/** Tool dùng được ở chế độ chỉ đọc (tab khác đang sửa project — mục 6.6): chỉ xem và lấy màu. */
const READ_ONLY_TOOLS: ReadonlySet<ToolId> = new Set(['pan', 'zoom', 'eyedropper']);

export interface CreateDocumentOptions {
  /** Khung nhìn đã lưu (mở lại project); không có thì vừa khung. */
  view?: ViewData;
}

/** Phụ thuộc truyền vào Engine qua constructor (mục 4.2). */
export interface EditorDeps {
  memory: MemoryBudgetConfig;
  platform: PlatformFeatures;
  /** Worker pool (tô loang…) — hiện thực ở services/workers. */
  workers: WorkerClient;
  initialOptions?: Partial<ToolOptionsState>;
  /** Tên layer Engine tự tạo ("Lớp 2", "Chú thích 1") — chuỗi giao diện do UI cung cấp. */
  layerName?: (kind: 'raster' | 'vector', n: number) => string;
  /** Tên bản sao khi nhân bản layer và tên layer nền sau Flatten (chuỗi giao diện). */
  layerCopyName?: (name: string) => string;
  backgroundName?: () => string;
  /**
   * Lỗi không mong đợi bên trong Engine (thao tác ảnh nền thất bại…) — app ghi vào nhật ký lỗi cục
   * bộ (mục 10.3). Người dùng vẫn nhận thông báo qua `notice`.
   */
  reportError?: (error: unknown) => void;
}

export interface ToolsAPI {
  /** Tool đang nhận sự kiện (gồm tool tạm thời). */
  readonly active: ToolId;
  /** Tool người dùng đã chọn. */
  readonly selected: ToolId;
  setActive(id: ToolId): void;
  pushTemporary(id: ToolId): void;
  popTemporary(id: ToolId): void;
}

/** Đối tượng vector đang chọn (mục 7.2: Options bar hiển thị thuộc tính đối tượng). */
export interface ObjectsAPI {
  readonly selection: readonly ID[];
  readonly hasSelection: boolean;
  select(ids: readonly ID[]): void;
  clearSelection(): void;
  deleteSelected(): boolean;
  bringToFront(): boolean;
  sendToBack(): boolean;
  /** Dời đối tượng đang chọn (phím mũi tên). */
  nudge(dx: number, dy: number): boolean;
  /**
   * Đổi thuộc tính đối tượng đang chọn bằng option của nhóm tương ứng; option của tool cũng được
   * cập nhật để đối tượng vẽ sau dùng cùng kiểu.
   */
  applyStyle<G extends OptionGroupId>(group: G, patch: Partial<ToolOptionsMap[G]>): void;
  /**
   * Kiểu dựng sẵn (preset style — GĐ7): đặt option của nhóm + màu chính/phụ cho tool, và áp cho
   * đối tượng đang chọn cùng nhóm kiểu trong một bước history (đối tượng khác loại giữ nguyên).
   */
  applyPreset<G extends OptionGroupId>(
    group: G,
    patch: Partial<ToolOptionsMap[G]>,
    colors: { primary?: Color; secondary?: Color },
  ): void;
  /** Tìm đối tượng theo id (test, UI). */
  get(id: ID): AnnotationObject | null;
  /** Hình bao (document) của các đối tượng đang chọn; null nếu không chọn gì. */
  selectionBounds(): Rect | null;
  /** Căn chỉnh đối tượng đang chọn (nhiều đối tượng: theo hình bao chung; một: theo khung ảnh). */
  align(mode: AlignMode): boolean;
}

/** Phiên sửa chữ (mục 5.10) — UI đặt textarea chồng lên canvas. */
export interface TextAPI {
  readonly current: TextEditState | null;
  update(text: string): void;
  commit(text: string): void;
  cancel(): void;
}

export interface LayersAPI {
  /** Chính sách khi dùng tool pixel trên layer chú thích (mục 5.3). */
  readonly paintPolicy: Readonly<Record<PaintTargetKind, PaintTargetPolicy>>;
  setPaintPolicy(kind: PaintTargetKind, policy: PaintTargetPolicy): void;
  /** Trả lời câu hỏi `paintTargetRequired`: thực hiện lựa chọn ngay, tùy chọn nhớ cho lần sau. */
  choosePaintTarget(kind: PaintTargetKind, choice: PaintTargetChoice, remember: boolean): boolean;
  /** Chọn layer hoạt động — trạng thái làm việc, không tạo bước history (ADR 0020). */
  setActive(id: ID): void;
  /** Thêm layer trống ngay trên layer hoạt động; trả id layer mới. */
  add(kind?: 'raster' | 'vector'): ID | null;
  duplicate(id: ID): ID | null;
  remove(id: ID): boolean;
  /** Đưa layer tới vị trí `index` (0 = dưới cùng). */
  move(id: ID, index: number): boolean;
  /** Đổi tên, ẩn/hiện, khóa, khóa trong suốt, opacity, blend mode. */
  setProps(id: ID, patch: Partial<LayerProps>): boolean;
  canMergeDown(id: ID): boolean;
  mergeDown(id: ID): boolean;
  canMergeVisible(): boolean;
  mergeVisible(): boolean;
  canFlatten(): boolean;
  flatten(): boolean;
  rasterize(id: ID): boolean;
  /** Ảnh thu nhỏ của layer (cạnh dài `maxSide` px, khung document). */
  thumbnail(id: ID, maxSide: number): Promise<ImageBitmap | null>;
}

/** Vùng chọn pixel, pixel nổi, clipboard (mục 5.7). */
export interface SelectionAPI {
  readonly summary: SelectionSummary | null;
  /** Có vùng chọn hoặc pixel nổi. */
  readonly hasSelection: boolean;
  readonly isFloating: boolean;
  /** Đặt vùng chọn bằng hình (API, test); `mode` mặc định thay thế. */
  select(shape: SelectionShape, mode?: SelectionMode): void;
  selectAll(): void;
  deselect(): void;
  invert(): void;
  /** Shift+T: nhấc pixel trong vùng chọn để co giãn, xoay bằng handle. */
  transform(): boolean;
  /** Enter: commit pixel nổi thành một bước history. */
  commit(): boolean;
  /** Esc: bỏ pixel nổi, layer giữ nguyên. */
  cancel(): boolean;
  /** Delete: xóa pixel trong vùng chọn (hoặc bỏ pixel nổi). */
  deleteContent(): boolean;
  /**
   * "Che thông tin" (mini toolbar — mục 7.6): thêm đối tượng Redact phủ hình bao vùng chọn theo
   * option Redact hiện tại, rồi bỏ chọn.
   */
  redact(): boolean;
  /** Tô vùng chọn bằng màu chính. */
  fill(): boolean;
  /** Pixel trong vùng chọn + vị trí; `merged` = ảnh đang thấy thay vì layer hoạt động. */
  copy(merged?: boolean): ClipboardCapture | null;
  cut(): ClipboardCapture | null;
  /** Dán ảnh thành pixel nổi (layer mới khi commit) tại `at`, hoặc giữa khung nhìn. */
  paste(image: CanvasImageSource & { width: number; height: number }, at?: Point | null): boolean;
  /** Xoay/lật pixel trong vùng chọn (nhấc ra nếu chưa nổi). */
  rotate(quarterTurns: number): boolean;
  flip(axis: FlipAxis): boolean;
  nudge(dx: number, dy: number): boolean;
  /** Điểm (document) nằm trong vùng chọn/pixel nổi. */
  contains(p: Point): boolean;
}

/** Biến đổi toàn ảnh (mục 2): chạy nền, trả false nếu bị từ chối hoặc không đổi gì. */
export interface ImageAPI {
  /** Đang biến đổi ảnh (thao tác vẽ, undo bị khóa). */
  readonly busy: boolean;
  crop(rect: Rect): Promise<boolean>;
  cropToSelection(): Promise<boolean>;
  trim(): Promise<boolean>;
  resize(width: number, height: number, quality?: ResampleQuality): Promise<boolean>;
  canvasSize(width: number, height: number, anchor?: CanvasAnchor): Promise<boolean>;
  rotate(angle: RotateAngle, scope?: 'image' | 'layer'): Promise<boolean>;
  flip(axis: FlipAxis, scope?: 'image' | 'layer'): Promise<boolean>;
}

/**
 * Điều chỉnh và bộ lọc (mục 2, 5.8): một phiên trên layer hoạt động — xem trước trực tiếp trên bản
 * thu nhỏ, áp dụng full-res có tiến trình và hủy được. Khi phiên mở, chỉ xem/zoom/pan/lấy màu.
 */
export interface FiltersAPI {
  readonly state: FilterSessionSummary | null;
  readonly isOpen: boolean;
  /** Mở phiên (panel nổi); `label`: khóa history của bước khi áp dụng. */
  begin(steps: readonly FilterStep[], label?: string): boolean;
  update(steps: readonly FilterStep[]): void;
  /** Giữ nút so sánh: hiện ảnh gốc. */
  compare(showOriginal: boolean): void;
  apply(): Promise<boolean>;
  /** Đang áp dụng: dừng (quay lại xem trước); đang xem trước: đóng phiên. */
  cancel(): void;
  /** Áp dụng ngay không qua xem trước (Đảo màu, Đen trắng). */
  run(steps: readonly FilterStep[], label?: string): Promise<boolean>;
  /** Số lần xem trước đã hiện, mốc thời gian lần gần nhất — benchmark (mục 11.2). */
  readonly previewStats: {
    readonly previews: number;
    readonly lastMs: number;
    readonly requestedAt: number;
    readonly shownAt: number;
    readonly refines: number;
  };
}

export interface ExportOptions {
  type?: 'image/png' | 'image/jpeg' | 'image/webp';
  /** 0..1 cho JPG/WebP. */
  quality?: number;
  /** Tỉ lệ 0,5×–2× (mục 2). */
  scale?: number;
  /** Màu lót cho định dạng không có alpha (JPG). */
  matte?: Color;
  /** Chỉ phần trong vùng chọn (hộp thoại Export — mục 7.3). */
  selectionOnly?: boolean;
  /** Gồm khung Làm đẹp nếu document đang bật (bỏ qua khi chỉ xuất vùng chọn). */
  beautify?: boolean;
}

/** Khung "Làm đẹp" ảnh chụp (GĐ7): nền, padding, bo góc, bóng — không phá hủy, có undo. */
export interface BeautifyAPI {
  readonly settings: BeautifySettings | null;
  /** Cài đặt đang bật, hoặc cài đặt sẽ dùng khi bật lại (lần bật trước / mặc định). */
  readonly preferred: BeautifySettings;
  /** Bật/đổi cài đặt (gộp với cài đặt hiện tại hoặc lần bật trước); null = tắt. */
  set(patch: Partial<BeautifySettings> | null): boolean;
}

export interface PointerInit {
  x: number;
  y: number;
  pressure?: number;
  points?: readonly PointerSample[];
  button?: number;
  pointerType?: 'mouse' | 'pen' | 'touch';
  shiftKey?: boolean;
  altKey?: boolean;
}

/**
 * Editor — facade và điểm vào duy nhất của Canvas Engine (mục 4.2):
 * `execute`, `tools.setActive`, `options.set`, `colors.setPrimary`, `viewport.zoomTo`, `on(event)`.
 * Không import React, Zustand hay services; UI chỉ đổi state qua API này.
 */
export class Editor {
  readonly events = new EventBus<EditorEvents>();
  readonly memory: MemoryBudget;
  readonly options: OptionsAPI;
  readonly colors: ColorsAPI;
  readonly viewport = new Viewport();
  readonly tools: ToolsAPI;
  readonly objects: ObjectsAPI;
  readonly text: TextAPI;
  readonly layers: LayersAPI;
  readonly selection: SelectionAPI;
  readonly image: ImageAPI;
  readonly filters: FiltersAPI;
  readonly beautify: BeautifyAPI;
  readonly platform: PlatformFeatures;

  private doc: Document | null = null;
  /** Kích thước document lần đồng bộ cuối (Crop, Resize, undo của chúng đổi kích thước). */
  private docSize = { width: 0, height: 0 };
  private readonly selectionManager: SelectionManager;
  private readonly imageOps: ImageOps;
  private readonly filterRunner: FilterRunner;
  private antsTimer: ReturnType<typeof setInterval> | null = null;
  private readonly history: History;
  private readonly renderer: Renderer;
  private readonly toolManager: ToolManager;
  private readonly exportScratch: ScratchPool;
  private readonly workers: WorkerClient;
  private readonly objectEnv: ObjectEnvironment;
  /** Ảnh nền của Redact khảm/làm mờ và Magnifier (mục 5.4). */
  private readonly backdrop: BackdropEffects;
  private readonly objectController: ObjectController;
  private readonly textSession: TextSession;
  private readonly layerName: (kind: 'raster' | 'vector', n: number) => string;
  private readonly layerManager: LayerManager;
  private layerWarning = false;
  private readonly policy: Record<PaintTargetKind, PaintTargetPolicy> = {
    draw: 'ask',
    modify: 'ask',
  };
  private input: InputManager | null = null;
  private preview: StrokePreview | null = null;
  /** Stroke buffer dùng chung giữa các nét; giải phóng khi đổi document, tab ẩn hoặc dispose. */
  private sharedStroke: GrowableSurface | null = null;
  private hoverPoint: Point | null = null;
  /** Lưới và bám lưới (mục 2, P2). */
  private guideSettings: GuideSettings = { grid: false, gridSize: 32, snap: false };
  /** Điểm bấm của thao tác kéo bằng tool Chọn khi bám lưới (dời theo bội số lưới). */
  private snapAnchor: Point | null = null;
  /** HUD chỉnh cọ (mục 7.6). */
  private brushHud: BrushHudState | null = null;
  private brushHudTimer = 0;
  private pendingFit = false;
  private pendingView: ViewData | null = null;
  private isBusy = false;
  private isReadOnly = false;
  private recorder: InputRecorder | null = null;
  /** "Hộp đen": luôn ghi các thao tác gần nhất để đính kèm nhật ký lỗi cục bộ (mục 10.3). */
  private blackBox: InputRecorder | null = null;
  private readonly unmountFns: (() => void)[] = [];
  private readonly disposers: Unsubscribe[] = [];
  private readonly replayEvent: DocPointerEvent;
  private readonly replaySamples: PointerSample[] = [];

  constructor(deps: EditorDeps) {
    this.platform = deps.platform;
    this.workers = deps.workers;
    this.layerName = deps.layerName ?? ((kind, n) => `${kind} ${String(n)}`);
    this.memory = new MemoryBudget(deps.memory);
    this.options = createOptionsAPI(deps.initialOptions, this.events);
    this.colors = createColorsAPI(deps.initialOptions, this.events);
    this.exportScratch = new ScratchPool(this.memory);
    this.history = new History(this.memory, {
      onChange: (summary) => {
        this.events.emit('historyChanged', summary);
      },
    });
    const compress = deps.workers.compressPixels?.bind(deps.workers);
    if (compress) this.history.setCompressor(compress);
    this.objectEnv = new ObjectEnvironment(this.memory, () => {
      // Font web vừa tải xong: bố cục chữ đã được đo lại, dựng lại cache và vẽ lại toàn bộ.
      this.backdrop.clear();
      this.renderer.resetCaches();
      this.textSession.refresh();
    });
    this.backdrop = new BackdropEffects({
      document: () => this.doc,
      memory: this.memory,
      scratch: this.exportScratch,
      env: this.objectEnv,
    });
    this.objectEnv.documentBounds = () => this.doc?.bounds ?? null;
    this.objectEnv.backdrop = this.backdrop;
    this.objectController = new ObjectController({
      document: () => this.doc,
      env: this.objectEnv,
      viewport: this.viewport,
      execute: (command) => this.executeSafe(command),
      invalidate: (rect) => {
        this.renderer.invalidate(rect);
      },
      invalidateOverlay: () => {
        this.renderer.invalidateOverlay();
      },
      notify: (code) => {
        this.notify(code);
      },
      colors: () => this.colors.state(),
      layerName: (kind, n) => this.layerName(kind, n),
      selectionChanged: (summary) => {
        this.events.emit('objectSelectionChanged', summary);
        this.emitDocument(true);
      },
    });
    this.textSession = new TextSession(
      this.objectController,
      (state) => {
        this.events.emit('textEditChanged', state);
      },
      () => this.colors.state(),
    );
    this.selectionManager = new SelectionManager({
      document: () => this.doc,
      memory: this.memory,
      workers: this.workers,
      viewport: this.viewport,
      scratch: this.exportScratch,
      execute: (command) => this.executeSafe(command),
      createTileStore: () => this.newTileStore(),
      invalidate: (rect) => {
        this.renderer.invalidate(rect);
      },
      invalidateOverlay: () => {
        this.renderer.invalidateOverlay();
      },
      notify: (code) => {
        this.notify(code);
      },
      colors: () => this.colors.state(),
      layerName: (kind, n) => this.layerName(kind, n),
      composite: (ctx, region) => {
        const doc = this.doc;
        if (!doc) return;
        compositeDocument(ctx, doc, {
          region,
          includeBackground: true,
          preview: null,
          scratch: this.exportScratch,
          objects: this.objectState(false),
        });
      },
      changed: (summary) => {
        this.events.emit('selectionChanged', summary);
        this.updateAnts();
        // Vùng chọn đổi khi đang xem trước filter: filter chỉ tác động bên trong vùng mới.
        this.filterRunner.refresh();
      },
    });
    this.renderer = new Renderer(this.memory, this.viewport, {
      document: () => this.doc,
      preview: () => this.preview,
      floating: () => this.selectionManager.floating,
      filter: () => this.filterRunner.filterPreview(),
      hover: () => this.hoverPoint,
      grid: () => (this.guideSettings.grid ? this.guideSettings.gridSize : null),
      objects: () => this.objectState(true),
      drawToolOverlay: (overlay) => {
        // Marching ants luôn hiện; handle biến đổi chỉ khi đang dùng tool chọn (mục 5.7).
        const showHandles = SELECT_TOOLS.includes(this.toolManager.activeId);
        this.selectionManager.renderOverlay(overlay, showHandles);
        const hud = this.brushHud;
        // Đang kéo HUD (Alt đang giữ → tool lấy màu tạm thời): chỉ vẽ HUD, không vẽ kính lúp.
        if (!hud?.dragging) this.toolManager.renderOverlay(overlay);
        if (hud) {
          const o = this.options.get(hud.group);
          drawBrushHud(overlay.ctx, hud.origin, o.size, o.hardness, this.viewport.zoom);
        }
      },
    });
    this.toolManager = new ToolManager(this.createToolContext(), this.events);

    const manager = this.toolManager;
    this.tools = {
      get active() {
        return manager.activeId;
      },
      get selected() {
        return manager.selectedId;
      },
      setActive: (id) => {
        manager.setActive(id);
      },
      pushTemporary: (id) => {
        manager.pushTemporary(id);
      },
      popTemporary: (id) => {
        manager.popTemporary(id);
      },
    };
    const copyName = deps.layerCopyName ?? ((name: string) => `${name} copy`);
    const backgroundName = deps.backgroundName ?? (() => 'Background');
    this.layerManager = new LayerManager({
      document: () => this.doc,
      memory: this.memory,
      env: this.objectEnv,
      scratch: this.exportScratch,
      execute: (command) => this.executeSafe(command),
      notify: (code) => {
        this.notify(code);
      },
      layerName: (kind, n) => this.layerName(kind, n),
      copyName,
      backgroundName,
      createTileStore: () => this.newTileStore(),
      rasterize: (id, vector) => this.rasterize(id, vector),
      settle: () => {
        this.settleObjects();
      },
    });
    this.imageOps = new ImageOps({
      document: () => this.doc,
      memory: this.memory,
      workers: this.workers,
      objectEnv: this.objectEnv,
      execute: (command) => this.executeSafe(command),
      notify: (code) => {
        this.notify(code);
      },
      reportError: (error) => {
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.warn(`[Paint Online] Thao tác ảnh thất bại — ${detail}`, error);
        deps.reportError?.(error);
      },
      settle: () => {
        this.toolManager.cancel();
        this.settleObjects();
        // Layer của nhánh redo (vd. vừa undo một lần cắt xén) giữ bộ nhớ: bỏ trước khi cấp phát.
        this.history.discardRedo();
      },
      setRunning: (running) => {
        this.setBusy(running);
      },
      selectionBounds: () => this.selectionManager.selection?.bounds ?? null,
      finished: () => {
        // Pixel đã đổi chỗ: vùng chọn cũ không còn ý nghĩa.
        this.selectionManager.reset();
      },
    });
    this.filterRunner = new FilterRunner({
      document: () => this.doc,
      memory: this.memory,
      workers: this.workers,
      viewport: this.viewport,
      execute: (command) => this.executeSafe(command),
      createTileStore: () => this.newTileStore(),
      notify: (code) => {
        this.notify(code);
      },
      clip: () => this.selectionManager.clip(),
      settle: () => {
        this.toolManager.cancel();
        this.settleObjects();
      },
      invalidate: (rect) => {
        this.renderer.invalidate(rect);
      },
      setRunning: (running) => {
        this.setBusy(running);
      },
      changed: (summary) => {
        this.events.emit('filterChanged', summary);
        this.input?.refreshCursor();
      },
    });
    this.objects = this.createObjectsAPI();
    this.text = this.createTextAPI();
    this.layers = this.createLayersAPI();
    this.selection = this.createSelectionAPI();
    this.image = this.createImageAPI();
    this.filters = this.createFiltersAPI();
    this.beautify = this.createBeautifyAPI();

    this.viewport.onChange((snapshot) => {
      this.renderer.resize();
      this.renderer.invalidate();
      this.input?.invalidateRect();
      this.input?.refreshCursor();
      // Khung nhìn đổi khi đang xem trước filter: dựng lại bản xem trước của phần đang thấy.
      this.filterRunner.refresh(true);
      this.events.emit('viewportChanged', {
        zoom: snapshot.zoom,
        panX: snapshot.panX,
        panY: snapshot.panY,
        width: snapshot.width,
        height: snapshot.height,
      });
    });
    this.disposers.push(
      this.memory.subscribe((usage) => {
        this.events.emit('memoryChanged', usage);
        this.checkLayerWarning();
      }),
      this.events.on('toolChanged', ({ tool, temporary }) => {
        this.input?.refreshCursor();
        this.record({ type: 'tool', tool });
        // Đổi sang tool khác (không phải tool tạm thời như Pan khi giữ Space): commit pixel nổi.
        if (!temporary && !SELECT_TOOLS.includes(tool)) this.selectionManager.commitFloating();
        // Đổi sang tool khác khi đang gõ chữ: ghi chữ đang gõ, không bỏ dở nội dung đã nhập.
        if (tool !== 'text' && this.textSession.active) {
          this.textSession.commit(this.textSession.current?.object.text ?? '');
        }
      }),
      this.events.on('toolOptionsChanged', ({ group, options }) => {
        this.input?.refreshCursor();
        this.renderer.invalidateOverlay();
        this.record({ type: 'options', group, options: { ...options } });
        // Đổi kiểu chữ trong lúc đang gõ: áp ngay cho chữ đang sửa.
        if (group === 'text' && this.textSession.active) {
          this.textSession.restyle(options);
        }
      }),
      this.events.on('colorsChanged', ({ primary, secondary }) => {
        this.record({ type: 'colors', primary, secondary });
      }),
    );

    this.replayEvent = {
      x: 0,
      y: 0,
      screenX: 0,
      screenY: 0,
      pressure: 0.5,
      tiltX: 0,
      tiltY: 0,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      timeStamp: 0,
      points: this.replaySamples,
      predicted: [],
    };
  }

  // ---------------------------------------------------------------------------
  // Sự kiện
  // ---------------------------------------------------------------------------

  on<K extends keyof EditorEvents>(
    event: K,
    handler: (payload: EditorEvents[K]) => void,
  ): Unsubscribe {
    return this.events.on(event, handler);
  }

  // ---------------------------------------------------------------------------
  // Document
  // ---------------------------------------------------------------------------

  get document(): Document | null {
    return this.doc;
  }

  /**
   * Tạo document mới (thay document hiện tại, xóa lịch sử). Trả false và phát `notice` nếu kích
   * thước vượt giới hạn thiết bị hoặc không đủ bộ nhớ — thao tác bị từ chối an toàn (mục 5.11).
   */
  createDocument(spec: DocumentSpec, options: CreateDocumentOptions = {}): boolean {
    if (!this.memory.allowsDocument(spec.width, spec.height)) {
      this.notify('document.tooLarge');
      return false;
    }
    let doc: Document;
    try {
      doc = Document.create(spec, this.memory);
    } catch (error) {
      if (!isAllocationError(error)) throw error;
      this.notify('memory.refused');
      return false;
    }
    this.toolManager.cancel();
    this.textSession.cancel();
    this.filterRunner.dispose();
    this.selectionManager.reset();
    this.objectController.setPending(null);
    this.objectController.setOverrides(null);
    this.history.clear();
    this.releaseStrokeBuffer();
    this.backdrop.clear();
    this.doc?.dispose();
    this.doc = doc;
    this.docSize = { width: doc.width, height: doc.height };
    this.objectController.clearSelection();
    this.viewport.setDocumentSize(doc.width, doc.height);
    this.viewport.setContentMargin(doc.beautify?.padding ?? 0);
    this.pendingView = options.view ?? null;
    this.pendingFit = false;
    if (this.viewport.hasSize) this.applyInitialView();
    else this.pendingFit = true;
    this.renderer.invalidate();
    this.blackBox = this.startRecorder(new InputRecorder(this.docSize, BLACK_BOX_EVENTS));
    this.emitDocument(true);
    return true;
  }

  /** Dữ liệu document để lưu (mục 6.4). Đối tượng là giá trị bất biến nên không cần sao sâu. */
  serialize(): DocumentData | null {
    return this.doc?.serialize() ?? null;
  }

  /**
   * Pha "Chụp" của autosave (mục 6.6): ImageBitmap của mọi layer raster có nội dung và có
   * `contentRev` khác giá trị đã lưu. `createImageBitmap` chụp nội dung ngay lúc gọi, nên người
   * dùng vẽ tiếp được ngay sau lời gọi này (quyết định chờ đo ở mục 10.4, có test).
   */
  captureLayers(saved: ReadonlyMap<ID, number>): LayerCapture[] {
    const doc = this.doc;
    if (!doc) return [];
    const captures: LayerCapture[] = [];
    for (const layer of doc.layers) {
      if (layer.kind !== 'raster') continue;
      const bounds = layer.bounds;
      const surface = layer.surface.surface;
      if (!bounds || !surface) continue;
      if (saved.get(layer.id) === layer.contentRev) continue;
      captures.push({
        layerId: layer.id,
        contentRev: layer.contentRev,
        bounds: { ...bounds },
        bitmap: createImageBitmap(surface.canvas),
      });
    }
    return captures;
  }

  /** Ảnh thu nhỏ (cạnh dài `maxSide` px) của ảnh đã ghép — lưới project ở trang chủ (mục 6.4). */
  async renderThumbnail(maxSide = 320): Promise<ImageBitmap> {
    const doc = this.doc;
    if (!doc) throw new Error('Chưa có document');
    const scale = Math.min(1, maxSide / Math.max(doc.width, doc.height));
    const width = Math.max(1, Math.round(doc.width * scale));
    const height = Math.max(1, Math.round(doc.height * scale));
    const surface = createSurface(this.memory, width, height, 'temp');
    try {
      const ctx = surface.ctx;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      compositeDocument(ctx, doc, {
        region: doc.bounds,
        includeBackground: true,
        preview: null,
        scratch: this.exportScratch,
        objects: this.objectState(false),
      });
      return await createImageBitmap(surface.canvas);
    } finally {
      surface.release();
      this.exportScratch.trim();
    }
  }

  /** Khung nhìn hiện tại (lưu vào phiên làm việc). */
  get view(): ViewData {
    const { zoom, panX, panY } = this.viewport.state;
    return { zoom, panX, panY };
  }

  /**
   * Chế độ chỉ đọc (tab khác giữ khóa project — mục 6.6): mọi Command bị từ chối có thông báo,
   * chỉ còn xem, zoom, pan, lấy màu, copy và export.
   */
  setReadOnly(readOnly: boolean): void {
    if (this.isReadOnly === readOnly) return;
    this.isReadOnly = readOnly;
    if (readOnly) {
      this.toolManager.cancel();
      this.filterRunner.dispose();
      this.textSession.cancel();
      this.objectController.clearSelection();
      this.selectionManager.reset();
    }
    this.input?.refreshCursor();
  }

  get readOnly(): boolean {
    return this.isReadOnly;
  }

  /** Thực thi một Command: vào history, tăng `document.rev` (quy tắc 13.1.4). */
  execute(command: Command): void {
    const doc = this.doc;
    if (!doc) return;
    if (this.isReadOnly) {
      command.dispose?.();
      this.notify('document.readOnly');
      return;
    }
    this.history.execute(command, doc);
    const area = command.affectedArea?.() ?? null;
    this.syncGeometry();
    this.renderer.contentChanged(area);
    this.renderer.invalidate(area ?? undefined);
    this.emitDocument(area === null);
  }

  /**
   * Phần ngân sách bộ nhớ dành cho lịch sử hoàn tác (Cài đặt — mục 7.3); giảm thì bỏ bớt bước cũ
   * nhất ngay.
   */
  setHistoryShare(share: number): void {
    this.memory.setHistoryShare(share);
    this.history.enforceLimits();
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  undo(): boolean {
    return this.step('undo');
  }

  redo(): boolean {
    return this.step('redo');
  }

  historySummary(): ReturnType<History['summary']> {
    return this.history.summary();
  }

  /**
   * Nhảy tới một bước bất kỳ trong panel History: `position` = số bước được áp dụng (0 = trước mọi
   * thay đổi). Trả false nếu không đi được (đang kéo, chỉ đọc, thiếu bộ nhớ ở bước đầu tiên).
   */
  historyGoTo(position: number): boolean {
    const doc = this.doc;
    if (!doc || this.toolManager.isGestureActive || this.isBusy) return false;
    if (this.filterRunner.isOpen) return false;
    if (this.isReadOnly) {
      this.notify('document.readOnly');
      return false;
    }
    if (position === this.history.summary().position) return false;
    this.textSession.cancel();
    this.selectionManager.cancelFloating();
    let moved = 0;
    try {
      moved = this.history.goTo(position, doc);
    } catch (error) {
      if (!isAllocationError(error)) throw error;
      this.notify('memory.refused');
    }
    if (moved === 0) return false;
    this.syncGeometry();
    this.renderer.contentChanged(null);
    this.renderer.invalidate();
    this.objectController.prune();
    this.emitDocument(true);
    return true;
  }

  /** Esc: hủy thao tác đang kéo (nét vẽ dở không vào history). */
  cancelGesture(): void {
    this.toolManager.cancel();
  }

  get isGestureActive(): boolean {
    return this.toolManager.isGestureActive;
  }

  /** Đang chờ tác vụ nền (tô loang trong Worker). */
  get busy(): boolean {
    return this.isBusy;
  }

  /**
   * Phím khi focus ở vùng làm việc: chuyển cho tool trước (Enter/Esc/Backspace của Polygon…).
   * Trả true nếu đã xử lý.
   */
  keyDown(e: KeyboardEvent): boolean {
    // Bảng điều chỉnh đang mở: Enter áp dụng, Esc hủy (mục 7.3).
    if (this.filterRunner.isOpen && (e.key === 'Enter' || e.key === 'Escape')) {
      if (e.key === 'Escape') this.filterRunner.cancel();
      else if (!this.filterRunner.isApplying) void this.filterRunner.apply();
      return true;
    }
    if (this.textSession.active) return false;
    // Pixel nổi: Enter commit, Esc hủy (mục 7.7) — trước cả tool.
    if (this.selectionManager.floating && (e.key === 'Enter' || e.key === 'Escape')) {
      if (e.key === 'Enter') this.selectionManager.commitFloating();
      else this.selectionManager.cancelFloating();
      return true;
    }
    const handled = this.toolManager.keyDown(e);
    if (handled) this.input?.refreshCursor();
    return handled;
  }

  /** Sửa chữ của đối tượng chữ đang chọn (Enter ở tool Select). */
  editSelectedText(): boolean {
    const ids = this.objectController.selection;
    const hit = ids.length === 1 && ids[0] ? this.objectController.find(ids[0]) : null;
    if (hit?.object.type !== 'text') return false;
    this.textSession.begin(hit.object, hit.object.id);
    return true;
  }

  /**
   * Chọn màu từ UI (bảng màu, bộ chọn màu): đổi màu chính/phụ và áp vào chữ đang sửa hoặc đối
   * tượng đang chọn (mục 7.2). `transient` = đang kéo trong bộ chọn màu.
   */
  pickColor(slot: 'primary' | 'secondary', color: Color, options: SetColorOptions = {}): void {
    if (slot === 'primary') this.colors.setPrimary(color, options);
    else this.colors.setSecondary(color, options);
    const applied = slot === 'primary' ? this.colors.primary : this.colors.secondary;
    if (this.textSession.active) {
      this.textSession.recolor(slot, applied);
    } else if (this.objectController.hasSelection) {
      this.objectController.applyColor(slot, applied, `color-${slot}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Hiển thị
  // ---------------------------------------------------------------------------

  /** Gắn engine vào một phần tử DOM: tạo display/overlay canvas, nghe input, resize, DPR. */
  mount(container: HTMLElement): void {
    this.unmount();
    // Canvas con định vị tuyệt đối theo khung; giữ nguyên nếu khung đã được định vị.
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.touchAction = 'none';
    this.renderer.attach(container);
    const overlay = this.renderer.overlayElement;
    if (!overlay) return;

    this.input = new InputManager(overlay, this.viewport, this.inputHandlers(), this.platform);

    const measure = () => {
      this.viewport.setSize(container.clientWidth, container.clientHeight);
      this.input?.invalidateRect();
      if (this.pendingFit && this.viewport.hasSize && this.doc) {
        this.pendingFit = false;
        this.applyInitialView();
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    this.unmountFns.push(() => {
      observer.disconnect();
    });

    // DPR đổi khi kéo cửa sổ sang màn hình khác hoặc zoom trang (mục 5.1, 7.9).
    let dprQuery: MediaQueryList | null = null;
    const watchDpr = () => {
      dprQuery?.removeEventListener('change', watchDpr);
      this.viewport.setDpr(window.devicePixelRatio || 1);
      dprQuery = window.matchMedia(`(resolution: ${String(window.devicePixelRatio || 1)}dppx)`);
      dprQuery.addEventListener('change', watchDpr);
    };
    watchDpr();
    this.unmountFns.push(() => {
      dprQuery?.removeEventListener('change', watchDpr);
    });

    const onVisibility = () => {
      const hidden = document.visibilityState === 'hidden';
      this.renderer.setPaused(hidden);
      this.updateAnts();
      // Tab nền: trả bộ nhớ tạm (mục 7.9).
      if (hidden && !this.toolManager.isGestureActive) this.releaseStrokeBuffer();
      if (hidden) this.backdrop.clear();
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.unmountFns.push(() => {
      document.removeEventListener('visibilitychange', onVisibility);
    });

    measure();
    this.renderer.resize();
    this.input.refreshCursor();
    this.updateAnts();
  }

  unmount(): void {
    this.toolManager.cancel();
    for (const fn of this.unmountFns.splice(0)) fn();
    this.input?.dispose();
    this.input = null;
    this.renderer.detach();
    this.hoverPoint = null;
    this.updateAnts();
  }

  get isMounted(): boolean {
    return this.renderer.isAttached;
  }

  setAppearance(appearance: Partial<Appearance>): void {
    this.renderer.setAppearance(appearance);
  }

  /** Vẽ ngay frame đang chờ (test, benchmark). */
  flush(): void {
    this.renderer.flush();
  }

  /** Bật/tắt Below/Above cache và mipmap của màn hình (benchmark mục 10.4, test). */
  setRenderCacheOptions(options: Partial<RenderCacheOptions>): void {
    this.renderer.setCacheOptions(options);
  }

  get renderCacheStats(): RenderCacheStats {
    return this.renderer.cacheStats;
  }

  onFrame(listener: ((stats: FrameStats) => void) | null): void {
    this.renderer.onFrame(listener);
  }

  /** Canvas hiển thị (test so pixel màn hình). */
  get displayCanvas(): HTMLCanvasElement | null {
    return this.renderer.displayCanvas;
  }

  // ---------------------------------------------------------------------------
  // Xuất ảnh
  // ---------------------------------------------------------------------------

  /** Ghép document (đã nướng mọi hiệu ứng) thành Blob ảnh — export và copy clipboard. */
  async exportImage(options: ExportOptions = {}): Promise<Blob> {
    const doc = this.doc;
    if (!doc) throw new Error('Chưa có document');
    const scale = Math.min(2, Math.max(0.1, options.scale ?? 1));
    const selection = options.selectionOnly ? this.selectionManager.selection : null;
    const region = selection?.bounds ?? doc.bounds;
    const beautify = options.beautify && !selection ? doc.beautify : null;
    const frame = beautify ? beautifyFrame(region, beautify) : region;
    const width = Math.max(1, Math.round(frame.width * scale));
    const height = Math.max(1, Math.round(frame.height * scale));
    const type = options.type ?? 'image/png';
    const surface = createSurface(this.memory, width, height, 'temp');
    try {
      const ctx = surface.ctx;
      // Màu lót là nền mà layer (kể cả blend mode) ghép lên — như khi xuất cả ảnh.
      if (options.matte && !selection) {
        ctx.fillStyle = options.matte;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.setTransform(scale, 0, 0, scale, -frame.x * scale, -frame.y * scale);
      ctx.imageSmoothingEnabled = scale !== 1;
      ctx.imageSmoothingQuality = 'high';
      if (beautify) {
        paintBeautifyFrame(ctx, region, beautify);
        ctx.save();
        clipToImage(ctx, region, beautify);
      }
      compositeDocument(ctx, doc, {
        region,
        includeBackground: true,
        preview: null,
        scratch: this.exportScratch,
        objects: this.objectState(false),
      });
      if (beautify) ctx.restore();
      // Chỉ vùng chọn: bỏ phần ngoài hình vùng chọn (ellipse, Lasso, mask).
      if (selection) {
        ctx.globalCompositeOperation = 'destination-in';
        selection.cover(ctx);
      }
      if (options.matte && selection) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = options.matte;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.globalCompositeOperation = 'source-over';
      const canvas = surface.canvas;
      if ('convertToBlob' in canvas) {
        return await canvas.convertToBlob({ type, quality: options.quality });
      }
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Không mã hóa được ảnh'));
          },
          type,
          options.quality,
        );
      });
    } finally {
      surface.release();
      this.exportScratch.trim();
    }
  }

  /** Pixel ảnh đã ghép (không preview, không bản nháp) — test pixel, eyedropper, tô loang. */
  readPixels(rect?: Readonly<Rect>): ImageData {
    const doc = this.doc;
    if (!doc) throw new Error('Chưa có document');
    const r = rect ?? doc.bounds;
    // Ghép trên canvas GPU (không `willReadFrequently`) rồi đọc ngược đúng vùng `r`: vẽ layer GPU
    // sang canvas CPU khiến Chromium đọc ngược CẢ texture nguồn — đo ở GĐ9: đọc 1 pixel của ảnh
    // 4K × 5 layer mất 266 ms (lấy màu, mở project).
    const surface = createSurface(this.memory, r.width, r.height, 'temp');
    try {
      const ctx = surface.ctx;
      ctx.setTransform(1, 0, 0, 1, -r.x, -r.y);
      compositeDocument(ctx, doc, {
        region: r,
        includeBackground: true,
        preview: null,
        scratch: this.exportScratch,
        objects: this.objectState(false),
      });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return ctx.getImageData(0, 0, r.width, r.height);
    } finally {
      surface.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Input recorder (mục 11.1) và phát lại
  // ---------------------------------------------------------------------------

  startRecording(): void {
    const doc = this.doc;
    if (!doc) return;
    this.recorder = this.startRecorder(new InputRecorder({ width: doc.width, height: doc.height }));
  }

  /** Các thao tác gần nhất (tối đa `BLACK_BOX_EVENTS` sự kiện) — đính kèm nhật ký lỗi. */
  recentInput(): Recording | null {
    return this.blackBox?.finish() ?? null;
  }

  private startRecorder(recorder: InputRecorder): InputRecorder {
    recorder.record({ type: 'tool', tool: this.toolManager.activeId });
    const primary = this.colors.primary;
    recorder.record({ type: 'colors', primary, secondary: this.colors.secondary });
    for (const group of ['brush', 'eraser'] as const) {
      recorder.record({ type: 'options', group, options: { ...this.options.get(group) } });
    }
    return recorder;
  }

  private record(event: Parameters<InputRecorder['record']>[0]): void {
    this.recorder?.record(event);
    this.blackBox?.record(event);
  }

  stopRecording(): Recording | null {
    const recording = this.recorder?.finish() ?? null;
    this.recorder = null;
    return recording;
  }

  get isRecording(): boolean {
    return this.recorder !== null;
  }

  /** Áp dụng một sự kiện đã ghi (dùng bởi replay và test). */
  applyRecorded(event: RecordedEvent): void {
    switch (event.type) {
      case 'down':
      case 'move':
      case 'up':
        this.dispatchPointer(event.type, {
          x: event.x,
          y: event.y,
          pressure: event.pressure,
          points: event.points?.map(([x, y, pressure]) => ({ x, y, pressure })),
          button: event.button,
          pointerType: event.pointerType,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
        });
        break;
      case 'cancel':
        this.toolManager.cancel();
        break;
      case 'tool':
        this.toolManager.setActive(event.tool);
        break;
      case 'options':
        this.options.set(event.group, event.options);
        break;
      case 'colors':
        this.colors.setPrimary(event.primary);
        this.colors.setSecondary(event.secondary);
        break;
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
    }
  }

  /** Đưa một sự kiện con trỏ (tọa độ document) vào tool hiện tại — không cần DOM. */
  dispatchPointer(type: 'down' | 'move' | 'up', init: PointerInit): void {
    const e = this.replayEvent;
    const screen = this.viewport.docToScreen(init);
    e.x = init.x;
    e.y = init.y;
    e.screenX = screen.x;
    e.screenY = screen.y;
    e.pressure = init.pressure ?? 0.5;
    e.pointerType = init.pointerType ?? 'mouse';
    e.button = init.button ?? 0;
    e.buttons = type === 'up' ? 0 : 1;
    e.shiftKey = init.shiftKey ?? false;
    e.altKey = init.altKey ?? false;
    e.timeStamp = performance.now();
    const samples = this.replaySamples;
    samples.length = 0;
    if (init.points && init.points.length > 0) {
      for (const p of init.points) samples.push({ x: p.x, y: p.y, pressure: p.pressure });
    } else {
      samples.push({ x: init.x, y: init.y, pressure: e.pressure });
    }
    const handlers = this.inputHandlers();
    if (type === 'down') handlers.down(e);
    else if (type === 'move') handlers.move(e);
    else handlers.up(e);
  }

  dispose(): void {
    window.clearTimeout(this.brushHudTimer);
    this.brushHud = null;
    this.unmount();
    this.filterRunner.dispose();
    this.textSession.cancel();
    this.selectionManager.dispose();
    this.updateAnts();
    this.toolManager.dispose();
    this.history.dispose();
    this.releaseStrokeBuffer();
    this.backdrop.clear();
    this.doc?.dispose();
    this.doc = null;
    this.blackBox = null;
    this.renderer.dispose();
    this.exportScratch.dispose();
    this.objectEnv.dispose();
    for (const off of this.disposers.splice(0)) off();
    this.events.clear();
  }

  // ---------------------------------------------------------------------------

  private objectState(withDrafts: boolean): ObjectRenderState {
    return {
      env: this.objectEnv,
      overrides: withDrafts ? this.objectController.overrides : null,
      pending: withDrafts ? this.objectController.pending : null,
    };
  }

  private applyInitialView(): void {
    const view = this.pendingView;
    this.pendingView = null;
    if (view && Number.isFinite(view.zoom) && view.zoom > 0) this.viewport.set(view);
    else this.viewport.fitIfLarger();
  }

  private releaseStrokeBuffer(): void {
    this.sharedStroke?.release();
    this.sharedStroke = null;
  }

  /** Chạy command; thiếu bộ nhớ thì từ chối an toàn và báo người dùng (mục 5.11). */
  private executeSafe(command: Command): boolean {
    if (this.isReadOnly) {
      command.dispose?.();
      this.notify('document.readOnly');
      return false;
    }
    try {
      this.execute(command);
      return true;
    } catch (error) {
      if (!isAllocationError(error)) throw error;
      command.dispose?.();
      this.notify('memory.refused');
      return false;
    }
  }

  private step(direction: 'undo' | 'redo'): boolean {
    const doc = this.doc;
    if (!doc || this.toolManager.isGestureActive || this.isBusy) return false;
    // Bảng điều chỉnh đang mở: Hủy hoặc Áp dụng trước (bản xem trước dựa trên ảnh hiện tại).
    if (this.filterRunner.isOpen) return false;
    if (this.isReadOnly) {
      this.notify('document.readOnly');
      return false;
    }
    this.textSession.cancel();
    // Ctrl+Z khi đang có pixel nổi: bỏ pixel nổi (chưa có bước history nào cho nó).
    if (this.selectionManager.cancelFloating()) return true;
    let done: Command | null;
    try {
      done = direction === 'undo' ? this.history.undo(doc) : this.history.redo(doc);
    } catch (error) {
      if (!isAllocationError(error)) throw error;
      this.notify('memory.refused');
      return false;
    }
    if (!done) return false;
    this.record({ type: direction });
    this.syncGeometry();
    // Cache chỉ dựng lại vùng của command; màn hình vẽ lại toàn bộ (rẻ: một frame).
    this.renderer.contentChanged(done.affectedArea?.() ?? null);
    this.renderer.invalidate();
    this.objectController.prune();
    this.emitDocument(true);
    return true;
  }

  /**
   * Layer của document chiếm gần hết phần 60% của chúng: gợi ý Merge/Flatten một lần (mục 5.11).
   * Chỉ tính layer đang thuộc document — layer cũ nằm trong history (vừa cắt xén, xóa) sắp được nén,
   * không phải lý do để cảnh báo.
   */
  private checkLayerWarning(): void {
    const doc = this.doc;
    const limit = this.memory.limitFor('layer');
    if (!doc || limit <= 0) return;
    let bytes = 0;
    for (const layer of doc.layers) if (layer.kind === 'raster') bytes += layer.surface.bytes;
    const ratio = Math.min(this.memory.layerRatio, bytes / limit);
    if (!this.layerWarning && ratio >= LAYER_WARNING_RATIO) {
      this.layerWarning = true;
      queueMicrotask(() => {
        this.notify('memory.layersHigh');
      });
    } else if (this.layerWarning && ratio < LAYER_WARNING_RATIO - 0.1) {
      this.layerWarning = false;
    }
  }

  private emitDocument(structural: boolean): void {
    const doc = this.doc;
    if (!doc) return;
    if (structural) this.checkLayerWarning();
    const summary = doc.summary();
    this.events.emit('documentChanged', summary);
    if (structural) {
      this.events.emit('layersChanged', summary);
      this.events.emit('historyChanged', this.history.summary());
    }
    // Ảnh hoặc layer hoạt động đổi khi đang xem trước filter: làm mới (hoặc đóng nếu layer không hợp lệ).
    this.filterRunner.refresh();
  }

  private notify(code: NoticeCode): void {
    // Bị từ chối vì layer đã chiếm hết phần 60% của chúng: gợi ý Merge/Flatten (mục 5.11).
    const refusal = this.memory.takeRefusal();
    const layersFull = refusal?.category === 'layer' && refusal.reason === 'share';
    this.events.emit('notice', {
      code: code === 'memory.refused' && layersFull ? 'memory.layersFull' : code,
    });
  }

  /** Kết thúc phiên gõ chữ và bỏ chọn đối tượng trước thao tác cấu trúc layer. */
  private settleObjects(): void {
    if (this.textSession.active) {
      this.textSession.commit(this.textSession.current?.object.text ?? '');
    }
    this.objectController.clearSelection();
    this.selectionManager.commitFloating();
  }

  private newTileStore(): TileStore {
    return new TileStore(this.memory, (bytes) => this.history.makeRoom(bytes));
  }

  private setBusy(busy: boolean): void {
    if (this.isBusy === busy) return;
    this.isBusy = busy;
    this.input?.refreshCursor();
    this.events.emit('busyChanged', busy);
  }

  // ---------------------------------------------------------------------------
  // Layer đích của tool pixel (mục 5.3)
  // ---------------------------------------------------------------------------

  private paintChoices(kind: PaintTargetKind): PaintTargetChoice[] {
    if (kind === 'draw') return ['new-layer', 'rasterize'];
    return this.rasterBelow() ? ['layer-below', 'rasterize'] : ['rasterize'];
  }

  private rasterBelow(): RasterLayer | null {
    const doc = this.doc;
    if (!doc) return null;
    for (let i = doc.indexOfLayer(doc.activeLayerId) - 1; i >= 0; i--) {
      const layer = doc.layers[i];
      if (layer.kind === 'raster' && layer.visible && !layer.locked) return layer;
    }
    return null;
  }

  private paintTarget(kind: PaintTargetKind, tool: ToolId): RasterLayer | null {
    const doc = this.doc;
    if (!doc) return null;
    const active = doc.activeLayer;
    if (active.kind === 'raster') return active;
    const policy = this.policy[kind];
    const choices = this.paintChoices(kind);
    if (policy === 'ask' || !choices.includes(policy)) {
      this.events.emit('paintTargetRequired', { kind, tool, choices });
      return null;
    }
    return this.applyPaintChoice(policy);
  }

  private applyPaintChoice(choice: PaintTargetChoice): RasterLayer | null {
    const doc = this.doc;
    if (!doc) return null;
    const active = doc.activeLayer;
    if (active.kind === 'raster') return active;
    if (choice === 'layer-below') {
      const below = this.rasterBelow();
      if (!below) {
        this.notify('layer.noRasterBelow');
        return null;
      }
      this.objectController.clearSelection();
      doc.activeLayerId = below.id;
      this.emitDocument(true);
      return below;
    }
    if (choice === 'new-layer') {
      const n = doc.layers.filter((l) => l.kind === 'raster').length + 1;
      let layer: RasterLayer;
      try {
        layer = new RasterLayer({ name: this.layerName('raster', n) }, this.memory, doc.bounds);
      } catch (error) {
        if (!isAllocationError(error)) throw error;
        this.notify('memory.refused');
        return null;
      }
      const index = doc.indexOfLayer(active.id) + 1;
      if (!this.executeSafe(new AddLayerCommand('history.addLayer', layer, index))) return null;
      this.objectController.clearSelection();
      return layer;
    }
    const command = new RasterizeLayerCommand('history.rasterize', active, (id, vector) =>
      this.rasterize(id, vector),
    );
    if (!this.executeSafe(command)) return null;
    this.objectController.clearSelection();
    const raster = doc.getLayer(command.rasterId);
    return raster?.kind === 'raster' ? raster : null;
  }

  /** Dựng layer raster từ đối tượng của layer chú thích (ảnh render cuối cùng — mục 5.4). */
  private rasterize(id: ID, vector: VectorLayer): RasterLayer {
    const doc = this.doc;
    if (!doc) throw new Error('Chưa có document');
    const raster = new RasterLayer(
      {
        id,
        name: vector.name,
        visible: vector.visible,
        locked: vector.locked,
        alphaLocked: vector.alphaLocked,
        opacity: vector.opacity,
        blendMode: vector.blendMode,
      },
      this.memory,
      doc.bounds,
    );
    let area: Rect | null = null;
    for (const obj of vector.objects) {
      const b = rendererFor(obj)?.bounds(obj, this.objectEnv);
      if (b) area = area ? unionRect(area, b) : b;
    }
    const clipped = area ? intersectRect(area, doc.bounds) : null;
    if (clipped && !isEmptyRect(clipped) && raster.surface.ensure(clipped)) {
      const session = raster.surface.begin();
      if (session) {
        drawObjects(session.ctx, vector.objects, clipped, this.objectEnv, null, {
          kind: 'layer',
          id: vector.id,
        });
        session.end();
      }
    }
    touchContent(raster);
    return raster;
  }

  // ---------------------------------------------------------------------------
  // API con
  // ---------------------------------------------------------------------------

  /**
   * Document vừa đổi kích thước (Crop, Resize, Canvas size, xoay 90° — hoặc undo của chúng): khung
   * nhìn, cache, stroke buffer theo kích thước mới; vùng chọn cũ không còn đúng chỗ.
   */
  private syncGeometry(): void {
    const doc = this.doc;
    if (!doc) return;
    this.viewport.setContentMargin(doc.beautify?.padding ?? 0);
    if (doc.width === this.docSize.width && doc.height === this.docSize.height) return;
    this.docSize = { width: doc.width, height: doc.height };
    this.selectionManager.reset();
    this.releaseStrokeBuffer();
    this.viewport.setDocumentSize(doc.width, doc.height);
    if (this.viewport.hasSize) this.viewport.fitIfLarger();
    this.renderer.resetCaches();
  }

  /** Marching ants chạy khi có vùng chọn, editor đang hiện và tab đang mở (mục 5.7). */
  private updateAnts(): void {
    const run =
      this.selectionManager.active &&
      this.renderer.isAttached &&
      typeof document !== 'undefined' &&
      document.visibilityState !== 'hidden';
    if (run && !this.antsTimer) {
      this.antsTimer = setInterval(() => {
        this.selectionManager.antsPhase = (this.selectionManager.antsPhase + 1) % 8;
        this.renderer.invalidateOverlay();
      }, ANTS_INTERVAL_MS);
    } else if (!run && this.antsTimer) {
      clearInterval(this.antsTimer);
      this.antsTimer = null;
    }
  }

  private createSelectionAPI(): SelectionAPI {
    const manager = this.selectionManager;
    /** Thao tác đổi pixel: chặn ở chế độ chỉ đọc và khi đang biến đổi ảnh. */
    const writable = (): boolean => {
      if (!this.doc || this.imageOps.isRunning) return false;
      if (this.filterRunner.isOpen) {
        this.notify('filter.open');
        return false;
      }
      if (this.isReadOnly) {
        this.notify('document.readOnly');
        return false;
      }
      this.toolManager.cancel();
      return true;
    };
    return {
      get summary() {
        return manager.summary();
      },
      get hasSelection() {
        return manager.active;
      },
      get isFloating() {
        return manager.floating !== null;
      },
      select: (shape, mode = 'replace') => {
        if (!this.doc) return;
        const o = this.options.get('selection');
        manager.applyShape(shape, mode, { feather: o.feather, antiAlias: o.antiAlias });
      },
      selectAll: () => {
        manager.selectAll();
      },
      deselect: () => {
        manager.deselect();
      },
      invert: () => {
        manager.invert();
      },
      transform: () => {
        if (!writable()) return false;
        if (manager.floating) return true;
        if (!manager.selection) manager.selectAll();
        return manager.lift(false);
      },
      commit: () => manager.commitFloating(),
      cancel: () => manager.cancelFloating(),
      deleteContent: () => writable() && manager.deleteContent(),
      fill: () => writable() && manager.fillContent(),
      redact: () => {
        const summary = manager.summary();
        if (!writable() || !summary || summary.floating) return false;
        const object = redactObject(summary.bounds, this.options.get('redact'));
        if (!this.objectController.add(object, 'history.addRedact')) return false;
        manager.deselect();
        return true;
      },
      copy: (merged = false) => manager.copy(merged),
      cut: () => (writable() ? manager.cut() : null),
      paste: (image, at = null) => {
        if (!writable() || !manager.paste(image, at)) return false;
        // Ảnh dán/thả đang nổi để di chuyển ngay (mục 7.4): đang ở tool khác thì sang tool Chọn.
        if (!SELECT_TOOLS.includes(this.toolManager.selectedId))
          this.toolManager.setActive('select');
        return true;
      },
      rotate: (quarterTurns) => writable() && manager.rotate(quarterTurns),
      flip: (axis) => writable() && manager.flip(axis),
      nudge: (dx, dy) => writable() && manager.nudge(dx, dy),
      contains: (p) => manager.contains(p),
    };
  }

  private createImageAPI(): ImageAPI {
    const ops = this.imageOps;
    const guard = (run: () => Promise<boolean>): Promise<boolean> => {
      if (!this.doc || ops.isRunning || this.isBusy) return Promise.resolve(false);
      if (this.filterRunner.isOpen) {
        this.notify('filter.open');
        return Promise.resolve(false);
      }
      if (this.isReadOnly) {
        this.notify('document.readOnly');
        return Promise.resolve(false);
      }
      return run();
    };
    return {
      get busy() {
        return ops.isRunning;
      },
      crop: (rect) => guard(() => ops.crop(rect)),
      cropToSelection: () =>
        guard(() => {
          this.selectionManager.commitFloating();
          return ops.cropToSelection();
        }),
      trim: () => guard(() => ops.trim()),
      resize: (width, height, quality = 'smooth') =>
        guard(() => ops.resize(width, height, quality)),
      canvasSize: (width, height, anchor = 'center') =>
        guard(() => ops.canvasSize(width, height, anchor)),
      rotate: (angle, scope = 'image') => guard(() => ops.rotate(angle, scope)),
      flip: (axis, scope = 'image') => guard(() => ops.flip(axis, scope)),
    };
  }

  private createFiltersAPI(): FiltersAPI {
    const runner = this.filterRunner;
    const allowed = (): boolean => {
      if (!this.doc || this.imageOps.isRunning || runner.isApplying) return false;
      if (this.isBusy && !runner.isOpen) return false;
      if (this.isReadOnly) {
        this.notify('document.readOnly');
        return false;
      }
      return true;
    };
    return {
      get state() {
        return runner.summary();
      },
      get isOpen() {
        return runner.isOpen;
      },
      begin: (steps, label) => allowed() && runner.open(steps, label),
      update: (steps) => {
        runner.update(steps);
      },
      compare: (showOriginal) => {
        runner.setComparing(showOriginal);
      },
      apply: () => runner.apply(),
      cancel: () => {
        runner.cancel();
      },
      run: (steps, label) => (allowed() ? runner.run(steps, label) : Promise.resolve(false)),
      get previewStats() {
        return runner.stats;
      },
    };
  }

  private createObjectsAPI(): ObjectsAPI {
    const controller = this.objectController;
    const find = (id: ID) => controller.find(id)?.object ?? null;
    return {
      get selection() {
        return controller.selection;
      },
      get hasSelection() {
        return controller.hasSelection;
      },
      select: (ids) => {
        controller.select(ids);
      },
      clearSelection: () => {
        controller.clearSelection();
      },
      deleteSelected: () => controller.deleteSelected(),
      bringToFront: () => controller.reorderSelected('front'),
      sendToBack: () => controller.reorderSelected('back'),
      nudge: (dx, dy) => controller.nudge(dx, dy),
      applyStyle: (group, patch) => {
        // Validate theo schema rồi chỉ áp các khóa đã đổi; option của tool cũng được cập nhật.
        const valid = validateOptions(this.options.get(group), patch, OPTION_SCHEMAS[group]);
        this.options.set(group, patch);
        const applied: Record<string, unknown> = {};
        const validated = valid as unknown as Record<string, unknown>;
        for (const key of Object.keys(patch)) applied[key] = validated[key];
        // Redact đổi chế độ: đối tượng nhận cường độ của chế độ mới từ option hiện tại.
        if (group === 'redact' && 'mode' in patch) {
          applied.blockSize = validated.blockSize;
          applied.blurRadius = validated.blurRadius;
        }
        controller.applyStyle(applied, `style-${group}-${Object.keys(patch).join(',')}`);
      },
      applyPreset: (group, patch, colors) => {
        if (this.textSession.active) {
          this.textSession.commit(this.textSession.current?.object.text ?? '');
        }
        this.options.set(group, patch);
        if (colors.primary) this.colors.setPrimary(colors.primary);
        if (colors.secondary) this.colors.setSecondary(colors.secondary);
        const valid = this.options.get(group) as unknown as Record<string, unknown>;
        const applied: Record<string, unknown> = {};
        for (const key of Object.keys(patch)) applied[key] = valid[key];
        if (controller.hasSelection) controller.applyPreset(group, applied, colors);
      },
      get: find,
      selectionBounds: () => controller.selectionBounds(),
      align: (mode) => !this.isReadOnly && controller.align(mode),
    };
  }

  private createBeautifyAPI(): BeautifyAPI {
    let last: BeautifySettings = { ...BEAUTIFY_DEFAULTS };
    const currentDoc = () => this.doc;
    return {
      get settings() {
        return currentDoc()?.beautify ?? null;
      },
      get preferred() {
        return { ...(currentDoc()?.beautify ?? last) };
      },
      set: (patch) => {
        const doc = this.doc;
        if (!doc || this.isBusy || this.filterRunner.isOpen) return false;
        const current = doc.beautify;
        if (current) last = { ...current };
        const next = patch === null ? null : normalizeBeautify(patch, current ?? last);
        const same =
          next === null
            ? current === null
            : current !== null &&
              (Object.keys(next) as (keyof BeautifySettings)[]).every(
                (k) => next[k] === current[k],
              );
        if (same) return false;
        return this.executeSafe(new BeautifyCommand(next));
      },
    };
  }

  private createTextAPI(): TextAPI {
    const session = this.textSession;
    return {
      get current() {
        return session.current;
      },
      update: (text) => {
        session.update(text);
      },
      commit: (text) => {
        session.commit(text);
      },
      cancel: () => {
        session.cancel();
      },
    };
  }

  private createLayersAPI(): LayersAPI {
    const manager = this.layerManager;
    /** Thao tác layer: commit pixel nổi trước khi tính vị trí layer (ảnh vừa dán thêm một layer). */
    const settled =
      <A extends unknown[], R>(fn: (...args: A) => R) =>
      (...args: A): R => {
        this.selectionManager.commitFloating();
        return fn(...args);
      };
    return {
      paintPolicy: this.policy,
      setPaintPolicy: (kind, policy) => {
        this.policy[kind] = policy;
      },
      choosePaintTarget: (kind, choice, remember) => {
        if (remember) this.policy[kind] = choice;
        return this.applyPaintChoice(choice) !== null;
      },
      setActive: (id) => {
        const doc = this.doc;
        if (!doc?.getLayer(id) || doc.activeLayerId === id) return;
        this.settleObjects();
        if (!doc.getLayer(id)) return;
        doc.activeLayerId = id;
        // Đổi layer hoạt động đổi cách chia Below/Above cache.
        this.renderer.invalidate();
        this.emitDocument(true);
      },
      add: settled((kind?: 'raster' | 'vector') => manager.add(kind)),
      duplicate: settled((id: ID) => manager.duplicate(id)),
      remove: settled((id: ID) => manager.remove(id)),
      move: settled((id: ID, index: number) => manager.move(id, index)),
      setProps: settled((id: ID, patch: Partial<LayerProps>) => manager.setProps(id, patch)),
      canMergeDown: (id) => manager.mergeDownBlocker(id) !== 'no-layer-below',
      mergeDown: settled((id: ID) => manager.mergeDown(id)),
      canMergeVisible: () => manager.mergeVisibleCandidates().length >= 2,
      mergeVisible: settled(() => manager.mergeVisible()),
      canFlatten: () => manager.canFlatten(),
      flatten: settled(() => manager.flatten()),
      rasterize: settled((id: ID) => manager.rasterize(id)),
      thumbnail: (id, maxSide) => manager.thumbnail(id, maxSide),
    };
  }

  private inputHandlers(): InputHandlers {
    return {
      down: (e) => {
        if (!this.doc) return;
        // Đang biến đổi ảnh (Resize, Crop… chạy nền) hoặc áp dụng filter: chưa nhận thao tác mới.
        if (this.imageOps.isRunning || this.filterRunner.isApplying) return;
        // Bảng điều chỉnh đang mở: chỉ xem, zoom, pan, lấy màu (ảnh xem trước dựa trên ảnh hiện tại).
        if (this.filterRunner.isOpen && !READ_ONLY_TOOLS.has(this.toolManager.activeId)) {
          this.notify('filter.open');
          return;
        }
        this.snapPointer('down', e);
        this.recordPointer('down', e);
        // Click ra ngoài khi đang gõ chữ: kết thúc phiên sửa (tool Text tự xử lý click của nó).
        if (this.textSession.active && this.toolManager.activeId !== 'text') {
          this.textSession.commit(this.textSession.current?.object.text ?? '');
        }
        if (this.isReadOnly && !READ_ONLY_TOOLS.has(this.toolManager.activeId)) {
          this.notify('document.readOnly');
          return;
        }
        this.toolManager.pointerDown(e);
      },
      move: (e) => {
        if (!this.doc) return;
        this.snapPointer('move', e);
        this.recordPointer('move', e);
        this.hoverPoint = { x: e.x, y: e.y };
        this.emitPointer();
        this.toolManager.pointerMove(e);
      },
      up: (e) => {
        if (!this.doc) return;
        this.snapPointer('up', e);
        this.recordPointer('up', e);
        this.toolManager.pointerUp(e);
      },
      cancel: () => {
        this.record({ type: 'cancel' });
        this.toolManager.cancel();
      },
      hover: (h) => {
        this.hoverPoint = h ? { x: h.x, y: h.y } : null;
        this.toolManager.setAltKey(h?.altKey ?? false);
        if (h && this.doc) this.toolManager.hover(h);
        this.emitPointer();
        this.renderer.invalidateOverlay();
      },
      contextMenu: (screen) => {
        if (!this.doc) return;
        if (this.textSession.active) {
          this.textSession.commit(this.textSession.current?.object.text ?? '');
        }
        const point = this.viewport.screenToDoc(screen);
        const hit = this.objectController.hitTest(point);
        if (hit && !this.objectController.selection.includes(hit.object.id)) {
          this.objectController.select([hit.object.id]);
        }
        this.events.emit('contextMenu', {
          x: screen.x,
          y: screen.y,
          onObject: hit !== null,
          onSelection: hit === null && this.selectionManager.contains(point),
        });
      },
      beginTemporaryPan: () => {
        this.toolManager.pushTemporary('pan');
      },
      endTemporaryPan: () => {
        this.toolManager.popTemporary('pan');
      },
      cursor: () => this.toolManager.cursor().css,
      adjustStart: (screen) => {
        const group = this.hudGroup();
        if (!group || this.isReadOnly) return false;
        const o = this.options.get(group);
        window.clearTimeout(this.brushHudTimer);
        this.brushHud = {
          group,
          origin: screen,
          startSize: o.size,
          startHardness: o.hardness,
          dragging: true,
        };
        this.renderer.invalidateOverlay();
        return true;
      },
      adjustMove: (screen) => {
        const hud = this.brushHud;
        if (!hud?.dragging) return;
        this.options.set(hud.group, hudValues(hud, screen, this.viewport.zoom));
        this.renderer.invalidateOverlay();
      },
      adjustEnd: () => {
        this.brushHud = null;
        this.renderer.invalidateOverlay();
      },
    };
  }

  /** Lưới hiển thị và bám lưới (Cài đặt / menu Xem). */
  get guides(): Readonly<GuideSettings> {
    return this.guideSettings;
  }

  setGuides(patch: Partial<GuideSettings>): void {
    const next = { ...this.guideSettings, ...patch };
    next.gridSize = Math.min(512, Math.max(4, Math.round(next.gridSize)));
    this.guideSettings = next;
    this.renderer.invalidateOverlay();
  }

  /**
   * Bám lưới: tool hình học nhận tọa độ làm tròn tới giao điểm lưới. Tool Chọn giữ điểm bấm (để
   * hit-test đúng đối tượng) và dời theo bội số khoảng cách lưới.
   */
  private snapPointer(type: 'down' | 'move' | 'up', e: DocPointerEvent): void {
    const { snap, gridSize: size } = this.guideSettings;
    if (!snap || !SNAP_TOOLS.has(this.toolManager.activeId)) {
      this.snapAnchor = null;
      return;
    }
    if (this.toolManager.activeId === 'select') {
      if (type === 'down') {
        this.snapAnchor = { x: e.x, y: e.y };
        return;
      }
      const anchor = this.snapAnchor;
      if (!anchor) return;
      e.x = anchor.x + Math.round((e.x - anchor.x) / size) * size;
      e.y = anchor.y + Math.round((e.y - anchor.y) / size) * size;
      if (type === 'up') this.snapAnchor = null;
      return;
    }
    e.x = Math.round(e.x / size) * size;
    e.y = Math.round(e.y / size) * size;
  }

  /** Nhóm option cọ của tool người dùng đã chọn (bỏ qua tool tạm thời như lấy màu khi giữ Alt). */
  private hudGroup(): HudGroup | null {
    const tool = this.toolManager.selectedId;
    return tool === 'brush' ? 'brush' : tool === 'eraser' ? 'eraser' : null;
  }

  /**
   * Hiện thoáng vòng tròn cỡ cọ tại con trỏ sau khi đổi cỡ/độ cứng bằng `[` `]` (mục 7.6).
   */
  flashBrushHud(): void {
    const group = this.hudGroup();
    const hover = this.hoverPoint;
    if (!group || !hover || this.brushHud?.dragging) return;
    const o = this.options.get(group);
    this.brushHud = {
      group,
      origin: this.viewport.docToScreen(hover),
      startSize: o.size,
      startHardness: o.hardness,
      dragging: false,
    };
    this.renderer.invalidateOverlay();
    window.clearTimeout(this.brushHudTimer);
    this.brushHudTimer = window.setTimeout(() => {
      if (this.brushHud && !this.brushHud.dragging) this.brushHud = null;
      this.renderer.invalidateOverlay();
    }, BRUSH_HUD_FLASH_MS);
  }

  private recordPointer(type: 'down' | 'move' | 'up', e: DocPointerEvent): void {
    if (!this.recorder && !this.blackBox) return;
    this.record({
      type,
      x: e.x,
      y: e.y,
      pressure: e.pressure,
      points: e.points.length > 1 ? e.points.map((p) => [p.x, p.y, p.pressure]) : undefined,
      button: e.button,
      pointerType: e.pointerType,
      shiftKey: e.shiftKey || undefined,
      altKey: e.altKey || undefined,
    });
  }

  private emitPointer(): void {
    const p = this.hoverPoint;
    this.events.emit('pointerMoved', p ? { x: p.x, y: p.y } : null);
  }

  private createToolContext(): ToolContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- getter cần tham chiếu editor
    const editor = this;
    return {
      get document() {
        const doc = editor.doc;
        if (!doc) throw new Error('Tool được gọi khi chưa có document');
        return doc;
      },
      get currentDocument() {
        return editor.doc;
      },
      viewport: this.viewport,
      memory: this.memory,
      execute: (command) => {
        this.execute(command);
      },
      createTileStore: () => this.newTileStore(),
      strokeBuffer: () => {
        const doc = editor.doc;
        if (!doc) throw new Error('Chưa có document');
        this.sharedStroke ??= new GrowableSurface(
          this.memory,
          doc.bounds,
          'temp',
          STROKE_GROWTH_MARGIN,
        );
        return this.sharedStroke;
      },
      recycleStrokeBuffer: (used) => {
        this.sharedStroke?.erase(used);
      },
      invalidate: (rect) => {
        this.renderer.invalidate(rect);
      },
      invalidateOverlay: () => {
        this.renderer.invalidateOverlay();
      },
      options: (group) => this.options.get(group),
      colors: () => this.colors.state(),
      notify: (code) => {
        this.notify(code);
      },
      setStrokePreview: (preview) => {
        // Có vùng chọn: nét chỉ hiện (và chỉ được ghi) bên trong (mục 5.5).
        this.preview = preview ? { ...preview, clip: this.selectionManager.clip() } : null;
      },
      get workers() {
        return editor.workers;
      },
      get objects() {
        return editor.objectController;
      },
      get objectEnv() {
        return editor.objectEnv;
      },
      get text() {
        return editor.textSession;
      },
      get selection() {
        return editor.selectionManager;
      },
      cropDocument: (rect) => {
        void this.imageOps.crop(rect);
      },
      paintTarget: (kind, tool) => this.paintTarget(kind, tool),
      readPixels: (rect) => this.readPixels(rect),
      setColor: (slot, color, transient) => {
        if (slot === 'primary') this.colors.setPrimary(color, { transient });
        else this.colors.setSecondary(color, { transient });
      },
      setBusy: (busy) => {
        this.setBusy(busy);
      },
      get busy() {
        return editor.isBusy;
      },
      refreshCursor: () => {
        this.input?.refreshCursor();
      },
    };
  }
}

/** Tool có cho phép giữ Alt để lấy màu tạm thời không (mục 5.3). */
export function supportsAltEyedropper(tool: ToolId): boolean {
  return getToolDefinition(tool).altEyedropper === true;
}
