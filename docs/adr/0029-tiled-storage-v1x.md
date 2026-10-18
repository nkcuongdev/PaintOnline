# 0029 — Tiled layer storage: đo lại ở GĐ9, đề xuất cho v1.x

- **Trạng thái:** Đề xuất — chờ chủ dự án quyết định
- **Ngày:** 2026-10-18 (GĐ8+9 gộp)
- **Liên quan:** mục 5.11, 10.4; ADR 0024 (GĐ4: chưa làm tiled storage, đo lại ở GĐ9), ADR 0028

## Bối cảnh

ADR 0024 giữ layer raster là một surface liền khối (`GrowableSurface`, nới theo hình bao nội dung,
lưới 256 px) và hẹn GĐ9 đo phần lãng phí khi nội dung rải thưa trên ảnh lớn: byte của surface so với
byte của các tile 512 px thực sự có nội dung.

## Số đo (GĐ9, ảnh L 6000 × 4000, một layer, cọ 12 px — Chromium GPU, bản dev)

| Nội dung                      | Surface liền khối | Tile 512 px có nội dung | Tỉ lệ |
| ----------------------------- | ----------------- | ----------------------- | ----- |
| Chú thích tập trung một vùng  | 3,0 MB            | 4,0 MB                  | 0,8×  |
| Một nét chéo qua cả ảnh       | 91,6 MB           | 20,0 MB                 | 4,6×  |
| 8 nét ngắn rải khắp ảnh       | 89,8 MB           | 14,0 MB                 | 6,4×  |
| 2 nét ngắn ở hai góc đối diện | 80,5 MB           | 3,0 MB                  | 26,8× |

Kịch bản benchmark L (10 layer: 5 phủ kín, 5 phủ 1/3 × 1/3) dùng 1,0–1,2 GB trong ngân sách 1,5 GB.
Vẽ, pan, undo trên L đều đạt ngưỡng (frame p95 16,8 ms Chromium, 16,7–24 ms Firefox).

## Nhận định

- Nội dung tập trung (chú thích screenshot, vẽ một vùng): surface liền khối **không** lãng phí, có
  khi nhỏ hơn tile.
- Nội dung rải thưa trên ảnh lớn: lãng phí tới hàng chục lần cho layer đó, nhưng **trần** là một layer
  phủ kín — đúng trường hợp ngân sách bộ nhớ đã tính (từ chối có thông báo, gợi ý gộp layer, không mất
  dữ liệu).
- Tiled storage đổi lõi engine: layer, history theo tile, cache, mipmap, lưu/mở, Worker. Đây là thay
  đổi kiến trúc lớn, không thuộc phạm vi v1.0.

## Đề xuất

1. **v1.0 giữ surface liền khối** (như ADR 0024). Ghi giới hạn: nhiều layer có nét rải thưa trên ảnh
   ≥ 24 MP có thể chạm ngân sách sớm hơn số pixel thật sự vẽ.
2. **v1.x — tiled storage nếu chủ dự án thường làm ảnh lớn nhiều layer thưa**: tile 512 px cấp phát
   lười, dùng lại cơ chế tile của history (ADR 0016) và `GrowableSurface` làm ranh giới (đường lui đã
   giữ sẵn theo mục 10.4). Ước lượng 1–2 tuần, cần ADR riêng.

Chủ dự án chọn: giữ như v1.0, hay xếp tiled storage vào v1.x.
