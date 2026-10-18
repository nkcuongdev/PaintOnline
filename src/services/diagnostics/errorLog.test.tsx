// jsdom: nhật ký lỗi dùng localStorage và sự kiện error/unhandledrejection của window.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearErrorLog,
  errorLog,
  errorLogBlob,
  installErrorCapture,
  MAX_ENTRIES,
  recordError,
  resetErrorLogForTest,
  setInputProvider,
} from './errorLog';

describe('nhật ký lỗi cục bộ (mục 10.3)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetErrorLogForTest();
  });

  afterEach(() => {
    resetErrorLogForTest();
  });

  it('ghi lỗi kèm route, phiên bản; lưu vào localStorage', () => {
    window.location.hash = '#/project/abc';
    recordError('react', new TypeError('x is undefined'));
    const [entry] = errorLog();
    expect(entry?.message).toBe('TypeError: x is undefined');
    expect(entry?.source).toBe('react');
    expect(entry?.route).toBe('#/project/abc');
    expect(entry?.stack).toContain('TypeError');
    resetErrorLogForTest();
    expect(errorLog()).toHaveLength(1);
  });

  it('kèm bản ghi input ở vài lỗi mới nhất; bỏ lỗi trùng liên tiếp', () => {
    setInputProvider(() => ({ format: 'paint-online-input', events: [1, 2, 3] }));
    for (let i = 0; i < 5; i++) recordError('window', new Error(`lỗi ${String(i)}`));
    recordError('window', new Error('lỗi 4'));
    const entries = errorLog();
    expect(entries).toHaveLength(5);
    expect(entries.filter((e) => e.input !== undefined)).toHaveLength(3);
    expect(entries.at(-1)?.input).toEqual({ format: 'paint-online-input', events: [1, 2, 3] });
  });

  it(`giữ tối đa ${String(MAX_ENTRIES)} lỗi gần nhất; xóa được; xuất file JSON`, async () => {
    for (let i = 0; i < MAX_ENTRIES + 5; i++) recordError('promise', `lỗi ${String(i)}`);
    expect(errorLog()).toHaveLength(MAX_ENTRIES);
    expect(errorLog()[0]?.message).toBe('lỗi 5');
    const payload = JSON.parse(await errorLogBlob().text()) as {
      format: string;
      entries: unknown[];
    };
    expect(payload.format).toBe('paint-online-error-log');
    expect(payload.entries).toHaveLength(MAX_ENTRIES);
    clearErrorLog();
    expect(errorLog()).toHaveLength(0);
  });

  it('bắt lỗi chưa xử lý của trang', () => {
    const off = installErrorCapture(window);
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('vỡ'), message: 'vỡ' }));
    const rejection = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(rejection, 'reason', { value: 'từ chối' });
    window.dispatchEvent(rejection);
    off();
    expect(errorLog().map((e) => e.message)).toEqual(['Error: vỡ', 'từ chối']);
  });
});
