import { describe, expect, it } from 'vitest';
import { safeFileName } from './download';

describe('safeFileName', () => {
  it('ghép đuôi một dấu chấm, có hay không dấu chấm ở đuôi truyền vào', () => {
    expect(safeFileName('Bài vẽ', 'paint')).toBe('Bài vẽ.paint');
    expect(safeFileName('Bài vẽ', '.paint')).toBe('Bài vẽ.paint');
    expect(safeFileName('Ảnh', 'png')).toBe('Ảnh.png');
  });

  it('bỏ ký tự cấm, dấu chấm đầu; tên rỗng dùng tên mặc định', () => {
    expect(safeFileName('a/b:c*?', 'png')).toBe('a b c.png');
    expect(safeFileName('..ẩn', 'paint')).toBe('ẩn.paint');
    expect(safeFileName('  ', 'paint')).toBe('paint-online.paint');
  });
});
