import type { Document } from '../core/Document';
import type {
  Color,
  ColorsState,
  NoticeCode,
  OptionGroupId,
  PaintTargetKind,
  Point,
  Rect,
  ToolId,
  ToolOptionsMap,
  WorkerClient,
} from '../core/types';
import type { RasterLayer } from '../layers/layers';
import type { ObjectEnv } from '../layers/objects/types';
import type { Command } from '../history/types';
import type { TileStore } from '../history/TileStore';
import type { GrowableSurface } from '../memory/GrowableSurface';
import type { MemoryBudget } from '../memory/MemoryBudget';
import type { Ctx2D } from '../memory/surfaces';
import type { Viewport } from '../viewport/Viewport';
import type { SelectionManager } from '../selection/SelectionManager';
import type { ObjectController } from './objects/ObjectController';
import type { TextSession } from './objects/TextSession';

export type ToolGroup = 'draw' | 'shape' | 'select' | 'annotate' | 'view';

/** Một mẫu vị trí con trỏ trong tọa độ document. */
export interface PointerSample {
  x: number;
  y: number;
  pressure: number;
}

/**
 * Sự kiện con trỏ đã đổi sang tọa độ document (mục 5.3). Đối tượng được TÁI SỬ DỤNG giữa các
 * sự kiện để không cấp phát trong vòng lặp nóng — tool không được giữ tham chiếu sau khi handler
 * trả về (sao chép giá trị cần dùng).
 */
export interface DocPointerEvent {
  x: number;
  y: number;
  /** Tọa độ trong phần tử canvas, CSS px. */
  screenX: number;
  screenY: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  pointerType: 'mouse' | 'pen' | 'touch';
  button: number;
  buttons: number;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  timeStamp: number;
  /** Mọi điểm từ getCoalescedEvents() (đã gồm điểm hiện tại, ở cuối). */
  points: readonly PointerSample[];
  /** Điểm dự đoán từ getPredictedEvents() — chỉ dùng để vẽ trên overlay. */
  predicted: readonly PointerSample[];
}

export interface CursorState {
  altKey: boolean;
  /** Đang trong một thao tác kéo. */
  active: boolean;
}

export interface CursorSpec {
  /** Giá trị CSS `cursor`. */
  css: string;
}

/** Nét đang vẽ, được Renderer ghép vào layer hoạt động trước khi commit (mục 5.2). */
export interface StrokePreview {
  layerId: string;
  buffer: GrowableSurface;
  opacity: number;
  composite: GlobalCompositeOperation;
  /** Vùng chọn cắt nét (mục 5.5) — Editor tự gắn, tool không cần đặt. */
  clip?: SelectionCoverage | null;
}

/** Độ phủ của vùng chọn: dùng để cắt nét vẽ, tô, xóa, nhấc pixel (mục 5.7). */
export interface SelectionCoverage {
  /** Hình bao (document, số nguyên). */
  readonly bounds: Rect;
  /** Vẽ độ phủ (alpha = mức được chọn) lên context đã đặt ma trận document → đích. */
  cover(ctx: Ctx2D): void;
}

/**
 * Pixel nổi (mục 5.7) được Renderer ghép như một phần của layer: `layerId` là layer chứa nội dung
 * gốc (bị nhấc ra thành lỗ `hole`), hoặc null khi pixel nổi sẽ thành layer mới ngay trên
 * `afterLayerId` (dán, kéo thả ảnh).
 */
export interface FloatingPreview {
  layerId: string | null;
  afterLayerId: string | null;
  hole: SelectionCoverage | null;
  /** Hình bao nội dung nổi sau biến đổi (document). */
  bounds: Rect;
  /** Vẽ nội dung nổi lên context đã đặt ma trận document → đích. */
  draw(ctx: Ctx2D): void;
}

/**
 * Xem trước filter (mục 5.8): ảnh đã lọc (thường là bản thu nhỏ) phủ `rect` (document, có thể lẻ)
 * thay cho pixel của layer `layerId`; có vùng chọn thì chỉ thay bên trong (trộn theo độ phủ).
 */
export interface FilterPreview {
  layerId: string;
  rect: Rect;
  image: CanvasImageSource;
  /** Kích thước ảnh (pixel của `image`). */
  width: number;
  height: number;
  clip: SelectionCoverage | null;
}

export interface OverlayContext {
  ctx: Ctx2D;
  viewport: Viewport;
  /** Vị trí con trỏ (document), null nếu con trỏ ngoài canvas. */
  hover: Point | null;
}

/** Những gì một tool được phép dùng — tool không chạm React hay Zustand (mục 5.3). */
export interface ToolContext {
  readonly document: Document;
  /** Document hiện tại hoặc null (tác vụ bất đồng bộ kiểm tra document còn nguyên không). */
  readonly currentDocument: Document | null;
  readonly viewport: Viewport;
  readonly memory: MemoryBudget;
  execute(command: Command): void;
  /**
   * Stroke buffer dùng chung (sạch) cho nét vẽ mới. Dùng lại giữa các nét để tránh cấp phát canvas
   * lớn mỗi nét (đo ở GĐ1: Firefox cấp phát texture lần đầu rất chậm).
   */
  strokeBuffer(): GrowableSurface;
  /** Trả stroke buffer sau khi commit/hủy: xóa vùng đã vẽ để nét sau dùng lại. */
  recycleStrokeBuffer(used: Rect): void;
  /** Kho tile history mới (trên GPU) — thiếu chỗ thì History tự bỏ bước cũ nhất. */
  createTileStore(): TileStore;
  /** Vùng document cần vẽ lại; bỏ trống = toàn bộ. */
  invalidate(rect?: Rect): void;
  invalidateOverlay(): void;
  /** Bản chụp option của nhóm tại thời điểm gọi. */
  options<K extends OptionGroupId>(group: K): Readonly<ToolOptionsMap[K]>;
  colors(): Readonly<ColorsState>;
  notify(code: NoticeCode): void;
  setStrokePreview(preview: StrokePreview | null): void;
  /** Worker pool (tô loang…) — mục 5.8. */
  readonly workers: WorkerClient;
  /** Đối tượng vector: chọn, tìm, bản nháp, ghi thay đổi. */
  readonly objects: ObjectController;
  readonly objectEnv: ObjectEnv;
  readonly text: TextSession;
  /** Vùng chọn pixel và pixel nổi (mục 5.7). Tool pixel tự được cắt theo vùng chọn khi commit. */
  readonly selection: SelectionManager;
  /** Cắt xén document theo khung (tool Crop) — chạy nền, khóa thao tác tới khi xong. */
  cropDocument(rect: Rect): void;
  /**
   * Layer raster để tool pixel làm việc. Nếu layer hoạt động là layer chú thích, áp dụng chính sách
   * (tạo layer mới / layer bên dưới / rasterize) hoặc hỏi người dùng — trả null nếu chưa vẽ được.
   */
  paintTarget(kind: PaintTargetKind, tool: ToolId): RasterLayer | null;
  /** Pixel ảnh đã ghép (không gồm bản nháp) — eyedropper. */
  readPixels(rect: Rect): ImageData;
  /** Đặt màu chính/phụ; `transient` = đang kéo, chưa ghi vào màu gần đây. */
  setColor(slot: 'primary' | 'secondary', color: Color, transient: boolean): void;
  /** Đang chờ tác vụ nền (Worker): con trỏ "đang xử lý", chặn undo/redo. */
  setBusy(busy: boolean): void;
  readonly busy: boolean;
  /** Cập nhật con trỏ chuột sau khi trạng thái của tool đổi (rê qua handle, bận…). */
  refreshCursor(): void;
}

export interface Tool {
  cursor(state: CursorState): CursorSpec;
  onActivate?(): void;
  onDeactivate?(): void;
  onPointerDown(e: DocPointerEvent): void;
  onPointerMove(e: DocPointerEvent): void;
  onPointerUp(e: DocPointerEvent): void;
  /** Esc, mất pointer capture, đổi tool giữa chừng, ngón thứ hai chạm sớm. */
  onCancel(): void;
  /** Phím khi focus ở vùng làm việc; trả true nếu tool đã xử lý (Enter, Esc, Backspace…). */
  onKeyDown?(e: KeyboardEvent): boolean;
  /** Con trỏ di chuyển khi không kéo (để đổi cursor theo handle/đối tượng bên dưới). */
  onHover?(e: HoverEvent): void;
  renderOverlay?(ctx: OverlayContext): void;
}

export interface HoverEvent {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  shiftKey: boolean;
}

export interface ToolDefinition {
  id: ToolId;
  group: ToolGroup;
  /** Tên icon (UI ánh xạ sang lucide). */
  icon: string;
  /** Khóa trong `t.tools`. */
  labelKey: string;
  shortcut?: string;
  layerKinds: readonly ('raster' | 'vector')[];
  /** Nhóm option mà Options bar hiển thị; schema lấy từ OPTION_SCHEMAS. */
  optionGroup?: OptionGroupId;
  /** Giữ Alt để lấy màu tạm thời (mục 5.3) — tool vẽ và hình khối. */
  altEyedropper?: boolean;
  create(ctx: ToolContext): Tool;
}
