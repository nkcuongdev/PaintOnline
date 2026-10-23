import { unzlibSync, zlibSync } from 'fflate';

/**
 * PNG RGBA 8 bit cho pixel layer (ADR 0021): mã hóa/giải mã từ RGBA KHÔNG nhân trước (đúng dữ liệu
 * getImageData/putImageData), nên lưu rồi mở lại đúng từng pixel trên mọi trình duyệt. Bộ mã hóa
 * PNG của canvas trên Firefox và WebKit làm lệch ±1 giá trị nhân trước alpha (đo ở GĐ3), đủ để
 * pixel bán trong suốt sai đáng kể sau khi lưu.
 *
 * File tạo ra là PNG chuẩn (mở được bằng mọi trình xem ảnh). Bộ giải mã chỉ nhận PNG RGBA 8 bit
 * không interlace (định dạng app tự ghi); định dạng khác trả null để người gọi dùng bộ giải mã của
 * trình duyệt. Hàm thuần — chạy trong Worker, có unit test.
 */

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = (CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function writeU32(out: Uint8Array, offset: number, value: number): void {
  out[offset] = (value >>> 24) & 0xff;
  out[offset + 1] = (value >>> 16) & 0xff;
  out[offset + 2] = (value >>> 8) & 0xff;
  out[offset + 3] = value & 0xff;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  writeU32(out, 0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  writeU32(out, 8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

/**
 * Lọc dòng PNG: Paeth cho mọi dòng (dòng đầu: Sub). Bộ lọc cố định thay cho heuristic chọn theo
 * từng dòng — nhanh gấp 2–3 lần mà kích thước gần như không đổi (đo ở GĐ3).
 * Vòng nóng: đánh chỉ số trực tiếp, không cấp phát theo dòng (mục 11.3).
 */
export function filterRows(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const stride = width * 4;
  if (rgba.length !== stride * height) throw new Error('Kích thước dữ liệu RGBA không khớp');
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const s = y * stride;
    const p = s - stride;
    const o = y * (stride + 1) + 1;
    if (y === 0) {
      raw[o - 1] = 1;
      for (let i = 0; i < stride; i++) raw[o + i] = rgba[s + i] - (i >= 4 ? rgba[s + i - 4] : 0);
      continue;
    }
    raw[o - 1] = 4;
    for (let i = 0; i < 4; i++) raw[o + i] = rgba[s + i] - rgba[p + i];
    for (let i = 4; i < stride; i++) {
      const a = rgba[s + i - 4];
      const b = rgba[p + i];
      const c = rgba[p + i - 4];
      const pa = Math.abs(b - c);
      const pb = Math.abs(a - c);
      const pc = Math.abs(a + b - c - c);
      raw[o + i] = rgba[s + i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
    }
  }
  return raw;
}

/** Ghép chữ ký + IHDR (RGBA 8 bit) + IDAT (dữ liệu zlib) + IEND. */
function assemblePng(width: number, height: number, zlib: Uint8Array): Uint8Array {
  const ihdr = new Uint8Array(13);
  writeU32(ihdr, 0, width);
  writeU32(ihdr, 4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const parts = [
    Uint8Array.from(SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Mã hóa RGBA (không nhân trước) thành PNG — đồng bộ, nén bằng fflate. */
export function encodePng(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  return assemblePng(width, height, zlibSync(filterRows(rgba, width, height), { level: 1 }));
}

function hasNativeStreams(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Như encodePng nhưng nén bằng CompressionStream('deflate') của trình duyệt (zlib native, nhanh
 * hơn và nén tốt hơn fflate); không có thì dùng fflate.
 */
export async function encodePngAsync(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const raw = filterRows(rgba, width, height);
  if (!hasNativeStreams()) return assemblePng(width, height, zlibSync(raw, { level: 1 }));
  const input = new Blob([raw as Uint8Array<ArrayBuffer>]).stream();
  return assemblePng(
    width,
    height,
    await readAll(input.pipeThrough(new CompressionStream('deflate'))),
  );
}

/**
 * Nén zlib bằng CompressionStream('deflate') của trình duyệt (native, nhanh), không có thì fflate
 * mức 1. Dùng cho pixel history cũ (mục 5.6) — giải nén bằng `unzlibSync` của fflate.
 */
export async function zlibAsync(raw: Uint8Array | Uint8ClampedArray): Promise<Uint8Array> {
  const bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  if (!hasNativeStreams()) return zlibSync(bytes, { level: 1 });
  const input = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream();
  return readAll(input.pipeThrough(new CompressionStream('deflate')));
}

export interface DecodedPng {
  width: number;
  height: number;
  /** RGBA không nhân trước. */
  data: Uint8ClampedArray<ArrayBuffer>;
}

export class PngError extends Error {
  constructor(message: string) {
    super(`PNG không hợp lệ: ${message}`);
    this.name = 'PngError';
  }
}

/** Cạnh tối đa nhận giải mã (mục 10.2). */
const MAX_SIDE = 16384;

interface ParsedPng {
  width: number;
  height: number;
  /** Dữ liệu zlib (các IDAT nối lại). */
  compressed: Uint8Array;
}

/** Đọc chunk, kiểm tra CRC. null nếu là PNG hợp lệ nhưng không phải RGBA 8 bit không interlace. */
function parsePng(bytes: Uint8Array): ParsedPng | null {
  if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) {
    throw new PngError('chữ ký');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let seenHeader = false;
  const idat: Uint8Array[] = [];
  let idatLength = 0;
  let ended = false;
  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) throw new PngError('chunk bị cắt cụt');
    if (crc32(bytes, offset + 4, dataEnd) !== readU32(bytes, dataEnd)) {
      throw new PngError(`CRC của ${type}`);
    }
    if (type === 'IHDR') {
      if (seenHeader) throw new PngError('IHDR lặp lại');
      if (length !== 13) throw new PngError('IHDR');
      width = readU32(bytes, dataStart);
      height = readU32(bytes, dataStart + 4);
      const depth = bytes[dataStart + 8];
      const colorType = bytes[dataStart + 9];
      const interlace = bytes[dataStart + 12];
      if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) {
        throw new PngError('kích thước');
      }
      if (depth !== 8 || colorType !== 6 || interlace !== 0) return null;
      seenHeader = true;
    } else if (type === 'IDAT') {
      if (!seenHeader) throw new PngError('IDAT trước IHDR');
      idat.push(bytes.subarray(dataStart, dataEnd));
      idatLength += length;
    } else if (type === 'IEND') {
      ended = true;
      break;
    }
    offset = dataEnd + 4;
  }
  if (!seenHeader || !ended || idat.length === 0) throw new PngError('thiếu chunk');
  const compressed = new Uint8Array(idatLength);
  let pos = 0;
  for (const part of idat) {
    compressed.set(part, pos);
    pos += part.length;
  }
  return { width, height, compressed };
}

/** Bỏ lọc các dòng (đủ 5 loại bộ lọc của PNG — file sửa tay có thể dùng bất kỳ loại nào). */
/**
 * Bỏ lọc dòng PNG. Vòng nóng riêng cho từng bộ lọc (pixel đầu dòng và dòng đầu tách ra) — không
 * rẽ nhánh theo từng byte: đo ở GĐ9, mở project M trên Firefox giải mã 5 layer 4K mất 3,3 s với
 * bản tổng quát. Ghi vào Uint8Array (tự lấy mod 256) rồi trả về dạng Uint8ClampedArray.
 */
function unfilter(raw: Uint8Array, width: number, height: number): DecodedPng {
  const stride = width * 4;
  if (raw.length !== (stride + 1) * height) throw new PngError('độ dài dữ liệu');
  const buffer = new ArrayBuffer(stride * height);
  const out = new Uint8Array(buffer);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = dst - stride;
    const first = y === 0;
    switch (filter) {
      case 0:
        out.set(raw.subarray(src, src + stride), dst);
        break;
      case 1:
        for (let i = 0; i < 4; i++) out[dst + i] = raw[src + i];
        for (let i = 4; i < stride; i++) out[dst + i] = raw[src + i] + out[dst + i - 4];
        break;
      case 2:
        if (first) out.set(raw.subarray(src, src + stride), dst);
        else for (let i = 0; i < stride; i++) out[dst + i] = raw[src + i] + out[up + i];
        break;
      case 3:
        if (first) {
          for (let i = 0; i < 4; i++) out[dst + i] = raw[src + i];
          for (let i = 4; i < stride; i++) {
            out[dst + i] = raw[src + i] + (out[dst + i - 4] >> 1);
          }
        } else {
          for (let i = 0; i < 4; i++) out[dst + i] = raw[src + i] + (out[up + i] >> 1);
          for (let i = 4; i < stride; i++) {
            out[dst + i] = raw[src + i] + ((out[dst + i - 4] + out[up + i]) >> 1);
          }
        }
        break;
      case 4:
        if (first) {
          // Không có dòng trên: Paeth(a, 0, 0) = a — như Sub.
          for (let i = 0; i < 4; i++) out[dst + i] = raw[src + i];
          for (let i = 4; i < stride; i++) {
            out[dst + i] = raw[src + i] + out[dst + i - 4];
          }
        } else {
          // Pixel đầu dòng: Paeth(0, b, 0) = b.
          for (let i = 0; i < 4; i++) out[dst + i] = raw[src + i] + out[up + i];
          for (let i = 4; i < stride; i++) {
            const a = out[dst + i - 4];
            const b = out[up + i];
            const c = out[up + i - 4];
            const pa = Math.abs(b - c);
            const pb = Math.abs(a - c);
            const pc = Math.abs(a + b - c - c);
            out[dst + i] = raw[src + i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          }
        }
        break;
      default:
        throw new PngError('bộ lọc');
    }
  }
  return { width, height, data: new Uint8ClampedArray(buffer) };
}

/**
 * Giải mã PNG RGBA 8 bit không interlace (đồng bộ, fflate). Trả null nếu là PNG hợp lệ nhưng định
 * dạng khác (để dùng bộ giải mã của trình duyệt); ném PngError nếu file hỏng. Bộ đệm giải nén cố
 * định đúng bằng kích thước khai báo (chống bom giải nén).
 */
export function decodePng(bytes: Uint8Array): DecodedPng | null {
  const parsed = parsePng(bytes);
  if (!parsed) return null;
  const expected = (parsed.width * 4 + 1) * parsed.height;
  let raw: Uint8Array;
  try {
    raw = unzlibSync(parsed.compressed, { out: new Uint8Array(expected) });
  } catch {
    throw new PngError('dữ liệu nén');
  }
  return unfilter(raw, parsed.width, parsed.height);
}

/** Giải nén bằng DecompressionStream, dừng ngay khi vượt kích thước khai báo. */
async function inflateBounded(compressed: Uint8Array, expected: number): Promise<Uint8Array> {
  const out = new Uint8Array(expected);
  const reader = new Blob([compressed as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'))
    .getReader();
  let pos = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // Dữ liệu dư sau phần khai báo bị bỏ qua (không cấp phát thêm) — như bản fflate.
      const take = Math.min(value.length, expected - pos);
      out.set(value.subarray(0, take), pos);
      pos += take;
      if (pos >= expected) {
        await reader.cancel();
        break;
      }
    }
  } catch {
    throw new PngError('dữ liệu nén');
  }
  if (pos !== expected) throw new PngError('độ dài dữ liệu');
  return out;
}

/** Như decodePng nhưng giải nén native (nhanh hơn) khi trình duyệt có DecompressionStream. */
export async function decodePngAsync(bytes: Uint8Array): Promise<DecodedPng | null> {
  if (!hasNativeStreams()) return decodePng(bytes);
  const parsed = parsePng(bytes);
  if (!parsed) return null;
  const expected = (parsed.width * 4 + 1) * parsed.height;
  return unfilter(await inflateBounded(parsed.compressed, expected), parsed.width, parsed.height);
}

/** Tô kín các vùng (RGBA đục) trực tiếp trên dữ liệu — nướng Redact khi xuất .paint. */
export function fillRgba(
  image: { width: number; height: number; data: Uint8ClampedArray },
  rects: readonly {
    x: number;
    y: number;
    width: number;
    height: number;
    rgba: readonly number[];
  }[],
): void {
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x));
    const y0 = Math.max(0, Math.floor(r.y));
    const x1 = Math.min(image.width, Math.ceil(r.x + r.width));
    const y1 = Math.min(image.height, Math.ceil(r.y + r.height));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * image.width + x) * 4;
        image.data[i] = r.rgba[0] ?? 0;
        image.data[i + 1] = r.rgba[1] ?? 0;
        image.data[i + 2] = r.rgba[2] ?? 0;
        image.data[i + 3] = r.rgba[3] ?? 255;
      }
    }
  }
}
