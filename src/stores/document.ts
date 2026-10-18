import { create } from 'zustand';
import type {
  DocumentSummary,
  FilterSessionSummary,
  HistorySummary,
  MemoryUsage,
  ObjectSelectionSummary,
  SelectionSummary,
  TextEditState,
} from '@/engine/core/types';

/**
 * documentStore — bản sao CHỈ ĐỌC của state Engine để UI hiển thị (mục 4.1). Chỉ engine-bridge
 * ghi vào store này; UI muốn đổi gì phải gọi Editor API.
 */
export interface ViewportCopy {
  zoom: number;
  panX: number;
  panY: number;
  width: number;
  height: number;
}

export interface DocumentState {
  doc: DocumentSummary | null;
  history: HistorySummary;
  viewport: ViewportCopy;
  pointer: { x: number; y: number } | null;
  memory: MemoryUsage | null;
  /** Đối tượng vector đang chọn (Options bar hiển thị thuộc tính). */
  selection: ObjectSelectionSummary;
  /** Vùng chọn pixel (thanh trạng thái, menu — mục 5.7); null = không có. */
  pixelSelection: SelectionSummary | null;
  /** Phiên sửa chữ (TextEditOverlay). */
  textEdit: TextEditState | null;
  /** Đang chờ tác vụ nền (tô loang). */
  busy: boolean;
  /** Phiên điều chỉnh/bộ lọc đang mở (bảng nổi — mục 7.3). */
  filter: FilterSessionSummary | null;
}

export const EMPTY_SELECTION: ObjectSelectionSummary = { layerId: null, objects: [] };

export const EMPTY_HISTORY: HistorySummary = {
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
  steps: 0,
  trimmed: false,
  entries: [],
  position: 0,
};

export const INITIAL_DOCUMENT_STATE: DocumentState = {
  doc: null,
  history: EMPTY_HISTORY,
  viewport: { zoom: 1, panX: 0, panY: 0, width: 0, height: 0 },
  pointer: null,
  memory: null,
  selection: EMPTY_SELECTION,
  pixelSelection: null,
  textEdit: null,
  busy: false,
  filter: null,
};

export const useDocumentStore = create<DocumentState>()(() => INITIAL_DOCUMENT_STATE);

/** Tỉ lệ bộ nhớ đã dùng (0..1). */
export function selectMemoryRatio(state: DocumentState): number {
  const m = state.memory;
  return m && m.totalBytes > 0 ? m.usedBytes / m.totalBytes : 0;
}
