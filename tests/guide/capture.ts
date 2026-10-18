import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Locator, Page } from '@playwright/test';

/**
 * Tiện ích chụp ảnh minh họa cho hướng dẫn: chụp vùng (cả trang, một phần tử, hoặc hình bao của
 * nhiều phần tử), đổi sang WebP và ghi tọa độ tỉ lệ của các phần tử cần đánh số.
 */

const ROOT = new URL('../../', import.meta.url);
const SHOTS_DIR = fileURLToPath(new URL('public/guide/shots/', ROOT));
const MANIFEST = fileURLToPath(new URL('src/app/help/shots.json', ROOT));

type Box = [number, number, number, number];
interface ShotInfo {
  w: number;
  h: number;
  boxes: Record<string, Box>;
}

const captured: Record<string, ShotInfo> = {};

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Area = 'page' | Locator | readonly Locator[] | Rect;

export interface ShotOptions {
  /** Vùng chụp (mặc định cả khung nhìn). */
  area?: Area;
  /** Lề quanh vùng chụp (CSS px). */
  pad?: number;
  /** Phần tử cần ghi vùng: khóa → locator. Phần tử không hiện bị bỏ qua. */
  boxes?: Record<string, Locator>;
  /** Chất lượng WebP 0..1. */
  quality?: number;
}

async function rectOf(page: Page, area: Area, pad: number): Promise<Rect> {
  const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
  let rect: Rect;
  if (area === 'page') rect = { x: 0, y: 0, width: viewport.width, height: viewport.height };
  else if ('x' in area && typeof area.x === 'number') rect = area;
  else {
    const locators = Array.isArray(area) ? (area as readonly Locator[]) : [area as Locator];
    const boxes = [];
    for (const l of locators) {
      const b = await l.boundingBox();
      if (b) boxes.push(b);
    }
    if (boxes.length === 0) throw new Error('Vùng chụp không hiển thị');
    const x0 = Math.min(...boxes.map((b) => b.x));
    const y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.width));
    const y1 = Math.max(...boxes.map((b) => b.y + b.height));
    rect = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  const x = Math.max(0, Math.floor(rect.x - pad));
  const y = Math.max(0, Math.floor(rect.y - pad));
  const right = Math.min(viewport.width, Math.ceil(rect.x + rect.width + pad));
  const bottom = Math.min(viewport.height, Math.ceil(rect.y + rect.height + pad));
  return { x, y, width: right - x, height: bottom - y };
}

let converter: Page | null = null;

/** Trang trống (không CSP) để đổi PNG → WebP bằng OffscreenCanvas của Chromium. */
async function converterPage(context: BrowserContext): Promise<Page> {
  if (!converter || converter.isClosed()) {
    converter = await context.newPage();
    await converter.goto('about:blank');
  }
  return converter;
}

async function toWebp(context: BrowserContext, png: Buffer, quality: number): Promise<Buffer> {
  const page = await converterPage(context);
  const base64 = await page.evaluate(
    async ([data, q]) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d');
      ctx.drawImage(bitmap, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality: q });
      const out = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < out.length; i += 0x8000) {
        binary += String.fromCharCode(...out.subarray(i, i + 0x8000));
      }
      return btoa(binary);
    },
    [png.toString('base64'), quality] as const,
  );
  return Buffer.from(base64, 'base64');
}

const round = (v: number) => Math.round(v * 10000) / 10000;

/** Chụp một ảnh minh họa và ghi vào manifest. */
export async function shot(page: Page, name: string, options: ShotOptions = {}): Promise<void> {
  const clip = await rectOf(page, options.area ?? 'page', options.pad ?? 0);
  const boxes: Record<string, Box> = {};
  for (const [key, locator] of Object.entries(options.boxes ?? {})) {
    const visible = (await locator.count()) > 0 && (await locator.first().isVisible());
    const b = visible ? await locator.first().boundingBox({ timeout: 2000 }) : null;
    if (!b) {
      console.warn(`[guide] ${name}: không thấy vùng "${key}"`);
      continue;
    }
    const x0 = Math.max(clip.x, b.x);
    const y0 = Math.max(clip.y, b.y);
    const x1 = Math.min(clip.x + clip.width, b.x + b.width);
    const y1 = Math.min(clip.y + clip.height, b.y + b.height);
    if (x1 <= x0 || y1 <= y0) {
      console.warn(`[guide] ${name}: vùng "${key}" nằm ngoài ảnh`);
      continue;
    }
    boxes[key] = [
      round((x0 - clip.x) / clip.width),
      round((y0 - clip.y) / clip.height),
      round((x1 - x0) / clip.width),
      round((y1 - y0) / clip.height),
    ];
  }
  const png = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
  const webp = await toWebp(page.context(), png, options.quality ?? 0.86);
  mkdirSync(SHOTS_DIR, { recursive: true });
  writeFileSync(`${SHOTS_DIR}${name}.webp`, webp);
  const scale = 1.5;
  captured[name] = {
    w: Math.round(clip.width * scale),
    h: Math.round(clip.height * scale),
    boxes,
  };
  console.log(`[guide] ${name}.webp ${String(Math.round(webp.length / 1024))} KB`);
}

/** Gộp các ảnh vừa chụp vào manifest (giữ ảnh cũ không chụp lại lần này). */
export function writeManifest(version: string): void {
  let current: { version: string; shots: Record<string, ShotInfo> } = { version, shots: {} };
  try {
    current = JSON.parse(readFileSync(MANIFEST, 'utf8')) as typeof current;
  } catch {
    // Chưa có manifest.
  }
  const shots = { ...current.shots, ...captured };
  const sorted = Object.fromEntries(
    Object.keys(shots)
      .sort()
      .map((k) => [k, shots[k]]),
  );
  const json = JSON.stringify({ version, shots: sorted }, null, 2);
  // Mảng tọa độ trên một dòng cho dễ đọc diff.
  writeFileSync(
    MANIFEST,
    `${json.replace(/\[\s+([\d.,\s]+?)\s+\]/g, (_, v: string) => `[${v.replace(/\s+/g, ' ')}]`)}\n`,
  );
}

/** Ảnh mẫu "màn hình phần mềm" để minh họa chú thích ảnh chụp (vẽ trên canvas, rõ là ảnh mẫu). */
export async function sampleScreenshotBase64(context: BrowserContext): Promise<string> {
  const page = await converterPage(context);
  return page.evaluate(async () => {
    const W = 1280;
    const H = 800;
    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d');
    const font = (size: number, weight = 400) =>
      `${String(weight)} ${String(size)}px "Segoe UI", Arial, sans-serif`;
    const round = (
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
      fill: string,
      stroke?: string,
    ) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };
    const text = (s: string, x: number, y: number, size: number, color: string, weight = 400) => {
      ctx.font = font(size, weight);
      ctx.fillStyle = color;
      ctx.fillText(s, x, y);
    };
    ctx.fillStyle = '#f3f5fa';
    ctx.fillRect(0, 0, W, H);
    // Thanh trên.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, 64);
    ctx.fillStyle = '#e4e7ef';
    ctx.fillRect(0, 64, W, 1);
    round(28, 18, 28, 28, 7, '#0ca678');
    text('Ứng dụng mẫu · Quản lý khách hàng', 68, 40, 18, '#1f2937', 600);
    ['Tổng quan', 'Khách hàng', 'Đơn hàng', 'Báo cáo'].forEach((s, i) => {
      text(s, 640 + i * 140, 40, 15, i === 1 ? '#0ca678' : '#6b7280', i === 1 ? 600 : 400);
    });
    // Thẻ hồ sơ.
    round(40, 96, 760, 640, 14, '#ffffff', '#e4e7ef');
    text('Hồ sơ khách hàng', 72, 146, 26, '#111827', 700);
    text('Cập nhật thông tin liên hệ rồi bấm Lưu thay đổi.', 72, 178, 15, '#6b7280');
    ctx.beginPath();
    ctx.arc(130, 262, 50, 0, Math.PI * 2);
    ctx.fillStyle = '#c3fae8';
    ctx.fill();
    text('NA', 106, 274, 32, '#087f5b', 700);
    text('Nguyễn Văn An', 204, 254, 22, '#111827', 600);
    text('Khách hàng thân thiết · từ 2021', 204, 284, 15, '#6b7280');
    const fields: [string, string][] = [
      ['Email', 'an.nguyen@example.com'],
      ['Điện thoại', '0901 234 567'],
      ['Số tài khoản', '0123 4567 8910'],
      ['Địa chỉ', '12 Lê Lợi, Quận 1, TP. Hồ Chí Minh'],
    ];
    fields.forEach(([label, value], i) => {
      const y = 350 + i * 76;
      text(label, 72, y, 14, '#6b7280', 600);
      round(72, y + 10, 696, 42, 8, '#f9fafb', '#d1d5db');
      text(value, 88, y + 38, 17, '#111827');
    });
    round(72, 664, 168, 46, 9, '#0ca678');
    text('Lưu thay đổi', 102, 694, 17, '#ffffff', 600);
    round(256, 664, 96, 46, 9, '#ffffff', '#d1d5db');
    text('Hủy', 287, 694, 17, '#374151', 600);
    // Đơn hàng gần đây.
    round(832, 96, 408, 640, 14, '#ffffff', '#e4e7ef');
    text('Đơn hàng gần đây', 860, 146, 20, '#111827', 700);
    const orders: [string, string, string][] = [
      ['#1042', 'Đã giao', '1.250.000 đ'],
      ['#1038', 'Đang giao', '480.000 đ'],
      ['#1031', 'Đã giao', '2.100.000 đ'],
      ['#1027', 'Đã hủy', '320.000 đ'],
    ];
    orders.forEach(([id, status, amount], i) => {
      const y = 196 + i * 84;
      round(860, y, 352, 68, 10, '#f9fafb');
      text(`Đơn ${id}`, 880, y + 30, 17, '#111827', 600);
      const color =
        status === 'Đã hủy' ? '#e03131' : status === 'Đang giao' ? '#f08c00' : '#0ca678';
      text(status, 880, y + 54, 14, color, 600);
      ctx.font = font(17, 600);
      ctx.fillStyle = '#111827';
      const w = ctx.measureText(amount).width;
      ctx.fillText(amount, 1192 - w, y + 42);
    });
    round(860, 552, 352, 150, 10, '#e6fcf5');
    text('Tổng chi tiêu năm nay', 880, 590, 15, '#087f5b', 600);
    text('4.150.000 đ', 880, 636, 34, '#087f5b', 700);
    text('Ảnh mẫu minh họa — không phải dữ liệu thật', 880, 680, 13, '#40c057');
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  });
}

/** Phát sự kiện dán một file PNG (base64) vào trang — giống Ctrl+V ảnh chụp màn hình. */
export async function pastePng(page: Page, base64: string, name = 'anh-chup.png'): Promise<void> {
  await page.evaluate(
    ([data, fileName]) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const file = new File([bytes], fileName, { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const event = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'clipboardData', { value: dt });
      document.dispatchEvent(event);
    },
    [base64, name] as const,
  );
}
