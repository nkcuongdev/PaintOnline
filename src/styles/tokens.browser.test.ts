import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme } from '@/app/theme';
import './globals.css';

/**
 * Chạy trên Chromium, Firefox và WebKit thật (Vitest browser mode): xác nhận design token
 * Light/Dark được trình duyệt áp dụng đúng — gồm cả màu vùng làm việc quanh canvas (mục 7.1).
 */

function computed(className: string, property: 'backgroundColor' | 'color'): string {
  const probe = document.createElement('div');
  probe.className = className;
  document.body.append(probe);
  const value = getComputedStyle(probe)[property];
  probe.remove();
  return value;
}

describe('design tokens', () => {
  afterEach(() => {
    applyTheme('light');
  });

  it('theme sáng dùng nền #F7F7F9 và vùng làm việc #ECECEF', () => {
    applyTheme('light');
    expect(getComputedStyle(document.body).backgroundColor).toBe('rgb(247, 247, 249)');
    expect(computed('bg-workspace', 'backgroundColor')).toBe('rgb(236, 236, 239)');
    expect(computed('bg-primary', 'backgroundColor')).toBe('rgb(59, 91, 219)');
  });

  it('theme tối dùng nền #1B1B1E và vùng làm việc #2A2A2E', () => {
    applyTheme('dark');
    expect(getComputedStyle(document.body).backgroundColor).toBe('rgb(27, 27, 30)');
    expect(computed('bg-workspace', 'backgroundColor')).toBe('rgb(42, 42, 46)');
    expect(getComputedStyle(document.documentElement).colorScheme).toBe('dark');
  });

  it('cỡ chữ UI 13 px', () => {
    expect(getComputedStyle(document.body).fontSize).toBe('13px');
  });
});
