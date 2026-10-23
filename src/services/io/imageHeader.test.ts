import { describe, expect, it } from 'vitest';
import { readDimensions, readJpegOrientation, sniffFormat } from './imageHeader';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === 'string' ? Array.from(p, (c) => c.charCodeAt(0)) : p)),
  );

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >>> 8) & 255];
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

it('A09: EXIF orientation parses both TIFF byte orders; truncated/malformed metadata never guesses axes or reads out of bounds', () => {
  for (const little of [true, false])
    for (const orientation of [1, 3, 6, 8]) {
      const u16 = (n: number) => (little ? le16(n) : [n >>> 8, n & 255]);
      const u32 = (n: number) => (little ? le32(n) : be32(n));
      const jpeg = bytes(
        [255, 216, 255, 225, 0, 34],
        'Exif\0\0',
        little ? 'II' : 'MM',
        u16(42),
        u32(8),
        u16(1),
        u16(0x112),
        u16(3),
        u32(1),
        u16(orientation),
        [0, 0],
        u32(0),
        [255, 218],
      );
      expect(readJpegOrientation(jpeg)).toBe(orientation);
      for (let end = 0; end < 38; end++) expect(readJpegOrientation(jpeg.slice(0, end))).toBeNull();
      const broken = jpeg.slice();
      broken.set([255, 255, 255, 255], 16);
      expect(readJpegOrientation(broken)).toBeNull();
    }
  expect(readJpegOrientation(bytes([255, 216, 255, 218]))).toBe(1);
});

const png = (w: number, h: number) =>
  bytes(
    [0x89],
    'PNG',
    [0x0d, 0x0a, 0x1a, 0x0a],
    be32(13),
    'IHDR',
    be32(w),
    be32(h),
    [8, 6, 0, 0, 0],
  );

describe('sniffFormat', () => {
  it('nhận định dạng bằng magic bytes', () => {
    expect(sniffFormat(png(1, 1))).toBe('png');
    expect(sniffFormat(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(sniffFormat(bytes('GIF89a', [1, 0, 1, 0]))).toBe('gif');
    expect(sniffFormat(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '))).toBe('webp');
    expect(sniffFormat(bytes('BM', new Array<number>(30).fill(0)))).toBe('bmp');
    expect(sniffFormat(bytes([0, 0, 0, 28], 'ftypavif'))).toBe('avif');
  });

  it('nhận SVG dạng văn bản, kể cả có khai báo XML', () => {
    expect(sniffFormat(bytes('<?xml version="1.0"?>\n<svg xmlns="x"></svg>'))).toBe('svg');
    expect(sniffFormat(bytes('  <svg width="10"></svg>'))).toBe('svg');
  });

  it('không tin phần mở rộng: văn bản/HTML không phải ảnh', () => {
    expect(sniffFormat(bytes('<html><body>hi</body></html>'))).toBeNull();
    expect(sniffFormat(bytes('hello'))).toBeNull();
    expect(sniffFormat(new Uint8Array())).toBeNull();
  });
});

describe('readDimensions', () => {
  it('PNG IHDR', () => {
    expect(readDimensions(png(1920, 1080), 'png')).toEqual({ width: 1920, height: 1080 });
  });

  it('PNG khai báo kích thước khổng lồ vẫn đọc được để từ chối trước khi decode', () => {
    expect(readDimensions(png(100000, 100000), 'png')).toEqual({ width: 100000, height: 100000 });
  });

  it('GIF', () => {
    expect(readDimensions(bytes('GIF89a', le16(320), le16(240)), 'gif')).toEqual({
      width: 320,
      height: 240,
    });
  });

  it('BMP (chiều cao âm = top-down)', () => {
    const header = bytes('BM', new Array<number>(16).fill(0), le32(640), le32(-480 >>> 0));
    expect(readDimensions(header, 'bmp')).toEqual({ width: 640, height: 480 });
  });

  it('WebP VP8X', () => {
    const header = bytes(
      'RIFF',
      [0, 0, 0, 0],
      'WEBPVP8X',
      new Array<number>(8).fill(0),
      le24(3999),
      le24(1999),
    );
    expect(readDimensions(header, 'webp')).toEqual({ width: 4000, height: 2000 });
  });

  it('JPEG: bỏ qua APP0, đọc SOF0', () => {
    const jpeg = bytes(
      [0xff, 0xd8],
      [0xff, 0xe0, 0x00, 0x10],
      new Array<number>(14).fill(0),
      [0xff, 0xc0, 0x00, 0x11, 0x08],
      [0x02, 0xd0], // cao 720
      [0x05, 0x00], // rộng 1280
      new Array<number>(10).fill(0),
    );
    expect(readDimensions(jpeg, 'jpeg')).toEqual({ width: 1280, height: 720 });
  });

  it('header hỏng → null', () => {
    expect(readDimensions(bytes([0xff, 0xd8, 0x00, 0x00]), 'jpeg')).toBeNull();
    expect(readDimensions(bytes([0x89], 'PNG'), 'png')).toBeNull();
  });
});
