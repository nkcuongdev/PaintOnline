import { describe, expect, it } from 'vitest';
import { matchesSearch, stripDiacritics } from '@/lib/text';
import { paletteScore } from './score';

describe('tìm lệnh không dấu (Command Palette)', () => {
  it('bỏ dấu tiếng Việt', () => {
    expect(stripDiacritics('Làm mờ đường viền')).toBe('Lam mo duong vien');
    expect(matchesSearch('Độ sáng/Tương phản', 'tuong phan')).toBe(true);
    expect(matchesSearch('Độ sáng', 'xoay')).toBe(false);
  });

  it('khớp đầu nhãn > đầu một từ > chứa > đủ các từ; không khớp mờ', () => {
    const score = (label: string, q: string) => paletteScore('id', q, [label]);
    expect(score('Làm mờ…', 'lam mo')).toBe(1);
    expect(score('Khảm điểm ảnh…', 'diem')).toBe(0.8);
    expect(score('Toàn màn hình', 'an hi')).toBe(0.6);
    expect(score('Xoay 90° phải', 'phai xoay')).toBe(0.4);
    expect(score('Co giãn, xoay vùng chọn', 'lam mo')).toBe(0);
    expect(score('Bất kỳ', '')).toBe(1);
  });
});
