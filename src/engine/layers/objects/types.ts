import type { AnnotationObject, ID, Point, Rect, TextFont } from '../../core/types';
import type { Ctx2D } from '../../memory/surfaces';
import type { BoxHandle } from './geometry';
import type { MeasureText } from './textLayout';

/** Môi trường vẽ đối tượng: đo chữ và tải font lười (mục 5.10). */
export interface ObjectEnv {
  measure: MeasureText;
  /** Bảo đảm font đã tải; nếu chưa, bắt đầu tải và vẽ lại khi xong (tạm dùng font dự phòng). */
  ensureFont(font: Readonly<TextFont>, sample: string): void;
  /** Khung document — Spotlight làm tối cả ảnh trừ vùng sáng. Thiếu = không vẽ phần làm tối. */
  documentBounds?(): Rect | null;
  /** Pixel nền bên dưới đối tượng (Redact khảm/làm mờ, Magnifier). Thiếu = phương án an toàn. */
  backdrop?: BackdropSource;
}

/**
 * Layer chứa đối tượng: layer chú thích `id`, hoặc layer chú thích sắp được tạo ngay trên layer
 * `id` (đối tượng đang tạo — mục 5.3).
 */
export type BackdropLayer = { kind: 'layer'; id: ID } | { kind: 'after'; id: ID };

/**
 * Ảnh nền bên dưới một đối tượng (mục 5.4): ghép các layer bên dưới layer chứa nó cùng các đối
 * tượng đứng trước `objects[index]` trong layer đó, ở độ phân giải document. Kết quả được cache
 * cho tới khi nền đổi. `objects` là danh sách đang được vẽ (đã áp bản nháp khi kéo).
 */
export interface BackdropSource {
  /** Ảnh đã áp hiệu ứng che, phủ `redactPixelRect(obj)` ∩ document; null = không dựng được. */
  redact(
    layer: BackdropLayer,
    objects: readonly AnnotationObject[],
    index: number,
  ): BackdropImage | null;
  /** Ảnh nền của vùng `source` ∩ document (chưa phóng to); null = không dựng được. */
  magnify(
    layer: BackdropLayer,
    objects: readonly AnnotationObject[],
    index: number,
  ): BackdropImage | null;
}

export interface BackdropImage {
  image: CanvasImageSource;
  /** Vùng document mà ảnh phủ (ảnh có đúng `rect.width × rect.height` pixel). */
  rect: Rect;
}

/** Dữ liệu phụ khi vẽ, do Compositor tính theo vị trí đối tượng trong layer. */
export interface DrawExtra {
  /** Số thứ tự của Step badge (1, 2, 3… theo thứ tự trong layer). */
  stepNumber?: number;
  /** Ảnh nền đã xử lý (Redact khảm/làm mờ, Magnifier); null = không có. */
  backdrop?: BackdropImage | null;
}

/**
 * Khung chọn của đối tượng: `box` (hình chữ nhật có thể xoay, handle 8 hướng + xoay) hoặc
 * `points` (đầu mút, đỉnh đa giác, điểm uốn của mũi tên).
 */
export type ObjectFrame =
  | { kind: 'box'; rect: Rect; rotation: number; handles: readonly BoxHandle[] }
  | { kind: 'points'; points: readonly Point[]; control: Point | null; closed: boolean };

/** `p0`, `p1`… = đỉnh/đầu mút; `control` = điểm uốn mũi tên. */
export type HandleId = BoxHandle | `p${number}` | 'control';

export interface DragModifiers {
  /** Shift: giữ tỉ lệ / bắt góc 15°. */
  shift: boolean;
}

/**
 * Renderer của một loại đối tượng (mục 6.2): thêm loại mới = thêm một nhánh union + một renderer
 * đăng ký trong objectRegistry. Đối tượng là giá trị bất biến: mọi phép biến đổi trả đối tượng mới.
 */
export interface ObjectRenderer<T extends AnnotationObject = AnnotationObject> {
  /** Vẽ lên context đã đặt ma trận document → đích. */
  draw(ctx: Ctx2D, obj: T, env: ObjectEnv, extra?: DrawExtra): void;
  /** Hình bao phần vẽ ra (gồm nét, bóng, xoay) — để vẽ lại đúng vùng. */
  bounds(obj: T, env: ObjectEnv): Rect;
  /** `tolerance` tính bằng px document. */
  hitTest(obj: T, p: Readonly<Point>, tolerance: number, env: ObjectEnv): boolean;
  frame(obj: T, env: ObjectEnv): ObjectFrame;
  translate(obj: T, dx: number, dy: number): T;
  dragHandle(
    start: T,
    handle: HandleId,
    p: Readonly<Point>,
    mods: DragModifiers,
    env: ObjectEnv,
  ): T;
}
