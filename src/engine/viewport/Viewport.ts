import type { Point, Rect } from '../core/types';
import {
  centered,
  clampZoom,
  fillZoom,
  fitZoom,
  scaleMatrix,
  screenToDoc,
  docToScreen,
  stepZoom,
  transformRect,
  viewMatrix,
  zoomAt,
  type Matrix,
  type ViewState,
} from './transform';

/** Phần document tối thiểu phải còn thấy được khi pan (CSS px). */
const MIN_VISIBLE = 64;

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ViewportSnapshot extends ViewState {
  width: number;
  height: number;
  dpr: number;
}

/**
 * Khung nhìn của editor (mục 5.1): zoom/pan dạng ma trận affine document → screen (CSS px),
 * kích thước khung (CSS px) và devicePixelRatio. Phát `onChange` sau mỗi thay đổi.
 */
export class Viewport {
  private view: ViewState = { zoom: 1, panX: 0, panY: 0 };
  private size = { width: 0, height: 0 };
  private ratio = 1;
  private doc = { width: 1, height: 1 };
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  /** Khoảng quanh document được tính vào Fit (khung Làm đẹp — GĐ7), px document. */
  private margin = 0;
  private listener: ((snapshot: ViewportSnapshot) => void) | null = null;

  onChange(listener: ((snapshot: ViewportSnapshot) => void) | null): void {
    this.listener = listener;
  }

  get zoom(): number {
    return this.view.zoom;
  }

  get state(): Readonly<ViewState> {
    return this.view;
  }

  get width(): number {
    return this.size.width;
  }

  get height(): number {
    return this.size.height;
  }

  get dpr(): number {
    return this.ratio;
  }

  get hasSize(): boolean {
    return this.size.width > 0 && this.size.height > 0;
  }

  snapshot(): ViewportSnapshot {
    return { ...this.view, ...this.size, dpr: this.ratio };
  }

  /** Ma trận document → screen (CSS px). */
  get matrix(): Matrix {
    return viewMatrix(this.view);
  }

  /** Ma trận document → pixel thiết bị của bộ đệm canvas (dpr × M). */
  get deviceMatrix(): Matrix {
    return scaleMatrix(this.matrix, this.ratio);
  }

  screenToDoc(p: Readonly<Point>): Point {
    return screenToDoc(this.view, p);
  }

  docToScreen(p: Readonly<Point>): Point {
    return docToScreen(this.view, p);
  }

  /** Hình bao trên màn hình (CSS px) của một vùng document. */
  docRectToScreen(r: Readonly<Rect>): Rect {
    return transformRect(this.matrix, r);
  }

  /** Vùng document đang thấy được (chưa cắt theo khung document). */
  visibleDocRect(): Rect {
    const tl = this.screenToDoc({ x: 0, y: 0 });
    const br = this.screenToDoc({ x: this.size.width, y: this.size.height });
    return { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y };
  }

  setDocumentSize(width: number, height: number): void {
    this.doc = { width, height };
  }

  /** Phần quanh document hiện trên canvas (khung Làm đẹp): Fit/căn giữa tính cả phần này. */
  setContentMargin(margin: number): void {
    this.margin = Number.isFinite(margin) ? Math.max(0, margin) : 0;
  }

  /** Đổi kích thước khung, giữ nguyên điểm document ở tâm khung nhìn (mục 5.1). */
  setSize(width: number, height: number): void {
    if (width === this.size.width && height === this.size.height) return;
    const hadSize = this.hasSize;
    const center = this.screenToDoc({ x: this.size.width / 2, y: this.size.height / 2 });
    this.size = { width, height };
    if (hadSize) {
      this.view = {
        zoom: this.view.zoom,
        panX: width / 2 - center.x * this.view.zoom,
        panY: height / 2 - center.y * this.view.zoom,
      };
    }
    this.emit();
  }

  setDpr(dpr: number): void {
    const next = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
    if (next === this.ratio) return;
    this.ratio = next;
    this.emit();
  }

  set(state: Readonly<ViewState>): void {
    this.view = this.constrain({ ...state, zoom: clampZoom(state.zoom) });
    this.emit();
  }

  /** Zoom tới mức tuyệt đối quanh `anchor` (CSS px), mặc định tâm khung nhìn. */
  zoomTo(zoom: number, anchor?: Readonly<Point>): void {
    this.set(zoomAt(this.view, anchor ?? this.center(), zoom));
  }

  zoomBy(factor: number, anchor?: Readonly<Point>): void {
    this.zoomTo(this.view.zoom * factor, anchor);
  }

  /** Mức zoom chuẩn kế tiếp (phím + / −). */
  zoomStep(direction: 1 | -1, anchor?: Readonly<Point>): void {
    this.zoomTo(stepZoom(this.view.zoom, direction), anchor);
  }

  panBy(dx: number, dy: number): void {
    this.set({ zoom: this.view.zoom, panX: this.view.panX + dx, panY: this.view.panY + dy });
  }

  /**
   * Phần khung bị giao diện nổi che (tool island, options bar…), CSS px. Canvas vẫn tràn toàn
   * khung; Fit/căn giữa chỉ dùng vùng còn lại để ảnh không nằm dưới thanh công cụ.
   */
  /** Phần khung nhìn bị UI nổi che (tool island…) — overlay của UI tránh đặt vào đó. */
  get occluded(): Readonly<Insets> {
    return this.insets;
  }

  setInsets(insets: Partial<Insets>): void {
    this.insets = { ...this.insets, ...insets };
  }

  /** Vừa khung (Shift+1). */
  fit(): void {
    if (!this.hasSize) return;
    this.placeCentered(fitZoom(this.content(), this.available()));
  }

  /** Phủ kín khung. */
  fill(): void {
    if (!this.hasSize) return;
    this.placeCentered(fillZoom(this.content(), this.available()));
  }

  /** 100% quanh tâm khung nhìn (Shift+0). */
  actualSize(): void {
    this.zoomTo(1);
  }

  /** Khi mở document: 100% nếu vừa, nếu không thì vừa khung. */
  fitIfLarger(): void {
    if (!this.hasSize) return;
    this.placeCentered(Math.min(1, fitZoom(this.content(), this.available())));
  }

  /** Document cùng khoảng quanh nó (khung Làm đẹp). */
  private content(): { width: number; height: number } {
    return { width: this.doc.width + this.margin * 2, height: this.doc.height + this.margin * 2 };
  }

  /** Vùng khung không bị giao diện nổi che. */
  private available(): { width: number; height: number } {
    const { top, right, bottom, left } = this.insets;
    return {
      width: Math.max(1, this.size.width - left - right),
      height: Math.max(1, this.size.height - top - bottom),
    };
  }

  private placeCentered(zoom: number): void {
    const view = centered(this.content(), this.available(), zoom);
    this.set({
      zoom: view.zoom,
      panX: view.panX + this.insets.left + this.margin * view.zoom,
      panY: view.panY + this.insets.top + this.margin * view.zoom,
    });
  }

  private center(): Point {
    return { x: this.size.width / 2, y: this.size.height / 2 };
  }

  /** Không để document trôi hẳn khỏi khung nhìn. */
  private constrain(view: ViewState): ViewState {
    if (!this.hasSize) return view;
    const w = this.doc.width * view.zoom;
    const h = this.doc.height * view.zoom;
    const keepX = Math.min(MIN_VISIBLE, w);
    const keepY = Math.min(MIN_VISIBLE, h);
    return {
      zoom: view.zoom,
      panX: Math.min(this.size.width - keepX, Math.max(keepX - w, view.panX)),
      panY: Math.min(this.size.height - keepY, Math.max(keepY - h, view.panY)),
    };
  }

  private emit(): void {
    this.listener?.(this.snapshot());
  }
}
