import { useUiStore } from '@/stores/ui';

/**
 * Vùng aria-live thông báo thay đổi tool, zoom, layer, theme cho trình đọc màn hình (mục 7.8).
 * Gọi `useUiStore.getState().announce(message)` từ bất kỳ đâu trong UI.
 */
export function LiveRegion() {
  const announcement = useUiStore((state) => state.announcement);
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {/* key đổi theo id để trình đọc màn hình đọc lại cả câu trùng nội dung */}
      {announcement && <span key={announcement.id}>{announcement.message}</span>}
    </div>
  );
}
