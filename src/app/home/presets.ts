import { t } from '@/i18n';

export interface SizePreset {
  id: 'full-hd' | 'square' | 'a4';
  name: string;
  hint: string;
  width: number;
  height: number;
}

/** Preset kích thước ở trang chủ (mục 7.3); "Tùy chỉnh" và "Từ clipboard" nằm ở PresetList. */
export const SIZE_PRESETS: readonly SizePreset[] = [
  { id: 'full-hd', ...t.home.presets.fullHd, width: 1920, height: 1080 },
  { id: 'square', ...t.home.presets.square, width: 1080, height: 1080 },
  // A4 (210 × 297 mm) ở 150 dpi.
  { id: 'a4', ...t.home.presets.a4, width: 1240, height: 1754 },
];
