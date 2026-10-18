/**
 * Toàn màn hình (mục 7.6, 7.9): Fullscreen API cho cả tab (`<html>`), kết hợp được với Zen mode.
 * Esc do trình duyệt giữ để thoát toàn màn hình trước — lần Esc thứ hai mới tới app.
 */

export function canFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenEnabled;
}

export function isFullscreen(): boolean {
  // jsdom và trình duyệt cũ: thuộc tính có thể là undefined.
  return typeof document !== 'undefined' && Boolean(document.fullscreenElement);
}

/** Bật/tắt toàn màn hình; trình duyệt có thể từ chối (không có thao tác người dùng, bị chặn). */
export async function toggleFullscreen(): Promise<boolean> {
  try {
    if (isFullscreen()) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    return true;
  } catch {
    return false;
  }
}

/** Theo dõi trạng thái (cả khi người dùng thoát bằng Esc hoặc F11); trả hàm gỡ. */
export function watchFullscreen(listener: (fullscreen: boolean) => void): () => void {
  const onChange = () => {
    listener(isFullscreen());
  };
  document.addEventListener('fullscreenchange', onChange);
  listener(isFullscreen());
  return () => {
    document.removeEventListener('fullscreenchange', onChange);
  };
}
