import type { DeviceTier, MemoryBudgetConfig } from '@/engine/core/types';
import { TIER_BUDGETS } from '@/engine/memory/MemoryBudget';

/**
 * Tier thiết bị và ngân sách bộ nhớ (mục 5.11). Đây là nơi DUY NHẤT được phép nhận diện iOS theo
 * thông tin nền tảng (quy tắc 13.1.8): Safari iOS từ chối canvas vượt 16,7 MP và có trần tổng bộ
 * nhớ canvas, nhưng không công bố `deviceMemory`.
 */

interface TierInput {
  platform: string;
  maxTouchPoints: number;
  /** `navigator.deviceMemory` (GB) — chỉ Chromium có. */
  deviceMemory: number | undefined;
}

export function isIOS({
  platform,
  maxTouchPoints,
}: Pick<TierInput, 'platform' | 'maxTouchPoints'>): boolean {
  if (/iphone|ipad|ipod/i.test(platform)) return true;
  // iPadOS 13+ báo "MacIntel" nhưng có màn hình cảm ứng; Mac thật không có điểm chạm.
  return platform === 'MacIntel' && maxTouchPoints > 1;
}

export function detectTier(input: TierInput): DeviceTier {
  if (isIOS(input)) return 'ios';
  // Desktop RAM thấp và Android: deviceMemory ≤ 4. Không có số (Firefox, Safari) → desktop.
  if (input.deviceMemory !== undefined && input.deviceMemory <= 4) return 'low-memory';
  return 'desktop';
}

export function memoryConfigFor(tier: DeviceTier): MemoryBudgetConfig {
  return { ...TIER_BUDGETS[tier] };
}

export function detectMemoryConfig(): MemoryBudgetConfig {
  if (typeof navigator === 'undefined') return memoryConfigFor('desktop');
  const nav = navigator as Navigator & { deviceMemory?: number };
  return memoryConfigFor(
    detectTier({
      platform: nav.platform,
      maxTouchPoints: nav.maxTouchPoints,
      deviceMemory: nav.deviceMemory,
    }),
  );
}
