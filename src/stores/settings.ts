import { create } from 'zustand';
import type { Color } from '@/engine/core/types';

/**
 * settingsStore — cài đặt người dùng (mục 4.1, 7.3): bảng màu tùy chỉnh, tự động lưu, bộ nhớ cho
 * lịch sử hoàn tác, lưới/thước đo. Service settings ghi bền vững vào IndexedDB (app/storage.ts
 * nạp lúc khởi động và lưu khi đổi).
 */

/** Lưới, thước đo, bám lưới (mục 2, P2). */
export interface ViewPreferences {
  grid: boolean;
  /** Khoảng cách lưới (px ảnh). */
  gridSize: number;
  rulers: boolean;
  snap: boolean;
}

export const DEFAULT_VIEW: ViewPreferences = {
  grid: false,
  gridSize: 32,
  rulers: false,
  snap: false,
};
export const GRID_SIZES: readonly number[] = [8, 16, 32, 50, 64, 100];
export const DEFAULT_HISTORY_SHARE = 0.25;

export interface SettingsState {
  customPalette: Color[];
  autosave: boolean;
  /** Phần ngân sách bộ nhớ cho lịch sử hoàn tác (0,1–0,4). */
  historyShare: number;
  view: ViewPreferences;
  addCustomColor: (color: Color) => void;
  removeCustomColor: (color: Color) => void;
  setAutosave: (enabled: boolean) => void;
  setHistoryShare: (share: number) => void;
  setView: (patch: Partial<ViewPreferences>) => void;
}

/** Số màu tối đa của bảng màu tùy chỉnh. */
export const MAX_CUSTOM_COLORS = 20;

export const useSettingsStore = create<SettingsState>()((set) => ({
  customPalette: [],
  autosave: true,
  historyShare: DEFAULT_HISTORY_SHARE,
  view: DEFAULT_VIEW,
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
  setAutosave: (autosave) => {
    set({ autosave });
  },
  setHistoryShare: (historyShare) => {
    set({ historyShare });
  },
  setView: (patch) => {
    set((state) => ({ view: { ...state.view, ...patch } }));
  },
}));
