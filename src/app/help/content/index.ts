import { buildIndex, topicText, type SearchEntry } from '../search';
import type { Category, Topic } from '../types';
import { annotateCategory } from './annotate';
import { drawCategory } from './draw';
import { filesCategory } from './files';
import { gettingStartedCategory } from './getting-started';
import { layersCategory } from './layers';
import { selectionCategory } from './selection';
import { speedCategory } from './speed';
import { supportCategory } from './support';
import { tutorialsCategory } from './tutorials';

/**
 * Mục lục hướng dẫn. Thêm bài: viết bài trong file của chủ đề rồi thêm vào `topics` của chủ đề đó;
 * thêm chủ đề: tạo file mới và thêm vào danh sách dưới. `help.test.ts` kiểm tra mã bài không trùng,
 * liên kết, ảnh minh họa và công cụ được nhắc tới đều tồn tại.
 */
export const CATEGORIES: readonly Category[] = [
  gettingStartedCategory,
  tutorialsCategory,
  drawCategory,
  annotateCategory,
  selectionCategory,
  layersCategory,
  filesCategory,
  speedCategory,
  supportCategory,
];

const TOPICS: readonly Topic[] = CATEGORIES.flatMap((c) => c.topics);

export function allTopics(): readonly Topic[] {
  return TOPICS;
}

export function findTopic(id: string): Topic | undefined {
  return TOPICS.find((topic) => topic.id === id);
}

export function categoryOf(topicId: string): Category | undefined {
  return CATEGORIES.find((c) => c.topics.some((topic) => topic.id === topicId));
}

/** Bài trước/sau theo thứ tự mục lục. */
export function neighbours(topicId: string): { previous?: Topic; next?: Topic } {
  const index = TOPICS.findIndex((topic) => topic.id === topicId);
  return { previous: TOPICS[index - 1], next: TOPICS[index + 1] };
}

const charCache = new Map<string, number>();

/** Số ký tự chữ của bài (ước lượng thời gian đọc). */
export function topicChars(topicId: string): number {
  let n = charCache.get(topicId);
  if (n === undefined) {
    const topic = findTopic(topicId);
    n = topic ? topicText(topic).length : 0;
    charCache.set(topicId, n);
  }
  return n;
}

let index: SearchEntry[] | null = null;

/** Chỉ mục tìm kiếm, dựng một lần khi tìm lần đầu. */
export function searchIndex(): SearchEntry[] {
  index ??= buildIndex(CATEGORIES);
  return index;
}

interface HomeContent {
  quickStart: readonly { topic: string; shot: string }[];
  popular: readonly { topic: string; label: string }[];
  keysTitle: string;
  keysLink: string;
  keys: readonly (readonly [shortcut: string, label: string])[];
}

/** Nội dung trang chính của hướng dẫn. */
export const HOME: HomeContent = {
  quickStart: [
    { topic: 'bat-dau-nhanh', shot: 'quick-result' },
    { topic: 'qt-chu-thich-anh-chup', shot: 'screenshot-overview' },
    { topic: 'qt-ve-tranh', shot: 'paint-overview' },
  ],
  popular: [
    { topic: 'che-thong-tin', label: 'Che thông tin' },
    { topic: 'xuat-anh', label: 'Xuất ảnh' },
    { topic: 'layer', label: 'Layer' },
    { topic: 'phim-tat', label: 'Phím tắt' },
    { topic: 'sao-luu-file-paint', label: 'Sao lưu .paint' },
  ],
  keysTitle: 'Phím tắt nên nhớ',
  keysLink: 'Xem toàn bộ phím tắt →',
  keys: [
    ['Mod+V', 'Dán ảnh chụp màn hình'],
    ['Mod+Z', 'Hoàn tác'],
    ['Mod+K', 'Tìm mọi lệnh (Command Palette)'],
    ['Mod+S', 'Lưu ngay'],
    ['Mod+Shift+S', 'Xuất ảnh'],
    ['?', 'Bảng phím tắt đầy đủ'],
    ['Space', 'Giữ để kéo khung nhìn'],
    ['[', 'Thu nhỏ cọ (] để phóng to)'],
    ['\\', 'Zen mode: ẩn giao diện'],
  ],
};
