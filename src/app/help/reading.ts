import { format, t } from '@/i18n';

/** Thời gian đọc ước lượng: ~900 ký tự/phút cho tiếng Việt có hình minh họa. */
export function readingMinutes(chars: number): number {
  return Math.max(1, Math.round(chars / 900));
}

export function readingLabel(chars: number): string {
  return format(t.help.readingTime, { n: readingMinutes(chars) });
}
