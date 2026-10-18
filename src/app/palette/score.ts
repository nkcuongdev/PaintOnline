import { stripDiacritics } from '@/lib/text';

/**
 * Lọc theo từ (không phân biệt hoa thường và dấu): khớp đầu nhãn > khớp đầu một từ > chứa chuỗi >
 * chứa đủ mọi từ. Không dùng so khớp mờ (fuzzy) để "lam mo" không khớp "Co giãn, xoay vùng chọn".
 */
export function paletteScore(_value: string, search: string, keywords: string[] = []): number {
  const query = stripDiacritics(search.trim().toLowerCase());
  if (query === '') return 1;
  const label = stripDiacritics((keywords[0] ?? '').toLowerCase());
  if (label.startsWith(query)) return 1;
  if (label.includes(` ${query}`)) return 0.8;
  if (label.includes(query)) return 0.6;
  const words = query.split(/\s+/);
  return words.every((word) => label.includes(word)) ? 0.4 : 0;
}
