/**
 * Trạng thái lưu hiển thị ở top bar và tiêu đề tab (mục 6.6): Đã lưu · Có thay đổi chưa lưu ·
 * Đang lưu · Lỗi lưu (kèm lý do, nút Thử lại) · Chỉ đọc; cộng hai trạng thái đặc biệt: hết dung
 * lượng và IndexedDB không dùng được (chế độ "không lưu tự động").
 */
export type SaveErrorReason =
  /** Lỗi tạm thời lặp lại sau 3 lần thử (transaction bị hủy, UnknownError…). */
  | 'transient'
  /** Mã hóa PNG thất bại kể cả khi mã hóa từng layer (thiếu bộ nhớ). */
  | 'encode'
  /** DB có revision mới hơn (tab khác đã ghi). */
  | 'conflict'
  /** Project đã bị xóa ở tab khác. */
  | 'missing';

export type SaveStatus =
  | { kind: 'saved'; savedAt: number | null }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'error'; reason: SaveErrorReason }
  | { kind: 'quota' }
  | { kind: 'readonly' }
  | { kind: 'unavailable' };

export type SaveStatusKind = SaveStatus['kind'];

/** Còn dữ liệu có thể mất nếu đóng tab ngay (bật beforeunload, dấu "•" trên tiêu đề tab). */
export function hasUnsavedWork(status: SaveStatus): boolean {
  switch (status.kind) {
    case 'dirty':
    case 'saving':
    case 'error':
    case 'quota':
    case 'unavailable':
      return true;
    case 'saved':
    case 'readonly':
      return false;
  }
}
