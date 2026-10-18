import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Cú pháp bị cấm trên toàn bộ src/ (mục 10.2 và quy tắc 13.1).
 * Lưu ý: khai báo `no-restricted-syntax` ở block sau sẽ THAY THẾ (không gộp)
 * block trước, nên các block ngoại lệ phải tự ghép lại từ các mảng này.
 */
const NO_HTML_INJECTION = [
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: 'Không render HTML từ dữ liệu (mục 10.2). Dùng text thuần qua React.',
  },
  {
    selector: 'MemberExpression[property.name=/^(innerHTML|outerHTML)$/]',
    message: 'Không ghi innerHTML/outerHTML (mục 10.2).',
  },
];

const NO_RAW_CANVAS = [
  {
    selector: "NewExpression[callee.name='OffscreenCanvas']",
    message:
      'Mọi canvas phải tạo qua engine/memory (createSurface) để MemoryBudget theo dõi (quy tắc 13.1.5).',
  },
  {
    selector: "CallExpression[callee.property.name='createElement'][arguments.0.value='canvas']",
    message:
      'Mọi canvas phải tạo qua engine/memory (createSurface) để MemoryBudget theo dõi (quy tắc 13.1.5).',
  },
];

/** engine/ là TypeScript thuần: không React, không Zustand, không chạm lớp trên (mục 4, 8). */
const ENGINE_BOUNDARY_MESSAGE =
  'engine/ không được import React, Zustand, app/, stores/, services/ hay components/ — phụ thuộc đi vào qua EditorDeps (quy tắc 13.1.3).';

export default defineConfig([
  globalIgnores([
    'dist-bench',
    '.vitest',
    'dist',
    'coverage',
    'playwright-report',
    'test-results',
    'node_modules',
    'public',
    'dev-dist',
  ]),

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      'no-restricted-syntax': ['error', ...NO_HTML_INJECTION, ...NO_RAW_CANVAS],
    },
  },

  // React chỉ dùng cho UI shell.
  {
    files: ['src/**/*.tsx'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
  },

  // Ranh giới module của Canvas Engine.
  {
    files: ['src/engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*', 'zustand', 'zustand/*'],
              message: ENGINE_BOUNDARY_MESSAGE,
            },
            {
              group: [
                '@/app',
                '@/app/**',
                '@/stores',
                '@/stores/**',
                '@/services',
                '@/services/**',
                '@/components',
                '@/components/**',
                '**/app/**',
                '**/stores/**',
                '**/services/**',
                '**/components/**',
              ],
              message: ENGINE_BOUNDARY_MESSAGE,
            },
          ],
        },
      ],
    },
  },

  // Test của engine được dùng hiện thực WorkerClient chạy trực tiếp trên main thread
  // (cùng hàm thuần với Worker) — code engine thật vẫn chỉ thấy interface qua EditorDeps.
  {
    files: ['src/engine/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*', 'zustand', 'zustand/*'],
              message: ENGINE_BOUNDARY_MESSAGE,
            },
            {
              group: [
                '@/app',
                '@/app/**',
                '@/stores',
                '@/stores/**',
                '@/components',
                '@/components/**',
              ],
              message: ENGINE_BOUNDARY_MESSAGE,
            },
          ],
        },
      ],
    },
  },

  // Nơi duy nhất được tạo canvas: engine/memory; Worker chạy ở luồng riêng
  // (không có MemoryBudget) nên được tạo OffscreenCanvas cục bộ.
  {
    files: ['src/engine/memory/**/*.ts', 'src/services/workers/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...NO_HTML_INJECTION],
    },
  },

  // Component do shadcn sinh ra export kèm biến thể (cva) cạnh component.
  {
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  // Test và file cấu hình.
  {
    files: ['**/*.test.{ts,tsx}', 'tests/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...NO_HTML_INJECTION],
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Test cố ý xử lý khác biệt trình duyệt mà kiểu DOM không mô tả (vd. WebKit trả null).
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
  {
    files: ['*.config.{ts,js}', 'tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
]);
