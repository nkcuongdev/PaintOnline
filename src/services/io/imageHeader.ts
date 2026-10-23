/**
 * Nhận diện định dạng ảnh bằng magic bytes (không tin phần mở rộng hay MIME) và đọc kích thước từ
 * header TRƯỚC khi decode — chống ảnh "bom giải nén" (mục 10.2). Hàm thuần, có unit test.
 */

export type ImageFormat = 'png' | 'jpeg' | 'gif' | 'webp' | 'bmp' | 'avif' | 'svg';

export const IMAGE_MIME: Readonly<Record<ImageFormat, string>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
};

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let s = '';
  for (let i = start; i < start + length && i < bytes.length; i++)
    s += String.fromCharCode(bytes[i] ?? 0);
  return s;
}

function u16be(b: Uint8Array, i: number): number {
  return ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
}

function u16le(b: Uint8Array, i: number): number {
  return (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
}

function u24le(b: Uint8Array, i: number): number {
  return (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8) | ((b[i + 2] ?? 0) << 16);
}

function u32be(b: Uint8Array, i: number): number {
  return (
    (((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)) >>> 0
  );
}

function i32le(b: Uint8Array, i: number): number {
  return (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8) | ((b[i + 2] ?? 0) << 16) | ((b[i + 3] ?? 0) << 24);
}

export function sniffFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 8 && ascii(bytes, 1, 3) === 'PNG' && bytes[0] === 0x89 && bytes[4] === 0x0d) {
    return 'png';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  const head6 = ascii(bytes, 0, 6);
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'gif';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  if (ascii(bytes, 0, 2) === 'BM' && bytes.length >= 26) return 'bmp';
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brands = ascii(bytes, 8, Math.min(32, bytes.length - 8));
    if (brands.includes('avif') || brands.includes('avis')) return 'avif';
  }
  // SVG là văn bản: bỏ BOM và khoảng trắng, tìm thẻ <svg trong 1 KB đầu.
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 1024));
  const trimmed = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).trimStart();
  if (/^(<\?xml|<svg|<!--|<!doctype svg)/i.test(trimmed) && /<svg[\s>]/i.test(text)) return 'svg';
  return null;
}

export interface ImageSize {
  width: number;
  height: number;
}

/** Kích thước khai báo trong header; null nếu không đọc được (AVIF, SVG, header hỏng). */
export function readDimensions(bytes: Uint8Array, format: ImageFormat): ImageSize | null {
  switch (format) {
    case 'png':
      // IHDR luôn là chunk đầu tiên: width/height big-endian tại byte 16 và 20.
      if (ascii(bytes, 12, 4) !== 'IHDR') return null;
      return valid(u32be(bytes, 16), u32be(bytes, 20));
    case 'gif':
      return valid(u16le(bytes, 6), u16le(bytes, 8));
    case 'bmp':
      return valid(Math.abs(i32le(bytes, 18)), Math.abs(i32le(bytes, 22)));
    case 'webp':
      return webpSize(bytes);
    case 'jpeg':
      return jpegSize(bytes);
    case 'avif':
      return avifSize(bytes);
    case 'svg':
      return null;
  }
}

/** ISO BMFF spatial extents, traversing only known container boxes. Use the
 * largest item as a conservative admission bound (includes auxiliary images). */
function avifSize(bytes: Uint8Array): ImageSize | null {
  let size: ImageSize | null = null;
  const scan = (start: number, end: number, depth: number): void => {
    if (depth > 8) return;
    for (let i = start; i + 8 <= end;) {
      const length = u32be(bytes, i);
      if (length < 8 || i + length > end) return;
      const type = ascii(bytes, i + 4, 4);
      if (type === 'ispe' && length >= 20) {
        const found = valid(u32be(bytes, i + 12), u32be(bytes, i + 16));
        if (found)
          size = {
            width: Math.max(size?.width ?? 0, found.width),
            height: Math.max(size?.height ?? 0, found.height),
          };
      } else if (['meta', 'iprp', 'ipco'].includes(type)) {
        scan(i + (type === 'meta' ? 12 : 8), i + length, depth + 1);
      }
      i += length;
    }
  };
  scan(0, bytes.length, 0);
  return size;
}

function valid(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

function webpSize(b: Uint8Array): ImageSize | null {
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8X') return valid(1 + u24le(b, 24), 1 + u24le(b, 27));
  if (chunk === 'VP8 ') return valid(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  if (chunk === 'VP8L') {
    if (b.length < 25) return null;
    const b0 = b[21];
    const b1 = b[22];
    const b2 = b[23];
    const b3 = b[24];
    return valid(
      1 + (((b1 & 0x3f) << 8) | b0),
      1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    );
  }
  return null;
}

/** Duyệt marker JPEG tới SOFn (trừ DHT C4, JPG C8, DAC CC). */
function jpegSize(b: Uint8Array): ImageSize | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1] ?? 0;
    if (marker === 0xff) {
      i++;
      continue;
    }
    // Marker đứng riêng (RSTn, SOI, EOI, TEM) không có độ dài.
    if ((marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
      i += 2;
      continue;
    }
    const length = u16be(b, i + 2);
    if (length < 2) return null;
    const isSOF =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) return valid(u16be(b, i + 7), u16be(b, i + 5));
    i += 2 + length;
  }
  return null;
}

/** EXIF IFD0 orientation. null means a truncated/invalid header: do not guess resize axes. */
export function readJpegOrientation(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 2;
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return 1;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2;
      continue;
    }
    if (i + 4 > bytes.length) return null;
    const length = view.getUint16(i + 2);
    const end = i + 2 + length;
    if (length < 2 || end > bytes.length) return null;
    if (marker === 0xe1 && ascii(bytes, i + 4, 6) === 'Exif\0\0') {
      const base = i + 10;
      if (base + 8 > end) return null;
      const order = ascii(bytes, base, 2);
      if (order !== 'II' && order !== 'MM') return null;
      const le = order === 'II';
      if (view.getUint16(base + 2, le) !== 42) return null;
      const ifd = base + view.getUint32(base + 4, le);
      if (ifd < base + 8 || ifd + 2 > end) return null;
      const count = view.getUint16(ifd, le);
      if (ifd + 2 + count * 12 > end) return null;
      for (let j = 0; j < count; j++) {
        const entry = ifd + 2 + j * 12;
        if (view.getUint16(entry, le) !== 0x0112) continue;
        if (view.getUint16(entry + 2, le) !== 3 || view.getUint32(entry + 4, le) !== 1) return null;
        const value = view.getUint16(entry + 8, le);
        return value >= 1 && value <= 8 ? value : null;
      }
    }
    i = end;
  }
  return null;
}
