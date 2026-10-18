import '@fontsource-variable/inter';
// Font chú thích tự host (mục 5.10): chỉ tải file của subset cần dùng (unicode-range) khi vẽ chữ.
import '@fontsource/patrick-hand/400.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './styles/globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { registerServiceWorker } from '@/app/pwa';
import { installSessionLifecycle } from '@/app/editor/session';
import { initStorage } from '@/app/storage';
import { startThemeSync } from '@/app/theme';
import { installErrorCapture } from '@/services/diagnostics/errorLog';
import { installBrowserGuards } from '@/services/platform/browserGuards';

// Nhật ký lỗi cục bộ (mục 10.3): bắt lỗi chưa xử lý ngay từ đầu.
installErrorCapture();
startThemeSync();
installBrowserGuards();
// IndexedDB: mở kết nối, đọc cài đặt và phiên trước (khôi phục), dọn thùng rác quá hạn (mục 6.6).
void initStorage();
installSessionLifecycle();

// Công cụ dev (input recorder…) — bị loại khỏi bản production.
if (import.meta.env.DEV) {
  void import('@/app/dev/devtools').then(({ installDevtools }) => {
    installDevtools();
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Không tìm thấy phần tử #root');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker (PWA — ADR 0011): lớp bổ sung, đăng ký sau khi trang tải xong.
if (document.readyState === 'complete') registerServiceWorker();
else window.addEventListener('load', registerServiceWorker, { once: true });
