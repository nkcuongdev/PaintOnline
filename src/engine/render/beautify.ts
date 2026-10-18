import type { BeautifyBackground, BeautifySettings, Rect } from '../core/types';
import { applyShadow } from '../layers/objects/draw';
import type { Ctx2D } from '../memory/surfaces';
import { inflateRect } from '../utils/rect';

/**
 * Khung "Làm đẹp" ảnh chụp (mục 2, 7.3 — GĐ7): nền gradient/màu quanh ảnh, ảnh bo góc, bóng đổ.
 * Dùng chung cho màn hình và ảnh xuất (copy, tải xuống, Export) để kết quả giống hệt nhau.
 */

export const BEAUTIFY_DEFAULTS: Readonly<BeautifySettings> = {
  padding: 64,
  background: 'ocean',
  radius: 12,
  shadow: true,
};

export const BEAUTIFY_MAX_PADDING = 400;
export const BEAUTIFY_MAX_RADIUS = 96;

/** Gradient chéo (trên trái → dưới phải) hoặc màu đơn; null = trong suốt. */
export const BEAUTIFY_BACKGROUNDS: Readonly<Record<BeautifyBackground, readonly string[] | null>> =
  {
    ocean: ['#4F8CFF', '#8B5CF6'],
    sunset: ['#FF9A62', '#FF4F8B'],
    mint: ['#34D399', '#38BDF8'],
    peach: ['#FDE68A', '#FCA5A5'],
    night: ['#334155', '#0F172A'],
    paper: ['#EEF0F3'],
    white: ['#FFFFFF'],
    transparent: null,
  };

/** Bóng đổ của ảnh (px document). */
const SHADOW = { color: '#0000005C', blur: 28, offsetX: 0, offsetY: 12 } as const;

/** Kẹp và làm tròn cài đặt; khóa lạ hoặc giá trị sai bị bỏ. */
export function normalizeBeautify(
  patch: Partial<BeautifySettings>,
  base: Readonly<BeautifySettings> = BEAUTIFY_DEFAULTS,
): BeautifySettings {
  const clamp = (v: unknown, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.round(Math.min(max, Math.max(0, v)))
      : fallback;
  return {
    padding: clamp(patch.padding, BEAUTIFY_MAX_PADDING, base.padding),
    radius: clamp(patch.radius, BEAUTIFY_MAX_RADIUS, base.radius),
    background:
      typeof patch.background === 'string' && patch.background in BEAUTIFY_BACKGROUNDS
        ? patch.background
        : base.background,
    shadow: typeof patch.shadow === 'boolean' ? patch.shadow : base.shadow,
  };
}

/** Khung ngoài cùng (ảnh + padding), tọa độ document. */
export function beautifyFrame(image: Readonly<Rect>, s: Readonly<BeautifySettings>): Rect {
  return inflateRect(image, s.padding);
}

/** Bán kính bo góc thực tế (không vượt nửa cạnh ngắn). */
function cornerRadius(image: Readonly<Rect>, s: Readonly<BeautifySettings>): number {
  return Math.max(0, Math.min(s.radius, image.width / 2, image.height / 2));
}

function traceImage(ctx: Ctx2D, image: Readonly<Rect>, s: Readonly<BeautifySettings>): void {
  const r = cornerRadius(image, s);
  if (r > 0) ctx.roundRect(image.x, image.y, image.width, image.height, r);
  else ctx.rect(image.x, image.y, image.width, image.height);
}

/**
 * Vẽ nền và bóng của khung (context đã đặt ma trận document → đích). Ảnh được ghép sau, bên trong
 * `clipToImage`.
 */
export function paintBeautifyFrame(
  ctx: Ctx2D,
  image: Readonly<Rect>,
  s: Readonly<BeautifySettings>,
): void {
  const frame = beautifyFrame(image, s);
  const colors = BEAUTIFY_BACKGROUNDS[s.background];
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (colors) {
    const [first = '#FFFFFF', last = first] = colors;
    if (colors.length > 1) {
      const g = ctx.createLinearGradient(
        frame.x,
        frame.y,
        frame.x + frame.width,
        frame.y + frame.height,
      );
      g.addColorStop(0, first);
      g.addColorStop(1, last);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = first;
    }
    ctx.fillRect(frame.x, frame.y, frame.width, frame.height);
  }
  if (s.shadow && s.padding > 0) {
    // Chỉ phần bóng ngoài ảnh: ảnh trong suốt một phần vẫn không lộ khối tô bên dưới.
    ctx.beginPath();
    ctx.rect(frame.x, frame.y, frame.width, frame.height);
    traceImage(ctx, image, s);
    ctx.clip('evenodd');
    applyShadow(ctx, SHADOW);
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    traceImage(ctx, image, s);
    ctx.fill();
  }
  ctx.restore();
}

/** Cắt theo ảnh bo góc (gọi giữa save/restore của người gọi). */
export function clipToImage(
  ctx: Ctx2D,
  image: Readonly<Rect>,
  s: Readonly<BeautifySettings>,
): void {
  ctx.beginPath();
  traceImage(ctx, image, s);
  ctx.clip();
}
