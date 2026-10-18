import { defineConfig, devices } from '@playwright/test';

const HOST = '127.0.0.1';
const PORT = 5190;

/**
 * Chụp ảnh minh họa cho trung tâm hướng dẫn (`npm run guide:shots`): chạy dev server, thao tác trên
 * app thật bằng Playwright, ghi ảnh WebP vào public/guide/shots và vùng các nút vào
 * src/app/help/shots.json. Chỉ Chromium (encode WebP), giao diện sáng, 1440×900 @1.5x.
 */
export default defineConfig({
  testDir: './tests/guide',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 600_000,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://${HOST}:${PORT}`,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    colorScheme: 'light',
    serviceWorkers: 'block',
    permissions: ['clipboard-read', 'clipboard-write'],
    actionTimeout: 20_000,
  },
  webServer: {
    command: `npx vite --host ${HOST} --port ${PORT} --strictPort`,
    url: `http://${HOST}:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
