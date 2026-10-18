import type {
  MaskData,
  MaskOperand,
  MaskRequest,
  Rect,
  SelectionMode,
  SelectionShape,
} from '../core/types';
import { intersectRect, isEmptyRect, roundOutRect, unionRect } from '../utils/rect';
import { shapeBounds } from './shape';

/**
 * Thuật toán mask vùng chọn (mục 5.7) — hàm thuần trên mảng alpha, chạy trong Worker (và trên main
 * thread khi không có Worker). Chỉ bước đổi hình (chữ nhật, ellipse, Lasso) sang alpha cần canvas,
 * được truyền vào qua `rasterize`.
 */

/** Vẽ hình thành alpha 0..255 kích thước `bounds` (canvas: khử răng cưa của trình duyệt). */
export type RasterizeShape = (shape: SelectionShape, bounds: Rect) => Uint8Array;

/** Ngưỡng "nằm trong vùng chọn" (marching ants, chứa điểm, bỏ khử răng cưa). */
export const MASK_THRESHOLD = 128;

/** Độ lệch tối đa (px) khi đơn giản hóa viền marching squares. */
const OUTLINE_TOLERANCE = 0.6;

export function emptyMask(bounds: Rect): MaskData {
  return { bounds: { ...bounds }, data: new Uint8Array(bounds.width * bounds.height) };
}

/** Giá trị alpha tại pixel (x, y) document; ngoài mask = 0. */
export function maskAt(mask: MaskData, x: number, y: number): number {
  const { bounds } = mask;
  const i = Math.floor(x) - bounds.x;
  const j = Math.floor(y) - bounds.y;
  if (i < 0 || j < 0 || i >= bounds.width || j >= bounds.height) return 0;
  return mask.data[j * bounds.width + i] ?? 0;
}

/** Chép mask sang khung `bounds` mới (phần ngoài = 0). */
export function reframeMask(mask: MaskData, bounds: Rect): MaskData {
  const out = emptyMask(bounds);
  const r = intersectRect(mask.bounds, bounds);
  if (isEmptyRect(r)) return out;
  const src = mask.bounds;
  for (let y = r.y; y < r.y + r.height; y++) {
    const from = (y - src.y) * src.width + (r.x - src.x);
    const to = (y - bounds.y) * bounds.width + (r.x - bounds.x);
    out.data.set(mask.data.subarray(from, from + r.width), to);
  }
  return out;
}

/** Cắt mask sát vùng có alpha > 0; null nếu trống. */
export function trimMask(mask: MaskData): MaskData | null {
  const { width, height } = mask.bounds;
  const data = mask.data;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let first = -1;
    for (let x = 0; x < width; x++) {
      if (data[row + x]) {
        first = x;
        break;
      }
    }
    if (first < 0) continue;
    let last = first;
    for (let x = width - 1; x > first; x--) {
      if (data[row + x]) {
        last = x;
        break;
      }
    }
    if (first < x0) x0 = first;
    if (last > x1) x1 = last;
    if (y < y0) y0 = y;
    y1 = y;
  }
  if (x1 < 0) return null;
  if (x0 === 0 && y0 === 0 && x1 === width - 1 && y1 === height - 1) return mask;
  return reframeMask(mask, {
    x: mask.bounds.x + x0,
    y: mask.bounds.y + y0,
    width: x1 - x0 + 1,
    height: y1 - y0 + 1,
  });
}

/** Kết hợp vùng chọn đang có `a` với phần mới `b` (mục 5.7). */
export function combineMasks(a: MaskData | null, b: MaskData, mode: SelectionMode): MaskData {
  if (mode === 'replace' || (!a && mode === 'add')) return b;
  if (!a) return emptyMask({ x: b.bounds.x, y: b.bounds.y, width: 0, height: 0 });
  if (mode === 'add') {
    const out = reframeMask(a, unionRect(a.bounds, b.bounds));
    blend(out, b, (x, y) => (x > y ? x : y));
    return out;
  }
  if (mode === 'subtract') {
    const out = reframeMask(a, a.bounds);
    blend(out, b, (x, y) => Math.round((x * (255 - y)) / 255));
    return out;
  }
  const bounds = intersectRect(a.bounds, b.bounds);
  const out = reframeMask(a, bounds);
  const other = reframeMask(b, bounds);
  for (let i = 0; i < out.data.length; i++) {
    out.data[i] = Math.round(((out.data[i] ?? 0) * (other.data[i] ?? 0)) / 255);
  }
  return out;
}

/** Áp `fn(giá trị đích, giá trị b)` lên phần của `out` giao với `b`. */
function blend(out: MaskData, b: MaskData, fn: (x: number, y: number) => number): void {
  const r = intersectRect(out.bounds, b.bounds);
  if (isEmptyRect(r)) return;
  for (let y = r.y; y < r.y + r.height; y++) {
    let o = (y - out.bounds.y) * out.bounds.width + (r.x - out.bounds.x);
    let s = (y - b.bounds.y) * b.bounds.width + (r.x - b.bounds.x);
    for (let x = 0; x < r.width; x++, o++, s++) {
      out.data[o] = fn(out.data[o] ?? 0, b.data[s] ?? 0);
    }
  }
}

/** Bỏ khử răng cưa: alpha về 0 hoặc 255 theo ngưỡng. */
export function thresholdMask(mask: MaskData): MaskData {
  const data = mask.data;
  for (let i = 0; i < data.length; i++) data[i] = (data[i] ?? 0) >= MASK_THRESHOLD ? 255 : 0;
  return mask;
}

/**
 * Làm mềm biên (feather): mask nở thêm `radius` px rồi làm mờ bằng 3 lượt box blur (xấp xỉ
 * Gauss, O(n) không phụ thuộc bán kính — như blur của mục 5.8).
 */
export function featherMask(mask: MaskData, radius: number): MaskData {
  const r = Math.max(1, Math.round(radius / 3));
  const pad = r * 3;
  const bounds = {
    x: mask.bounds.x - pad,
    y: mask.bounds.y - pad,
    width: mask.bounds.width + pad * 2,
    height: mask.bounds.height + pad * 2,
  };
  const out = reframeMask(mask, bounds);
  const { width, height } = bounds;
  const tmp = new Float32Array(width * height);
  const buf = Float32Array.from(out.data);
  for (let pass = 0; pass < 3; pass++) {
    boxBlur(buf, tmp, width, height, r, 1, width);
    boxBlur(tmp, buf, height, width, r, width, 1);
  }
  for (let i = 0; i < out.data.length; i++) out.data[i] = Math.round(buf[i] ?? 0);
  return out;
}

/**
 * Box blur một chiều: `lines` đường, mỗi đường `length` mẫu cách nhau `step`, các đường cách nhau
 * `lineStep`. Biên ngoài coi là 0 (mask đã được nới đủ rộng).
 */
function boxBlur(
  src: Float32Array,
  dst: Float32Array,
  length: number,
  lines: number,
  r: number,
  step: number,
  lineStep: number,
): void {
  const size = r * 2 + 1;
  for (let line = 0; line < lines; line++) {
    const base = line * lineStep;
    let sum = 0;
    for (let i = 0; i <= r && i < length; i++) sum += src[base + i * step] ?? 0;
    for (let i = 0; i < length; i++) {
      dst[base + i * step] = sum / size;
      const add = i + r + 1;
      const remove = i - r;
      if (add < length) sum += src[base + add * step] ?? 0;
      if (remove >= 0) sum -= src[base + remove * step] ?? 0;
    }
  }
}

function operandMask(operand: MaskOperand, doc: Rect, rasterize: RasterizeShape): MaskData {
  if (operand.kind === 'mask') return operand.mask;
  const bounds = intersectRect(roundOutRect(shapeBounds(operand.shape)), doc);
  if (isEmptyRect(bounds)) return emptyMask({ x: 0, y: 0, width: 0, height: 0 });
  return { bounds, data: rasterize(operand.shape, bounds) };
}

/**
 * Dựng mask theo yêu cầu (mục 5.7): phần mới (làm mềm biên, bỏ khử răng cưa nếu chọn) kết hợp
 * với vùng đang có, cắt theo document và cắt sát nội dung. Null nếu kết quả trống.
 */
export function buildMaskData(request: MaskRequest, rasterize: RasterizeShape): MaskData | null {
  const doc = { x: 0, y: 0, width: request.docWidth, height: request.docHeight };
  let operand = operandMask(request.operand, doc, rasterize);
  if (request.feather > 0 && operand.data.length > 0) {
    operand = featherMask(operand, request.feather);
    operand = reframeMask(operand, intersectRect(operand.bounds, doc));
  } else if (!request.antiAlias) {
    operand = thresholdMask({ bounds: operand.bounds, data: operand.data.slice() });
  }
  const base = request.base ? operandMask(request.base, doc, rasterize) : null;
  const combined = combineMasks(base, operand, request.mode);
  if (combined.data.length === 0) return null;
  return trimMask(combined);
}

// ---------------------------------------------------------------------------
// Viền vùng chọn: marching squares + đơn giản hóa (mục 5.7)
// ---------------------------------------------------------------------------

/**
 * Dò viền mask ở mức alpha 128 bằng marching squares trên tâm pixel (có nội suy tuyến tính), nối
 * các đoạn thành đường khép kín rồi đơn giản hóa (Ramer–Douglas–Peucker). Tọa độ document.
 */
export function traceMask(mask: MaskData): Float32Array[] {
  const { bounds, data } = mask;
  const w = bounds.width;
  const h = bounds.height;
  if (w === 0 || h === 0) return [];
  const iso = MASK_THRESHOLD - 0.5;
  const value = (i: number, j: number): number =>
    i < 0 || j < 0 || i >= w || j >= h ? 0 : (data[j * w + i] ?? 0);
  const cols = w + 2;
  /** Khóa cạnh: cạnh ngang (i, j)–(i+1, j) hoặc dọc (i, j)–(i, j+1), lưới mẫu đệm 1 ô. */
  const hKey = (i: number, j: number) => ((j + 1) * cols + (i + 1)) * 2;
  const vKey = (i: number, j: number) => ((j + 1) * cols + (i + 1)) * 2 + 1;

  const points = new Map<number, [number, number]>();
  /** Mỗi cạnh nằm trên đúng 2 đoạn của các đường khép kín. */
  const links = new Map<number, number[]>();
  const segA: number[] = [];
  const segB: number[] = [];

  const point = (key: number, x: number, y: number) => {
    if (!points.has(key)) points.set(key, [bounds.x + x + 0.5, bounds.y + y + 0.5]);
  };
  const edge = (side: 0 | 1 | 2 | 3, i: number, j: number, v: number[]): number => {
    const [tl, tr, br, bl] = v as [number, number, number, number];
    switch (side) {
      case 0: {
        const key = hKey(i, j);
        point(key, i + (iso - tl) / (tr - tl), j);
        return key;
      }
      case 1: {
        const key = vKey(i + 1, j);
        point(key, i + 1, j + (iso - tr) / (br - tr));
        return key;
      }
      case 2: {
        const key = hKey(i, j + 1);
        point(key, i + (iso - bl) / (br - bl), j + 1);
        return key;
      }
      default: {
        const key = vKey(i, j);
        point(key, i, j + (iso - tl) / (bl - tl));
        return key;
      }
    }
  };
  const segment = (a: number, b: number) => {
    const id = segA.length;
    segA.push(a);
    segB.push(b);
    for (const key of [a, b]) {
      const list = links.get(key);
      if (list) list.push(id);
      else links.set(key, [id]);
    }
  };

  const T = 0;
  const R = 1;
  const B = 2;
  const L = 3;
  const v = [0, 0, 0, 0];
  for (let j = -1; j < h; j++) {
    for (let i = -1; i < w; i++) {
      v[0] = value(i, j);
      v[1] = value(i + 1, j);
      v[2] = value(i + 1, j + 1);
      v[3] = value(i, j + 1);
      const index =
        (v[0] > iso ? 8 : 0) | (v[1] > iso ? 4 : 0) | (v[2] > iso ? 2 : 0) | (v[3] > iso ? 1 : 0);
      if (index === 0 || index === 15) continue;
      const pair = (s: 0 | 1 | 2 | 3, t: 0 | 1 | 2 | 3) => {
        segment(edge(s, i, j, v), edge(t, i, j, v));
      };
      switch (index) {
        case 1:
        case 14:
          pair(L, B);
          break;
        case 2:
        case 13:
          pair(B, R);
          break;
        case 3:
        case 12:
          pair(L, R);
          break;
        case 4:
        case 11:
          pair(T, R);
          break;
        case 6:
        case 9:
          pair(T, B);
          break;
        case 7:
        case 8:
          pair(T, L);
          break;
        case 5:
        case 10: {
          const center = ((v[0] ?? 0) + (v[1] ?? 0) + (v[2] ?? 0) + (v[3] ?? 0)) / 4 > iso;
          // Điểm yên ngựa: tâm ô quyết định hai góc cùng loại có nối với nhau không.
          if ((index === 5) === center) {
            pair(T, L);
            pair(B, R);
          } else {
            pair(T, R);
            pair(L, B);
          }
          break;
        }
      }
    }
  }

  const visited = new Uint8Array(segA.length);
  const out: Float32Array[] = [];
  for (let start = 0; start < segA.length; start++) {
    if (visited[start]) continue;
    const ring: number[] = [];
    let seg = start;
    const first = segA[start] ?? 0;
    let key = first;
    for (;;) {
      visited[seg] = 1;
      const p = points.get(key);
      if (p) ring.push(p[0], p[1]);
      key = segA[seg] === key ? (segB[seg] ?? 0) : (segA[seg] ?? 0);
      if (key === first) break;
      const next = links.get(key)?.find((s) => s !== seg && !visited[s]);
      if (next === undefined) break;
      seg = next;
    }
    if (ring.length >= 6) out.push(simplifyRing(ring, OUTLINE_TOLERANCE));
  }
  return out;
}

/** Đơn giản hóa đường khép kín (RDP, không đệ quy). */
export function simplifyRing(flat: readonly number[], tolerance: number): Float32Array {
  const n = flat.length / 2;
  if (n <= 4) return Float32Array.from(flat);
  // Tách vòng tại điểm 0 và điểm xa nó nhất, đơn giản hóa hai nửa.
  let far = 0;
  let best = -1;
  for (let i = 1; i < n; i++) {
    const d = (flat[i * 2] - flat[0]) ** 2 + (flat[i * 2 + 1] - flat[1]) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[far] = 1;
  const stack: [number, number][] = [
    [0, far],
    [far, n],
  ];
  const tol2 = tolerance * tolerance;
  while (stack.length > 0) {
    const [a, b] = stack.pop() ?? [0, 0];
    if (b - a < 2) continue;
    const ax = flat[a * 2] ?? 0;
    const ay = flat[a * 2 + 1] ?? 0;
    const bi = b % n;
    const bx = flat[bi * 2] ?? 0;
    const by = flat[bi * 2 + 1] ?? 0;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let index = -1;
    let max = tol2;
    for (let i = a + 1; i < b; i++) {
      const px = (flat[i * 2] ?? 0) - ax;
      const py = (flat[i * 2 + 1] ?? 0) - ay;
      const d = len2 > 0 ? (px * dy - py * dx) ** 2 / len2 : px * px + py * py;
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (index >= 0) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(flat[i * 2] ?? 0, flat[i * 2 + 1] ?? 0);
  return Float32Array.from(out);
}

/** Hình bao (theo ảnh) của pixel có alpha > 0 trong RGBA — Trim. */
export function alphaBoundsOf(rgba: Uint8ClampedArray, width: number, height: number): Rect | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    let first = -1;
    for (let x = 0; x < width; x++) {
      if (rgba[row + x * 4 + 3]) {
        first = x;
        break;
      }
    }
    if (first < 0) continue;
    let last = first;
    for (let x = width - 1; x > first; x--) {
      if (rgba[row + x * 4 + 3]) {
        last = x;
        break;
      }
    }
    if (first < x0) x0 = first;
    if (last > x1) x1 = last;
    if (y < y0) y0 = y;
    y1 = y;
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
