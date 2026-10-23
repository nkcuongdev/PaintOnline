import { Unzip, UnzipInflate, zipSync, type Zippable } from 'fflate';
import { ZipError } from './zipError';
import { MAX_PAINT_BYTES, MAX_PAINT_ENTRIES } from '@/services/io/paintLimits';
import { MAX_MANIFEST_BYTES } from '@/services/io/decodeBudget';

/**
 * Nén/giải nén ZIP cho file `.paint` (mục 6.5) — hàm thuần chạy trong Worker (có unit test).
 * Giải nén coi file là không đáng tin (mục 10.2): giới hạn số mục, dung lượng sau giải nén đếm
 * theo byte THỰC (không tin kích thước khai báo trong header), kiểm tra đường dẫn.
 */

export interface ZipEntry {
  path: string;
  data: Uint8Array;
  /** PNG đã nén sẵn: lưu nguyên (0) để không tốn CPU; JSON: nén (6). */
  level: 0 | 6;
}

export interface UnzipLimits {
  /** Finite entry limit, including manifest and thumbnail. */
  maxEntries: number;
  /** Tổng dung lượng sau giải nén (≤ 1 GB). */
  maxTotalBytes: number;
  /** Chỉ giải nén các mục này; mục khác bị bỏ qua (vẫn tính vào số mục). */
  accept: (path: string) => boolean;
}

export { ZipError, type ZipErrorCode } from './zipError';

export const DEFAULT_UNZIP_LIMITS: Omit<UnzipLimits, 'accept'> = {
  maxEntries: MAX_PAINT_ENTRIES,
  maxTotalBytes: MAX_PAINT_BYTES,
};

/** Đường dẫn an toàn: tương đối, không `..`, không ký tự ổ đĩa hay gạch ngược. */
export function isSafeZipPath(path: string): boolean {
  if (path.length === 0 || path.length > 255) return false;
  if (path.startsWith('/') || path.includes('\\') || path.includes(':') || path.includes('\0')) {
    return false;
  }
  return path.split('/').every((part) => part !== '..' && part !== '.');
}

export function zipEntries(entries: readonly ZipEntry[]): Uint8Array {
  const files: Zippable = {};
  for (const entry of entries) {
    if (!isSafeZipPath(entry.path)) throw new ZipError('badPath');
    files[entry.path] = [entry.data, { level: entry.level }];
  }
  return zipSync(files);
}

const LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04];

export function looksLikeZip(bytes: Uint8Array): boolean {
  return LOCAL_HEADER.every((b, i) => bytes[i] === b);
}

/** Giải nén có giới hạn. Ném ZipError; trả về các mục được chấp nhận theo đường dẫn. */
export function unzipLimited(data: Uint8Array, limits: UnzipLimits): Map<string, Uint8Array> {
  if (!looksLikeZip(data)) throw new ZipError('notZip');
  const out = new Map<string, Uint8Array>();
  let entries = 0;
  let total = 0;
  // Đối tượng giữ lỗi: callback của fflate gán vào, vòng đẩy dữ liệu đọc ra.
  const state: { failure: ZipError | null } = { failure: null };

  const unzip = new Unzip((file) => {
    if (state.failure) return;
    entries++;
    if (entries > limits.maxEntries) {
      state.failure = new ZipError('tooManyEntries');
      return;
    }
    // Thư mục: bỏ qua.
    if (file.name.endsWith('/')) return;
    if (!isSafeZipPath(file.name)) {
      state.failure = new ZipError('badPath');
      return;
    }
    if (!limits.accept(file.name) || out.has(file.name)) return;
    const entryLimit =
      file.name === 'manifest.json'
        ? MAX_MANIFEST_BYTES
        : file.name === 'thumbnail.png'
          ? 4 * 1024 * 1024
          : limits.maxTotalBytes;
    if (file.originalSize !== undefined && file.originalSize > entryLimit) {
      state.failure = new ZipError('tooLarge');
      return;
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    file.ondata = (error, chunk, final) => {
      if (state.failure) return;
      if (error) {
        state.failure = new ZipError('corrupt');
        return;
      }
      size += chunk.length;
      total += chunk.length;
      if (
        total > limits.maxTotalBytes ||
        (file.name === 'manifest.json' && size > MAX_MANIFEST_BYTES) ||
        (file.name === 'thumbnail.png' && size > 4 * 1024 * 1024)
      ) {
        state.failure = new ZipError('tooLarge');
        file.terminate();
        return;
      }
      chunks.push(chunk);
      if (final) out.set(file.name, concat(chunks, size));
    };
    file.start();
  });
  unzip.register(UnzipInflate);

  try {
    // Đẩy từng khối để dừng sớm khi vượt giới hạn (không giải nén cả file một lần).
    // A compressed input chunk may expand ~1000x before ondata gets control.
    // Small chunks also bound transient inflation for forged/unknown ZIP sizes.
    const block = 1024;
    for (let offset = 0; offset < data.length && !state.failure; offset += block) {
      const end = Math.min(data.length, offset + block);
      unzip.push(data.subarray(offset, end), end === data.length);
    }
  } catch {
    throw state.failure ?? new ZipError('corrupt');
  }
  if (state.failure) throw state.failure;
  return out;
}

function concat(chunks: readonly Uint8Array[], size: number): Uint8Array {
  if (chunks.length === 1 && chunks[0]) return chunks[0];
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
