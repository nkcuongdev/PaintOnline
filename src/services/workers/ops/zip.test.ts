import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_UNZIP_LIMITS,
  isSafeZipPath,
  unzipLimited,
  ZipError,
  zipEntries,
  type UnzipLimits,
} from './zip';

const acceptAll: UnzipLimits = { ...DEFAULT_UNZIP_LIMITS, accept: () => true };
const text = (s: string) => new TextEncoder().encode(s);

function codeOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof ZipError ? error.code : 'other';
  }
}

describe('zip/unzip .paint (mục 6.5, 10.2)', () => {
  it('nén rồi giải nén giữ nguyên nội dung', () => {
    const png = new Uint8Array(5000).map((_, i) => (i * 37) % 256);
    const data = zipEntries([
      { path: 'manifest.json', data: text('{"a":1}'), level: 6 },
      { path: 'layers/abc.png', data: png, level: 0 },
    ]);
    const files = unzipLimited(data, acceptAll);
    expect(new TextDecoder().decode(files.get('manifest.json'))).toBe('{"a":1}');
    expect(files.get('layers/abc.png')).toEqual(png);
  });

  it('chỉ giải nén mục được chấp nhận', () => {
    const data = zipEntries([
      { path: 'manifest.json', data: text('{}'), level: 6 },
      { path: 'other/readme.txt', data: text('hello'), level: 6 },
    ]);
    const files = unzipLimited(data, { ...acceptAll, accept: (p) => p === 'manifest.json' });
    expect([...files.keys()]).toEqual(['manifest.json']);
  });

  it.each(['../evil.png', '/abs.png', 'a\\b.png', 'C:/x.png', 'layers/../../x', './x'])(
    'từ chối đường dẫn không an toàn %s',
    (path) => {
      expect(isSafeZipPath(path)).toBe(false);
      const data = zipSync({ [path]: text('x') });
      expect(codeOf(() => unzipLimited(data, acceptAll))).toBe('badPath');
    },
  );

  it('giới hạn số mục (≤ 200)', () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 205; i++) files[`f${String(i)}.txt`] = text('x');
    expect(codeOf(() => unzipLimited(zipSync(files), acceptAll))).toBe('tooManyEntries');
  });

  it('chống zip bomb: đếm byte thật sau giải nén, không tin header', () => {
    // 32 MB số 0 nén còn vài chục KB.
    const bomb = zipSync({ 'layers/a.png': new Uint8Array(32 * 1024 * 1024) }, { level: 6 });
    expect(bomb.length).toBeLessThan(200_000);
    expect(codeOf(() => unzipLimited(bomb, { ...acceptAll, maxTotalBytes: 8 * 1024 * 1024 }))).toBe(
      'tooLarge',
    );
  }, 20_000);

  it('không phải ZIP', () => {
    expect(codeOf(() => unzipLimited(text('not a zip at all'), acceptAll))).toBe('notZip');
  });

  it('file cắt cụt hoặc hỏng ngẫu nhiên chỉ ném ZipError, không treo', () => {
    const payload = new Uint8Array(20_000).map((_, i) => (i * 7919) % 251);
    const data = zipEntries([
      { path: 'manifest.json', data: text(JSON.stringify({ x: 'y'.repeat(2000) })), level: 6 },
      { path: 'layers/a.png', data: payload, level: 6 },
    ]);
    expect(codeOf(() => unzipLimited(data.subarray(0, data.length >> 1), acceptAll))).not.toBe(
      'other',
    );
    // Fuzz: làm hỏng byte ngẫu nhiên (seed cố định).
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed / 2 ** 32;
    };
    for (let round = 0; round < 60; round++) {
      const copy = data.slice();
      for (let k = 0; k < 8; k++)
        copy[4 + Math.floor(rand() * (copy.length - 4))] = Math.floor(rand() * 256);
      const result = codeOf(() => unzipLimited(copy, acceptAll));
      expect(result === null || result !== 'other').toBe(true);
    }
  });
});
