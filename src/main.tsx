import '@fontsource-variable/inter';
// Font chú thích tự host (mục 5.10): chỉ tải file của subset cần dùng (unicode-range) khi vẽ chữ.
import '@fontsource/patrick-hand/400.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './styles/globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { installSessionLifecycle } from '@/app/editor/session';
import { initStorage } from '@/app/storage';
import { startThemeSync } from '@/app/theme';
import { installBrowserGuards } from '@/services/platform/browserGuards';

// Service worker (PWA) được đăng ký ở đây từ GĐ8 — lớp bổ sung, không bắt buộc.

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
