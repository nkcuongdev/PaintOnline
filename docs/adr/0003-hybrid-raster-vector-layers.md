# 0003 — Hai loại layer: raster và vector

- **Trạng thái:** Chấp nhận (mục Tóm tắt, 5.4, 6.1–6.2)
- **Ngày:** 2026-10-17

## Bối cảnh

Paint là ứng dụng raster, nhưng chú thích screenshot cần sửa lại được sau khi vẽ (Win 11 Paint
rasterize ngay khi bỏ chọn — đó là điểm yếu cần khắc phục).

## Quyết định

- **Raster layer:** `GrowableSurface` chỉ phủ vùng có nội dung, căn bội số 256 px, cấp phát lười.
- **Vector layer:** danh sách `AnnotationObject` (rect, ellipse, line, arrow, polygon, text,
  highlight, redact, step, spotlight), có cache surface thu hồi được.
- Dùng shape/text trên layer raster → tự dùng/tạo layer vector "Chú thích N" ngay phía trên. Dùng
  tool pixel trên layer vector → hỏi rasterize hoặc tạo layer raster mới.
- Thêm loại đối tượng = một nhánh union + một `ObjectRenderer` trong `objectRegistry`.

## Hệ quả

- Chú thích sửa được mà không biến app thành công cụ vector (không bezier, boolean path).
- Export và Merge luôn dùng ảnh render cuối; Redact được nướng cứng khi export.
