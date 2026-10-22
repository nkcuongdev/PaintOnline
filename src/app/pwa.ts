import { getCurrentProject, hasUnsavedChanges, saveCurrentProject } from '@/app/editor/session';
import { t } from '@/i18n';
import { toast } from '@/stores/ui';

/** Keep the waiting SW and the editor intact until all work is durable. */
export async function applyPendingUpdate(
  updateSW: (reload: boolean) => Promise<void>,
): Promise<boolean> {
  const project = getCurrentProject();
  const failed = () => {
    toast('error', t.pwa.saveFailed, {
      persistent: true,
      action: {
        label: t.pwa.reload,
        run: () => {
          void applyPendingUpdate(updateSW);
        },
      },
    });
    return false;
  };
  try {
    if (project && !(project.readOnly && !hasUnsavedChanges()) && !(await saveCurrentProject())) {
      return failed();
    }
    if (getCurrentProject() !== project || hasUnsavedChanges()) {
      return failed();
    }
    await updateSW(true);
    return true;
  } catch {
    return failed();
  }
}

/**
 * PWA (mục 3.3, ADR 0011): đăng ký service worker precache app shell để mở nhanh và dùng được khi
 * mất mạng. Là lớp bổ sung — không đăng ký được (trình duyệt chặn, file://, dev) thì app vẫn chạy
 * như trang web bình thường. Có bản mới: hỏi người dùng, lưu project đang mở rồi mới tải lại.
 */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  // Tải lười module đăng ký (workbox-window) sau khi trang đã chạy: không vào JS khởi động.
  void import('virtual:pwa-register')
    .then(({ registerSW }) => {
      const updateSW = registerSW({
        onNeedRefresh() {
          toast('info', t.pwa.updateReady, {
            persistent: true,
            action: {
              label: t.pwa.reload,
              run: () => {
                // Lưu bản hiện tại (durability strict) trước khi kích hoạt bản mới và tải lại.
                void applyPendingUpdate(updateSW);
              },
            },
          });
        },
        onOfflineReady() {
          toast('success', t.pwa.offlineReady);
        },
      });
    })
    .catch(() => {
      // Không đăng ký được service worker: app vẫn dùng bình thường khi có mạng.
    });
}
