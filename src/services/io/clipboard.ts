import { canWriteImageToClipboard } from '@/services/platform/features';
import { downloadBlob } from './download';

/**
 * Clipboard (mục 5.7, 10.1): dán ảnh dựa trên sự kiện `paste`; copy dùng ClipboardItem với
 * Promise<Blob> (Safari yêu cầu tạo ClipboardItem đồng bộ trong thao tác người dùng). Không ghi
 * được thì tự tải file PNG và báo cho người dùng.
 */

/** Tên file project .paint (mục 6.5). */
export function isPaintFileName(name: string): boolean {
  return /\.paint$/i.test(name);
}

/** File đầu tiên được thả: ảnh hoặc file project .paint (mục 7.3). */
export function droppedFile(data: DataTransfer | null): File | null {
  if (!data) return null;
  const files = Array.from(data.files);
  return files.find((f) => isPaintFileName(f.name)) ?? imageFileFrom(data);
}

/** File ảnh đầu tiên trong dữ liệu dán/thả. */
export function imageFileFrom(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  // Một số trình duyệt chỉ điền `files` (kéo thả từ trình quản lý file).
  for (const file of Array.from(data.files)) {
    if (file.type.startsWith('image/') || file.type === '') return file;
  }
  return null;
}

export type CopyResult = 'copied' | 'downloaded';

/**
 * Ghi ảnh PNG vào clipboard hệ thống. PHẢI gọi đồng bộ trong handler của thao tác người dùng
 * (click, sự kiện `copy`) — truyền Promise để ClipboardItem được tạo ngay.
 */
export async function copyImage(png: Promise<Blob>, fallbackName: string): Promise<CopyResult> {
  if (canWriteImageToClipboard()) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      return 'copied';
    } catch {
      // Bị từ chối quyền hoặc trình duyệt không hỗ trợ ghi ảnh: rơi xuống tải file.
    }
  }
  downloadBlob(await png, fallbackName);
  return 'downloaded';
}
