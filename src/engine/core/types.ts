/**
 * Kiểu dữ liệu lõi của Canvas Engine — mục 6.1–6.3 của Implementation Plan.
 *
 * Quy ước (mục 6): ID là `crypto.randomUUID()`; tọa độ là pixel document (số thực);
 * góc tính bằng radian; màu là chuỗi `#RRGGBBAA`; thời gian là epoch ms.
 *
 * File này là TypeScript thuần, không import React/Zustand/services (quy tắc 13.1.3).
 * Kiểu chỉ tồn tại lúc chạy của layer, history, memory nằm cạnh module sở hữu chúng
 * (engine/layers, engine/history, engine/memory); file này giữ kiểu dữ liệu và hợp đồng chung.
 */

export type ID = string;

/** Màu dạng `#RRGGBBAA`. */
export type Color = `#${string}`;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 16 blend mode có sẵn của Canvas 2D (mục 5.4). */
export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const;

export type BlendMode = (typeof BLEND_MODES)[number];

export type DocumentBackground = { kind: 'transparent' } | { kind: 'color'; color: Color };

/** Nền của khung Làm đẹp: gradient/màu dựng sẵn hoặc trong suốt. */
export type BeautifyBackground =
  'ocean' | 'sunset' | 'mint' | 'peach' | 'night' | 'paper' | 'white' | 'transparent';

/**
 * "Làm đẹp" ảnh chụp trước khi chia sẻ (mục 2, 7.3 — GĐ7): khung nền quanh ảnh, bo góc, bóng.
 * Không phá hủy: lưu cùng document, hiện trên canvas, áp khi copy/tải xuống/xuất ảnh.
 */
export interface BeautifySettings {
  /** Khoảng nền quanh ảnh, px document. */
  padding: number;
  background: BeautifyBackground;
  /** Bán kính bo góc ảnh, px document. */
  radius: number;
  shadow: boolean;
}

/** Thuộc tính chung của mọi layer (mục 6.1). */
export interface LayerBase {
  id: ID;
  name: string;
  visible: boolean;
  locked: boolean;
  alphaLocked: boolean;
  /** 0..1 */
  opacity: number;
  blendMode: BlendMode;
  /** Tăng khi nội dung layer đổi; autosave chỉ mã hóa layer có contentRev mới. */
  contentRev: number;
}

// ---------------------------------------------------------------------------
// Đối tượng vector: shape, text, chú thích (mục 6.2)
// ---------------------------------------------------------------------------

export interface Stroke {
  color: Color;
  width: number;
  dash?: number[];
  cap?: 'round' | 'butt';
}

export interface ObjectShadow {
  color: Color;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface ObjectBase {
  id: ID;
  locked?: boolean;
  /** Quanh tâm bbox, radian. */
  rotation: number;
  opacity: number;
  shadow?: ObjectShadow;
}

export interface TextFont {
  family: string;
  size: number;
  weight: 400 | 600 | 700;
  italic: boolean;
}

export type TextAlign = 'left' | 'center' | 'right';

export type RectObject = ObjectBase & {
  type: 'rect';
  rect: Rect;
  stroke?: Stroke;
  fill?: Color;
  cornerRadius: number;
};

export type EllipseObject = ObjectBase & {
  type: 'ellipse';
  rect: Rect;
  stroke?: Stroke;
  fill?: Color;
};

export type LineObject = ObjectBase & { type: 'line'; from: Point; to: Point; stroke: Stroke };

export type ArrowObject = ObjectBase & {
  type: 'arrow';
  from: Point;
  to: Point;
  /** Điểm điều khiển cho mũi tên cong. */
  control?: Point;
  stroke: Stroke;
  head: 'triangle' | 'open' | 'none';
  bothEnds: boolean;
};

export type PolygonObject = ObjectBase & {
  type: 'polygon';
  points: Point[];
  closed: boolean;
  stroke?: Stroke;
  fill?: Color;
};

export type TextObject = ObjectBase & {
  type: 'text';
  origin: Point;
  wrapWidth: number | null;
  text: string;
  font: TextFont;
  align: TextAlign;
  lineHeight: number;
  color: Color;
  background?: Color;
  outline?: Stroke;
};

/** Vẽ bằng multiply. */
export type HighlightObject = ObjectBase & { type: 'highlight'; rect: Rect; color: Color };

export type RedactObject = ObjectBase & {
  type: 'redact';
  rect: Rect;
  mode: 'solid' | 'pixelate' | 'blur';
  strength: number;
  color: Color;
};

/** Số thứ tự tự tính theo thứ tự đối tượng. */
export type StepObject = ObjectBase & { type: 'step'; center: Point; radius: number; color: Color };

export type SpotlightObject = ObjectBase & {
  type: 'spotlight';
  rect: Rect;
  shape: 'rect' | 'ellipse';
  dim: number;
};

/**
 * Phóng to một vùng (magnifier callout — mục 2, P2): khung `source` trên ảnh, bản phóng to `zoom`
 * lần đặt tâm tại `target`, nối bằng hai đường dẫn.
 */
export type MagnifierObject = ObjectBase & {
  type: 'magnifier';
  source: Rect;
  target: Point;
  zoom: number;
  shape: 'rect' | 'ellipse';
  stroke: Stroke;
};

export type AnnotationObject =
  | RectObject
  | EllipseObject
  | LineObject
  | ArrowObject
  | PolygonObject
  | TextObject
  | HighlightObject
  | RedactObject
  | StepObject
  | SpotlightObject
  | MagnifierObject;

export type AnnotationObjectType = AnnotationObject['type'];

// ---------------------------------------------------------------------------
// Tool options (mục 6.3) — Engine sở hữu; Zustand chỉ giữ bản sao để hiển thị
// ---------------------------------------------------------------------------

export interface BrushOptions {
  preset: 'round' | 'soft' | 'marker' | 'calligraphy';
  size: number;
  opacity: number;
  flow: number;
  hardness: number;
  smoothing: number;
  pressure: { size: boolean; opacity: boolean };
}

export interface EraserOptions {
  size: number;
  hardness: number;
  opacity: number;
}

export interface BucketOptions {
  tolerance: number;
  contiguous: boolean;
  sampleAll: boolean;
  expand: number;
}

/**
 * Hình khối (Rectangle, Ellipse, Line, Polygon). Màu viền là màu chính, màu tô là màu phụ — theo
 * quy ước MS Paint, để bảng màu trên tool island áp dụng cho mọi công cụ (ADR 0019).
 */
export interface ShapeOptions {
  strokeWidth: number;
  /** Tô bằng màu phụ. */
  fill: boolean;
  cornerRadius: number;
  dashed: boolean;
  shadow: boolean;
}

export interface ArrowOptions {
  strokeWidth: number;
  head: 'triangle' | 'open' | 'none';
  bothEnds: boolean;
  dashed: boolean;
  shadow: boolean;
}

/** Chữ: màu chữ là màu chính, nền (nếu bật) là màu phụ (ADR 0019). */
export interface TextOptions {
  family: string;
  size: number;
  weight: 400 | 600 | 700;
  italic: boolean;
  align: TextAlign;
  background: boolean;
  /** Viền chữ trắng/đen tương phản để chú thích dễ đọc trên mọi nền. */
  outline: boolean;
}

export interface HighlightOptions {
  color: Color;
}

/** Che thông tin (mục 5.4): tô kín (mặc định), khảm khối lớn hoặc làm mờ. */
export interface RedactOptions {
  mode: RedactObject['mode'];
  /** Cỡ ô khảm, px (≥ 12). */
  blockSize: number;
  /** Độ lệch chuẩn làm mờ, px. */
  blurRadius: number;
}

/** Số thứ tự (Step badge): bán kính, px; màu là màu chính. */
export interface StepOptions {
  size: number;
}

export interface SpotlightOptions {
  shape: SpotlightObject['shape'];
  /** 0..1 — độ tối phần ngoài vùng sáng. */
  dim: number;
}

export interface MagnifierOptions {
  zoom: number;
  shape: MagnifierObject['shape'];
}

/** Cách kết hợp vùng chọn mới với vùng đang có (mục 5.7): Shift = thêm, Alt = bớt, cả hai = giao. */
export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect';

/**
 * Tool chọn vùng (Marquee, Lasso, Magic Wand — mục 5.7). Phím bổ trợ lúc bấm chuột ghi đè `mode`;
 * `tolerance`, `contiguous`, `sampleAll` chỉ dùng cho Magic Wand (cùng thuật toán tô loang).
 */
export interface SelectionOptions {
  mode: SelectionMode;
  /** Làm mềm biên, px (0 = không). */
  feather: number;
  antiAlias: boolean;
  tolerance: number;
  contiguous: boolean;
  sampleAll: boolean;
}

/**
 * Gradient (mục 2, GĐ6 — P2): kéo từ điểm đầu tới điểm cuối, màu chính → màu phụ (hoặc → trong
 * suốt); bị giới hạn trong vùng chọn như mọi tool pixel.
 */
export interface GradientOptions {
  kind: 'linear' | 'radial';
  /** Màu chính → trong suốt thay vì → màu phụ. */
  toTransparent: boolean;
  /** 0..1 */
  opacity: number;
}

export interface ToolOptionsState {
  primary: Color;
  secondary: Color;
  recent: Color[];
  brush: BrushOptions;
  eraser: EraserOptions;
  bucket: BucketOptions;
  gradient: GradientOptions;
  shape: ShapeOptions;
  arrow: ArrowOptions;
  text: TextOptions;
  highlight: HighlightOptions;
  redact: RedactOptions;
  step: StepOptions;
  spotlight: SpotlightOptions;
  magnifier: MagnifierOptions;
  selection: SelectionOptions;
}

// ---------------------------------------------------------------------------
// Tool & option (mục 5.3, 4.2)
// ---------------------------------------------------------------------------

/** Tool có trong engine. Danh sách mở rộng theo từng giai đoạn (mục 5.3). */
export type ToolId =
  | 'select'
  | 'pencil'
  | 'brush'
  | 'eraser'
  | 'bucket'
  | 'gradient'
  | 'eyedropper'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'polygon'
  | 'text'
  | 'highlight'
  | 'redact'
  | 'step'
  | 'spotlight'
  | 'magnifier'
  | 'marquee-rect'
  | 'marquee-ellipse'
  | 'lasso'
  | 'wand'
  | 'crop'
  | 'pan'
  | 'zoom';

/** Nhóm tùy chọn mà OptionsAPI quản lý (`editor.options.get('brush')`). */
export type ToolOptionsMap = Omit<ToolOptionsState, 'primary' | 'secondary' | 'recent'>;
export type OptionGroupId = keyof ToolOptionsMap;

export interface ColorsState {
  primary: Color;
  secondary: Color;
  recent: Color[];
}

// ---------------------------------------------------------------------------
// Phụ thuộc truyền vào Engine (mục 4.2 — EditorDeps)
// ---------------------------------------------------------------------------

/** Kết quả feature detection (services/platform/features.ts hiện thực). */
export interface PlatformFeatures {
  /** ⌘ thay cho Ctrl. */
  readonly isApple: boolean;
  readonly offscreenCanvas: boolean;
  readonly coalescedEvents: boolean;
  readonly predictedEvents: boolean;
}

/** Tier thiết bị (mục 5.11). */
export type DeviceTier = 'desktop' | 'low-memory' | 'ios';

/** Yêu cầu tô loang (Paint Bucket, mục 5.8) gửi sang Worker; `data` được chuyển (transfer). */
export interface FloodFillRequest {
  width: number;
  height: number;
  /** RGBA không nhân trước, `width × height × 4` byte. */
  data: Uint8ClampedArray;
  /** Điểm bắt đầu (pixel nguyên). */
  x: number;
  y: number;
  /** 0..1 — khoảng cách RGBA tối đa so với màu gốc. */
  tolerance: number;
  /** true: chỉ vùng liền kề; false: mọi pixel cùng màu. */
  contiguous: boolean;
  /** Nới vùng tô thêm 0–2 px để không còn viền trắng quanh nét khử răng cưa (mục 10.1). */
  expand: number;
}

/** Mặt nạ vùng tô: 255 = tô, 0 = không; kích thước bằng `bounds`. Null nếu không tô gì. */
export interface FloodFillResult {
  bounds: Rect;
  mask: Uint8Array;
}

// ---------------------------------------------------------------------------
// Vùng chọn (mục 5.7, 6.3)
// ---------------------------------------------------------------------------

/** Hình của vùng chọn dạng path (tọa độ document): Marquee chữ nhật/ellipse, Lasso. */
export type SelectionShape =
  | { kind: 'rect'; rect: Rect }
  | { kind: 'ellipse'; rect: Rect }
  | { kind: 'polygon'; points: Point[] };

/** Mask raster: alpha 0..255, `bounds.width × bounds.height` byte, gốc tại `bounds` (document). */
export interface MaskData {
  bounds: Rect;
  data: Uint8Array;
}

export type MaskOperand =
  { kind: 'shape'; shape: SelectionShape } | { kind: 'mask'; mask: MaskData };

/**
 * Dựng mask vùng chọn (mục 5.7) trong Worker: kết hợp vùng đang có với phần mới, làm mềm biên,
 * bỏ khử răng cưa, rồi dò viền bằng marching squares. Mask cắt theo khung document.
 */
export interface MaskRequest {
  docWidth: number;
  docHeight: number;
  /** Vùng chọn hiện tại (null = chưa có). */
  base: MaskOperand | null;
  /** Phần mới. */
  operand: MaskOperand;
  mode: SelectionMode;
  /** Làm mềm biên phần mới, px. */
  feather: number;
  /** false: alpha được làm tròn về 0 hoặc 255 (không khử răng cưa). */
  antiAlias: boolean;
}

export interface MaskResult {
  /** Mask đã cắt sát vùng có alpha > 0. */
  mask: MaskData;
  /** Ảnh alpha của mask (vẽ được, dùng để cắt nét vẽ trên GPU); null nếu nơi dựng không có canvas. */
  bitmap: ImageBitmap | null;
  /** Viền (marching ants): các đường khép kín, mỗi đường là dãy x, y (document). */
  outline: Float32Array[];
}

/** Cách co giãn khi Resize ảnh: `smooth` — chất lượng cao; `pixelated` — điểm gần nhất (pixel art). */
export type ResampleQuality = 'smooth' | 'pixelated';

// ---------------------------------------------------------------------------
// Điều chỉnh và bộ lọc (mục 2, 5.8 — GĐ6)
// ---------------------------------------------------------------------------

/**
 * Một bước của pipeline filter. Tham số theo đơn vị người dùng thấy (%, độ, px document) — dải giá
 * trị ở `engine/filters/spec.ts`. Pipeline là dãy bước chạy lần lượt (vd. độ sáng rồi tương phản).
 */
export type FilterStep =
  /** −100..100: cộng thêm tới ±100% độ sáng. */
  | { id: 'brightness'; amount: number }
  /** −100..100 */
  | { id: 'contrast'; amount: number }
  /** −100..100: −100 = đen trắng, 100 = gấp đôi độ bão hòa. */
  | { id: 'saturation'; amount: number }
  /** −180..180: xoay sắc độ (HSV). */
  | { id: 'hue'; degrees: number }
  | { id: 'grayscale' }
  | { id: 'invert' }
  /** 0..100 */
  | { id: 'sepia'; amount: number }
  /** Bán kính (độ lệch chuẩn của Gauss, px document); 3 lượt box blur. */
  | { id: 'blur'; radius: number }
  /** Unsharp mask: `amount` 0..500 (%), `radius` px. */
  | { id: 'sharpen'; amount: number; radius: number }
  /** Cạnh ô khảm (px document), lưới căn theo gốc document. */
  | { id: 'pixelate'; size: number };

export type FilterId = FilterStep['id'];

/**
 * Chạy pipeline filter trên một vùng ảnh (Worker — mục 5.8). `data` là RGBA không nhân trước của
 * vùng đọc (đã gồm phần đệm quanh vùng kết quả cho blur, sharpen, pixelate), được chuyển (transfer).
 */
export interface FilterRequest {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
  /** Vị trí điểm (0, 0) của `data` trong document — lưới khảm căn theo document. */
  originX: number;
  originY: number;
  /** Tỉ lệ dữ liệu so với document: 1 = full-res; < 1 = bản thu nhỏ để xem trước. */
  scale: number;
  /** Phần cần trả về (tọa độ trong `data`). */
  core: Rect;
  steps: readonly FilterStep[];
  /** Layer khóa trong suốt: giữ nguyên alpha gốc (mục 5.4). */
  lockAlpha: boolean;
}

/** Phiên điều chỉnh đang mở (panel nổi — mục 7.3). */
export interface FilterSessionSummary {
  steps: readonly FilterStep[];
  /** `preview`: đang xem trước; `applying`: đang chạy full-res. */
  phase: 'preview' | 'applying';
  /** Tiến trình áp dụng 0..1. */
  progress: number;
  /** Đang giữ nút so sánh (hiện ảnh gốc). */
  comparing: boolean;
}

/**
 * Cổng sang Worker pool (mục 4.2, 5.8) — hiện thực ở services/workers. Engine chỉ thấy interface
 * này; trong test được thay bằng bản chạy trực tiếp.
 */
export interface WorkerClient {
  /** Số Worker chạy song song (chia việc lớn thành phần); không có = 1. */
  readonly concurrency?: number;
  floodFill(request: FloodFillRequest, signal?: AbortSignal): Promise<FloodFillResult | null>;
  /**
   * Nén lossless RGBA (không nhân trước) của bitmap thành zlib — dữ liệu history cũ (mục 5.6).
   * Không có = không nén (bước cũ vẫn giữ trên GPU, chỉ bị bỏ khi thiếu bộ nhớ).
   */
  compressPixels?(bitmap: ImageBitmap): Promise<Uint8Array>;
  /** Dựng mask vùng chọn + viền (mục 5.7). Null nếu vùng chọn kết quả rỗng. */
  buildMask(request: MaskRequest): Promise<MaskResult | null>;
  /** Hình bao vùng có alpha > 0 của ảnh (Trim), null nếu trong suốt hoàn toàn. */
  alphaBounds(bitmap: ImageBitmap): Promise<Rect | null>;
  /** Pipeline filter (mục 5.8): trả RGBA của `core`. Hủy bằng `signal` (dừng Worker đang chạy). */
  applyFilter(
    request: FilterRequest,
    signal?: AbortSignal,
  ): Promise<Uint8ClampedArray<ArrayBuffer>>;
}

export interface MemoryBudgetConfig {
  tier: DeviceTier;
  /** Tổng ngân sách ước lượng cho mọi surface + history, byte. */
  totalBytes: number;
  /** Cạnh lớn nhất của document. */
  maxDocumentSide: number;
  /** Tổng số pixel tối đa của document. */
  maxDocumentPixels: number;
}

// ---------------------------------------------------------------------------
// Sự kiện Engine → UI (mục 4.2)
// ---------------------------------------------------------------------------

/** Một bước trong panel History (mục 2). */
export interface HistoryEntry {
  /** Khóa i18n `history.*`. */
  label: string;
  timestamp: number;
}

export interface HistorySummary {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  steps: number;
  /** Đã phải giải phóng bước cũ vì giới hạn số bước hoặc bộ nhớ. */
  trimmed: boolean;
  /** Mọi bước, cũ → mới, gồm cả các bước đã hoàn tác (nhánh redo). */
  entries: HistoryEntry[];
  /** Số bước đang được áp dụng: `entries[position - 1]` là trạng thái hiện tại. */
  position: number;
}

export interface LayerSummary {
  id: ID;
  name: string;
  kind: 'raster' | 'vector';
  visible: boolean;
  locked: boolean;
  alphaLocked: boolean;
  opacity: number;
  blendMode: BlendMode;
  /** Revision nội dung — panel Layers vẽ lại thumbnail khi đổi. */
  contentRev: number;
  /** Layer có pixel / đối tượng. */
  hasContent: boolean;
}

export interface DocumentSummary {
  id: ID;
  width: number;
  height: number;
  rev: number;
  activeLayerId: ID;
  layers: LayerSummary[];
  beautify: BeautifySettings | null;
}

// ---------------------------------------------------------------------------
// Dữ liệu lưu trữ (mục 6.4) — Engine chỉ xuất/nhận dữ liệu thuần; services/storage lo IndexedDB
// ---------------------------------------------------------------------------

/** Layer dạng dữ liệu thuần: raster giữ vị trí surface (pixel lưu riêng), vector giữ đối tượng. */
export type LayerData = LayerBase &
  ({ kind: 'raster'; bounds: Rect | null } | { kind: 'vector'; objects: AnnotationObject[] });

/** Phần dữ liệu document của DocumentRecord (mục 6.4), chưa gồm projectId/viewport. */
export interface DocumentData {
  rev: number;
  width: number;
  height: number;
  background: DocumentBackground;
  activeLayerId: ID;
  palette: Color[];
  layers: LayerData[];
  /** Khung Làm đẹp (GĐ7); thiếu = tắt. */
  beautify?: BeautifySettings | null;
}

/**
 * Ảnh chụp nội dung một layer raster tại thời điểm gọi (pha "Chụp" của autosave, mục 6.6).
 * `bitmap` là ImageBitmap của toàn surface (`bounds`), chuyển được sang Worker để mã hóa.
 */
export interface LayerCapture {
  layerId: ID;
  contentRev: number;
  bounds: Rect;
  bitmap: Promise<ImageBitmap>;
}

/**
 * Lưới và bám lưới (mục 2, P2 — "Grid, thước đo, căn chỉnh"): lưới vẽ trên overlay theo khoảng cách
 * pixel ảnh, không vào ảnh xuất; bám lưới làm tròn tọa độ của tool hình học.
 */
export interface GuideSettings {
  grid: boolean;
  gridSize: number;
  snap: boolean;
}

/** Khung nhìn lưu kèm document / phiên làm việc. */
export interface ViewData {
  zoom: number;
  panX: number;
  panY: number;
}

export interface MemoryUsage {
  usedBytes: number;
  totalBytes: number;
  byCategory: Readonly<Record<SurfaceCategory, number>>;
  liveSurfaces: number;
}

/** Loại bề mặt trong MemoryBudget (mục 5.2). */
export type SurfaceCategory = 'fixed' | 'layer' | 'history' | 'cache' | 'temp';

/**
 * Thông báo cho người dùng. Engine chỉ phát mã; UI dịch sang chuỗi trong i18n/vi.ts.
 */
export type NoticeCode =
  | 'memory.refused'
  | 'document.tooLarge'
  | 'layer.locked'
  | 'layer.hidden'
  | 'layer.notRaster'
  | 'layer.noRasterBelow'
  | 'fill.failed'
  | 'document.readOnly'
  /** Hạng mục layer chạm 60% ngân sách — từ chối, gợi ý Merge/Flatten (mục 5.11). */
  | 'memory.layersFull'
  /** Hạng mục layer vượt 90% phần của nó — cảnh báo sớm, gợi ý Merge/Flatten. */
  | 'memory.layersHigh'
  /** Thao tác cần vùng chọn có pixel (copy, cắt xén theo vùng chọn) nhưng vùng chọn trống. */
  | 'selection.empty'
  /** Trim: không có vùng trong suốt nào để cắt bỏ. */
  | 'image.nothingToTrim'
  /** Biến đổi ảnh thất bại giữa chừng (document đổi, lỗi Worker) — ảnh giữ nguyên. */
  | 'image.failed'
  /** Bộ lọc chỉ áp dụng cho layer ảnh. */
  | 'filter.notRaster'
  /** Layer không có pixel nào để điều chỉnh (trong vùng chọn). */
  | 'filter.empty'
  /** Áp dụng bộ lọc thất bại (lỗi Worker, document đổi) — ảnh giữ nguyên. */
  | 'filter.failed'
  /** Thao tác chỉnh sửa bị chặn khi bảng điều chỉnh đang mở. */
  | 'filter.open'
  | 'output.pending'
  | 'layer.redactionProtected';

/** Bản sao vùng chọn cho UI (thanh trạng thái, menu — mục 7.2). */
export interface SelectionSummary {
  /** Hình bao (document, số nguyên). */
  bounds: Rect;
  shape: 'rect' | 'ellipse' | 'polygon' | 'mask';
  /** Đang có pixel nổi (di chuyển, biến đổi, vừa dán). */
  floating: boolean;
}

/** Đối tượng đang được chọn (bản sao để UI hiển thị thuộc tính — mục 7.2). */
export interface ObjectSelectionSummary {
  layerId: ID | null;
  objects: readonly AnnotationObject[];
}

/** Phiên sửa chữ: UI đặt textarea chồng đúng vị trí theo ma trận viewport (mục 5.10). */
export interface TextEditState {
  /** Id đối tượng đang sửa; null = chữ mới chưa có trong document. */
  objectId: ID | null;
  object: TextObject;
}

/**
 * Dùng tool pixel trên layer chú thích (mục 5.3): `draw` (brush, pencil) có thể vẽ trên layer
 * mới; `modify` (eraser, bucket) có thể dùng layer ảnh bên dưới. Cả hai có thể rasterize.
 */
export type PaintTargetKind = 'draw' | 'modify';
export type PaintTargetChoice = 'new-layer' | 'layer-below' | 'rasterize';
export type PaintTargetPolicy = 'ask' | PaintTargetChoice;

export interface EditorEvents {
  documentChanged: DocumentSummary;
  layersChanged: DocumentSummary;
  historyChanged: HistorySummary;
  toolChanged: { tool: ToolId; temporary: boolean };
  toolOptionsChanged: { group: OptionGroupId; options: Readonly<ToolOptionsMap[OptionGroupId]> };
  colorsChanged: Readonly<ColorsState>;
  viewportChanged: { zoom: number; panX: number; panY: number; width: number; height: number };
  pointerMoved: { x: number; y: number } | null;
  memoryChanged: MemoryUsage;
  notice: { code: NoticeCode };
  objectSelectionChanged: ObjectSelectionSummary;
  /** Vùng chọn pixel (mục 5.7); null = không có. */
  selectionChanged: SelectionSummary | null;
  textEditChanged: TextEditState | null;
  /** Chuột phải trên canvas (tọa độ CSS px trong khung canvas). */
  contextMenu: { x: number; y: number; onObject: boolean; onSelection: boolean };
  /** Tool pixel trên layer chú thích khi chính sách là "hỏi". */
  paintTargetRequired: { kind: PaintTargetKind; tool: ToolId; choices: PaintTargetChoice[] };
  /** Đang chờ tác vụ nền (tô loang trong Worker). */
  busyChanged: boolean;
  /** Phiên điều chỉnh/bộ lọc (null = đóng). */
  filterChanged: FilterSessionSummary | null;
}
