# 0021 — Lưu trữ GĐ3: PNG RGBA tự mã hóa, ArrayBuffer trong IndexedDB, cờ thoát sạch

- **Trạng thái:** Chấp nhận
- **Ngày:** 2026-10-17 (GĐ3)
- **Liên quan:** mục 6.4, 6.5, 6.6, 10.2, 10.4; ADR 0009, 0010

## Bối cảnh

Nghiệm thu GĐ3 yêu cầu "`.paint` round-trip giữ nguyên từng pixel" và DB luôn chứa một revision
hợp lệ. Test trên IndexedDB thật của Chromium, Firefox, WebKit cho thấy ba vấn đề:

1. **Bộ mã hóa/giải mã PNG của canvas không bảo toàn pixel bán trong suốt** trên Firefox và
   WebKit. Đo trên ảnh 300×200 có 25 nét ngẫu nhiên (alpha 1–255):

   | Đường đi                                                | Chromium | Firefox              | WebKit              |
   | ------------------------------------------------------- | -------- | -------------------- | ------------------- |
   | `createImageBitmap(canvas)` → `drawImage`               | 0 lệch   | 0 lệch               | 0 lệch              |
   | `getImageData` → `putImageData`                         | 0 lệch   | 0 lệch               | 0 lệch              |
   | `toBlob('image/png')` → giải mã (mọi tùy chọn, `<img>`) | 0 lệch   | 67 267 kênh, tới 128 | 60 290 kênh, tới 63 |

   Lệch ±1 ở giá trị nhân trước alpha, bị khuếch đại khi đọc ra RGBA không nhân trước ở pixel
   alpha thấp. Mắt thường khó thấy, nhưng mỗi lần mở lại project ảnh trôi dần.

2. **WebKit dùng cho test tự động (Playwright, Windows) không lưu được `Blob` vào IndexedDB**
   (`put` thất bại), trong khi `ArrayBuffer` lưu được trên cả ba engine.

3. **Lượt ghi IndexedDB bắt đầu trong `pagehide` có thể bị hủy** khi trang đóng: tải lại trang
   bình thường vẫn bị coi là "thoát đột ngột" và hiện banner khôi phục sai.

## Quyết định

1. **Pixel layer lưu bằng PNG RGBA 8 bit tự mã hóa** (`services/workers/ops/png.ts`, dùng
   `fflate` — đã có trong mục 3.3): Worker vẽ ImageBitmap chụp được (pha "Chụp" giữ nguyên
   `createImageBitmap` như 6.6) vào OffscreenCanvas, đọc RGBA bằng `getImageData`, lọc dòng
   bằng bộ lọc Paeth cố định rồi nén zlib bằng `CompressionStream('deflate')` của trình duyệt
   (không có thì `fflate`). Khi mở: giải mã ra RGBA và ghi vào
   layer bằng `putImageData`. File vẫn là PNG chuẩn (mở được bằng mọi trình xem ảnh), nên định
   dạng `.paint` (6.5) không đổi. PNG không do app ghi (định dạng khác RGBA 8 bit) vẫn đi qua bộ
   giải mã của trình duyệt. Ảnh thu nhỏ và ảnh xuất cho người dùng (PNG/JPG/WebP) vẫn dùng bộ mã
   hóa của trình duyệt — ở đó sai số ±1 không quan trọng.
2. **IndexedDB lưu ảnh dạng `ArrayBuffer`** (`LayerBlobRecord.png`, `ThumbnailRecord.image`) thay
   vì `Blob`. Chromium và Firefox tự tách giá trị lớn ra file nên chi phí tương đương Blob; dữ liệu
   vẫn là PNG như mục 6.4 mô tả.
3. **Cờ thoát sạch có bản sao đồng bộ trong localStorage**: mỗi lần mở project, phiên nhận một
   token mới (ghi trong bản ghi `session`); `pagehide` ghi token vào localStorage (đồng bộ, luôn
   xong) bên cạnh lượt ghi IndexedDB. Khi khởi động, phiên được coi là thoát sạch nếu
   `cleanExit = true` hoặc token khớp. Cùng cách làm với theme (ADR 0015).
4. Hai chi tiết nhỏ của `.paint`: `manifest.json` thêm `name` và `mode` (tùy chọn) để nhập lại đúng
   tên và chế độ; "Áp dụng vĩnh viễn vùng che" thay hẳn pixel dưới Redact **trong file xuất**,
   project trong trình duyệt không đổi (Redact vẫn không phá hủy khi chỉnh sửa).

## Hệ quả

- Lưu rồi mở lại, xuất rồi nhập `.paint` đúng từng pixel trên Chromium, Firefox và WebKit (test
  `src/services/storage/storage.browser.test.ts`).
- Lọc dòng bằng JS, nén native: lượt lưu thường của kịch bản M mất 0,43–0,74 s, không có long
  task nào trên 100 ms (docs/perf-baseline.md, GĐ3). Lượt lưu đầy đủ 5 layer 4K trên Chromium, máy
  2 nhân, mất 3,65 s — vượt ngưỡng 3 s; chủ dự án chấp nhận là ngoại lệ (ADR 0022). Dự phòng ở mục 10.4 (RGBA
  thô nén deflate) không giúp vì phần nén vẫn như nhau.
- Bộ giải mã PNG riêng giới hạn bộ đệm giải nén đúng bằng kích thước khai báo (chống bom giải
  nén) và kiểm tra CRC từng chunk.
- Đọc project nạp toàn bộ ArrayBuffer của các layer vào bộ nhớ (Blob thì lười) — chấp nhận được
  vì mở project cần giải mã mọi layer ngay.
