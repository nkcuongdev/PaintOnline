# 0011 — PWA và offline là lớp bổ sung

- **Trạng thái:** Chấp nhận (mục Tóm tắt, 1, 9 GĐ8)
- **Ngày:** 2026-10-17

## Quyết định

- `vite-plugin-pwa` precache app shell (GĐ8). Cài đặt PWA là tùy chọn; không tính năng nào phụ
  thuộc việc cài.
- Không tự kích hoạt bản mới khi đang vẽ: hiện toast "Có bản mới" → lưu → reload khi người dùng
  đồng ý.

## Hệ quả

- Mở nhanh và dùng được khi mất mạng; không cài thì app vẫn là trang web bình thường.
- Hiện thực ở GĐ8+9 (ADR 0028): `generateSW` precache mọi file của bản build, `registerType: 'prompt'`,
  toast "Lưu và tải lại" lưu project đang mở rồi mới kích hoạt bản mới; tắt trong bản dev và bench.
  E2E "tắt mạng rồi reload" chạy trên Chromium và Firefox (Playwright WebKit không có service worker
  trên Windows/Linux — Safari kiểm tay).
