import * as v from 'valibot';
import {
  BLEND_MODES,
  type AnnotationObject,
  type BeautifySettings,
  type Color,
  type DocumentBackground,
  type ID,
  type LayerData,
  type Rect,
  type ToolId,
  type ToolOptionsState,
  type ViewData,
} from '@/engine/core/types';
import type { PaintTargetChoice, PaintTargetKind, PaintTargetPolicy } from '@/engine/core/types';

/**
 * Schema IndexedDB (mục 6.4) và schema validate dữ liệu đọc vào (valibot — mục 6.5, 6.6).
 *
 * Dữ liệu tách 3 phần: metadata nhẹ (`projects` — trang chủ chỉ đọc store này), mô tả document
 * dạng JSON (`documents`) và pixel dạng Blob (`layerBlobs`). Mọi dữ liệu đọc từ DB hoặc file
 * `.paint` đều được validate trước khi đưa vào Engine; trường lạ bị loại bỏ.
 */

export const DB_NAME = 'paint-online';

/** Phiên bản schema IndexedDB hiện tại; mỗi lần đổi thêm một bước trong migrations.ts. */
export const DB_VERSION = 1;

/** Phiên bản định dạng bản ghi document/project (ghi kèm từng bản ghi để nâng cấp khi đọc). */
export const RECORD_SCHEMA_VERSION = 1;

/** Thùng rác: project bị xóa mềm được xóa hẳn sau 7 ngày (mục 6.4). */
export const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type ProjectMode = 'paint' | 'screenshot';

export interface ProjectMeta {
  id: ID;
  name: string;
  mode: ProjectMode;
  width: number;
  height: number;
  layerCount: number;
  sizeBytes: number;
  /** Revision đã commit gần nhất. */
  rev: number;
  createdAt: number;
  updatedAt: number;
  openedAt: number;
  /** Để nhắc sao lưu .paint. */
  lastExportedAt?: number;
  /** Thùng rác, xóa hẳn sau 7 ngày. */
  deletedAt?: number;
  schemaVersion: number;
}

export interface DocumentRecord {
  schemaVersion: number;
  projectId: ID;
  rev: number;
  width: number;
  height: number;
  background: DocumentBackground;
  activeLayerId: ID;
  palette: Color[];
  /** Layer raster: pixel ở `layerBlobs`; layer vector: đối tượng nằm ngay đây. */
  layers: LayerData[];
  /** Khung Làm đẹp (GĐ7); thiếu = tắt (bản ghi trước GĐ7). */
  beautify?: BeautifySettings | null;
  viewport: ViewData;
}

/**
 * Ảnh lưu trong IndexedDB dạng ArrayBuffer (ADR 0021): WebKit dùng cho test tự động không lưu được
 * Blob; Chromium/Firefox tự tách giá trị lớn ra file nên hiệu năng như Blob.
 */
export interface StoredImage {
  data: ArrayBuffer;
  type: string;
}

export interface LayerBlobRecord {
  projectId: ID;
  layerId: ID;
  /** PNG RGBA của toàn surface (`bounds`) — png.ts, ADR 0021. */
  png: ArrayBuffer;
  bounds: Rect;
  contentRev: number;
  updatedAt: number;
}

export interface ThumbnailRecord {
  projectId: ID;
  /** PNG/WebP, cạnh dài 320 px. */
  image: StoredImage;
  rev: number;
  updatedAt: number;
}

export interface CheckpointLayer {
  layerId: ID;
  png: ArrayBuffer;
  bounds: Rect;
  contentRev: number;
}

/** Bản sao đầy đủ một revision cũ — dự phòng khi bản hiện tại hỏng (mục 6.6). */
export interface CheckpointRecord {
  projectId: ID;
  rev: number;
  createdAt: number;
  document: DocumentRecord;
  layers: CheckpointLayer[];
}

export interface AppSettings {
  key: 'app';
  /** Tool options + màu (mục 4.2: lưu giữa các phiên, debounce 1 s). */
  toolOptions?: Partial<ToolOptionsState>;
  customPalette?: Color[];
  paintPolicy?: Partial<Record<PaintTargetKind, PaintTargetPolicy>>;
  /** Đã xin navigator.storage.persist() (mục 6.6). */
  persistRequested?: boolean;
  /** Lần cuối ẩn lời nhắc sao lưu .paint. */
  backupReminderDismissedAt?: number;
}

export interface SessionRecord {
  key: 'last';
  /** Project đang mở; null = đã về trang chủ. */
  projectId: ID | null;
  viewport: ViewData | null;
  activeTool: ToolId | null;
  panels: Record<string, boolean>;
  /** false khi đang mở project; pagehide bình thường đặt true (mục 6.6). */
  cleanExit: boolean;
  updatedAt: number;
  /** Token của phiên mở project, đối chiếu với cờ thoát sạch trong localStorage. */
  token?: string;
}

// ---------------------------------------------------------------------------
// Validate (valibot)
// ---------------------------------------------------------------------------

const MAX_SIDE = 16384;
const MAX_LAYERS = 200;
const MAX_OBJECTS = 5000;
const MAX_POINTS = 10_000;
const MAX_TEXT = 20_000;

const num = v.pipe(v.number(), v.finite());
const nonNegative = v.pipe(num, v.minValue(0));
const unit = v.pipe(num, v.minValue(0), v.maxValue(1));
const side = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_SIDE));
const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));
const color = v.pipe(v.string(), v.regex(/^#[0-9A-Fa-f]{8}$/)) as v.GenericSchema<Color>;
const point = v.object({ x: num, y: num });
const rect = v.object({ x: num, y: num, width: nonNegative, height: nonNegative });

const stroke = v.object({
  color,
  width: v.pipe(num, v.minValue(0), v.maxValue(1000)),
  dash: v.optional(v.pipe(v.array(nonNegative), v.maxLength(16))),
  cap: v.optional(v.picklist(['round', 'butt'])),
});

const objectBase = {
  id,
  locked: v.optional(v.boolean()),
  rotation: num,
  opacity: unit,
  shadow: v.optional(
    v.object({
      color,
      blur: v.pipe(num, v.minValue(0), v.maxValue(500)),
      offsetX: num,
      offsetY: num,
    }),
  ),
};

const annotationObject = v.variant('type', [
  v.object({
    ...objectBase,
    type: v.literal('rect'),
    rect,
    stroke: v.optional(stroke),
    fill: v.optional(color),
    cornerRadius: nonNegative,
  }),
  v.object({
    ...objectBase,
    type: v.literal('ellipse'),
    rect,
    stroke: v.optional(stroke),
    fill: v.optional(color),
  }),
  v.object({ ...objectBase, type: v.literal('line'), from: point, to: point, stroke }),
  v.object({
    ...objectBase,
    type: v.literal('arrow'),
    from: point,
    to: point,
    control: v.optional(point),
    stroke,
    head: v.picklist(['triangle', 'open', 'none']),
    bothEnds: v.boolean(),
  }),
  v.object({
    ...objectBase,
    type: v.literal('polygon'),
    points: v.pipe(v.array(point), v.minLength(2), v.maxLength(MAX_POINTS)),
    closed: v.boolean(),
    stroke: v.optional(stroke),
    fill: v.optional(color),
  }),
  v.object({
    ...objectBase,
    type: v.literal('text'),
    origin: point,
    wrapWidth: v.nullable(v.pipe(num, v.minValue(1))),
    text: v.pipe(v.string(), v.maxLength(MAX_TEXT)),
    font: v.object({
      family: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
      size: v.pipe(num, v.minValue(1), v.maxValue(2000)),
      weight: v.picklist([400, 600, 700]),
      italic: v.boolean(),
    }),
    align: v.picklist(['left', 'center', 'right']),
    lineHeight: v.pipe(num, v.minValue(0.5), v.maxValue(5)),
    color,
    background: v.optional(color),
    outline: v.optional(stroke),
  }),
  v.object({ ...objectBase, type: v.literal('highlight'), rect, color }),
  v.object({
    ...objectBase,
    type: v.literal('redact'),
    rect,
    mode: v.picklist(['solid', 'pixelate', 'blur']),
    strength: nonNegative,
    color,
  }),
  v.object({
    ...objectBase,
    type: v.literal('step'),
    center: point,
    radius: v.pipe(num, v.minValue(1)),
    color,
  }),
  v.object({
    ...objectBase,
    type: v.literal('spotlight'),
    rect,
    shape: v.picklist(['rect', 'ellipse']),
    dim: unit,
  }),
  v.object({
    ...objectBase,
    type: v.literal('magnifier'),
    source: rect,
    target: point,
    zoom: v.pipe(num, v.minValue(1), v.maxValue(16)),
    shape: v.picklist(['rect', 'ellipse']),
    stroke,
  }),
]);

/** Khung Làm đẹp (GĐ7) — trường tùy chọn, bản ghi cũ không có vẫn hợp lệ. */
const beautify = v.object({
  padding: v.pipe(num, v.minValue(0), v.maxValue(1000)),
  background: v.picklist([
    'ocean',
    'sunset',
    'mint',
    'peach',
    'night',
    'paper',
    'white',
    'transparent',
  ]),
  radius: v.pipe(num, v.minValue(0), v.maxValue(1000)),
  shadow: v.boolean(),
}) as v.GenericSchema<BeautifySettings>;

const layerBase = {
  id,
  name: v.pipe(v.string(), v.maxLength(200)),
  visible: v.boolean(),
  locked: v.boolean(),
  alphaLocked: v.boolean(),
  opacity: unit,
  blendMode: v.picklist(BLEND_MODES),
  contentRev: v.pipe(v.number(), v.integer(), v.minValue(0)),
};

const layerData = v.variant('kind', [
  v.object({ ...layerBase, kind: v.literal('raster'), bounds: v.nullable(rect) }),
  v.object({
    ...layerBase,
    kind: v.literal('vector'),
    objects: v.pipe(v.array(annotationObject), v.maxLength(MAX_OBJECTS)),
  }),
]);

const background = v.variant('kind', [
  v.object({ kind: v.literal('transparent') }),
  v.object({ kind: v.literal('color'), color }),
]);

export const viewDataSchema = v.object({
  zoom: v.pipe(num, v.minValue(0.001), v.maxValue(1000)),
  panX: num,
  panY: num,
});

export const documentRecordSchema = v.pipe(
  v.object({
    schemaVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
    projectId: id,
    rev: v.pipe(v.number(), v.integer(), v.minValue(0)),
    width: side,
    height: side,
    background,
    activeLayerId: id,
    palette: v.pipe(v.array(color), v.maxLength(256)),
    layers: v.pipe(v.array(layerData), v.minLength(1), v.maxLength(MAX_LAYERS)),
    beautify: v.optional(v.nullable(beautify)),
    viewport: viewDataSchema,
  }),
  v.check(
    (record) => new Set(record.layers.map((l) => l.id)).size === record.layers.length,
    'Trùng id layer',
  ),
  v.check(
    (record) =>
      record.layers.every(
        (l) =>
          l.kind === 'vector' ||
          !l.bounds ||
          (Number.isInteger(l.bounds.x) &&
            Number.isInteger(l.bounds.y) &&
            Number.isInteger(l.bounds.width) &&
            Number.isInteger(l.bounds.height) &&
            l.bounds.x >= 0 &&
            l.bounds.y >= 0 &&
            l.bounds.width >= 1 &&
            l.bounds.height >= 1 &&
            l.bounds.x + l.bounds.width <= record.width &&
            l.bounds.y + l.bounds.height <= record.height),
      ),
    'Vị trí layer nằm ngoài ảnh',
  ),
);

// Kiểm tra lúc biên dịch: dữ liệu đã validate dùng được trực tiếp làm kiểu của Engine.
type Assert<T extends true> = T;
export type SchemaMatchesEngine = Assert<
  v.InferOutput<typeof annotationObject> extends AnnotationObject ? true : false
>;
export type LayerSchemaMatchesEngine = Assert<
  v.InferOutput<typeof layerData> extends LayerData ? true : false
>;

export class RecordValidationError extends Error {
  constructor(
    message: string,
    readonly issues: readonly string[] = [],
  ) {
    super(message);
    this.name = 'RecordValidationError';
  }
}

/** Bản ghi được ghi bởi phiên bản app mới hơn (không đọc được an toàn). */
export class NewerSchemaError extends Error {
  constructor(readonly version: number) {
    super(`Bản ghi có schemaVersion ${String(version)} mới hơn app`);
    this.name = 'NewerSchemaError';
  }
}

/**
 * Nâng cấp bản ghi document cũ lên RECORD_SCHEMA_VERSION (mỗi phiên bản một bước), rồi validate.
 * Hiện chỉ có phiên bản 1. Ném NewerSchemaError / RecordValidationError.
 */
export function parseDocumentRecord(raw: unknown): DocumentRecord {
  const version =
    typeof raw === 'object' && raw !== null && 'schemaVersion' in raw
      ? raw.schemaVersion
      : undefined;
  if (typeof version === 'number' && version > RECORD_SCHEMA_VERSION) {
    throw new NewerSchemaError(version);
  }
  const upgraded = upgradeDocumentRecord(raw);
  const result = v.safeParse(documentRecordSchema, upgraded);
  if (!result.success) {
    throw new RecordValidationError(
      'Bản ghi document không hợp lệ',
      result.issues.slice(0, 5).map((issue) => {
        const path = issue.path?.map((p) => String(p.key)).join('.') ?? '';
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    );
  }
  return result.output;
}

/** Các bước nâng cấp bản ghi theo schemaVersion (chỗ để thêm bước khi đổi định dạng). */
function upgradeDocumentRecord(raw: unknown): unknown {
  return raw;
}

export function isValidViewData(value: unknown): value is ViewData {
  return v.is(viewDataSchema, value);
}

/** Lựa chọn layer đích hợp lệ (settings). */
export function isPaintTargetPolicy(value: unknown): value is PaintTargetPolicy {
  const choices: readonly (PaintTargetPolicy | PaintTargetChoice)[] = [
    'ask',
    'new-layer',
    'layer-below',
    'rasterize',
  ];
  return typeof value === 'string' && (choices as readonly string[]).includes(value);
}

export function isColor(value: unknown): value is Color {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{8}$/.test(value);
}
