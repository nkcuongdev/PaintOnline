import { create } from 'zustand';
import type { AdjustmentKind } from '@/app/editor/adjustments';
import type { PaintTargetChoice, PaintTargetKind, ToolId } from '@/engine/core/types';

/**
 * uiStore — state thuần UI (mục 4.1): theme, panel, dialog, thông báo aria-live.
 * Không chứa state của Engine; Engine không bao giờ đọc store này.
 */

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

export type ToastKind = 'info' | 'success' | 'error';

/** Câu hỏi chọn layer đích khi dùng tool pixel trên layer chú thích (mục 5.3). */
export interface PaintTargetRequest {
  kind: PaintTargetKind;
  tool: ToolId;
  choices: PaintTargetChoice[];
}

/** Menu chuột phải trên canvas (tọa độ CSS px trong khung canvas). */
export interface CanvasMenuRequest {
  id: number;
  x: number;
  y: number;
  onObject: boolean;
  /** Bấm trong vùng chọn pixel (menu Copy, Cắt, Xóa, Cắt xén theo vùng chọn…). */
  onSelection: boolean;
}

/** Hộp thoại cấp ứng dụng đang mở (mỗi lúc một hộp thoại). */
export type AppDialog =
  | { kind: 'export' }
  | { kind: 'paintExport'; projectId: string }
  | { kind: 'rename'; projectId: string; name: string }
  | { kind: 'quota' }
  | { kind: 'newImage' }
  | { kind: 'resizeImage' }
  | { kind: 'canvasSize' };

/** Panel phải của editor (mục 7.2): tab Layers, History; thu gọn được. */
export type RightPanelTab = 'layers' | 'history' | 'beautify';

export interface RightPanelState {
  open: boolean;
  tab: RightPanelTab;
}

const RIGHT_PANEL_KEY = 'paint-online:right-panel';

/** Trạng thái panel nhớ theo trình duyệt (tiện ích riêng của người xem — localStorage có thể bị chặn). */
function loadRightPanel(): RightPanelState {
  const fallback: RightPanelState = { open: true, tab: 'layers' };
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(RIGHT_PANEL_KEY) : null;
    if (!raw) return fallback;
    const value = JSON.parse(raw) as Partial<RightPanelState>;
    return {
      open: typeof value.open === 'boolean' ? value.open : fallback.open,
      tab: value.tab === 'history' || value.tab === 'beautify' ? value.tab : 'layers',
    };
  } catch {
    return fallback;
  }
}

function saveRightPanel(state: RightPanelState): void {
  try {
    window.localStorage.setItem(RIGHT_PANEL_KEY, JSON.stringify(state));
  } catch {
    // Không lưu được (chế độ riêng tư): chỉ nhớ trong phiên.
  }
}

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

/** Số toast hiển thị cùng lúc. */
const MAX_TOASTS = 3;

export interface UiState {
  themePreference: ThemePreference;
  systemPrefersDark: boolean;
  /** Thông báo gần nhất cho vùng aria-live (mục 7.8); `id` đổi để đọc lại câu trùng. */
  announcement: { id: number; message: string } | null;
  toasts: Toast[];
  paintTargetRequest: PaintTargetRequest | null;
  canvasMenu: CanvasMenuRequest | null;
  dialog: AppDialog | null;
  rightPanel: RightPanelState;
  /** Bảng điều chỉnh đang mở (loại bảng; phiên filter nằm trong Engine). */
  adjustment: AdjustmentKind | null;

  setThemePreference: (preference: ThemePreference) => void;
  setSystemPrefersDark: (prefersDark: boolean) => void;
  announce: (message: string) => void;
  /** Hiện thông báo ngắn ("Đã copy", lỗi mở ảnh…); trả về id để đóng sớm. */
  pushToast: (kind: ToastKind, message: string) => number;
  dismissToast: (id: number) => void;
  setPaintTargetRequest: (request: PaintTargetRequest | null) => void;
  openCanvasMenu: (menu: Omit<CanvasMenuRequest, 'id'>) => void;
  closeCanvasMenu: () => void;
  openDialog: (dialog: AppDialog) => void;
  closeDialog: () => void;
  setRightPanel: (patch: Partial<RightPanelState>) => void;
  setAdjustment: (kind: AdjustmentKind | null) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>()((set) => ({
  themePreference: 'system',
  systemPrefersDark: false,
  announcement: null,
  toasts: [],
  paintTargetRequest: null,
  canvasMenu: null,
  dialog: null,
  rightPanel: loadRightPanel(),
  adjustment: null,

  setThemePreference: (themePreference) => {
    set({ themePreference });
  },
  setSystemPrefersDark: (systemPrefersDark) => {
    set({ systemPrefersDark });
  },
  announce: (message) => {
    set((state) => ({ announcement: { id: (state.announcement?.id ?? 0) + 1, message } }));
  },
  pushToast: (kind, message) => {
    const id = ++toastSeq;
    set((state) => ({
      // Cùng nội dung thì thay thế, không xếp chồng.
      toasts: [...state.toasts.filter((t) => t.message !== message), { id, kind, message }].slice(
        -MAX_TOASTS,
      ),
    }));
    return id;
  },
  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
  setPaintTargetRequest: (paintTargetRequest) => {
    set({ paintTargetRequest });
  },
  openCanvasMenu: (menu) => {
    set((state) => ({ canvasMenu: { ...menu, id: (state.canvasMenu?.id ?? 0) + 1 } }));
  },
  closeCanvasMenu: () => {
    set({ canvasMenu: null });
  },
  openDialog: (dialog) => {
    set({ dialog });
  },
  closeDialog: () => {
    set({ dialog: null });
  },
  setAdjustment: (adjustment) => {
    set({ adjustment });
  },
  setRightPanel: (patch) => {
    set((state) => {
      const rightPanel = { ...state.rightPanel, ...patch };
      saveRightPanel(rightPanel);
      return { rightPanel };
    });
  },
}));

export function openDialog(dialog: AppDialog): void {
  useUiStore.getState().openDialog(dialog);
}

/** Gọi từ ngoài React (bridge, handler sự kiện). */
export function toast(kind: ToastKind, message: string): number {
  return useUiStore.getState().pushToast(kind, message);
}

export function selectResolvedTheme(state: UiState): ResolvedTheme {
  return resolveTheme(state.themePreference, state.systemPrefersDark);
}
