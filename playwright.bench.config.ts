import { defineConfig, devices } from '@playwright/test';

const HOST = '127.0.0.1';
const PORT = 4174;

/**
 * Benchmark (mục 11.2) chạy trên bản build mode `bench` (`dist-bench`, có thêm trang
 * tests/bench/index.html). Chạy tay trên thiết bị thật; số đo trên CI chỉ để bắt hồi quy lớn.
 */
export default defineConfig({
  testDir: './tests/bench',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    // HEADED=1: chạy trình duyệt có cửa sổ để dùng GPU thật (headless có thể render bằng CPU).
    headless: !process.env.HEADED,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Như Firefox: không hạ nhịp khi cửa sổ có giao diện bị che hoặc ở nền.
        launchOptions: {
          args: [
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-background-timer-throttling',
          ],
        },
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        // FF_CANVAS_ACCEL=0/1: cố định chế độ canvas của Firefox để so sánh (mặc định: để Firefox tự chọn).
        // Cửa sổ có giao diện bị che (máy để lâu, cửa sổ khác nằm trên) bị Windows/Firefox hạ còn
        // 1–5 khung/giây (đo ở GĐ6): tắt theo dõi che khuất để số đo không phụ thuộc cửa sổ nào ở trên.
        launchOptions: {
          firefoxUserPrefs: {
            'widget.windows.window_occlusion_tracking.enabled': false,
            ...(process.env.FF_CANVAS_ACCEL
              ? { 'gfx.canvas.accelerated': process.env.FF_CANVAS_ACCEL === '1' }
              : {}),
          },
        },
      },
    },
  ],
  webServer: {
    command: `npx vite preview --outDir dist-bench --host ${HOST} --port ${String(PORT)} --strictPort`,
    url: `http://${HOST}:${String(PORT)}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
