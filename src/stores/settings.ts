import { create } from 'zustand';
import type { Color } from '@/engine/core/types';

/**
 * settingsStore — cài đặt người dùng (mục 4.1). Bảng màu tùy chỉnh (mục 2, P1) sống trong phiên
 * làm việc; từ GĐ3 service settings ghi bền vững vào IndexedDB cùng tool options.
 */
export interface SettingsState {
  customPalette: Color[];
  addCustomColor: (color: Color) => void;
  removeCustomColor: (color: Color) => void;
}

/** Số màu tối đa của bảng màu tùy chỉnh. */
export const MAX_CUSTOM_COLORS = 20;

export const useSettingsStore = create<SettingsState>()((set) => ({
  customPalette: [],
  addCustomColor: (color) => {
    set((state) =>
      state.customPalette.includes(color)
        ? state
        : { customPalette: [...state.customPalette, color].slice(-MAX_CUSTOM_COLORS) },
    );
  },
  removeCustomColor: (color) => {
    set((state) => ({ customPalette: state.customPalette.filter((c) => c !== color) }));
  },
}));
