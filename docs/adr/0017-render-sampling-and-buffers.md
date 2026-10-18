# 0017 — Lấy mẫu `low`, vẽ vùng con và stroke buffer dùng chung

- **Trạng thái:** Chấp nhận
- **Ngày:** 2026-10-17 (GĐ1)
- **Liên quan:** mục 5.1, 5.2, 5.5, 10.4

## Bối cảnh

Benchmark GĐ1 (Chromium có GPU, ảnh 4K × 5 layer) đo frame khi vẽ p95 966 ms. Micro-benchmark độc
lập cho thấy Chromium ghép 6 canvas 4K mỗi frame vẫn 16,7 ms với `imageSmoothingQuality = 'low'`,
nhưng > 250 ms/frame với `'medium'`/`'high'` (dựng mipmap cho cả texture nguồn mỗi lần vẽ).

## Quyết định

- Renderer màn hình luôn dùng `imageSmoothingQuality = 'low'` (song tuyến); tắt làm mịn từ 400%
  như mục 5.1. Thu nhỏ đẹp ở zoom thấp dùng **mipmap ½, ¼ do Engine tự quản** (mục 5.2, GĐ4) —
  không dựa vào mipmap của trình duyệt. Export vẫn dùng `'high'` (một lần, không theo frame).
- Compositor chỉ vẽ **phần nguồn ứng với vùng cần vẽ** (nới 2 px chống đường nối khi nội suy),
  kể cả đường ghép stroke preview.
- Stroke buffer là **một GrowableSurface dùng chung** giữa các nét: xóa vùng đã vẽ sau mỗi nét thay
  vì giải phóng; nở có biên dự phòng 384 px. Giải phóng khi đổi document, tab ẩn hoặc dispose.
- `desynchronized` cho display canvas giữ bật trên Chromium (mặc định của mục 10.4) — benchmark tự
  động không đo được độ trễ hiển thị thật/xé hình; kiểm tra bằng mắt ở mốc Alpha.

## Hệ quả

- Frame p95 khi vẽ 4K × 5 layer: 966 → 16,9 ms (Chromium GPU); pan p95 399 → 34 ms.
- Ở zoom < 50% với ảnh rất lớn, chất lượng thu nhỏ là song tuyến cho tới khi có mipmap (GĐ4).
- Stroke buffer chiếm bộ nhớ tạm tới hết phiên làm việc với document (tối đa bằng document), được
  tính vào MemoryBudget và trả lại khi tab ẩn.
