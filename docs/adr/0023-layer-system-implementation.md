# 0023 — Hệ thống layer GĐ4: ghép layer chú thích, cache dựng lười, chuỗi thu hồi, nén history

- **Trạng thái:** Chấp nhận
- **Ngày:** 2026-10-17 (GĐ4)
- **Liên quan:** mục 5.2, 5.4, 5.6, 5.11, 10.4; ADR 0006, 0007, 0016, 0017, 0020

## Bối cảnh

GĐ4 thêm panel Layers/History, Below/Above cache, mipmap và chuỗi thu hồi của MemoryBudget. Kế
hoạch mô tả mục tiêu; khi hiện thực có vài chỗ phải chốt cách làm cụ thể:

1. **Layer chú thích có opacity < 1 hoặc blend khác `normal`** (ADR 0020 để lại tới GĐ4). Ghép cả
   nhóm cách ly làm Highlight (`multiply`) thành khối màu đặc che chữ bên dưới; nhân opacity vào từng
   đối tượng thì chỗ hai hình chồng nhau đậm hơn.
2. **Cache ở độ phân giải document** làm nét vector mờ khi phóng to, và Above cache chỉ đúng khi các
   layer phía trên không phụ thuộc nền (mục 5.2).
3. **Nén history cũ** (mục 5.6) đọc pixel từ GPU — trên Firefox một lần `getImageData` tốn 13–83 ms
   (ADR 0016), không được làm trên đường tương tác; chuỗi thu hồi lại chạy đồng bộ khi cấp phát.
4. **Merge Down cắt (clip) theo vùng** làm trình duyệt khử răng cưa nét vector khác với lúc hiển thị
   (đo được tới 21 mức ở vài pixel mép trên cả 3 engine).

## Quyết định

1. **Ba cách ghép layer chú thích** (`vectorLayerMode`):
   - `normal`, opacity 1 → vẽ thẳng từng đối tượng (như GĐ2);
   - `normal`, opacity < 1 → _pass-through_: vẽ đối tượng lên bản sao nền (theo pixel thiết bị của
     đích, nên vẫn sắc ở mọi zoom) rồi trộn tuyến tính `nền × (1 − α) + kết quả × α` bằng
     `destination-out` + `lighter` — đúng opacity của cả layer, Highlight vẫn trộn với ảnh dưới;
   - blend khác `normal` → _isolated_: ghép nhóm đối tượng riêng rồi blend cả nhóm như một layer.
2. **Below/Above cache, mipmap là bề mặt dẫn xuất dựng lười theo ô 256 px** (`render/cache.ts`):
   chỉ phần sắp vẽ mới được tính, nên dựng lại sau khi vô hiệu chỉ tốn bằng một frame vẽ trực tiếp.
   - Below cache = nền + mọi layer dưới layer hoạt động (đúng với mọi blend mode); Above cache chỉ
     khi các layer phía trên hiện đều không phụ thuộc nền (blend `normal`, không Highlight /
     pass-through) — có thì ghép từng layer mỗi frame.
   - Mỗi cache cần ≥ 2 layer hiển thị; dải có layer chú thích chỉ được cache khi zoom × DPR ≤ 1.
   - Vô hiệu: chữ ký cấu trúc (thứ tự, ẩn/hiện, opacity, blend, layer hoạt động, nền, font vừa tải)
     → toàn bộ; `contentRev` đổi → chỉ vùng của Command vừa chạy (Editor báo
     `renderer.contentChanged(area)`), toàn bộ nếu không rõ vùng. Bản nháp đối tượng nằm ngoài layer
     hoạt động → frame đó vẽ trực tiếp.
   - Mipmap ½, ¼ khi zoom × DPR ≤ 50% / 25% và ảnh > 3840 × 2160, cho cache và layer raster vẽ trực
     tiếp; mỗi mức là trung bình 2×2 của mức trước. Trả bộ nhớ khi zoom ≥ 50% hoặc 120 frame không
     dùng.
   - Chỉ dùng cho màn hình; export, đọc pixel, Merge luôn ghép trực tiếp.
3. **Chuỗi thu hồi** (`MemoryBudget.reclaim`): mipmap → Below/Above cache → cache layer vector
   (không có — ADR 0020) → nén history → bỏ bước cũ nhất (giữ ≥ 10). Cấp phát cho cache chỉ được
   thu hồi mipmap; không thu hồi trong lúc Renderer đang vẽ một frame; lỗi cấp phát thật
   (`getContext` null) chạy cả chuỗi rồi thử lại một lần. Từ chối vì layer đã chiếm hết phần 60% →
   thông báo riêng gợi ý Merge/Flatten; vượt 90% phần đó → cảnh báo sớm một lần.
4. **Nén history trong Worker, giải nén đồng bộ**: lúc rảnh, dữ liệu của bước cũ hơn 10 bước (atlas
   tile) và surface của layer đã rời document (xóa, gộp) được chụp bằng `createImageBitmap` (không
   đọc pixel trên main thread), Worker đọc RGBA và nén zlib (`CompressionStream`, fallback fflate);
   undo/redo tới bước đó giải nén bằng `fflate.unzlibSync` + `putImageData` — đúng từng pixel trên 3
   engine (test 18 bước + layer đã xóa). Bước 4 của chuỗi (đồng bộ) không giải phóng ngay được nên
   chỉ thúc việc nén chạy sớm; khi vẫn thiếu, bước 5 bỏ bước cũ nhất.
5. **Gộp layer**: Merge Down vẽ layer trên vào pixel thô của layer dưới bằng chính hàm ghép của
   Compositor (opacity, blend của layer trên), **không clip** (nội dung đã nằm trong hình bao, tile
   đã chụp phủ trọn) — một `TransactionCommand` (snapshot tile layer dưới + layer trên). Hai layer
   chú thích ghép thẳng thì gộp đối tượng (vẫn sửa được); layer dưới là chú thích còn lại thì
   rasterize trước. Merge Visible / Flatten ghép đúng ảnh đang thấy, gồm màu nền document; Merge
   Visible giữ layer ẩn, Flatten bỏ chúng (có undo).
6. **Thuộc tính layer là Command** (đổi tên, ẩn/hiện, khóa, khóa trong suốt, opacity, blend — mục
   5.6, quy tắc 13.1.4): có trong history và autosave; kéo slider opacity liên tục gộp thành một bước
   (< 1 s). Layer khóa chặn nội dung và cách ghép; vẫn đổi tên, ẩn/hiện, mở khóa được.
7. **Tẩy trên layer khóa trong suốt** tô màu phụ bằng `source-atop` (như tẩy của MS Paint) thay vì
   làm giảm alpha.
8. `layersChanged` đồng bộ ngay sang store (không gộp theo frame) để panel phản hồi tức thì; sự kiện
   theo từng nét vẽ vẫn gộp theo frame.

## Hệ quả

- 16 blend mode khớp ảnh chuẩn tính theo công thức W3C trên Chromium, Firefox, WebKit
  (`render.browser.test.ts`, sai khác ≤ 6/255, trung bình ≤ 1); màn hình có cache/mipmap cho cùng
  ảnh như vẽ trực tiếp (≤ 2/255, mipmap: trung bình < 4/255).
- **Benchmark 10.4 (GPU thật): giữ Below/Above cache và mipmap.** Cache: kịch bản M với 5/20 layer
  chênh lệch ≥ 20% (Firefox frame p95 khi vẽ 32,8 → 22,4 ms; Chromium pan M × 20 51,5 → 17,7 ms).
  Mipmap: Firefox không có mipmap thì pan/vẽ ở mức vừa khung ảnh L 400–600 ms mỗi frame; Chromium
  pan −50%. Số đo đầy đủ ở docs/perf-baseline.md (GĐ4).
- **Dựng dần lúc rảnh**: vùng cần dựng > 6 ô (mipmap > 24 ô) thì frame đó vẽ trực tiếp và cache được
  tính dần ≤ 8 ms mỗi lượt trong `requestIdleCallback` — tránh một frame ghép lại cả ảnh gốc (~550 ms
  với L × 20). Còn lại: Firefox L × 20 khựng một frame ~335 ms khi đổi layer hoạt động ở mức vừa khung
  (vẽ trực tiếp 20 layer 24 MP chưa có mipmap riêng) — không xảy ra khi vẽ.
- Flatten/xóa layer giải phóng bộ nhớ layer sau khi nén xong (vài trăm ms), không phải ngay lập tức.
- Merge lên pixel bán trong suốt chỉ sai số làm tròn 8 bit (≤ 2/255).
- **Cập nhật GĐ5 (ADR 0025):** nén history chụp và nén theo dải ~4 MB thay vì cả surface một lần
  (đọc cả layer 96 MB từ GPU làm đứng hình > 1 s); định dạng `CompressedPixels` gồm các dải hàng.
