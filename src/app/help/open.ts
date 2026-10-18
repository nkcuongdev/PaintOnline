import { navigate, readRoute } from '@/app/router';

/**
 * Mở hướng dẫn (bài `topic`, hoặc trang chính). Đang ở editor thì mở tab mới để không rời project
 * đang làm; ở màn hình khác thì chuyển trang trong tab hiện tại.
 */
export function openHelp(topic: string | null = null): void {
  if (readRoute().name === 'project') {
    const hash = topic ? `#/help/${topic}` : '#/help';
    window.open(`${window.location.pathname}${hash}`, '_blank', 'noopener');
    return;
  }
  navigate({ name: 'help', topic, section: null });
}
