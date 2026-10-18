import { describe, expect, it } from 'vitest';
import type { FilterStep } from '@/engine/core/types';
import { filterHalo } from '@/engine/filters/spec';
import { applyFilter, runPipeline } from './pipeline';
import type { FilterImage } from './types';

/**
 * Nghiệm thu GĐ6: mỗi filter có unit test với ảnh nhỏ biết trước kết quả (mục 9, 11.1). Giá trị kỳ
 * vọng tính tay từ công thức ghi trong từng file filter.
 */

type Px = readonly [number, number, number, number];

function image(width: number, height: number, pixels: readonly Px[]): FilterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((p, i) => data.set(p, i * 4));
  return { width, height, data };
}

function filled(width: number, height: number, p: Px): FilterImage {
  return image(width, height, new Array<Px>(width * height).fill(p));
}

function pixels(img: FilterImage): Px[] {
  const out: Px[] = [];
  for (let i = 0; i < img.data.length; i += 4) {
    const d = img.data;
    out.push([d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0, d[i + 3] ?? 0]);
  }
  return out;
}

const CTX = { originX: 0, originY: 0, scale: 1 };

function run(img: FilterImage, ...steps: FilterStep[]): Px[] {
  runPipeline(img, steps, CTX);
  return pixels(img);
}

describe('filter theo từng pixel', () => {
  it('Brightness: cộng amount% của 255, kẹp ở 255, alpha giữ nguyên', () => {
    const img = image(2, 1, [
      [100, 150, 250, 255],
      [0, 10, 20, 128],
    ]);
    expect(run(img, { id: 'brightness', amount: 20 })).toEqual([
      [151, 201, 255, 255],
      [51, 61, 71, 128],
    ]);
    expect(run(filled(1, 1, [90, 90, 90, 255]), { id: 'brightness', amount: -100 })).toEqual([
      [0, 0, 0, 255],
    ]);
  });

  it('Contrast: kéo giãn quanh 128; −100 thành xám đều', () => {
    const img = image(3, 1, [
      [100, 200, 128, 255],
      [0, 255, 64, 255],
      [128, 128, 128, 255],
    ]);
    // f = 259·(127,5 + 255) / (255·(259 − 127,5)) ≈ 2,9544
    expect(run(img, { id: 'contrast', amount: 50 })).toEqual([
      [45, 255, 128, 255],
      [0, 255, 0, 255],
      [128, 128, 128, 255],
    ]);
    expect(run(filled(1, 1, [10, 200, 90, 255]), { id: 'contrast', amount: -100 })).toEqual([
      [128, 128, 128, 255],
    ]);
  });

  it('Saturation: −100 = độ sáng Rec. 709; +100 = gấp đôi', () => {
    const gray = image(3, 1, [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
    ]);
    expect(run(gray, { id: 'saturation', amount: -100 })).toEqual([
      [54, 54, 54, 255],
      [182, 182, 182, 255],
      [18, 18, 18, 255],
    ]);
    expect(run(filled(1, 1, [200, 100, 50, 255]), { id: 'saturation', amount: 100 })).toEqual([
      [255, 82, 0, 255],
    ]);
  });

  it('Hue: xoay trong HSV — đỏ +120° thành xanh lá, xám không đổi', () => {
    const img = image(4, 1, [
      [255, 0, 0, 255],
      [0, 0, 255, 255],
      [128, 128, 128, 255],
      [200, 100, 50, 200],
    ]);
    expect(run(img, { id: 'hue', degrees: 120 })).toEqual([
      [0, 255, 0, 255],
      [255, 0, 0, 255],
      [128, 128, 128, 255],
      [50, 200, 100, 200],
    ]);
    expect(run(filled(1, 1, [200, 100, 50, 255]), { id: 'hue', degrees: 180 })).toEqual([
      [50, 150, 200, 255],
    ]);
    expect(run(filled(1, 1, [255, 0, 0, 255]), { id: 'hue', degrees: -120 })).toEqual([
      [0, 0, 255, 255],
    ]);
  });

  it('Grayscale: mỗi kênh = 0,2126 R + 0,7152 G + 0,0722 B', () => {
    const img = image(4, 1, [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 128],
      [255, 255, 255, 255],
    ]);
    expect(run(img, { id: 'grayscale' })).toEqual([
      [54, 54, 54, 255],
      [182, 182, 182, 255],
      [18, 18, 18, 128],
      [255, 255, 255, 255],
    ]);
  });

  it('Invert: 255 − v, alpha giữ nguyên', () => {
    expect(run(filled(1, 1, [10, 20, 30, 128]), { id: 'invert' })).toEqual([[245, 235, 225, 128]]);
  });

  it('Sepia: ma trận sepia, nội suy theo amount', () => {
    expect(run(filled(1, 1, [100, 100, 100, 255]), { id: 'sepia', amount: 100 })).toEqual([
      [135, 120, 94, 255],
    ]);
    // 50%: (1 − ½)·100 + ½·(135,1; 120,3; 93,7)
    expect(run(filled(1, 1, [100, 100, 100, 255]), { id: 'sepia', amount: 50 })).toEqual([
      [118, 110, 97, 255],
    ]);
  });
});

describe('filter theo vùng lân cận', () => {
  it('Blur bán kính 1 = một hộp 3 × 3: điểm trắng thành khối 3 × 3 giá trị 255/9', () => {
    const img = filled(7, 7, [0, 0, 0, 255]);
    img.data.set([255, 255, 255, 255], (3 * 7 + 3) * 4);
    const out = run(img, { id: 'blur', radius: 1 });
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const inside = Math.abs(x - 3) <= 1 && Math.abs(y - 3) <= 1;
        const v = inside ? 28 : 0;
        expect(out[y * 7 + x]).toEqual([v, v, v, 255]);
      }
    }
  });

  it('Blur trên nền trong suốt: màu giữ nguyên, chỉ alpha lan ra (không viền tối)', () => {
    const img = filled(5, 5, [0, 0, 0, 0]);
    img.data.set([255, 255, 255, 255], (2 * 5 + 2) * 4);
    const out = run(img, { id: 'blur', radius: 1 });
    expect(out[2 * 5 + 2]).toEqual([255, 255, 255, 28]);
    expect(out[1 * 5 + 1]).toEqual([255, 255, 255, 28]);
    expect(out[0]).toEqual([0, 0, 0, 0]);
  });

  it('Blur ảnh một màu không đổi (mép kéo dài pixel biên)', () => {
    const out = run(filled(9, 6, [40, 80, 120, 255]), { id: 'blur', radius: 6 });
    expect(new Set(out.map((p) => p.join(',')))).toEqual(new Set(['40,80,120,255']));
  });

  it('Sharpen = unsharp mask: bậc thang 100 | 200 thành 67 | 233', () => {
    const img = image(6, 1, [
      [100, 100, 100, 255],
      [100, 100, 100, 255],
      [100, 100, 100, 255],
      [200, 200, 200, 255],
      [200, 200, 200, 255],
      [200, 200, 200, 255],
    ]);
    const out = run(img, { id: 'sharpen', amount: 100, radius: 1 });
    expect(out.map((p) => p[0])).toEqual([100, 100, 67, 233, 200, 200]);
    expect(out.every((p) => p[3] === 255)).toBe(true);
  });

  it('Pixelate: trung bình từng ô (nhân trước theo alpha)', () => {
    const img = image(4, 2, [
      [0, 0, 0, 255],
      [100, 100, 100, 255],
      [255, 0, 0, 255],
      [0, 0, 0, 0],
      [200, 200, 200, 255],
      [100, 100, 100, 255],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const out = run(img, { id: 'pixelate', size: 2 });
    expect(out[0]).toEqual([100, 100, 100, 255]);
    expect(out[5]).toEqual([100, 100, 100, 255]);
    // Ô phải: một pixel đỏ đặc + ba pixel trong suốt → đỏ, alpha 255/4.
    expect(out[2]).toEqual([255, 0, 0, 64]);
    expect(out[7]).toEqual([255, 0, 0, 64]);
  });

  it('Pixelate căn lưới theo document: gốc dữ liệu lệch 1 px thì ô lệch theo', () => {
    const img = image(3, 1, [
      [0, 0, 0, 255],
      [100, 100, 100, 255],
      [200, 200, 200, 255],
    ]);
    // Dữ liệu bắt đầu ở x = 1 của document: ô [0, 2) chứa pixel 0, ô [2, 4) chứa pixel 1 và 2.
    runPipeline(img, [{ id: 'pixelate', size: 2 }], { originX: 1, originY: 0, scale: 1 });
    expect(pixels(img).map((p) => p[0])).toEqual([0, 150, 150]);
  });
});

describe('pipeline', () => {
  it('bước không đổi ảnh bị bỏ qua; LUT liền nhau gộp đúng thứ tự', () => {
    const a = filled(2, 2, [90, 140, 200, 255]);
    const b = filled(2, 2, [90, 140, 200, 255]);
    runPipeline(
      a,
      [
        { id: 'brightness', amount: 10 },
        { id: 'contrast', amount: 30 },
      ],
      CTX,
    );
    runPipeline(b, [{ id: 'brightness', amount: 10 }], CTX);
    runPipeline(b, [{ id: 'contrast', amount: 30 }], CTX);
    expect(pixels(a)).toEqual(pixels(b));
    const c = filled(1, 1, [1, 2, 3, 4]);
    runPipeline(
      c,
      [
        { id: 'brightness', amount: 0 },
        { id: 'blur', radius: 0 },
      ],
      CTX,
    );
    expect(pixels(c)).toEqual([[1, 2, 3, 4]]);
  });

  it('layer khóa trong suốt: blur giữ nguyên alpha gốc', () => {
    const img = filled(5, 5, [0, 0, 0, 0]);
    img.data.set([255, 0, 0, 255], (2 * 5 + 2) * 4);
    runPipeline(img, [{ id: 'blur', radius: 1 }], CTX, true);
    expect(pixels(img)[2 * 5 + 2]).toEqual([255, 0, 0, 255]);
    expect(pixels(img)[2 * 5 + 1]?.[3]).toBe(0);
  });

  it('chia dải có phần đệm = chạy cả ảnh một lần (blur, sharpen, pixelate)', () => {
    const W = 24;
    const H = 20;
    const source = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < source.length; i++) source[i] = (i * 37 + (i >> 3) * 11) % 256;
    const pipelines: FilterStep[][] = [
      [{ id: 'blur', radius: 2.5 }],
      [{ id: 'sharpen', amount: 150, radius: 1.5 }],
      [{ id: 'pixelate', size: 5 }],
    ];
    for (const steps of pipelines) {
      const whole = applyFilter({
        width: W,
        height: H,
        data: source.slice(),
        originX: 0,
        originY: 0,
        scale: 1,
        core: { x: 0, y: 0, width: W, height: H },
        steps,
        lockAlpha: false,
      });
      const halo = filterHalo(steps);
      const banded = new Uint8ClampedArray(W * H * 4);
      for (let y0 = 0; y0 < H; y0 += 7) {
        const rows = Math.min(7, H - y0);
        const top = Math.max(0, y0 - halo);
        const bottom = Math.min(H, y0 + rows + halo);
        const part = applyFilter({
          width: W,
          height: bottom - top,
          data: source.slice(top * W * 4, bottom * W * 4),
          originX: 0,
          originY: top,
          scale: 1,
          core: { x: 0, y: y0 - top, width: W, height: rows },
          steps,
          lockAlpha: false,
        });
        banded.set(part, y0 * W * 4);
      }
      expect(Array.from(banded)).toEqual(Array.from(whole));
    }
  });
});
