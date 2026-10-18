import manifest from './shots.json';

/**
 * Manifest ảnh minh họa do `npm run guide:shots` (tests/guide/shots.spec.ts) sinh ra: kích thước ảnh
 * và vùng (tỉ lệ 0..1) của các phần tử giao diện đo từ DOM thật lúc chụp — điểm đánh số trên ảnh
 * luôn trúng nút dù giao diện đổi, chỉ cần chụp lại.
 */
interface ShotInfo {
  w: number;
  h: number;
  boxes: Record<string, readonly [number, number, number, number]>;
}

// JSON được suy kiểu là number[]; script chụp luôn ghi đủ 4 số [x, y, w, h].
const SHOTS = manifest.shots as unknown as Record<string, ShotInfo | undefined>;

/** Phiên bản app lúc chụp ảnh. */
export const SHOTS_VERSION: string = manifest.version;

export function shotInfo(name: string): ShotInfo | undefined {
  return SHOTS[name];
}

export function shotBox(
  name: string,
  key: string,
): readonly [number, number, number, number] | null {
  return SHOTS[name]?.boxes[key] ?? null;
}

export function shotNames(): string[] {
  return Object.keys(SHOTS);
}

export function shotUrl(name: string): string {
  return `${import.meta.env.BASE_URL}guide/shots/${name}.webp`;
}
