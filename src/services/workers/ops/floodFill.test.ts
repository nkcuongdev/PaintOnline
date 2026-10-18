import { describe, expect, it } from 'vitest';
import type { FloodFillRequest } from '@/engine/core/types';
import { floodFill } from './floodFill';

/** Ảnh RGBA từ lưới ký tự: '.' trắng, '#' đen, 'g' xám nhạt (lệch 20), ' ' trong suốt. */
function image(rows: readonly string[]): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => {
    Array.from(row).forEach((c, x) => {
      const o = (y * width + x) * 4;
      const [r, g, b, a] =
        c === '#'
          ? [0, 0, 0, 255]
          : c === 'g'
            ? [235, 235, 235, 255]
            : c === ' '
              ? [0, 0, 0, 0]
              : [255, 255, 255, 255];
      data.set([r, g, b, a], o);
    });
  });
  return { width, height, data };
}

function fill(rows: readonly string[], patch: Partial<FloodFillRequest> = {}) {
  const img = image(rows);
  return floodFill({ ...img, x: 1, y: 1, tolerance: 0, contiguous: true, expand: 0, ...patch });
}

/** Mặt nạ kết quả vẽ lại thành lưới ký tự trên toàn ảnh ('x' = tô). */
function render(rows: readonly string[], result: ReturnType<typeof floodFill>): string[] {
  return rows.map((row, y) =>
    Array.from(row)
      .map((c, x) => {
        if (!result) return c;
        const { bounds, mask } = result;
        const lx = x - bounds.x;
        const ly = y - bounds.y;
        const inside = lx >= 0 && ly >= 0 && lx < bounds.width && ly < bounds.height;
        return inside && mask[ly * bounds.width + lx] === 255 ? 'x' : c;
      })
      .join(''),
  );
}

describe('floodFill (scanline, mục 5.8)', () => {
  const box = ['#######', '#.....#', '#.###.#', '#.#.#.#', '#.###.#', '#.....#', '#######'];

  it('tô vùng liền kề, dừng ở viền', () => {
    expect(render(box, fill(box))).toEqual([
      '#######',
      '#xxxxx#',
      '#x###x#',
      '#x#.#x#',
      '#x###x#',
      '#xxxxx#',
      '#######',
    ]);
  });

  it('không liền kề: mọi pixel cùng màu trên toàn ảnh', () => {
    const result = fill(box, { contiguous: false });
    expect(render(box, result)[3]).toBe('#x#x#x#');
  });

  it('hình bao vừa khít vùng tô', () => {
    expect(fill(box)?.bounds).toEqual({ x: 1, y: 1, width: 5, height: 5 });
  });

  it('dung sai: 0 không lan sang màu lệch, 10% lan sang', () => {
    const rows = ['....', '.gg.', '....'];
    expect(render(rows, fill(rows, { x: 0, y: 0 }))).toEqual(['xxxx', 'xggx', 'xxxx']);
    expect(render(rows, fill(rows, { x: 0, y: 0, tolerance: 0.1 }))).toEqual([
      'xxxx',
      'xxxx',
      'xxxx',
    ]);
  });

  it('pixel trong suốt luôn giống nhau dù kênh màu khác nhau', () => {
    const img = image(['   ', '   ']);
    img.data.set([255, 0, 0, 0], 4); // trong suốt nhưng có màu "rác"
    const result = floodFill({ ...img, x: 0, y: 0, tolerance: 0, contiguous: true, expand: 0 });
    expect(result?.mask.every((v) => v === 255)).toBe(true);
  });

  it('nới vùng tô 1 px phủ lên viền (tránh viền trắng quanh nét khử răng cưa)', () => {
    const rows = ['#####', '#...#', '#####'];
    // Giãn 4 hướng: góc chéo không bị tô.
    expect(render(rows, fill(rows, { expand: 1 }))).toEqual(['#xxx#', 'xxxxx', '#xxx#']);
  });

  it('điểm ngoài ảnh hoặc dữ liệu thiếu → null', () => {
    expect(fill(box, { x: -1 })).toBeNull();
    expect(fill(box, { y: 7 })).toBeNull();
    expect(
      floodFill({
        width: 4,
        height: 4,
        data: new Uint8ClampedArray(8),
        x: 0,
        y: 0,
        tolerance: 0,
        contiguous: true,
        expand: 0,
      }),
    ).toBeNull();
  });

  it('ảnh lớn không tràn stack (vùng xoắn ốc 512×512)', () => {
    const size = 512;
    const data = new Uint8ClampedArray(size * size * 4).fill(255);
    // Sọc ngang có khe xen kẽ hai đầu: vùng tô là một đường zig-zag rất dài.
    for (let y = 1; y < size; y += 2) {
      for (let x = 0; x < size; x++) {
        const gap = (y >> 1) % 2 === 0 ? size - 1 : 0;
        if (x !== gap) data.set([0, 0, 0, 255], (y * size + x) * 4);
      }
    }
    const result = floodFill({
      width: size,
      height: size,
      data,
      x: 0,
      y: 0,
      tolerance: 0,
      contiguous: true,
      expand: 0,
    });
    const filled = result?.mask.reduce((n, v) => n + (v ? 1 : 0), 0) ?? 0;
    // 256 hàng trắng + một khe trên mỗi hàng đen.
    expect(filled).toBe((size / 2) * size + size / 2);
  });
});
