import { describe, expect, it } from 'vitest';
import { redactionFills, countRedactions } from '@/services/io/projectFile';
import { exportSize, formatBytes, clampExportScale } from '@/services/io/exportImage';
import { sampleRecord } from './testing';
import { sanitizeSettings, sanitizeToolOptions } from './settings';
import { hasUnsavedWork } from './saveStatus';
import type { AppSettings } from './schema';

describe('cài đặt đọc từ DB (mục 4.2)', () => {
  it('giữ cấu trúc đúng, bỏ dữ liệu sai kiểu', () => {
    const raw = {
      key: 'app',
      toolOptions: {
        brush: { size: 30 },
        eraser: 'x',
        primary: '#112233FF',
        secondary: 42,
        recent: ['#000000FF', 'red', 7],
        evil: { a: 1 },
      },
      customPalette: ['#FFFFFFFF', 'nope'],
      paintPolicy: { draw: 'new-layer', modify: 'drop-table' },
      persistRequested: 'yes',
    } as unknown as AppSettings;
    const clean = sanitizeSettings(raw);
    expect(clean.toolOptions).toEqual({
      brush: { size: 30 },
      primary: '#112233FF',
      recent: ['#000000FF'],
    });
    expect(clean.customPalette).toEqual(['#FFFFFFFF']);
    expect(clean.paintPolicy).toEqual({ draw: 'new-layer' });
    expect(clean.persistRequested).toBe(false);
  });

  it('cài đặt GĐ8+9: tự động lưu, bộ nhớ lịch sử, lưới — giá trị lạ bị bỏ hoặc kẹp', () => {
    const clean = sanitizeSettings({
      key: 'app',
      autosave: false,
      historyShare: 0.4,
      view: { grid: true, gridSize: 9999, rulers: 'yes', snap: true },
    } as unknown as AppSettings);
    expect(clean.autosave).toBe(false);
    expect(clean.historyShare).toBe(0.4);
    expect(clean.view).toEqual({ grid: true, gridSize: 512, rulers: false, snap: true });
    const junk = sanitizeSettings({
      key: 'app',
      autosave: 'no',
      historyShare: 2,
      view: 5,
    } as unknown as AppSettings);
    expect(junk.autosave).toBeUndefined();
    expect(junk.historyShare).toBeUndefined();
    expect(junk.view).toBeUndefined();
  });

  it('dữ liệu rác → cài đặt mặc định', () => {
    expect(sanitizeSettings(null)).toEqual({ key: 'app' });
    expect(sanitizeToolOptions('x')).toBeUndefined();
    expect(sanitizeToolOptions([1, 2])).toBeUndefined();
  });
});

describe('trạng thái lưu (mục 6.6)', () => {
  it('beforeunload/dấu "•" chỉ khi còn dữ liệu có thể mất', () => {
    expect(hasUnsavedWork({ kind: 'saved', savedAt: 1 })).toBe(false);
    expect(hasUnsavedWork({ kind: 'readonly' })).toBe(false);
    for (const kind of ['dirty', 'saving', 'quota'] as const) {
      expect(hasUnsavedWork({ kind })).toBe(true);
    }
    expect(hasUnsavedWork({ kind: 'error', reason: 'transient' })).toBe(true);
  });
});

describe('Redact khi xuất .paint (mục 10.2)', () => {
  it('vùng che áp lên mọi layer ảnh bên dưới, căn ra ngoài theo pixel, tọa độ trong layer', () => {
    const record = sampleRecord();
    expect(countRedactions(record)).toBe(1);
    const fills = redactionFills(record);
    // Redact (5.5, 5.5, 40×20) → pixel (5, 5) – (46, 26); layer r1 ở (0, 0).
    expect(fills.get('r1')).toEqual([
      {
        x: 5,
        y: 5,
        width: 41,
        height: 21,
        rgba: [0, 0, 0, 255],
        mode: 'solid',
        full: { x: 5, y: 5, width: 41, height: 21 },
      },
    ]);
  });

  it('layer ảnh nằm trên layer chú thích không bị tô', () => {
    const record = sampleRecord();
    record.layers = [...record.layers].reverse();
    expect(redactionFills(record).size).toBe(0);
  });
});

describe('xuất ảnh (mục 7.3)', () => {
  it('tỉ lệ 0,5×–2× và kích thước đầu ra', () => {
    expect(clampExportScale(5)).toBe(2);
    expect(clampExportScale(0.1)).toBe(0.5);
    expect(clampExportScale(Number.NaN)).toBe(1);
    expect(exportSize(1081, 1081, 0.5)).toEqual({ width: 541, height: 541 });
  });

  it('dung lượng dạng tiếng Việt', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1,5 MB');
  });
});
