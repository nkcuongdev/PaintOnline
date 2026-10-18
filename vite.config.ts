import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
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
