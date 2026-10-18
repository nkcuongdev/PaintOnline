# 0027 — Screenshot Editor hoàn chỉnh (GĐ7)

- **Trạng thái:** Chấp nhận
- **Ngày:** 2026-10-18 (GĐ7)
- **Liên quan:** mục 2, 5.3, 5.4, 6.2, 6.4, 7.3, 7.4, 7.7, 11.2; ADR 0019, 0020, 0023, 0026

## Bối cảnh

GĐ7 hoàn thiện chế độ Screenshot: giao diện rút gọn; Redact khảm và làm mờ; Spotlight, Step badge,
Magnifier (P2); kiểu nhanh cho mũi tên, khung, chữ; panel Làm đẹp (padding, nền, bo góc, bóng). Nghiệm
thu: luồng screenshot đầy đủ dưới 15 giây; test pixel cho cả 3 chế độ Redact.

Kế hoạch nêu mục tiêu (mục 5.4: Redact "lấy pixel của các layer bên dưới trong bbox, áp hiệu ứng và
cache kết quả cho đến khi nền bên dưới thay đổi… pixel gốc không bao giờ có trong file xuất") nhưng
phải chốt thêm: hiệu ứng chạy ở đâu, cache theo gì, vùng nào phải vẽ lại, Làm đẹp lưu thế nào, số thứ
tự tính ra sao.

## Quyết định

1. **Hiệu ứng che chạy đồng bộ trên main thread** (`render/backdrop.ts`, `BackdropEffects`), không qua
   Worker: mọi đường ra (màn hình, Below cache, export, copy, Rasterize, Merge, thumbnail) gọi cùng
   `drawObjects` của Compositor, nên ảnh xuất luôn đã nướng hiệu ứng — không có trạng thái "chưa tính
   xong" phải chờ. Nhân blur dùng chung với bộ lọc GĐ6 được chuyển từ `services/workers/ops/filters`
   sang `engine/filters/kernels.ts` (Engine không được import services; Worker vẫn dùng nhân đó).
   - Ảnh nền = các layer bên dưới + đối tượng đứng trước trong cùng layer (mũi tên đi qua vùng che cũng
     bị che), ở độ phân giải document; lót màu đục (màu của Redact) — vùng che luôn đục.
   - Khảm: chia đều vùng che thành ⌊cạnh / cỡ ô⌋ ô (mỗi ô ≥ 12 px, không có dải hẹp ở mép), trung bình
     nhân trước theo alpha. Làm mờ: 3 hộp xấp xỉ Gauss (σ 4–40 px), đọc thêm phần đệm ngoài vùng che.
   - Thiếu bộ nhớ hoặc không dựng được ảnh nền: tô kín bằng màu của Redact (không bao giờ lộ nền).
   - Cache theo chữ ký nền (kích thước, màu nền, `contentRev`/hiển thị/opacity/blend của từng layer bên
     dưới, danh sách đối tượng đứng trước so theo tham chiếu, thuộc tính đối tượng); tối đa 48 ảnh, LRU,
     hạng mục `cache`; bỏ khi đổi document, tab ẩn, font web vừa tải.
   - Pixel nền đọc từ GPU **một lần** cho mỗi trạng thái nền (cả ảnh nếu ≤ 1920 × 1200, nếu không thì
     vùng quanh đối tượng nới 384 px): đo trên ảnh 1080p, đọc vùng 0,2 MP từ canvas GPU mất ~28 ms vì
     Chromium đọc cả texture nguồn; kéo vùng che chỉ chép từ bộ nhớ.
   - Đang kéo vùng làm mờ lớn (> 60 000 px): bản nháp ở ½ độ phân giải; thả chuột tính lại chính xác.
2. **Vùng vẽ lại phụ thuộc nền**: Redact khảm/làm mờ và Magnifier đọc nền ở vùng khác vùng nét vẽ thay
   đổi (cả ô khảm, phần mờ lan ra, bản phóng to ở chỗ khác). Renderer mở rộng mọi vùng bẩn và vùng
   cache cần dựng lại thêm vùng vẽ của các đối tượng như vậy (`expandForBackdrops`).
3. **Spotlight** làm tối mọi thứ đứng trước nó (layer dưới + đối tượng trước trong layer); nhiều
   Spotlight trong cùng layer gộp thành một lớp làm tối nhiều vùng sáng (độ tối lớn nhất), vẽ ở vị trí
   Spotlight đầu tiên. **Step badge**: số = thứ tự của nó giữa các Step trong cùng layer, do Compositor
   tính khi vẽ — xóa thì tự đánh lại; layer chú thích khác bắt đầu dãy riêng. **Magnifier** (P2): vùng
   nguồn + bản phóng to (1,5–6×, chữ nhật/elip) nối bằng hai tiếp tuyến ngoài; handle: góc vùng nguồn,
   tâm bản phóng to, mép phải đổi độ phóng. Thêm nhánh `magnifier` vào union đối tượng (mục 6.2).
4. **Làm đẹp không phá hủy**: `Document.beautify` (padding, nền gradient/màu/trong suốt, bo góc, bóng)
   đổi qua `BeautifyCommand` (kéo slider liên tục gộp một bước), lưu trong DocumentRecord như trường
   **tùy chọn** (bản ghi cũ vẫn hợp lệ — không tăng schemaVersion) và trong `.paint`. Renderer vẽ khung
   quanh ảnh (Fit tính cả khung); `exportImage({ beautify: true })` xuất khung — Copy và Tải xuống luôn
   gồm khung, hộp thoại Export có ô chọn; không áp khi chỉ xuất vùng chọn.
5. **Chế độ Screenshot** (`ProjectMeta.mode`, đổi được và lưu cùng project): tool island rút gọn (Chọn │
   Mũi tên, Khung, Bút dạ quang, Chữ, Che thông tin, Số thứ tự, Spotlight, Phóng to vùng │ Cắt xén);
   top bar: Copy (nút chính), Tải xuống, nút sang Paint đầy đủ; ẩn menu Ảnh, Điều chỉnh; panel phải là
   Làm đẹp + Lịch sử. Phím tắt của mọi tool vẫn dùng được. Chế độ Paint: panel phải thêm tab Làm đẹp;
   tool island gộp Hình (U) và Làm nổi bật (Spotlight, Phóng to vùng) thành nút tách để vừa khung 1280
   px khi panel mở.
6. **Kiểu nhanh** (`app/editor/presets.ts`): 4 kiểu cho mũi tên, khung, chữ; một click đặt option + màu
   chính/phụ cho tool và áp cho đối tượng đang chọn trong **một** bước history (`objects.applyPreset`).
7. **Options bar**: Redact có Kiểu che (Tô kín mặc định / Khảm / Làm mờ), cỡ ô hoặc độ mờ theo kiểu;
   chọn Làm mờ hiện cảnh báo "có thể bị khôi phục một phần" (mục 5.4). Thuộc tính đối tượng đang chọn
   chỉ hiện ở tool Chọn hoặc tool tạo cùng loại (vẽ khung rồi nhấn K thì thấy option của Redact).
8. **Phím**: N = Số thứ tự (mục 7.7); Spotlight, Phóng to vùng không gán phím mặc định.

## Hệ quả

- Nghiệm thu: test pixel cho Tô kín, Khảm (đúng từng pixel trung bình từng ô, < 1% pixel trùng gốc),
  Làm mờ (bằng đúng blur của nền gồm phần đệm) trên ảnh xuất PNG ở Chromium, Firefox, WebKit; cache cập
  nhật khi nền đổi (cả màn hình — test hỏng nếu bỏ mở rộng vùng bẩn); luồng đầy đủ (dán → mũi tên →
  khung → khảm → chữ → 2 số thứ tự → Làm đẹp → Copy) tự động đo 5 lần: Chromium 1,6–2,3 s, Firefox
  3,9–6,1 s, WebKit 3,5–5,9 s (≤ 15 s). Thời gian thao tác của người phải tự đo trên trình duyệt hằng
  ngày (docs/perf-baseline.md).
- Kéo vùng che 600 × 300 trên ảnh 1080p (bản dev): khảm ~8 ms/khung, làm mờ 27–45 ms/khung (bản nháp),
  thả tay tính lại 56–109 ms một lần.
- ~~File `.paint` "áp dụng vĩnh viễn vùng che" vẫn tô kín pixel dưới mọi Redact (cả khảm/làm mờ) bằng
  màu của Redact.~~ Đã sửa ở GĐ8+9 (ADR 0028): nướng đúng kiểu khảm/làm mờ.
- Redact trong layer có opacity < 1 hoặc layer bị ẩn thì che kém hơn/không che — theo đúng thuộc tính
  layer người dùng đặt (như GĐ2).
- JS khởi động 234,2 KB gzip (GĐ6: 227,3 KB; ≤ 250 KB): renderer đối tượng mới, ảnh nền, Làm đẹp nằm
  trong engine; panel Làm đẹp, kiểu nhanh ở chunk editor tải lười. Còn ~16 KB cho GĐ8.
