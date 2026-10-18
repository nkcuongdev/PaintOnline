import type { GroupId } from '@/app/dialogs/shortcutRows';
import type { ToolId } from '@/engine/core/types';

/**
 * Mô hình nội dung của trung tâm hướng dẫn. Bài viết là dữ liệu (không phải JSX) để:
 * - người viết chỉ sửa chuỗi tiếng Việt, không cần biết React;
 * - tìm kiếm toàn văn được trên mọi bài (search.ts đọc cùng dữ liệu);
 * - test kiểm tra được liên kết, ảnh minh họa, công cụ và phím tắt mà bài nhắc tới (help.test.ts).
 *
 * Chuỗi `Rich` hỗ trợ cú pháp nội dòng (inline.tsx):
 * - `**đậm**`, `` `mã` ``
 * - `[[Mod+Z]]` phím tắt (tự đổi Ctrl ↔ ⌘ theo máy)
 * - `{tool:brush}` tên + icon + phím của công cụ, lấy từ registry
 * - `{cmd:edit.undo}` tên lệnh + phím tắt, lấy từ Command Registry
 * - `{ui:Xuất}` tên nút/mục menu trên giao diện
 * - `{icon:more}` icon trên giao diện (xem ICONS trong inline.tsx)
 * - `[chữ](ma-bai)`, `[chữ](ma-bai#ma-muc)` liên kết tới bài khác; `https://…` liên kết ngoài
 */
export type Rich = string;

/** Điểm đánh dấu trên ảnh minh họa: vùng lấy từ manifest ảnh (`target`) hoặc tọa độ tỉ lệ. */
export interface Marker {
  /** Khóa vùng trong manifest của ảnh (do script chụp ghi lại từ DOM thật). */
  target?: string;
  /** Tọa độ tỉ lệ 0..1 khi không có vùng DOM (vd. một điểm trên canvas). */
  at?: readonly [number, number];
  label: Rich;
  /** Vẽ khung quanh vùng thay vì chỉ đặt số. */
  outline?: boolean;
}

export interface FigureBlock {
  type: 'figure';
  /** Tên ảnh trong manifest (public/guide/shots/<shot>.webp). */
  shot: string;
  caption?: Rich;
  markers?: readonly Marker[];
  /** Độ rộng hiển thị: `full` cả cột, `medium` ~75%, `small` ~50%. */
  size?: 'full' | 'medium' | 'small';
}

export interface Step {
  title?: string;
  text: Rich;
  figure?: FigureBlock;
}

export type CalloutTone = 'note' | 'tip' | 'warning' | 'important';

export type Block =
  | { type: 'p'; text: Rich }
  | { type: 'h2'; id: string; text: string }
  | { type: 'h3'; text: string }
  | { type: 'list'; items: readonly Rich[]; ordered?: boolean }
  | { type: 'steps'; items: readonly (Rich | Step)[] }
  | { type: 'callout'; tone: CalloutTone; title?: string; text: Rich | readonly Rich[] }
  | FigureBlock
  | { type: 'gallery'; items: readonly FigureBlock[] }
  | { type: 'table'; head: readonly string[]; rows: readonly (readonly Rich[])[] }
  /** Bảng phím tắt sinh từ Command Registry (luôn khớp app). */
  | { type: 'shortcuts'; groups: readonly GroupId[] }
  /** Bảng phím/thao tác viết tay (thao tác chuột, phím bổ trợ của từng công cụ). */
  | { type: 'keys'; rows: readonly (readonly [keys: Rich, action: Rich])[] }
  /** Thẻ công cụ: icon, tên, phím tắt lấy từ registry; mô tả do bài viết cung cấp. */
  | { type: 'tools'; items: readonly { tool: ToolId; text: Rich }[] }
  /** Danh sách tùy chọn: tên (đậm) — giải thích. */
  | { type: 'options'; items: readonly (readonly [name: Rich, text: Rich])[] }
  /** Lưới thẻ tính năng. */
  | {
      type: 'cards';
      items: readonly { icon: string; title: string; text: Rich; link?: string }[];
    };

export type Level = 'basic' | 'advanced' | 'tutorial';

export interface Topic {
  /** Mã bài trong URL: `#/help/<id>`. Chữ thường không dấu, gạch ngang. */
  id: string;
  title: string;
  /** Một câu: bài này giúp làm gì (hiện ở thẻ, kết quả tìm kiếm, đầu bài). */
  summary: string;
  /** Icon lucide (xem ICONS trong inline.tsx). */
  icon: string;
  level: Level;
  /** Từ khóa thêm cho tìm kiếm (từ đồng nghĩa, tên tiếng Anh). */
  keywords?: readonly string[];
  related?: readonly string[];
  blocks: readonly Block[];
}

export interface Category {
  id: string;
  title: string;
  description: string;
  icon: string;
  topics: readonly Topic[];
}
