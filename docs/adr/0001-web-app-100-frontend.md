# 0001 — Web app 100% frontend, dùng cá nhân, desktop trước

- **Trạng thái:** Chấp nhận (Implementation Plan, mục Tóm tắt, 1, 3.4)
- **Ngày:** 2026-10-17

## Bối cảnh

Paint Online là công cụ cá nhân "mở tab là dùng" để vẽ nhanh, chỉnh ảnh và chú thích ảnh chụp màn
hình. Không có người dùng nào khác cần quản lý và không có mục tiêu thương mại.

## Quyết định

- Ứng dụng là **trang web tĩnh**, chạy hoàn toàn trong trình duyệt. Không backend, không database
  server, không Electron/Tauri hay bản desktop native.
- **Không** tài khoản, thanh toán, analytics, feature flag, error-tracking SaaS hay quản trị người dùng.
- Trình duyệt desktop (chuột, trackpad, bàn phím) là trải nghiệm chính và là chuẩn nghiệm thu;
  tablet và điện thoại được hỗ trợ responsive.
- Hosting tĩnh miễn phí: Cloudflare Pages (đề xuất, đặt được CSP qua `_headers`) hoặc Netlify.

## Hệ quả

- Không có chi phí vận hành; mọi công sức dồn vào chất lượng vẽ và chỉnh ảnh.
- Dữ liệu chỉ nằm trên một trình duyệt/thiết bị → cần `.paint` để sao lưu (ADR 0010) và
  `navigator.storage.persist()` (ADR 0009).
- Lỗi chỉ được ghi cục bộ (nhật ký lỗi trong Cài đặt, GĐ9).
