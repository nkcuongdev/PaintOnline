# 0014 — Phụ thuộc bổ sung ngoài mục 3.3

- **Trạng thái:** Chấp nhận
- **Ngày:** 2026-10-17 (GĐ0)

## Bối cảnh

Quy tắc 13.1.11: không thêm dependency ngoài mục 3.3 nếu chưa có ADR.

## Quyết định

| Gói                                                                                 | Lý do                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fontsource-variable/inter`                                                        | Cách tự host Inter Variable (mục 7.1): file woff2 được Vite đóng gói vào `dist/`, không gọi CDN, có subset tiếng Việt và trình duyệt chỉ tải subset cần dùng nhờ `unicode-range`. Thay cho việc chép tay file font vào `public/fonts/`. |
| `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`  | Phụ thuộc chuẩn của component shadcn/ui (mục 3.3 đã chọn shadcn/ui).                                                                                                                                                                    |
| `jsdom`                                                                             | Môi trường DOM cho Testing Library (mục 3.3) ở tầng component test.                                                                                                                                                                     |
| `@vitest/browser`, `@vitest/browser-playwright`, `playwright`                       | Vitest browser mode + Playwright (mục 3.3).                                                                                                                                                                                             |
| `globals`, `@eslint/js`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` | Cấu hình ESLint flat chuẩn cho React + TypeScript.                                                                                                                                                                                      |
| `prettier-plugin-tailwindcss`                                                       | Sắp xếp class Tailwind nhất quán.                                                                                                                                                                                                       |
| `@fontsource/patrick-hand`, `@fontsource-variable/jetbrains-mono` (GĐ2)             | "2–3 font web tự host" cho chữ chú thích (mục 5.10): một font viết tay và một font mono, đều có subset tiếng Việt; cùng cách tự host như Inter, chỉ tải subset cần dùng khi vẽ chữ.                                                     |

Gói `cn` mà shadcn CLI tự thêm (do resolve sai alias `utils`) đã được gỡ; component dùng
`@/lib/utils`.

## Hệ quả

Tất cả là phụ thuộc nhỏ, phổ biến, phục vụ trực tiếp stack đã chọn; không thêm thư viện runtime nào
ngoài lớp UI.
