# 0024 — Tiled layer storage sau benchmark GĐ4

- **Trạng thái:** Chấp nhận — phương án 1, chủ dự án chọn ngày 2026-10-17
- **Ngày:** 2026-10-17 (GĐ4)
- **Liên quan:** mục 5.11, 10.4; ADR 0007

## Bối cảnh

Mục 10.4: không làm tiled layer storage, "chỉ làm khi (a) kịch bản XL với ≥ 5 layer vượt ngân sách
desktop, hoặc (b) p95 > 50 ms trên kịch bản L do composite; khi đó viết ADR".

Đo ở GĐ4 (docs/perf-baseline.md):

- **(b) không xảy ra:** L × 5 và L × 20 có frame p95 khi vẽ 16,7–22,7 ms trên Chromium và Firefox
  (GPU thật và headless).
- **(a) đúng về số học khi layer phủ kín:** layer 8192 × 8192 = 256 MB; phần dành cho layer (60% của
  1,5 GB) = 921,6 MB → tối đa 3 layer phủ kín — đúng bằng kịch bản XL của plan (3 layer). Layer phủ
  kín thứ 4 bị từ chối có thông báo "gộp hoặc làm phẳng" (chuỗi thu hồi chạy trước, không mất layer).

Tile thưa chỉ tiết kiệm bộ nhớ cho layer có nội dung rải rác (GrowableSurface cấp phát hình bao căn
256 px nên hai nét ở hai góc ảnh tốn cả ảnh); với layer phủ kín, tổng tile bằng đúng surface hiện
tại. Như vậy điều kiện (a) bị kích hoạt bởi đúng trường hợp mà tile **không** giải quyết được.

## Phương án

1. **Không làm tiled storage ở GĐ4.** Giữ GrowableSurface; ghi nhận XL tối đa 3 layer phủ
   kín trên desktop 1,5 GB (đúng kịch bản XL của plan). Ở GĐ9 đo thêm mức lãng phí của hình bao với
   nội dung rải rác (ví dụ chú thích pixel ở các góc ảnh XL); nếu đáng kể thì làm tile ở v1.x. Đường
   lui đã sẵn: GrowableSurface chỉ lộ `ensure/region/read/write`, history đã theo tile.
2. **Làm tiled storage ngay (512 px thưa).** Đổi phần trong của GrowableSurface, Compositor vẽ từng
   tile, autosave/.paint ghép tile thành PNG; ước tính ~1 tuần. Chỉ giảm bộ nhớ cho layer rải rác;
   XL với 5 layer phủ kín vẫn vượt ngân sách.
3. **Tăng phần dành cho layer** (ví dụ 70%) cho tier desktop để XL chứa được 4 layer phủ kín —
   giảm chỗ cho history/cache; cần đo lại áp lực bộ nhớ.

## Quyết định

Chọn **phương án 1**. Không làm tiled layer storage ở GĐ4; giữ GrowableSurface (surface liền khối,
cấp phát lười theo hình bao căn 256 px) như mục 5.11. Giữ nguyên phần 60% cho layer.

## Hệ quả

- Desktop 1,5 GB chứa tối đa 3 layer XL phủ kín (đúng kịch bản XL của plan); layer phủ kín thứ 4 bị
  từ chối có thông báo gợi ý gộp hoặc làm phẳng — không mất layer, không crash tab.
- **GĐ9:** đo thêm mức lãng phí của hình bao với nội dung rải rác (ví dụ nét/chú thích pixel ở các
  góc ảnh XL và L: bộ nhớ GrowableSurface so với tổng tile 512 px thật sự có nội dung). Nếu lãng phí
  đáng kể so với ngân sách thì đề xuất làm tile ở v1.x kèm ADR mới.
- Đường lui giữ nguyên: GrowableSurface chỉ lộ `ensure/region/read/write`, history đã làm việc theo
  tile, nên đổi sang tile thưa không phải sửa tool.
