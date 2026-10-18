# 0007 — MemoryBudget trung tâm, giới hạn theo tier thiết bị

- **Trạng thái:** Chấp nhận (mục Tóm tắt, 5.11, 10.4)
- **Ngày:** 2026-10-17

## Quyết định

- Mọi canvas tạo qua `engine/memory` (`createSurface`, `GrowableSurface`) và giải phóng bằng
  `release()` (đặt `width = height = 0`). ESLint chặn `new OffscreenCanvas` và
  `document.createElement('canvas')` ở nơi khác.
- Ngân sách khởi điểm: Desktop 1,5 GB / 8192²; RAM thấp, Android 768 MB / 6000²; iOS 320 MB / 4096².
  Phân bổ: layer ≤ 60%, history ≤ 25%, còn lại cho cache.
- Chuỗi thu hồi: mipmap → Below/Above cache → cache vector ẩn → nén history → bỏ bước cũ nhất.
  Không đủ → **từ chối thao tác có thông báo**; dữ liệu layer không bao giờ bị thu hồi.
- Không làm tiled rendering ở v1; chỉ làm khi benchmark GĐ4/GĐ9 chạm ngưỡng ở mục 10.4.

## Hệ quả

- Số liệu được hiệu chỉnh sau benchmark cuối GĐ1 (`docs/perf-baseline.md`).
- `deviceTier.ts` là nơi duy nhất được phép nhận diện iOS theo thông tin nền tảng.
