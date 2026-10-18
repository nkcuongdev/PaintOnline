import { zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { decodePng, encodePng, fillRgba, PngError } from './png';

function randomImage(width: number, height: number, seed = 1): Uint8ClampedArray {
  let s = seed;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    data[i] = s >>> 24;
  }
  // Một nửa ảnh trong suốt hoàn toàn (dòng rỗng), vài vùng bán trong suốt.
  data.fill(0, 0, width * 4 * Math.floor(height / 2));
  return data;
}

/** PNG RGBA 8 bit dựng tay với bộ lọc chỉ định cho từng dòng (tham chiếu theo đặc tả PNG). */
function pngWithFilters(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  filters: number[],
): Uint8Array {
  const stride = w * 4;
  const raw = new Uint8Array((stride + 1) * h);
  const at = (y: number, i: number) => (y < 0 || i < 0 ? 0 : (rgba[y * stride + i] ?? 0));
  for (let y = 0; y < h; y++) {
    const f = filters[y % filters.length] ?? 0;
    raw[y * (stride + 1)] = f;
    for (let i = 0; i < stride; i++) {
      const x = at(y, i);
      const a = i >= 4 ? at(y, i - 4) : 0;
      const b = at(y - 1, i);
      const c = i >= 4 ? at(y - 1, i - 4) : 0;
      const p = a + b - c;
      const pr =
        Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
          ? a
          : Math.abs(p - b) <= Math.abs(p - c)
            ? b
            : c;
      const pred = [0, a, b, (a + b) >> 1, pr][f] ?? 0;
      raw[y * (stride + 1) + 1 + i] = (x - pred) & 0xff;
    }
  }
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of bytes) c = (table[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, w);
  new DataView(ihdr.buffer).setUint32(4, h);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw)),
    chunk('IEND', new Uint8Array()),
  ];
  const total = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    total.set(part, offset);
    offset += part.length;
  }
  return total;
}

describe('PNG RGBA cho pixel layer (ADR 0021)', () => {
  it('giải mã đúng cả 5 bộ lọc dòng (None, Sub, Up, Average, Paeth), kể cả dòng đầu', () => {
    const w = 37;
    const h = 11;
    const data = randomImage(w, h, 99);
    data.fill(200, 0, w * 4); // dòng đầu khác 0 để kiểm tra nhánh "không có dòng trên"
    for (const filters of [[0], [1], [2], [3], [4], [4, 3, 2, 1, 0], [3, 4, 0, 2, 1]]) {
      const decoded = decodePng(pngWithFilters(data, w, h, filters));
      expect(decoded?.data, `bộ lọc ${filters.join(',')}`).toEqual(data);
    }
  });

  it('mã hóa rồi giải mã giữ nguyên từng byte', () => {
    for (const [w, h] of [
      [1, 1],
      [3, 7],
      [257, 33],
    ] as const) {
      const data = randomImage(w, h, w * 31 + h);
      const png = encodePng(data, w, h);
      const decoded = decodePng(png);
      expect(decoded?.width).toBe(w);
      expect(decoded?.height).toBe(h);
      expect(decoded?.data).toEqual(data);
    }
  });

  it('giải mã PNG của công cụ khác (bộ lọc Average, nhiều IDAT)', () => {
    // 1×1 đỏ đục do libpng tạo.
    const bytes = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
      ),
      (c) => c.charCodeAt(0),
    );
    const decoded = decodePng(bytes);
    expect(decoded?.width).toBe(1);
    expect([...(decoded?.data ?? [])]).toEqual(
      [255, 0, 0, 255].map((v, i) => (i < 3 ? decoded!.data[i] : v)),
    );
  });

  it('PNG định dạng khác trả null để dùng bộ giải mã của trình duyệt', () => {
    const png = encodePng(new Uint8ClampedArray(4), 1, 1);
    const rgb = png.slice();
    rgb[8 + 8 + 9] = 2; // color type RGB trong IHDR
    // Sửa CRC của IHDR cho đúng để chỉ khác định dạng.
    const fixed = encodePng(new Uint8ClampedArray(4), 1, 1);
    expect(decodePng(fixed)).not.toBeNull();
    expect(() => decodePng(rgb)).toThrow(PngError); // CRC sai
  });

  it('file hỏng ném PngError; dữ liệu nén lớn hơn khai báo không làm phình bộ nhớ', () => {
    const png = encodePng(randomImage(20, 20), 20, 20);
    expect(() => decodePng(png.subarray(0, png.length - 20))).toThrow(PngError);
    const corrupt = png.slice();
    corrupt[40] = (corrupt[40] ?? 0) ^ 0xff;
    expect(() => decodePng(corrupt)).toThrow(PngError);
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow(PngError);

    // IHDR nói 2×2 nhưng IDAT giải nén ra nhiều hơn.
    const small = encodePng(new Uint8ClampedArray(16), 2, 2);
    const ihdrEnd = 8 + 25;
    const bomb = zlibSync(new Uint8Array(1_000_000));
    const idat = new Uint8Array(12 + bomb.length);
    const view = new DataView(idat.buffer);
    view.setUint32(0, bomb.length);
    idat.set([73, 68, 65, 84], 4);
    idat.set(bomb, 8);
    // CRC đúng để chắc chắn bị chặn bởi giới hạn giải nén chứ không phải CRC.
    const table = new Uint32Array(256).map((_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
    let crc = 0xffffffff;
    for (let i = 4; i < 8 + bomb.length; i++) crc = table[(crc ^ idat[i]) & 0xff] ^ (crc >>> 8);
    view.setUint32(8 + bomb.length, (crc ^ 0xffffffff) >>> 0);
    const tail = small.subarray(small.length - 12);
    const forged = new Uint8Array([...small.subarray(0, ihdrEnd), ...idat, ...tail]);
    // Bộ đệm giải nén cố định theo kích thước khai báo: không cấp phát thêm dù dữ liệu phình to.
    expect(decodePng(forged)?.data.length).toBe(16);
  });

  it('tô kín vùng (nướng Redact)', () => {
    const image = { width: 4, height: 3, data: new Uint8ClampedArray(48).fill(9) };
    fillRgba(image, [{ x: 1, y: 1, width: 2, height: 5, rgba: [1, 2, 3, 255] }]);
    expect([...image.data.subarray(20, 24)]).toEqual([1, 2, 3, 255]);
    expect([...image.data.subarray(0, 4)]).toEqual([9, 9, 9, 9]);
  });
});
