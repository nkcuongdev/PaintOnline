# 0020 — Layer chú thích vẽ trực tiếp mỗi frame; layer hoạt động không đi qua history

- **Trạng thái:** Chấp nhận (GĐ4: không cần cache layer vector; ghép nhóm khi opacity < 1 hoặc blend
  khác normal — ADR 0023)
- **Ngày:** 2026-10-17 (GĐ2)
- **Liên quan:** mục 5.2, 5.3, 5.4, 10.4, 13.1.4

## Bối cảnh

Mục 5.2/5.4 mô tả cache surface cho layer vector (kích thước bbox các đối tượng, thu hồi được).
Hai vấn đề khi hiện thực:

1. **Highlight dùng `multiply`** (mục 2): nếu vẽ đối tượng vào cache trong suốt rồi ghép cache
   bằng `normal`, multiply chỉ trộn với nội dung trong cache (trong suốt) — highlight thành khối
   màu đặc che mất chữ bên dưới.
2. **Độ sắc nét**: cache ở độ phân giải document bị nội suy khi zoom > 100%, trong khi vẽ thẳng
   bằng ma trận viewport cho nét vector sắc ở mọi mức zoom.

Ngoài ra, chọn đối tượng hoặc chọn "dùng layer ảnh bên dưới" đổi `document.activeLayerId`.

## Quyết định

- Compositor vẽ **từng đối tượng trực tiếp** lên đích (màn hình, export, đọc pixel) với ma trận
  hiện tại, chỉ các đối tượng có hình bao giao vùng bẩn, cắt theo vùng cần ghép. Highlight trộn
  đúng với mọi layer bên dưới. Cache layer vector là tối ưu tùy chọn (mục 5.2: "cache không phải
  điều kiện đúng") — chỉ thêm khi số đo cần (benchmark GĐ4 cùng Below/Above cache), cùng với ghép
  cách ly (group) cho layer vector có opacity < 1 hoặc blend khác `normal` khi có panel Layers.
- `activeLayerId` là trạng thái làm việc như vùng chọn, **không** tạo bước history và không tăng
  `rev`; mọi thay đổi nội dung (thêm/xóa layer, đối tượng, pixel) vẫn đi qua Command (13.1.4).
  Tạo layer tự động (chú thích, layer vẽ mới) là `AddLayerCommand`; tạo đối tượng trên layer chú
  thích mới là một `TransactionCommand` — một bước undo.

## Hệ quả

- Kịch bản S (1 raster + 1 vector với 24 đối tượng) đo ở docs/perf-baseline.md (GĐ2).
- Rasterize vẽ đối tượng lên layer trong suốt nên highlight sau khi rasterize mất hiệu ứng
  multiply với layer dưới — hộp thoại chọn layer đích ghi rõ chú thích sẽ thành pixel.
