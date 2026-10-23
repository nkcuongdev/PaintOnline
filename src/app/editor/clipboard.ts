import type { Rect } from '@/engine/core/types';
import { format, t } from '@/i18n';
import { copyImage, imageFileFrom } from '@/services/io/clipboard';
import { safeFileName } from '@/services/io/download';
import { decodeImage, ImportError } from '@/services/io/importImage';
import { detectMemoryConfig } from '@/services/platform/deviceTier';
import { toast } from '@/stores/ui';
import { codec } from '@/app/storage';
import { notifyNoImageInClipboard, paletteOf } from './actions';
import { setProjectPalette, type OpenProject } from './session';

/**
 * Clipboard của vùng chọn (mục 5.7): copy lưu nội bộ (ImageBitmap + vị trí) và đồng thời ghi PNG
 * vào clipboard hệ thống; paste ưu tiên dữ liệu nội bộ nếu cùng phiên, giữ đúng vị trí (ADR 0025).
 *
 * Trình duyệt không cho biết clipboard hệ thống có bị ứng dụng khác ghi đè không. Dữ liệu nội bộ
 * được coi là còn mới nếu cửa sổ chưa mất focus kể từ lúc copy (không thể copy ở nơi khác mà không
 * rời cửa sổ). Sau khi rời cửa sổ, luôn dùng nội dung ảnh do hệ thống cung cấp.
 */

interface InternalClip {
  bitmap: ImageBitmap;
  rect: Rect;
  copiedAt: number;
}

let internal: InternalClip | null = null;
let lastBlur = -Infinity;

/** Theo dõi cửa sổ mất focus (người dùng có thể đã copy ở ứng dụng khác). Trả hàm gỡ. */
export function trackClipboardFreshness(): () => void {
  const onBlur = () => {
    lastBlur = performance.now();
  };
  window.addEventListener('blur', onBlur);
  return () => {
    window.removeEventListener('blur', onBlur);
  };
}

function remember(bitmap: Promise<ImageBitmap>, rect: Rect): void {
  const copiedAt = performance.now();
  void bitmap.then(
    (b) => {
      internal?.bitmap.close();
      internal = { bitmap: b, rect: { ...rect }, copiedAt };
    },
    () => undefined,
  );
}

/** Có ảnh trong clipboard nội bộ (menu Dán dùng được kể cả khi không đọc được clipboard hệ thống). */
export function hasInternalClip(): boolean {
  return internal !== null;
}

/** Bỏ clipboard nội bộ (test). */
export function clearInternalClip(): void {
  internal?.bitmap.close();
  internal = null;
  lastBlur = -Infinity;
}

/**
 * Copy (hoặc cắt) vùng chọn. PHẢI gọi đồng bộ trong handler của thao tác người dùng (sự kiện
 * `copy`/`cut`, click menu) — Safari yêu cầu ClipboardItem tạo ngay trong gesture.
 */
export function copySelection(project: OpenProject, mode: 'copy' | 'cut' | 'merged'): boolean {
  const { editor } = project;
  const capture =
    mode === 'cut' ? editor.selection.cut() : editor.selection.copy(mode === 'merged');
  if (!capture) return false;
  remember(capture.bitmap, capture.rect);
  copyImage(capture.png, safeFileName(project.name, 'png')).then(
    (result) => {
      if (result === 'downloaded') toast('info', t.actions.copyDownloaded);
      else toast('success', mode === 'cut' ? t.actions.cutSelection : t.actions.copiedSelection);
    },
    () => {
      toast('error', t.actions.exportFailed);
    },
  );
  return true;
}

async function decode(blob: Blob) {
  const memory = detectMemoryConfig();
  return decodeImage(
    blob,
    { maxSide: memory.maxDocumentSide, maxPixels: memory.maxDocumentPixels },
    codec(),
  );
}

function pasteInternal(project: OpenProject, clip: InternalClip): boolean {
  return project.editor.selection.paste(clip.bitmap, { x: clip.rect.x, y: clip.rect.y });
}

/** Dán ảnh (Blob) thành pixel nổi — layer mới khi commit (mục 2, 7.4). */
async function pasteBlob(project: OpenProject, blob: Blob): Promise<boolean> {
  let decoded;
  try {
    decoded = await decode(blob);
  } catch (error) {
    toast(
      'error',
      error instanceof ImportError ? t.importErrors[error.code] : t.actions.pasteFailed,
    );
    return false;
  }
  try {
    if (decoded.scaled) {
      toast(
        'info',
        format(t.importErrors.scaled, { width: decoded.width, height: decoded.height }),
      );
    }
    // Ảnh mới vào project: cập nhật bảng màu project (mục 7.6) — trích trước khi bitmap bị đóng.
    const palette = paletteOf(decoded.bitmap);
    const pasted = project.editor.selection.paste(decoded.bitmap, null);
    if (pasted) void palette.then(setProjectPalette);
    return pasted;
  } finally {
    decoded.bitmap.close();
  }
}

/** Sự kiện `paste` (Ctrl+V) trong editor. */
export async function pasteFromEvent(
  project: OpenProject,
  data: DataTransfer | null,
): Promise<boolean> {
  const file = imageFileFrom(data);
  const clip = internal;
  const fresh = clip !== null && clip.copiedAt > lastBlur;
  if (clip && fresh) return pasteInternal(project, clip);
  if (!file) {
    notifyNoImageInClipboard();
    return false;
  }
  return pasteBlob(project, file);
}

/** "Dán" từ menu: clipboard nội bộ còn mới, hoặc đọc clipboard hệ thống bằng Clipboard API. */
export async function pasteFromMenu(project: OpenProject): Promise<boolean> {
  const clip = internal;
  if (clip && clip.copiedAt > lastBlur) return pasteInternal(project, clip);
  try {
    if (typeof navigator.clipboard.read === 'function') {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((mime) => mime.startsWith('image/'));
        if (type) return await pasteBlob(project, await item.getType(type));
      }
    }
  } catch {
    // Không có quyền đọc clipboard: dùng bản nội bộ nếu có.
  }
  if (clip) {
    toast('info', t.actions.pasteInternalFallback);
    return pasteInternal(project, clip);
  }
  notifyNoImageInClipboard();
  return false;
}

/** Thả file ảnh vào editor: layer mới đặt giữa khung nhìn, đang nổi để di chuyển ngay (mục 7.4). */
export function dropImage(project: OpenProject, file: Blob): Promise<boolean> {
  return pasteBlob(project, file);
}
