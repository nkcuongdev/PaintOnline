# 0015 — Áp theme trước lần vẽ đầu bằng localStorage

- **Trạng thái:** Chấp nhận
- **Ngày:** 2026-10-17 (GĐ0)

## Bối cảnh

Mục 7.1: Light/Dark đổi bằng class `dark` trên `<html>`, mặc định theo hệ thống. Mục 6.4 đặt theme
trong store `settings` của IndexedDB — nhưng IndexedDB bất đồng bộ, đọc xong thì trang đã vẽ một lần
bằng theme sai (nháy trắng/đen). CSP `script-src 'self'` (mục 10.2) cấm script inline.

## Quyết định

- `public/theme-init.js` — script tĩnh, chạy đồng bộ trong `<head>` — đọc lựa chọn từ
  `localStorage['paint-online:theme']` (hoặc `prefers-color-scheme`), đặt class `dark`,
  `color-scheme` và favicon theo theme trước khi CSS vẽ.
- `src/app/theme.ts` đồng bộ `uiStore` ↔ DOM ↔ localStorage ↔ theme hệ thống, và giữa các tab qua
  sự kiện `storage`.
- Từ GĐ3, `settings` trong IndexedDB là bản lưu chính; localStorage chỉ là bản nhân phục vụ khởi
  động. localStorage bị chặn → theo hệ thống, không lỗi.

## Hệ quả

- Không nháy màu khi tải trang; tuân thủ CSP.
- Logic giải theme tồn tại ở hai nơi (script tĩnh và `theme.ts`); có E2E kiểm tra reload giữ theme
  và mặc định theo hệ thống trên 3 engine.
