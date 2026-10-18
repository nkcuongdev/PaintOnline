/** Bề dày thước (CSS px) — canvas lùi vào đúng chừng này khi bật thước. */
export const RULER_SIZE = 20;
/** Khoảng cách tối thiểu giữa hai vạch có số (CSS px). */
const MIN_MAJOR_SPACING = 56;
const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];

export interface Tick {
  pos: number;
  value: number;
  major: boolean;
}

/** Vạch thước trên đoạn [0, length) CSS px: tọa độ màn hình = `offset + giá trị · zoom`. */
export function rulerTicks(length: number, zoom: number, offset: number): Tick[] {
  if (length <= 0 || zoom <= 0) return [];
  const step = STEPS.find((s) => s * zoom >= MIN_MAJOR_SPACING) ?? 10000;
  const minor = step % 5 === 0 ? step / 5 : step / 2;
  const first = Math.floor(-offset / zoom / step) * step;
  const last = (length - offset) / zoom;
  const ticks: Tick[] = [];
  for (let v = first; v <= last; v += minor) {
    // `+ 0`: bỏ số -0 (vạch 0 khi pan âm).
    const value = Math.round(v * 1000) / 1000 + 0;
    const pos = offset + value * zoom;
    if (pos < 0) continue;
    ticks.push({ pos, value, major: Math.abs(value / step - Math.round(value / step)) < 1e-6 });
  }
  return ticks;
}
