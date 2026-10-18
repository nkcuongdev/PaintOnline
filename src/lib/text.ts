/** Bỏ dấu tiếng Việt để tìm kiếm: gõ "lam mo" vẫn khớp "Làm mờ". */
export function stripDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

/** Khớp tìm kiếm không phân biệt hoa thường và dấu. */
export function matchesSearch(text: string, query: string): boolean {
  const q = stripDiacritics(query.trim().toLowerCase());
  return q === '' || stripDiacritics(text.toLowerCase()).includes(q);
}
