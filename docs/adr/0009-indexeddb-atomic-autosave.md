# 0009 — IndexedDB, autosave theo revision, ghi nguyên tử

- **Trạng thái:** Chấp nhận (mục Tóm tắt, 6.4, 6.6)
- **Ngày:** 2026-10-17

## Quyết định

- Database `paint-online` qua `idb`; metadata, document JSON và pixel (Blob PNG) tách riêng.
- Autosave: debounce 1,5 s, tối đa 10 s, ngay khi tab ẩn/`pagehide`, khi chuyển project, Ctrl+S.
- Một lượt lưu = chụp (main thread) → mã hóa (Worker) → **một transaction** trên `projects`,
  `documents`, `layerBlobs`, `thumbnails`. Single-flight theo project; rev tăng dần, từ chối ghi
  revision cũ hơn; Web Locks đảm bảo một tab ghi.
- Checkpoint một revision cũ; 5 trạng thái lưu hiển thị; xử lý QuotaExceeded, lỗi tạm thời, kết nối
  bị đóng.

## Hệ quả

- Bản lưu luôn là một revision hợp lệ; trong điều kiện bình thường chỉ mất tối đa vài giây thao tác.
- Những gì ngoài tầm kiểm soát (trình duyệt xóa storage, mất điện) được nêu rõ trong mục 6.6.
- Chi tiết hiện thực ở GĐ3 (PNG RGBA tự mã hóa để lưu đúng từng pixel, ảnh lưu dạng ArrayBuffer, cờ
  thoát sạch trong localStorage): [ADR 0021](./0021-storage-implementation.md).
