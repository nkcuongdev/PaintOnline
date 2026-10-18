import type { PlatformFeatures, Point } from '../core/types';
import type { DocPointerEvent, HoverEvent, PointerSample } from '../tools/types';
import { normalizeWheelDelta, wheelZoomFactor } from '../viewport/transform';
import type { Viewport } from '../viewport/Viewport';

export interface InputHandlers {
  down(e: DocPointerEvent): void;
  move(e: DocPointerEvent): void;
  up(e: DocPointerEvent): void;
  cancel(): void;
  /** Con trỏ di chuyển khi không kéo (null = rời canvas). */
  hover(e: (HoverEvent & { altKey: boolean }) | null): void;
  /** Chuột phải trên canvas (tọa độ CSS px trong khung canvas). */
  contextMenu(screen: Point): void;
  /** Chuột giữa: chuyển sang Pan tạm thời. */
  beginTemporaryPan(): void;
  endTemporaryPan(): void;
  /** Giá trị CSS cursor hiện tại của tool. */
  cursor(): string;
  /**
   * Alt + kéo chuột phải: HUD chỉnh cỡ/độ cứng cọ (mục 7.6). Trả false nếu tool hiện tại không có
   * cọ — khi đó chuột phải mở menu như thường.
   */
  adjustStart(screen: Point): boolean;
  adjustMove(screen: Point): void;
  adjustEnd(): void;
}

/** Ngón thứ hai chạm trong khoảng này thì nét đang vẽ bị hủy (mục 5.9). */
const SECOND_FINGER_CANCEL_MS = 150;

interface Pinch {
  startDistance: number;
  startZoom: number;
  /** Điểm document dưới tâm hai ngón khi bắt đầu. */
  anchorDoc: Point;
}

/**
 * Chuẩn hóa Pointer Events thành DocPointerEvent (mục 5.9): tọa độ document, áp lực, coalesced và
 * predicted events; setPointerCapture; wheel = pan, Ctrl/⌘ + wheel và pinch trackpad = zoom quanh
 * con trỏ, Shift + wheel = pan ngang; hai ngón = pinch zoom + pan, không bao giờ vẽ; chuột giữa =
 * pan; chặn menu chuột phải và autoscroll của trình duyệt trong vùng canvas.
 */
export class InputManager {
  private readonly event: DocPointerEvent = {
    x: 0,
    y: 0,
    screenX: 0,
    screenY: 0,
    pressure: 0.5,
    tiltX: 0,
    tiltY: 0,
    pointerType: 'mouse',
    button: 0,
    buttons: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    timeStamp: 0,
    points: [],
    predicted: [],
  };
  private readonly points: PointerSample[] = [];
  private readonly predicted: PointerSample[] = [];
  private rect: DOMRect | null = null;
  private activePointer: number | null = null;
  private activeStart = 0;
  private middlePan = false;
  /** Pointer đang kéo HUD chỉnh cọ (Alt + chuột phải). */
  private adjusting: number | null = null;
  /** Bỏ qua menu chuột phải ngay sau khi kéo HUD (Windows mở menu khi nhả chuột). */
  private suppressMenuUntil = 0;
  private readonly touches = new Map<number, Point>();
  private pinch: Pinch | null = null;
  private gestureScale = 1;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly element: HTMLElement,
    private readonly viewport: Viewport,
    private readonly handlers: InputHandlers,
    private readonly features: PlatformFeatures,
  ) {
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      listener: (e: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      element.addEventListener(type, listener as EventListener, options);
      this.cleanup.push(() => {
        element.removeEventListener(type, listener as EventListener, options);
      });
    };

    on('pointerdown', (e) => {
      this.onPointerDown(e);
    });
    on('pointermove', (e) => {
      this.onPointerMove(e);
    });
    on('pointerup', (e) => {
      this.onPointerUp(e, false);
    });
    on('pointercancel', (e) => {
      this.onPointerUp(e, true);
    });
    on('lostpointercapture', (e) => {
      if (e.pointerId === this.activePointer) this.onPointerUp(e, true);
    });
    on('pointerleave', (e) => {
      if (this.activePointer === null && e.pointerType !== 'touch') this.handlers.hover(null);
    });
    // Listener non-passive để chặn zoom trang khi Ctrl+wheel/pinch (mục 7.9).
    on(
      'wheel',
      (e) => {
        this.onWheel(e);
      },
      { passive: false },
    );
    // Menu chuột phải của trình duyệt được thay bằng menu theo ngữ cảnh của app (mục 5.9).
    on('contextmenu', (e) => {
      e.preventDefault();
      if (this.adjusting !== null || e.timeStamp < this.suppressMenuUntil) return;
      if (this.activePointer !== null || this.pinch) return;
      this.handlers.contextMenu(this.local(e.clientX, e.clientY));
    });
    // Chặn autoscroll của chuột giữa để dùng chuột giữa làm pan.
    on('mousedown', (e) => {
      if (e.button === 1) e.preventDefault();
    });
    // Safari desktop: pinch trackpad phát gesture* (mục 5.9).
    const gesture = (
      type: string,
      listener: (e: Event & { scale?: number; clientX?: number; clientY?: number }) => void,
    ) => {
      element.addEventListener(type, listener, { passive: false });
      this.cleanup.push(() => {
        element.removeEventListener(type, listener);
      });
    };
    gesture('gesturestart', (e) => {
      e.preventDefault();
      this.gestureScale = 1;
    });
    gesture('gesturechange', (e) => {
      e.preventDefault();
      const scale = e.scale ?? 1;
      const anchor = this.local(e.clientX ?? 0, e.clientY ?? 0);
      this.viewport.zoomBy(scale / this.gestureScale, anchor);
      this.gestureScale = scale;
    });
    gesture('gestureend', (e) => {
      e.preventDefault();
    });

    const onScroll = () => {
      this.rect = null;
    };
    window.addEventListener('scroll', onScroll, true);
    this.cleanup.push(() => {
      window.removeEventListener('scroll', onScroll, true);
    });
  }

  /** Gọi khi khung canvas đổi kích thước hoặc vị trí (cache getBoundingClientRect — mục 5.1). */
  invalidateRect(): void {
    this.rect = null;
  }

  /** Cập nhật cursor CSS từ tool hiện tại. */
  refreshCursor(): void {
    this.element.style.cursor = this.handlers.cursor();
  }

  dispose(): void {
    for (const fn of this.cleanup) fn();
    this.cleanup.length = 0;
  }

  // ---------------------------------------------------------------------------

  private bounds(): DOMRect {
    this.rect ??= this.element.getBoundingClientRect();
    return this.rect;
  }

  private local(clientX: number, clientY: number): Point {
    const r = this.bounds();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, this.local(e.clientX, e.clientY));
      if (this.touches.size === 2) {
        this.startPinch(e);
        return;
      }
      if (this.touches.size > 2 || this.pinch) return;
    }
    if (this.activePointer !== null || this.adjusting !== null) return;
    // Alt + chuột phải: HUD chỉnh cọ (mục 7.6).
    if (e.pointerType === 'mouse' && e.button === 2 && e.altKey) {
      const local = this.local(e.clientX, e.clientY);
      if (this.handlers.adjustStart(local)) {
        e.preventDefault();
        this.adjusting = e.pointerId;
        try {
          this.element.setPointerCapture(e.pointerId);
        } catch {
          // Không capture được: vẫn nhận move trong vùng canvas.
        }
        return;
      }
    }
    // Chuột phải dành cho context menu (GĐ2); nút khác ngoài trái/giữa bị bỏ qua.
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;

    e.preventDefault();
    this.rect = this.element.getBoundingClientRect();
    try {
      this.element.setPointerCapture(e.pointerId);
    } catch {
      // Trình duyệt có thể từ chối capture (pointer đã kết thúc) — vẫn xử lý bình thường.
    }
    this.activePointer = e.pointerId;
    this.activeStart = e.timeStamp;
    if (e.button === 1) {
      this.middlePan = true;
      this.handlers.beginTemporaryPan();
    }
    this.fill(e, false);
    if (this.middlePan) this.event.button = 0;
    this.handlers.down(this.event);
    this.refreshCursor();
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, this.local(e.clientX, e.clientY));
      if (this.pinch) {
        this.updatePinch();
        return;
      }
    }
    if (this.adjusting === e.pointerId) {
      this.handlers.adjustMove(this.local(e.clientX, e.clientY));
      return;
    }
    if (this.activePointer === e.pointerId) {
      this.fill(e, true);
      this.handlers.move(this.event);
      return;
    }
    if (this.activePointer === null && e.pointerType !== 'touch') {
      this.emitHover(this.local(e.clientX, e.clientY), e);
      this.refreshCursor();
    }
  }

  private onPointerUp(e: PointerEvent, cancelled: boolean): void {
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId);
      if (this.pinch) {
        if (this.touches.size < 2) this.pinch = null;
        return;
      }
    }
    if (this.adjusting === e.pointerId) {
      this.adjusting = null;
      this.suppressMenuUntil = e.timeStamp + 500;
      this.handlers.adjustEnd();
      return;
    }
    if (this.activePointer !== e.pointerId) return;
    this.activePointer = null;
    if (cancelled) {
      this.handlers.cancel();
    } else {
      this.fill(e, false);
      if (this.middlePan) this.event.button = 0;
      this.handlers.up(this.event);
    }
    if (this.middlePan) {
      this.middlePan = false;
      this.handlers.endTemporaryPan();
    }
    this.refreshCursor();
  }

  /** Hai ngón: hủy nét vừa bắt đầu (< 150 ms) hoặc kết thúc nét, rồi pinch zoom + pan. */
  private startPinch(e: PointerEvent): void {
    if (this.activePointer !== null) {
      if (e.timeStamp - this.activeStart < SECOND_FINGER_CANCEL_MS) {
        this.handlers.cancel();
      } else {
        this.handlers.up(this.event);
      }
      this.activePointer = null;
    }
    const [a, b] = [...this.touches.values()] as [Point, Point];
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.pinch = {
      startDistance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      startZoom: this.viewport.zoom,
      anchorDoc: this.viewport.screenToDoc(center),
    };
  }

  private updatePinch(): void {
    const pinch = this.pinch;
    if (!pinch || this.touches.size < 2) return;
    const [a, b] = [...this.touches.values()] as [Point, Point];
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const zoom = (pinch.startZoom * Math.hypot(b.x - a.x, b.y - a.y)) / pinch.startDistance;
    // Điểm document ban đầu đi theo tâm hai ngón (zoom + pan cùng lúc).
    this.viewport.set({
      zoom,
      panX: center.x - pinch.anchorDoc.x * zoom,
      panY: center.y - pinch.anchorDoc.y * zoom,
    });
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const anchor = this.local(e.clientX, e.clientY);
    const dy = normalizeWheelDelta(e.deltaY, e.deltaMode, this.viewport.height);
    const dx = normalizeWheelDelta(e.deltaX, e.deltaMode, this.viewport.width);
    if (e.ctrlKey || e.metaKey) {
      this.viewport.zoomBy(wheelZoomFactor(dy), anchor);
    } else if (e.shiftKey && dx === 0) {
      this.viewport.panBy(-dy, 0);
    } else {
      this.viewport.panBy(-dx, -dy);
    }
    if (this.activePointer === null) this.emitHover(anchor, e);
  }

  private emitHover(screen: Point, e: { altKey: boolean; shiftKey: boolean }): void {
    const doc = this.viewport.screenToDoc(screen);
    this.handlers.hover({
      x: doc.x,
      y: doc.y,
      screenX: screen.x,
      screenY: screen.y,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
    });
  }

  /** Ghi PointerEvent vào đối tượng sự kiện tái sử dụng. */
  private fill(e: PointerEvent, withCoalesced: boolean): void {
    const ev = this.event;
    const r = this.bounds();
    const toSample = (pe: PointerEvent, out: PointerSample) => {
      const sx = pe.clientX - r.left;
      const sy = pe.clientY - r.top;
      const doc = this.viewport.screenToDoc({ x: sx, y: sy });
      out.x = doc.x;
      out.y = doc.y;
      // Chuột luôn báo 0,5 — bỏ qua áp lực với chuột (mục 5.5).
      out.pressure = pe.pointerType === 'mouse' ? 0.5 : pe.pressure;
    };

    ev.screenX = e.clientX - r.left;
    ev.screenY = e.clientY - r.top;
    const doc = this.viewport.screenToDoc({ x: ev.screenX, y: ev.screenY });
    ev.x = doc.x;
    ev.y = doc.y;
    ev.pressure = e.pointerType === 'mouse' ? 0.5 : e.pressure;
    ev.tiltX = e.tiltX;
    ev.tiltY = e.tiltY;
    ev.pointerType = e.pointerType === 'pen' || e.pointerType === 'touch' ? e.pointerType : 'mouse';
    ev.button = e.button;
    ev.buttons = e.buttons;
    ev.shiftKey = e.shiftKey;
    ev.altKey = e.altKey;
    ev.ctrlKey = e.ctrlKey;
    ev.metaKey = e.metaKey;
    ev.timeStamp = e.timeStamp;

    const coalesced = withCoalesced && this.features.coalescedEvents ? e.getCoalescedEvents() : [];
    const list = coalesced.length > 0 ? coalesced : [e];
    resizeSamples(this.points, list.length);
    for (let i = 0; i < list.length; i++) toSample(list[i], this.points[i]);

    const predicted = withCoalesced && this.features.predictedEvents ? e.getPredictedEvents() : [];
    resizeSamples(this.predicted, predicted.length);
    for (let i = 0; i < predicted.length; i++) {
      toSample(predicted[i], this.predicted[i]);
    }

    ev.points = this.points;
    ev.predicted = this.predicted;
  }
}

/** Đổi độ dài mảng mẫu, tái sử dụng các object đã có. */
function resizeSamples(samples: PointerSample[], length: number): void {
  while (samples.length < length) samples.push({ x: 0, y: 0, pressure: 0.5 });
  samples.length = length;
}
