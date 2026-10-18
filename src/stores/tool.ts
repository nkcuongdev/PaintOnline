import { create } from 'zustand';
import { DEFAULT_TOOL_OPTIONS } from '@/engine/core/options';
import type { ColorsState, ToolId, ToolOptionsMap } from '@/engine/core/types';

/**
 * toolStore — bản sao chỉ đọc của tool, tool options và màu từ Engine (mục 4.2). Cập nhật đồng
 * bộ (không throttle) để slider phản hồi tức thì.
 */
export interface ToolState {
  /** Tool đang nhận sự kiện (gồm tool tạm thời như Pan khi giữ Space). */
  active: ToolId;
  /** Tool người dùng đã chọn. */
  selected: ToolId;
  temporary: boolean;
  options: ToolOptionsMap;
  colors: ColorsState;
}

const { primary, secondary, recent, ...options } = DEFAULT_TOOL_OPTIONS;

export const INITIAL_TOOL_STATE: ToolState = {
  active: 'brush',
  selected: 'brush',
  temporary: false,
  options,
  colors: { primary, secondary, recent },
};

export const useToolStore = create<ToolState>()(() => INITIAL_TOOL_STATE);
