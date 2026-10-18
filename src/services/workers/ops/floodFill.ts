import type { FloodFillRequest, FloodFillResult } from '@/engine/core/types';

/** Khoảng cách RGBA lớn nhất có thể (căn của 4 × 255²). */
const MAX_DISTANCE = 510;

/**
 * Tô loang scanline dùng stack (mục 5.8) — hàm thuần trên mảng RGBA, chạy trong Worker.
 *
 * - Hai pixel "giống nhau" khi khoảng cách Euclid RGBA ≤ `tolerance × 510`; hai pixel trong suốt
 *   hoàn toàn luôn giống nhau (kênh màu của pixel trong suốt không có nghĩa).
 * - `contiguous = false`: mọi pixel giống màu gốc trên toàn ảnh.
 * - `expand`: nới vùng tô thêm 0–2 px (giãn 4 hướng) để phủ viền khử răng cưa của nét vẽ — tránh
 *   lỗi viền trắng kinh điển của Paint (mục 10.1).
 *
 * Trả mặt nạ cắt theo hình bao vùng tô (255 = tô), hoặc null nếu điểm nằm ngoài ảnh.
 */
export function floodFill(request: FloodFillRequest): FloodFillResult | null {
  const { width: w, height: h, data } = request;
  const sx = Math.floor(request.x);
  const sy = Math.floor(request.y);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || data.length < w * h * 4) return null;

  const seed = (sy * w + sx) * 4;
  const r0 = data[seed] ?? 0;
  const g0 = data[seed + 1] ?? 0;
  const b0 = data[seed + 2] ?? 0;
  const a0 = data[seed + 3] ?? 0;
  const limit = Math.max(0, Math.min(1, request.tolerance)) * MAX_DISTANCE;
  const limit2 = limit * limit;

  const matches = (i: number): boolean => {
    const o = i * 4;
    const a = data[o + 3] ?? 0;
    if (a === 0 && a0 === 0) return true;
    const dr = (data[o] ?? 0) - r0;
    const dg = (data[o + 1] ?? 0) - g0;
    const db = (data[o + 2] ?? 0) - b0;
    const da = a - a0;
    return dr * dr + dg * dg + db * db + da * da <= limit2;
  };

  const mask = new Uint8Array(w * h);
  let minX = sx;
  let maxX = sx;
  let minY = sy;
  let maxY = sy;

  if (request.contiguous) {
    // Stack các điểm hạt giống (x, y) — mảng số nguyên tự nở, không cấp phát object.
    let stack = new Int32Array(1024);
    let top = 0;
    const push = (x: number, y: number) => {
      if (top + 2 > stack.length) {
        const bigger = new Int32Array(stack.length * 2);
        bigger.set(stack);
        stack = bigger;
      }
      stack[top++] = x;
      stack[top++] = y;
    };
    push(sx, sy);
    while (top > 0) {
      const y = stack[--top] ?? 0;
      const x = stack[--top] ?? 0;
      const row = y * w;
      if (mask[row + x] || !matches(row + x)) continue;
      let left = x;
      while (left > 0 && !mask[row + left - 1] && matches(row + left - 1)) left--;
      let right = x;
      while (right < w - 1 && !mask[row + right + 1] && matches(row + right + 1)) right++;
      mask.fill(1, row + left, row + right + 1);
      if (left < minX) minX = left;
      if (right > maxX) maxX = right;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      // Hàng trên và dưới: đẩy một hạt giống cho mỗi đoạn liên tiếp còn khớp.
      for (let ny = y - 1; ny <= y + 1; ny += 2) {
        if (ny < 0 || ny >= h) continue;
        const nrow = ny * w;
        let inRun = false;
        for (let nx = left; nx <= right; nx++) {
          const ok = !mask[nrow + nx] && matches(nrow + nx);
          if (ok && !inRun) push(nx, ny);
          inRun = ok;
        }
      }
    }
  } else {
    minX = w;
    maxX = -1;
    minY = h;
    maxY = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (!matches(row + x)) continue;
        mask[row + x] = 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return null;
  }

  // Nới vùng tô: mỗi lượt giãn 1 px theo 4 hướng, trong hình bao đã nới.
  const expand = Math.max(0, Math.min(4, Math.round(request.expand)));
  for (let step = 0; step < expand; step++) {
    const x0 = Math.max(0, minX - 1);
    const x1 = Math.min(w - 1, maxX + 1);
    const y0 = Math.max(0, minY - 1);
    const y1 = Math.min(h - 1, maxY + 1);
    // Đánh dấu tạm bằng 2 để pixel mới giãn không lan tiếp trong cùng lượt.
    for (let y = y0; y <= y1; y++) {
      const row = y * w;
      for (let x = x0; x <= x1; x++) {
        const i = row + x;
        if (mask[i]) continue;
        if (
          (x > 0 && mask[i - 1] === 1) ||
          (x < w - 1 && mask[i + 1] === 1) ||
          (y > 0 && mask[i - w] === 1) ||
          (y < h - 1 && mask[i + w] === 1)
        ) {
          mask[i] = 2;
        }
      }
    }
    for (let y = y0; y <= y1; y++) {
      const row = y * w;
      for (let x = x0; x <= x1; x++) if (mask[row + x] === 2) mask[row + x] = 1;
    }
    minX = x0;
    maxX = x1;
    minY = y0;
    maxY = y1;
  }

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const out = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    const src = (minY + y) * w + minX;
    const dst = y * bw;
    for (let x = 0; x < bw; x++) if (mask[src + x]) out[dst + x] = 255;
  }
  return { bounds: { x: minX, y: minY, width: bw, height: bh }, mask: out };
}
