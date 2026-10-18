import { describe, expect, it } from 'vitest';
import { colorToHsva, hsvaToColor, shortHex } from './color';

describe('chuyển đổi HSV ↔ hex', () => {
  it('màu cơ bản', () => {
    expect(colorToHsva('#FF0000FF')).toEqual({ h: 0, s: 100, v: 100, a: 1 });
    expect(hsvaToColor({ h: 120, s: 100, v: 100, a: 1 })).toBe('#00FF00FF');
    expect(hsvaToColor({ h: 240, s: 100, v: 50, a: 0.5 })).toBe('#00008080');
  });

  it('khứ hồi giữ nguyên màu', () => {
    for (const color of [
      '#3B5BDBFF',
      '#123456AB',
      '#FFFFFFFF',
      '#00000000',
      '#7F7F7F80',
    ] as const) {
      expect(hsvaToColor(colorToHsva(color))).toBe(color);
    }
  });

  it('xám có độ bão hòa 0', () => {
    const hsva = colorToHsva('#808080FF');
    expect(hsva.s).toBe(0);
    expect(hsva.h).toBe(0);
  });

  it('hex gọn khi đục', () => {
    expect(shortHex('#3B5BDBFF')).toBe('#3B5BDB');
    expect(shortHex('#3B5BDB80')).toBe('#3B5BDB80');
  });
});
