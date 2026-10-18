import { format, t } from '@/i18n';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "vừa xong", "5 phút trước", "3 giờ trước", "2 ngày trước", rồi ngày tháng. */
export function relativeTime(epoch: number, now = Date.now()): string {
  const diff = Math.max(0, now - epoch);
  if (diff < MINUTE) return t.projects.relative.justNow;
  if (diff < HOUR) return format(t.projects.relative.minutes, { n: Math.floor(diff / MINUTE) });
  if (diff < DAY) return format(t.projects.relative.hours, { n: Math.floor(diff / HOUR) });
  if (diff < 7 * DAY) return format(t.projects.relative.days, { n: Math.floor(diff / DAY) });
  return new Intl.DateTimeFormat('vi-VN', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(new Date(epoch));
}

/** Số ngày còn lại trước khi project trong thùng rác bị xóa hẳn (làm tròn lên, tối thiểu 0). */
export function daysLeft(deletedAt: number, retentionMs: number, now = Date.now()): number {
  // Mốc "now" của giao diện có thể cũ hơn thời điểm vừa xóa: không tính thời gian âm.
  const elapsed = Math.max(0, now - deletedAt);
  return Math.max(0, Math.ceil((retentionMs - elapsed) / DAY));
}
