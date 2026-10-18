import { describe, expect, it } from 'vitest';
import { format, t } from './index';
import { vi } from './vi';

describe('format', () => {
  it('thay tham số theo tên', () => {
    expect(format('{width} × {height} px', { width: 1920, height: 1080 })).toBe('1920 × 1080 px');
  });

  it('giữ nguyên tham số thiếu để dễ phát hiện', () => {
    expect(format('Xin chào {name}', {})).toBe('Xin chào {name}');
  });

  it('thay mọi lần xuất hiện', () => {
    expect(format('{a}-{a}', { a: 'x' })).toBe('x-x');
  });
});

describe('từ điển', () => {
  it('t trỏ tới tiếng Việt', () => {
    expect(t).toBe(vi);
  });

  it('không có chuỗi rỗng', () => {
    const walk = (node: unknown, path: string): void => {
      if (typeof node === 'string') {
        expect(node.trim(), path).not.toBe('');
        return;
      }
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        walk(value, `${path}.${key}`);
      }
    };
    walk(vi, 'vi');
  });
});
