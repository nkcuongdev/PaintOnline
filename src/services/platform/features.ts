import type { PlatformFeatures } from '@/engine/core/types';

/**
 * Feature detection tập trung (mục 11.4). Mọi API không đồng đều giữa các trình duyệt được kiểm
 * tra ở đây; kết quả truyền vào Engine qua `EditorDeps.platform`.
 */

export type { PlatformFeatures } from '@/engine/core/types';

interface NavigatorUAData {
  platform?: string;
}

/**
 * Nền tảng Apple (macOS, iOS, iPadOS): dùng ⌘ thay cho Ctrl khi hiển thị và xử lý phím tắt
 * (mục 7.7). Đọc platform do trình duyệt công bố, không phân tích chuỗi user agent.
 */
export function detectApplePlatform(nav: Navigator): boolean {
  const uaData = (nav as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
  // `navigator.platform` đã lỗi thời nhưng vẫn là nguồn duy nhất trên Firefox và Safari.
  const platform = uaData?.platform ?? nav.platform;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

function hasPointerMethod(name: 'getCoalescedEvents' | 'getPredictedEvents'): boolean {
  return typeof PointerEvent !== 'undefined' && name in PointerEvent.prototype;
}

export function detectPlatformFeatures(): PlatformFeatures {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  return {
    isApple: nav !== null && detectApplePlatform(nav),
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    coalescedEvents: hasPointerMethod('getCoalescedEvents'),
    predictedEvents: hasPointerMethod('getPredictedEvents'),
  };
}

export const platformFeatures: PlatformFeatures = detectPlatformFeatures();

/** Ghi ảnh vào clipboard bằng ClipboardItem (Firefox ≥ 127, Chromium, Safari) — mục 10.1. */
export function canWriteImageToClipboard(): boolean {
  return (
    typeof ClipboardItem !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'clipboard' in navigator &&
    typeof navigator.clipboard.write === 'function'
  );
}
