import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './EventBus';
import {
  createColorsAPI,
  createOptionsAPI,
  DEFAULT_TOOL_OPTIONS,
  OPTION_SCHEMAS,
  optionFieldPatch,
  readOptionField,
  validateOptions,
} from './options';
import type { EditorEvents } from './types';

describe('validateOptions', () => {
  const brush = DEFAULT_TOOL_OPTIONS.brush;

  it('kẹp số và làm tròn theo bước', () => {
    const next = validateOptions(brush, { size: 9999, opacity: 0.123456 }, OPTION_SCHEMAS.brush);
    expect(next.size).toBe(500);
    expect(next.opacity).toBe(0.12);
  });

  it('bỏ giá trị select không hợp lệ và số NaN', () => {
    const next = validateOptions(
      brush,
      { preset: 'laser' as never, size: Number.NaN },
      OPTION_SCHEMAS.brush,
    );
    expect(next.preset).toBe('round');
    expect(next.size).toBe(brush.size);
  });

  it('khóa lạ bị bỏ, khóa ngoài schema chỉ nhận khi cùng kiểu', () => {
    const next = validateOptions(
      brush,
      { hacked: true, smoothing: 'x' as never } as never,
      OPTION_SCHEMAS.brush,
    );
    expect('hacked' in next).toBe(false);
    expect(next.smoothing).toBe(0);
  });
});

describe('OptionsAPI', () => {
  it('set validate rồi phát toolOptionsChanged đồng bộ', () => {
    const events = new EventBus<EditorEvents>();
    const listener = vi.fn();
    events.on('toolOptionsChanged', listener);
    const options = createOptionsAPI(undefined, events);
    options.set('brush', { size: 24 });
    expect(options.get('brush').size).toBe(24);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ group: 'brush', options: { size: 24 } });
  });

  it('nhận initialOptions (đã validate)', () => {
    const options = createOptionsAPI(
      { eraser: { size: 1000, hardness: 0.5, opacity: 1 } },
      new EventBus(),
    );
    expect(options.get('eraser')).toEqual({ size: 500, hardness: 0.5, opacity: 1 });
  });
});

describe('ColorsAPI', () => {
  it('chuẩn hóa màu, ghi nhớ màu gần đây, đổi chỗ', () => {
    const events = new EventBus<EditorEvents>();
    const listener = vi.fn();
    events.on('colorsChanged', listener);
    const colors = createColorsAPI(undefined, events);
    colors.setPrimary('#f00');
    expect(colors.primary).toBe('#FF0000FF');
    expect(colors.recent[0]).toBe('#FF0000FF');
    colors.swap();
    expect(colors.primary).toBe('#FFFFFFFF');
    expect(colors.secondary).toBe('#FF0000FF');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('bỏ qua màu không hợp lệ', () => {
    const colors = createColorsAPI(undefined, new EventBus());
    colors.setPrimary('red' as never);
    expect(colors.primary).toBe('#000000FF');
  });
});

describe('Option lồng nhau và màu tạm thời (GĐ2)', () => {
  it('validate khóa lồng nhau theo field `pressure.size`', () => {
    const brush = DEFAULT_TOOL_OPTIONS.brush;
    const next = validateOptions(
      brush,
      { pressure: { size: false, opacity: 'x' as never } },
      OPTION_SCHEMAS.brush,
    );
    expect(next.pressure).toEqual({ size: false, opacity: false });
  });

  it('đọc và tạo bản vá cho khóa lồng nhau, giữ thuộc tính anh em', () => {
    const brush = DEFAULT_TOOL_OPTIONS.brush;
    expect(readOptionField(brush, 'pressure.size')).toBe(true);
    expect(optionFieldPatch(brush, 'pressure.opacity', true)).toEqual({
      pressure: { size: true, opacity: true },
    });
    expect(optionFieldPatch(brush, 'size', 12)).toEqual({ size: 12 });
  });

  it('select nhận giá trị số (độ đậm chữ)', () => {
    const text = DEFAULT_TOOL_OPTIONS.text;
    expect(validateOptions(text, { weight: 700 }, OPTION_SCHEMAS.text).weight).toBe(700);
    expect(validateOptions(text, { weight: 500 as never }, OPTION_SCHEMAS.text).weight).toBe(600);
  });

  it('màu tạm thời (đang kéo bộ chọn màu) không vào "màu gần đây"', () => {
    const colors = createColorsAPI(undefined, new EventBus());
    colors.setPrimary('#112233', { transient: true });
    colors.setPrimary('#223344', { transient: true });
    expect(colors.primary).toBe('#223344FF');
    expect(colors.recent).toEqual([]);
    colors.setPrimary('#223344');
    expect(colors.recent).toEqual(['#223344FF']);
  });
});
