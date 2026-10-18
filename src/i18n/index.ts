import { vi, type Messages } from './vi';

export type { Messages } from './vi';

/** Ngôn ngữ đang dùng. v1 chỉ có tiếng Việt (mục 3.4). */
export const locale = 'vi';

/** Từ điển đang dùng; component đọc trực tiếp: `t.home.title`. */
export const t: Messages = vi;

/**
 * Thay tham số `{ten}` trong chuỗi. Tham số thiếu được giữ nguyên để dễ phát hiện.
 *
 * @example format(t.home.sizeLabel, { width: 1920, height: 1080 }) // "1920 × 1080 px"
 */
export function format(
  template: string,
  params: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(params, key) ? String(params[key]) : match,
  );
}
