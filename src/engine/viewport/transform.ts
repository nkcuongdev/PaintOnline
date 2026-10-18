import type { Point, Rect } from '../core/types';

/**
 * Mọi phép đổi tọa độ document ↔ screen nằm trong module này (mục 5.1).
 *
 * Ma trận affine 2D cùng bố cục với DOMMatrix: [a c e; b d f; 0 0 1].
 * v1 chỉ dùng zoom + pan (b = c = 0) nhưng giữ dạng ma trận đầy đủ để xoay khung nhìn sau này
 * không phải refactor. Module thuần (không dùng DOMMatrix) để unit test được trong Node.
 */
export interface Matrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export const IDENTITY: Matrix = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

/** Trạng thái khung nhìn: zoom (1 = 100%) và pan (vị trí gốc document trên màn hình, CSS px). */
export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

export const MIN_ZOOM = 0.01;
export const MAX_ZOOM = 64;

/** Mức zoom chuẩn cho phím +/− và menu (mục 5.1: 1%–6400%). */
export const ZOOM_LEVELS: readonly number[] = [
  0.01, 0.02, 0.03, 0.05, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 1, 1.5, 2, 3, 4, 6, 8,
  12, 16, 24, 32, 48, 64,
];

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function viewMatrix(view: Readonly<ViewState>): Matrix {
  return { a: view.zoom, b: 0, c: 0, d: view.zoom, e: view.panX, f: view.panY };
}

export function multiply(m: Matrix, n: Matrix): Matrix {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

export function invert(m: Matrix): Matrix {
  const det = m.a * m.d - m.b * m.c;
  if (det === 0) throw new Error('Ma trận suy biến');
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

export function scaleMatrix(m: Matrix, s: number): Matrix {
  return multiply({ a: s, b: 0, c: 0, d: s, e: 0, f: 0 }, m);
}

export function applyMatrix(m: Matrix, p: Readonly<Point>, out: Point = { x: 0, y: 0 }): Point {
  const x = m.a * p.x + m.c * p.y + m.e;
  const y = m.b * p.x + m.d * p.y + m.f;
  out.x = x;
  out.y = y;
  return out;
}

/** x_screen = x_doc · zoom + pan */
export function docToScreen(view: Readonly<ViewState>, p: Readonly<Point>): Point {
  return { x: p.x * view.zoom + view.panX, y: p.y * view.zoom + view.panY };
}

/** x_doc = (x_screen − pan) / zoom — giữ số thực (Pencil/Bucket tự floor). */
export function screenToDoc(view: Readonly<ViewState>, p: Readonly<Point>): Point {
  return { x: (p.x - view.panX) / view.zoom, y: (p.y - view.panY) / view.zoom };
}

/** Hình bao trên màn hình của một hình trong document (ma trận bất kỳ). */
export function transformRect(m: Matrix, r: Readonly<Rect>): Rect {
  const pts = [
    applyMatrix(m, { x: r.x, y: r.y }),
    applyMatrix(m, { x: r.x + r.width, y: r.y }),
    applyMatrix(m, { x: r.x, y: r.y + r.height }),
    applyMatrix(m, { x: r.x + r.width, y: r.y + r.height }),
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * Zoom quanh một điểm màn hình, giữ điểm document dưới con trỏ đứng yên:
 * pan' = cursor − (cursor − pan) × (zoom' / zoom).
 */
export function zoomAt(
  view: Readonly<ViewState>,
  anchor: Readonly<Point>,
  zoom: number,
): ViewState {
  const next = clampZoom(zoom);
  const ratio = next / view.zoom;
  return {
    zoom: next,
    panX: anchor.x - (anchor.x - view.panX) * ratio,
    panY: anchor.y - (anchor.y - view.panY) * ratio,
  };
}

/** Đặt zoom và căn document vào giữa khung nhìn. */
export function centered(
  doc: { width: number; height: number },
  viewport: { width: number; height: number },
  zoom: number,
): ViewState {
  const z = clampZoom(zoom);
  return {
    zoom: z,
    panX: Math.round((viewport.width - doc.width * z) / 2),
    panY: Math.round((viewport.height - doc.height * z) / 2),
  };
}

/** Zoom để document vừa trọn khung nhìn (trừ lề `padding` mỗi cạnh). */
export function fitZoom(
  doc: { width: number; height: number },
  viewport: { width: number; height: number },
  padding = 24,
): number {
  const w = Math.max(1, viewport.width - padding * 2);
  const h = Math.max(1, viewport.height - padding * 2);
  return clampZoom(Math.min(w / doc.width, h / doc.height));
}

/** Zoom để document phủ kín khung nhìn. */
export function fillZoom(
  doc: { width: number; height: number },
  viewport: { width: number; height: number },
): number {
  return clampZoom(Math.max(viewport.width / doc.width, viewport.height / doc.height));
}

/** Mức zoom chuẩn kế tiếp theo hướng (+1 phóng to, −1 thu nhỏ). */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const eps = 1e-6;
  if (direction > 0) {
    return ZOOM_LEVELS.find((level) => level > zoom + eps) ?? MAX_ZOOM;
  }
  for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
    const level = ZOOM_LEVELS[i] ?? MIN_ZOOM;
    if (level < zoom - eps) return level;
  }
  return MIN_ZOOM;
}

/**
 * Hệ số zoom từ một sự kiện wheel đã chuẩn hóa về pixel: ×1,1 mỗi nấc chuột (~100 px).
 * Delta nhỏ (pinch trackpad gửi wheel có ctrlKey) được khuếch đại để cử chỉ không bị ì.
 */
export function wheelZoomFactor(deltaPixels: number): number {
  const d = Math.max(-200, Math.min(200, deltaPixels));
  const notches = Math.abs(d) < 50 ? d / 25 : d / 100;
  return Math.pow(1.1, -notches);
}

/** Đổi deltaY của WheelEvent sang pixel theo deltaMode (0 = pixel, 1 = dòng, 2 = trang). */
export function normalizeWheelDelta(delta: number, deltaMode: number, pageSize: number): number {
  if (deltaMode === 1) return delta * 33;
  if (deltaMode === 2) return delta * pageSize;
  return delta;
}
