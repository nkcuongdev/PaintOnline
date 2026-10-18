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
