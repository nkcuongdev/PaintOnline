import { describe, expect, it } from 'vitest';
import { detectTier, isIOS, memoryConfigFor } from './deviceTier';

describe('deviceTier', () => {
  it('nhận iPhone/iPad và iPadOS báo MacIntel có cảm ứng', () => {
    expect(isIOS({ platform: 'iPhone', maxTouchPoints: 5 })).toBe(true);
    expect(isIOS({ platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isIOS({ platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
  });

  it('phân tier theo deviceMemory', () => {
    expect(detectTier({ platform: 'Win32', maxTouchPoints: 0, deviceMemory: 8 })).toBe('desktop');
    expect(detectTier({ platform: 'Win32', maxTouchPoints: 0, deviceMemory: undefined })).toBe(
      'desktop',
    );
    expect(detectTier({ platform: 'Linux armv8l', maxTouchPoints: 5, deviceMemory: 4 })).toBe(
      'low-memory',
    );
    expect(detectTier({ platform: 'iPad', maxTouchPoints: 5, deviceMemory: undefined })).toBe(
      'ios',
    );
  });

  it('ngân sách theo tier (mục 5.11)', () => {
    expect(memoryConfigFor('ios').maxDocumentSide).toBe(4096);
    expect(memoryConfigFor('low-memory').totalBytes).toBe(768 * 1024 ** 2);
  });
});
