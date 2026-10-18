# 0026 — Điều chỉnh, bộ lọc và Gradient (GĐ6)

- **Trạng thái:** Chấp nhận
- **Ngày:** 2026-10-18 (GĐ6)
- **Liên quan:** mục 2, 3.2, 5.6, 5.8, 7.3, 11.2, 11.3, 13.4; ADR 0008, 0016, 0025

## Bối cảnh

GĐ6 thêm Brightness, Contrast, Saturation, Hue, Grayscale, Invert, Sepia, Blur, Sharpen, Pixelate
(pipeline filter trong Worker, xem trước trên bản thu nhỏ, áp dụng full-res có tiến trình và nút
hủy) và tool Gradient (P2). Nghiệm thu: mỗi filter có unit test với ảnh nhỏ biết trước kết quả; ngưỡng
xem trước của mục 11.2 (≤ 100 ms mỗi lần cập nhật khi kéo slider) đạt cho kịch bản M.

Kế hoạch nêu mục tiêu (mục 5.8: LUT, box blur 3 lượt, unsharp mask, khảm trung bình khối; xem trước
≤ ~1 MP của vùng đang thấy; kết quả ghép qua mask vùng chọn) nhưng khi hiện thực phải chốt thêm:

1. Công thức cụ thể của từng filter và nghĩa của tham số.
2. Phiên điều chỉnh tương tác với phần còn lại thế nào (vẽ, undo, đổi layer, vùng chọn) khi bảng
   điều chỉnh "nổi, không chặn canvas".
3. Đo trên GPU thật cho thấy bản xem trước 1 MP của Blur/Sharpen không thể ≤ 100 ms: tính toán JS
   ~200 ms cho 1,45 MP trên máy tham chiếu (box blur đã O(n)), cộng chi phí ghép màn hình và đọc ngược
   GPU. Sau hai lần tối ưu có profile Blur vẫn p95 99–152 ms; theo mục 13.4 đã hỏi chủ dự án, chọn
   tối ưu lần 3 (dưới đây).

## Quyết định

1. **Filter là hàm thuần** trong `services/workers/ops/filters/` (mỗi filter một file, bảng tra ở
   `pipeline.ts`), chạy trên RGBA không nhân trước. Đặc tả tham số (dải, mặc định, đơn vị, bước không
   đổi ảnh, phần đệm) ở `engine/filters/spec.ts` — một nguồn cho Engine (tính vùng đọc), Worker và UI
   (slider). Pipeline = dãy bước; các bước LUT liền nhau được gộp một lượt.
   - Độ sáng: cộng amount% của 255. Tương phản: f = 259(C + 255) / (255(259 − C)), C = amount × 2,55.
   - Độ bão hòa, Đen trắng: ma trận như bộ lọc CSS với hệ số Rec. 709. Sepia: ma trận `sepia()` của
     CSS, nội suy theo cường độ. Đảo màu: 255 − v. Sắc độ: xoay trong HSV (đỏ +120° = xanh lá).
   - Làm mờ: `radius` = độ lệch chuẩn Gauss (px document), 3 hộp xấp xỉ Gauss (Kutskir), trên giá trị
     nhân trước theo thang nguyên (màu × alpha) và làm tròn sau mỗi lượt — kết quả chính xác, không
     phụ thuộc cách chia dải. Làm sắc nét = unsharp mask trên blur đó, giữ alpha. Khảm: ô căn theo
     gốc document, trung bình nhân trước theo alpha.
   - Layer khóa trong suốt: giữ alpha gốc (blur, khảm).
2. **Phiên điều chỉnh** (`engine/filters/FilterRunner`, `editor.filters`) gắn với layer hoạt động
   (layer chú thích, khóa, ẩn: từ chối có thông báo). Khi bảng mở: chỉ xem, zoom, pan, lấy màu; undo,
   biến đổi ảnh, sửa vùng chọn bị chặn có thông báo; Enter áp dụng, Esc hủy. Đổi layer hoạt động, vùng
   chọn, khung nhìn thì bản xem trước dựng lại. Tham số trung tính: Áp dụng không tạo bước history.
3. **Xem trước** ghép bởi Renderer (`FilterPreview`, document chưa đổi), vẽ thẳng ảnh lọc ở độ phân
   giải màn hình thay vì scratch cỡ document; có vùng chọn thì gốc × (1 − m) + lọc × m (giống lúc áp
   dụng). Để mỗi lần cập nhật ≤ 100 ms:
   - Lưới pixel cố định theo tỉ lệ (neo ở gốc document); pixel nguồn đọc từ GPU **một lần** cho khung
     nhìn, rộng đủ phần đệm của tham số lớn nhất; kéo slider chỉ cắt phần cần trong bộ nhớ.
   - Mức thu nhỏ k (tỉ lệ cơ sở / 2^k) dựng trên CPU từ mức 0 (trung bình 2 × 2).
   - Mỗi bản xem trước chia dải chạy song song trên cả pool (`WorkerClient.concurrency`).
   - Đang kéo slider: **bản nháp** — mức chọn theo tốc độ đo được của pipeline trên chính máy đó (mục
     tiêu ~40 ms Worker); thôi kéo 200 ms thì dựng lại bản đầy đủ, bản này nhường ngay khi tham số đổi.
   - Pipeline chỉ có Blur lấy mẫu sao cho σ ≥ 4 pixel xem trước (ảnh đã blur mịn — phóng lên trông
     như bản 1 MP).
4. **Áp dụng full-res**: dải ~2 MP có phần đệm, tối đa 4 dải song song, nhường main thread giữa các
   dải, tiến trình theo dải, Hủy = `AbortSignal` (dừng Worker đang chạy). Bản trước của tile history
   chụp dần theo dải; kết quả ghi bằng **một** PaintCommand (vùng = nội dung layer + phần đệm, cắt theo
   vùng chọn). Hủy hoặc lỗi: layer giữ nguyên, phiên quay lại xem trước.
5. **UI**: menu "Điều chỉnh" trên top bar (nhóm Điều chỉnh, Bộ lọc); bảng nổi góc phải vùng làm việc
   (slider + ô số sinh từ đặc tả, giữ "So sánh" để xem ảnh gốc, Đặt lại, Hủy, Áp dụng, thanh tiến
   trình + Dừng). Đen trắng, Đảo màu không có tham số nên áp dụng ngay (vẫn có tiến trình). Không gán
   phím mặc định (mục 7.7) — dùng qua menu và Command Palette (GĐ8).
6. **Gradient** (`tools/gradient`): kéo từ điểm đầu tới điểm cuối, màu chính → màu phụ (hoặc → trong
   suốt), thẳng hoặc tỏa tròn, độ mờ; Shift khóa góc 45°. Vẽ trên stroke buffer nên tự bị giới hạn
   trong vùng chọn và commit bằng một PaintCommand. Nút tách "Tô ▾" (Tô màu, Gradient); phím G chọn
   kiểu tô dùng gần nhất, nhấn lại để đổi (như M của Marquee).

## Hệ quả

- Nghiệm thu: 16 unit test filter với ảnh nhỏ biết trước kết quả (gồm chia dải = chạy một lần), test
  engine trên 3 engine (áp dụng/undo chính xác, vùng chọn, dải song song, hủy giữa chừng, xem trước
  trên màn hình, so sánh, Gradient), E2E trên 3 trình duyệt.
- Kịch bản M, Chromium GPU thật, ba lượt đầy đủ: mọi filter ở zoom vừa khung và 100% có p95 ≤ 79 ms
  (p50 ≤ 50 ms), cập nhật sau khi thả slider ≤ 100 ms (docs/perf-baseline.md, GĐ6). Firefox GPU thật chưa đo được
  trong phiên này (cửa sổ headed bị Windows hạ còn 1–5 fps kể cả trang trống); headless (vẽ bằng CPU)
  p95 49–109 ms — đo lại ở GĐ9.
- Mở bảng khi đang thu nhỏ ảnh lớn: lần đọc pixel nguồn đầu tiên từ GPU khựng 80–150 ms (một lần
  mỗi khung nhìn/nội dung).
- Bản nháp khi kéo slider có thể thô hơn (tới 1/16 số pixel) trên máy chậm; bản đầy đủ hiện ~0,2 s
  sau khi thả tay.
- Áp dụng Blur/Sharpen full-res trên M mất ~0,9–2,1 s (có tiến trình, UI không treo).
- JS khởi động 227,3 KB gzip (GĐ5: 220,6 KB; ≤ 250 KB): FilterRunner nằm trong engine; filter
  thuần nằm trong chunk Worker.
