import type { MagnifierObject, Point, Rect } from '../../core/types';
import type { Ctx2D } from '../../memory/surfaces';
import { unionRect } from '../../utils/rect';
import { insideBox, onBoxEdge } from './box';
import { aaPad, applyStroke, paintWithShadow, shadowPad } from './draw';
import { rectCenter, rectFromPoints } from './geometry';
import type { ObjectRenderer } from './types';

/**
 * Phóng to vùng (magnifier callout — mục 2, P2): khung `source` trên ảnh, bản phóng to đặt tâm tại
 * `target`, nối bằng hai đường tiếp tuyến ngoài. Ảnh phóng to là nền bên dưới vùng `source`
 * (`extra.backdrop`), nên luôn khớp nội dung thật kể cả khi sửa ảnh sau đó.
 */

export const MAGNIFIER_MIN_ZOOM = 1.5;
export const MAGNIFIER_MAX_ZOOM = 6;
/** Cạnh nhỏ nhất của vùng nguồn (px document). */
const MIN_SOURCE = 4;

export function clampZoom(zoom: number): number {
  return Math.min(MAGNIFIER_MAX_ZOOM, Math.max(MAGNIFIER_MIN_ZOOM, zoom));
}

/** Khung bản phóng to (document). */
export function magnifierTarget(obj: Pick<MagnifierObject, 'source' | 'target' | 'zoom'>): Rect {
  const w = obj.source.width * obj.zoom;
  const h = obj.source.height * obj.zoom;
  return { x: obj.target.x - w / 2, y: obj.target.y - h / 2, width: w, height: h };
}

function traceShape(ctx: Ctx2D, shape: MagnifierObject['shape'], r: Readonly<Rect>): void {
  if (shape === 'ellipse') {
    const c = rectCenter(r);
    ctx.ellipse(c.x, c.y, r.width / 2, r.height / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.rect(r.x, r.y, r.width, r.height);
  }
}

/** Điểm trên viền hình (để dựng bao lồi). */
function outline(shape: MagnifierObject['shape'], r: Readonly<Rect>): Point[] {
  if (shape === 'rect') {
    return [
      { x: r.x, y: r.y },
      { x: r.x + r.width, y: r.y },
      { x: r.x + r.width, y: r.y + r.height },
      { x: r.x, y: r.y + r.height },
    ];
  }
  const c = rectCenter(r);
  const out: Point[] = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    out.push({ x: c.x + (Math.cos(a) * r.width) / 2, y: c.y + (Math.sin(a) * r.height) / 2 });
  }
  return out;
}

const cross = (o: Point, a: Point, b: Point) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/**
 * Hai đường nối = các cạnh của bao lồi (hai hình) đi từ hình này sang hình kia — tiếp tuyến ngoài,
 * đúng cho cả chữ nhật lẫn elip, mọi vị trí tương đối.
 */
export function connectorLines(obj: MagnifierObject): [Point, Point][] {
  const tagged = [
    ...outline(obj.shape, obj.source).map((p) => ({ p, from: 0 })),
    ...outline(obj.shape, magnifierTarget(obj)).map((p) => ({ p, from: 1 })),
  ].sort((a, b) => a.p.x - b.p.x || a.p.y - b.p.y);
  if (tagged.length < 3) return [];
  const hull: typeof tagged = [];
  const build = (list: typeof tagged) => {
    const start = hull.length;
    for (const t of list) {
      while (hull.length >= start + 2) {
        const a = hull[hull.length - 2];
        const b = hull[hull.length - 1];
        if (cross(a.p, b.p, t.p) > 0) break;
        hull.pop();
      }
      hull.push(t);
    }
    hull.pop();
  };
  build(tagged);
  build([...tagged].reverse());
  const lines: [Point, Point][] = [];
  hull.forEach((t, i) => {
    const next = hull[(i + 1) % hull.length];
    if (next.from !== t.from) lines.push([t.p, next.p]);
  });
  return lines;
}

export const magnifierRenderer: ObjectRenderer<MagnifierObject> = {
  draw(ctx, obj, _env, extra) {
    const target = magnifierTarget(obj);
    ctx.save();
    ctx.globalAlpha *= obj.opacity;
    applyStroke(ctx, { ...obj.stroke, width: Math.max(1, obj.stroke.width * 0.6) });
    ctx.globalAlpha *= 0.85;
    ctx.beginPath();
    for (const [a, b] of connectorLines(obj)) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.globalAlpha /= 0.85;
    applyStroke(ctx, obj.stroke);
    ctx.beginPath();
    traceShape(ctx, obj.shape, obj.source);
    ctx.stroke();

    // Bản phóng to: nền trắng + bóng, ảnh nền của vùng nguồn kéo giãn `zoom` lần, viền.
    paintWithShadow(
      ctx,
      obj.shadow,
      () => {
        ctx.beginPath();
        traceShape(ctx, obj.shape, target);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      },
      false,
    );
    const backdrop = extra?.backdrop;
    if (backdrop) {
      const b = backdrop.rect;
      ctx.save();
      ctx.beginPath();
      traceShape(ctx, obj.shape, target);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const sx = target.width / obj.source.width;
      const sy = target.height / obj.source.height;
      ctx.drawImage(
        backdrop.image,
        0,
        0,
        b.width,
        b.height,
        target.x + (b.x - obj.source.x) * sx,
        target.y + (b.y - obj.source.y) * sy,
        b.width * sx,
        b.height * sy,
      );
      ctx.restore();
    }
    ctx.beginPath();
    traceShape(ctx, obj.shape, target);
    ctx.stroke();
    ctx.restore();
  },
  bounds(obj) {
    const half = obj.stroke.width / 2;
    return aaPad(unionRect(obj.source, magnifierTarget(obj)), half + shadowPad(obj.shadow));
  },
  hitTest(obj, p, tolerance) {
    const half = obj.stroke.width / 2;
    if (insideBox(p, magnifierTarget(obj), 0, tolerance + half)) return true;
    return onBoxEdge(p, obj.source, 0, half, tolerance);
  },
  frame(obj) {
    const target = magnifierTarget(obj);
    return {
      kind: 'points',
      points: [
        { x: obj.source.x, y: obj.source.y },
        { x: obj.source.x + obj.source.width, y: obj.source.y + obj.source.height },
        { ...obj.target },
        { x: target.x + target.width, y: obj.target.y },
      ],
      control: null,
      closed: false,
    };
  },
  translate: (obj, dx, dy) => ({
    ...obj,
    source: { ...obj.source, x: obj.source.x + dx, y: obj.source.y + dy },
    target: { x: obj.target.x + dx, y: obj.target.y + dy },
  }),
  dragHandle(start, handle, p) {
    const s = start.source;
    if (handle === 'p0' || handle === 'p1') {
      const fixed = handle === 'p0' ? { x: s.x + s.width, y: s.y + s.height } : { x: s.x, y: s.y };
      const source = rectFromPoints(fixed, p);
      if (source.width < MIN_SOURCE || source.height < MIN_SOURCE) return start;
      return { ...start, source };
    }
    if (handle === 'p2') return { ...start, target: { x: p.x, y: p.y } };
    if (handle === 'p3') {
      const zoom = clampZoom((Math.abs(p.x - start.target.x) * 2) / Math.max(1, s.width));
      return { ...start, zoom };
    }
    return start;
  },
};
