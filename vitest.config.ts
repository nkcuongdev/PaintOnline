import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

/**
 * Ba tầng test (mục 11.1):
 * - unit:    logic thuần chạy trong Node (`*.test.ts`)
 * - dom:     component React với Testing Library trên jsdom (`*.test.tsx`)
 * - browser: test cần canvas thật, chạy bằng Vitest browser mode trên
 *            Chromium/Firefox/WebKit (`*.browser.test.ts`)
 *
 * Biến môi trường VITEST_BROWSERS (vd. "chromium") giới hạn engine khi chạy local.
 */
const browserNames = (process.env.VITEST_BROWSERS ?? 'chromium,firefox,webkit')
  .split(',')
  .map((name) => name.trim())
  .filter((name): name is 'chromium' | 'firefox' | 'webkit' =>
    ['chromium', 'firefox', 'webkit'].includes(name),
  );

export default mergeConfig(
  viteConfig({ mode: 'test', command: 'serve' }),
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            environment: 'node',
            include: ['src/**/*.test.ts'],
            exclude: ['src/**/*.browser.test.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'dom',
            environment: 'jsdom',
            include: ['src/**/*.test.tsx'],
            setupFiles: ['./tests/setup/dom.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'browser',
            include: ['src/**/*.browser.test.ts'],
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              instances: browserNames.map((browser) => ({ browser })),
            },
          },
        },
      ],
    },
  }),
);
