import { t } from '@/i18n';

/** Nhãn history (khóa i18n `history.*` do Engine đặt) → chuỗi hiển thị. */
export function historyLabel(key: string | null): string | null {
  if (!key) return null;
  const name = key.replace(/^history\./, '');
  return (t.history as Record<string, string>)[name] ?? null;
}
