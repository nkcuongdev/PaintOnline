# 0016 — Tile history lưu trên GPU (TileStore), không đọc pixel về CPU

- **Trạng thái:** Chấp nhận
- **Ngày:** 2026-10-17 (GĐ1)
- **Liên quan:** mục 5.2, 5.6, 5.11, 10.1 · ADR 0005

## Bối cảnh

Mục 5.6 chốt Undo/Redo bằng Command + diff tile 256×256, kỹ thuật hoán đổi, nằm trong ngân sách bộ
nhớ chung — không đổi. Mục 5.2 gợi ý đọc tile qua scratch `willReadFrequently` thành `ImageData`.
Benchmark GĐ1 trên máy cấu hình D2 cho thấy cách đọc pixel về CPU không đạt ngưỡng bắt buộc:

- Chromium có GPU: undo một nét 4K mất 1310 ms (đọc qua scratch buộc đọc ngược cả texture).
- Firefox: mỗi `getImageData` một tile tốn 13–83 ms; một nét lớn chạm ~150 tile ⇒ ~3,3 s.
- Canvas phần mềm (headless): xen kẽ đọc/ghi cùng layer làm undo 4K mất 3,9 s.

## Quyết định

- Tile history nằm trong **TileStore**: một canvas "atlas" (8 ô 256×256 mỗi hàng, nở ×1,5 khi đầy)
  thuộc hạng mục `history` của MemoryBudget. Chép tile layer ↔ atlas bằng `drawImage` ở tọa độ
  nguyên, không co giãn, `imageSmoothingEnabled = false`, đích được xóa trước — sao chép nguyên giá
  trị premultiplied nên **chính xác từng pixel** (test 100 nét + 50 vòng undo/redo trên 3 engine).
- Vùng layer chưa có surface được ghi nhận là "trong suốt" mà không tốn ô (layer mới rất phổ biến).
- **Chụp dần** bản trước: lần đầu nét chạm một tile, tile được chép vào kho ngay (TileCapture);
  commit lúc nhả chuột chỉ còn ghép stroke buffer.
- **Hoán đổi 2 pha**: chép mọi tile hiện tại sang kho mới (layer chưa đổi) → ghi tile đang giữ vào
  layer → thay kho. Không xen đọc/ghi trên cùng canvas.
- History không tự đặt mức dùng nữa: dữ liệu của command tự giữ chỗ trong hạng mục `history`;
  `History.makeRoom(bytes)` bỏ bước cũ nhất (giữ ≥ 10) trước khi một thao tác cấp phát thêm;
  `History.trim` dựa trên mức dùng thật của hạng mục.

## Hệ quả

- Undo/redo 4K: 1310 ms → 5 ms (Chromium GPU), 126 → 60 ms (Firefox); commit 276 → 1–23 ms.
- Số canvas tăng thêm một atlas cho mỗi bước history (≤ 100). Bộ nhớ tính đúng vào MemoryBudget.
- Nén tile cũ (deflate trong Worker — mục 5.6, GĐ4) sẽ đọc pixel ở thời điểm rảnh (idle) cho các
  bước cũ, không nằm trên đường tương tác.
- `GrowableSurface.read/write` (ImageData) vẫn có cho thao tác cần pixel thật (fill, filter…).
