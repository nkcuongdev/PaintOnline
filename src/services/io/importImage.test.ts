import { describe, expect, it } from 'vitest';
import { safeFileName } from './download';
import { fitWithin } from './importImage';

describe('fitWithin', () => {
  const limits = { maxSide: 8192, maxPixels: 8192 * 8192 };

  it('không thu nhỏ ảnh trong giới hạn', () => {
    expect(fitWithin({ width: 1920, height: 1080 }, limits)).toBeNull();
  });

  it('thu nhỏ theo cạnh, giữ tỉ lệ', () => {
    expect(fitWithin({ width: 16000, height: 4000 }, limits)).toEqual({
      width: 8192,
      height: 2048,
    });
  });

  it('thu nhỏ theo tổng pixel (tier iOS 16,7 MP)', () => {
    const r = fitWithin({ width: 4096, height: 4096 }, { maxSide: 4096, maxPixels: 4000 * 4000 });
    expect(r).not.toBeNull();
    expect((r?.width ?? 0) * (r?.height ?? 0)).toBeLessThanOrEqual(4000 * 4000);
  });
});

describe('safeFileName', () => {
  it('giữ tiếng Việt, bỏ ký tự cấm', () => {
    expect(safeFileName('Ảnh: chụp/màn*hình?', 'png')).toBe('Ảnh chụp màn hình.png');
  });

  it('tên rỗng → mặc định', () => {
    expect(safeFileName('  ...  ', 'png')).toBe('paint-online.png');
  });
});
