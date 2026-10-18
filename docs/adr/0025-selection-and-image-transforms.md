# 0025 — Vùng chọn, pixel nổi và biến đổi ảnh (GĐ5)

- **Trạng thái:** Chấp nhận
- **Ngày:** 2026-10-18 (GĐ5)
- **Liên quan:** mục 2, 5.5, 5.6, 5.7, 5.11, 6.3, 7.3, 7.4, 7.7, 11.2; ADR 0016, 0020, 0023, 0024

## Bối cảnh

GĐ5 thêm Marquee chữ nhật/elip, Lasso, Magic Wand, kết hợp vùng chọn, marching ants, floating
selection (di chuyển, co giãn, xoay), copy/cắt/dán/xóa, tô và vẽ bị giới hạn trong vùng chọn, Crop
(khung, theo vùng chọn), Trim, Resize, Canvas size, xoay, lật, kéo thả và dán ảnh vào project đang mở.
Kế hoạch mô tả mục tiêu; khi hiện thực có vài chỗ phải chốt:

1. Bảng Command của mục 5.6 không có lệnh cho vùng chọn — vùng chọn có vào history không?
2. Pixel nổi phải hiện ra trước khi commit, trong khi mọi thay đổi document phải là Command (quy tắc
   13.1.4).
3. Mục 5.7 dùng Alt cho hai việc: "Alt = bớt" khi kết hợp vùng chọn và "giữ Alt để nhân bản" khi kéo
   vùng chọn.
4. Clipboard hệ thống không cho biết ứng dụng khác đã ghi đè chưa, nhưng "paste ưu tiên dữ liệu nội bộ
   nếu cùng phiên, giữ đúng vị trí".
5. DocumentCommand giữ "snapshot nén của các layer trước khi biến đổi": lúc biến đổi, layer cũ và mới
   cùng tồn tại. Với ảnh L (6000 × 4000, 5 layer phủ kín = 480 MB) xoay hay Canvas size cần thêm
   ~480 MB — vượt phần 60% dành cho layer (921 MB) dù tổng ngân sách 1,5 GB còn đủ.
6. Đo trên GPU thật (HEADED) cho thấy ba điểm làm đứng hình: nén history đọc cả layer 96 MB từ GPU một
   lần (khung 1,4 s, kể cả khi Flatten/xóa layer của GĐ4); resample trong Worker buộc chép ảnh 96 MB
   qua lại giữa các GPU context (Chromium khung 1,4 s); chép cả layer 24 MP một lượt trên Firefox
   (~300 ms mỗi layer).

## Quyết định

1. **Vùng chọn là trạng thái làm việc**, như layer hoạt động (ADR 0020): đổi vùng chọn không tạo bước
   history; chỉ thay đổi pixel (di chuyển, xóa, tô, cắt, dán, biến đổi ảnh) là Command. Ctrl+Z khi
   đang có pixel nổi hủy pixel nổi (chưa có bước history nào cho nó).
2. **Mô hình vùng chọn** (`engine/selection`): chữ nhật, elip, Lasso không làm mềm chỉ giữ path; mask
   raster (alpha 1 byte/px, kích thước bằng hình bao) dựng trong Worker khi làm mềm biên, bỏ khử răng
   cưa, Magic Wand hoặc kết hợp vùng — vẽ hình bằng OffscreenCanvas, kết hợp thêm/bớt/giao, làm mềm
   bằng 3 lượt box blur, cắt sát nội dung, dò viền bằng marching squares + Ramer–Douglas–Peucker; Worker
   trả kèm ImageBitmap alpha để cắt trên GPU. Cắt nét vẽ (brush, pencil, eraser, bucket):
   `destination-in` trên stroke buffer khi commit, trên scratch thứ hai khi xem trước (mục 5.5).
3. **Pixel nổi** là surface tạm + hộp biến đổi (khung, góc xoay, lật). Renderer ghép nó như một phần của
   layer hoạt động (khoét lỗ ở vị trí cũ rồi vẽ nội dung) — document chưa đổi. Commit (Enter, click ra
   ngoài, đổi tool, thao tác layer) là **một** PaintCommand: xóa lỗ + vẽ nội dung với
   `imageSmoothingQuality = 'high'`; dời nguyên pixel / xoay 90° / lật thì tắt làm mịn để chép đúng
   từng pixel. Ảnh dán hoặc thả vào editor là pixel nổi "layer mới ngay trên layer hoạt động"; commit là
   một AddLayerCommand (bước "Dán"). Dán xong tự chuyển sang tool Chọn để kéo ngay (mục 7.4).
4. **Alt**: kéo **bên trong** vùng chọn (chế độ Mới, không Shift) di chuyển pixel, giữ Alt để nhân bản;
   bắt đầu **ngoài** vùng chọn thì Shift = thêm, Alt = bớt, Shift+Alt = giao. Muốn bớt một vùng nằm
   trong vùng chọn: chọn chế độ "Bớt" trên Options bar. Magic Wand: click luôn là chọn (Alt = bớt), chỉ
   kéo được pixel đang nổi.
5. **Clipboard**: copy giữ bản nội bộ (ImageBitmap + vị trí) và ghi PNG vào clipboard hệ thống. Bản nội
   bộ được coi là còn mới nếu cửa sổ chưa mất focus kể từ lúc copy; nếu đã rời cửa sổ mà ảnh dán có cùng
   kích thước với bản nội bộ thì vẫn dán đúng vị trí cũ. Copy lấy pixel của layer hoạt động (layer chú
   thích: ảnh đang thấy); "Copy ảnh đang thấy trong vùng chọn" ở menu.
6. **Biến đổi ảnh** (`engine/document/ImageOps`): một DocumentCommand thay kích thước + danh sách layer
   (layer mới cùng id, cùng thuộc tính); layer cũ nằm trong command và được nén lúc rảnh như layer đã
   xóa. Layer mới được dựng **từng layer, vẽ theo dải ~4 MP, nhường main thread giữa các dải**; resample
   chạy trên GPU ngay main thread (thu nhỏ từng nửa = trung bình 2×2, song tuyến lần cuối; phóng to
   chất lượng cao; "giữ điểm ảnh" = điểm gần nhất) — không chép ảnh sang Worker. Đối tượng chú thích
   biến đổi theo ma trận (vẫn sửa được; chữ không bị lật/kéo méo). Vùng chọn bị bỏ sau khi biến đổi.
7. **Bộ nhớ khi biến đổi ảnh**: layer mới được dựng trong hạng mục `temp` (chỉ tổng ngân sách giới
   hạn), chuyển sang `layer` khi DocumentCommand đã vào history (`MemoryBudget.transfer`). Phần layer có
   thể tạm vượt 60% cho tới khi layer cũ được nén; cảnh báo "gần hết bộ nhớ layer" chỉ tính layer đang
   thuộc document. Nhánh redo bị bỏ trước khi dựng (layer của nó giữ bộ nhớ). Vượt tổng ngân sách thì
   từ chối có thông báo, ảnh giữ nguyên.
8. **Nén history theo dải ~4 MB** (thay đổi hiện thực của ADR 0023): `CompressedPixels` gồm các dải
   hàng, History chụp và nén từng dải, nghỉ lúc rảnh giữa các dải (liền mạch khi đang thiếu bộ nhớ).

## Hệ quả

- Nghiệm thu: copy-paste giữ đúng vị trí và biến đổi rồi undo khôi phục chính xác — test pixel trên
  Chromium, Firefox, WebKit (`selection.browser.test.ts`) và E2E (`tests/e2e/selection.spec.ts`).
- Kịch bản L (6000 × 4000, 10 layer), GPU thật: crop 80%, Resize 50%, xoay 90°, Canvas size +10% và
  undo đều chạy được; trong lúc xử lý không khung nào > 117 ms, không long task (Chromium). Lần vẽ lại
  đầu tiên sau khi mọi layer đổi: Chromium 17–363 ms, Firefox 100–490 ms — cùng nguyên nhân với ghi
  nhận của ADR 0023 (Firefox vẽ trực tiếp nhiều layer 24 MP khi cache/mipmap đang dựng lại), đo lại ở
  GĐ9. Số đo ở docs/perf-baseline.md (GĐ5).
- Xoay/co giãn một vùng chọn dạng mask thì vùng chọn sau đó là khung (đa giác) của pixel nổi; mask chỉ
  giữ nguyên hình khi dời nguyên pixel.
- Trim bỏ phần trong suốt quanh nội dung các layer đang hiện, không tính màu nền của document.
- Mini toolbar cạnh vùng chọn (mục 7.6) thuộc GĐ8; ở GĐ5 các thao tác có trong menu Ảnh, menu chuột phải
  và phím tắt.
