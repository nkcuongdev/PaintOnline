import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Lấy CSP từ public/_headers (nguồn duy nhất) để `vite preview` phục vụ với cùng chính sách
 * như bản deploy — E2E nhờ vậy phát hiện sớm vi phạm CSP. Không áp dụng cho dev server
 * vì HMR của Vite cần script/inline style riêng.
 */
function readDeployHeaders(): Record<string, string> {
  const file = readFileSync(new URL('./public/_headers', import.meta.url), 'utf8');
  const headers: Record<string, string> = {};
  let inRootBlock = false;
  for (const line of file.split(/\r?\n/)) {
    if (line.startsWith('#') || line.trim() === '') continue;
    if (!line.startsWith(' ')) {
      inRootBlock = line.trim() === '/*';
      continue;
    }
    if (!inRootBlock) continue;
    const separator = line.indexOf(':');
    if (separator > 0) headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return headers;
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * PWA là lớp bổ sung (mục 3.3, ADR 0011): service worker precache toàn bộ app shell (JS, CSS, font,
 * WASM) để mở nhanh và dùng đầy đủ khi mất mạng; không tính năng nào phụ thuộc việc cài đặt. Bản mới
 * chờ người dùng đồng ý (toast "Có bản mới") rồi mới kích hoạt — không reload giữa lúc đang vẽ.
 */
function pwa(mode: string) {
  return VitePWA({
    disable: mode === 'bench',
    registerType: 'prompt',
    // Đăng ký thủ công, tải lười sau khi app chạy (src/app/pwa.ts) — không thêm vào JS khởi động.
    injectRegister: false,
    manifest: {
      name: 'Paint Online',
      short_name: 'Paint Online',
      description: 'Vẽ, chỉnh ảnh và chú thích ảnh chụp màn hình ngay trong trình duyệt.',
      lang: 'vi',
      dir: 'ltr',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#f7f7f9',
      theme_color: '#3b5bdb',
      categories: ['graphics', 'productivity', 'utilities'],
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        {
          src: '/icons/icon-maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,woff,woff2,wasm,svg,png,webmanifest}'],
      // Encoder WebP (WASM) và chunk engine lớn hơn 2 MB mặc định của Workbox.
      maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      // Hash route (#/project/<id>): mọi điều hướng trả về index.html đã precache.
      navigateFallback: '/index.html',
      cleanupOutdatedCaches: true,
      // Không phát ra file source map của chính service worker.
      sourcemap: false,
    },
  });
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), pwa(mode)],
  define: {
    // Ghi vào manifest.json của file .paint (mục 6.5).
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Encoder WebP (WASM) tự tìm file .wasm bằng new URL(..., import.meta.url): không pre-bundle.
  optimizeDeps: {
    exclude: ['@jsquash/webp'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Không nhúng font dạng data: URI (subset font nhỏ < 4 KB): CSP chỉ cho `font-src 'self'`.
    assetsInlineLimit: (file: string) => (/.woff2?$/.test(file) ? false : undefined),
    // Mode `bench`: thêm trang benchmark (tests/bench) vào một bản build riêng, không vào bản deploy.
    ...(mode === 'bench'
      ? {
          outDir: 'dist-bench',
          rollupOptions: {
            input: {
              main: fileURLToPath(new URL('./index.html', import.meta.url)),
              bench: fileURLToPath(new URL('./tests/bench/index.html', import.meta.url)),
            },
          },
        }
      : {}),
  },
  preview: {
    headers: readDeployHeaders(),
  },
}));
