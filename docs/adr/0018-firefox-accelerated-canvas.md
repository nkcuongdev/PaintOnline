# 0018 — Firefox với canvas tăng tốc WebGL: giai đoạn "khởi động" ở ảnh lớn nhiều layer

- **Trạng thái:** Chấp nhận — phương án 1, chủ dự án chọn ngày 2026-10-17 (mục 13.4)
- **Ngày:** 2026-10-17 (GĐ1)
- **Liên quan:** mục 10.4, 11.2, 11.4 · docs/perf-baseline.md

## Bối cảnh

Trên máy cấu hình D2, mọi ngưỡng bắt buộc của mục 11.2 cho kịch bản S và M đều đạt trên Chromium
(GPU và phần mềm) và trên Firefox khi canvas chạy phần mềm (`gfx.canvas.accelerated = false`).

Khi Firefox dùng canvas tăng tốc WebGL (mặc định của Firefox trên máy có GPU phù hợp), kịch bản M
(3840×2160, 5 layer) có ~2,5 s đầu của nét vẽ **đầu tiên** sau khi mở document chỉ 2–3 khung/giây
(frame dài nhất ~850 ms, độ trễ p95 ~880 ms), sau đó ổn định 60 khung/giây cho mọi nét tiếp theo.
Kịch bản S (ảnh chụp màn hình — luồng dùng chính) đạt toàn bộ ngưỡng trên mọi cấu hình.

Đã loại trừ bằng thí nghiệm: đọc pixel cho history, cấp phát/nở stroke buffer, thời gian chờ trước
khi vẽ (1–6 s), thứ tự loại nét. `willReadFrequently` không tránh được hiện tượng và làm Chromium
chậm ~600 lần. Trang web không có API để chọn chế độ canvas của Firefox; nhận diện trình duyệt bằng
user agent bị cấm (quy tắc 13.1.8).

## Phương án

1. **Chấp nhận có ghi chú (đề xuất):** giữ kiến trúc; ghi giới hạn vào tài liệu; đo lại ở GĐ4 khi
   có Below/Above cache (giảm số surface lớn ghép mỗi frame từ N xuống ~3, có thể rút ngắn giai đoạn
   khởi động) và ở GĐ9.
2. **Làm "ấm" sau khi mở document:** trong lúc rảnh, chạy vài trăm phép ghép vô hình để Firefox
   chuyển chế độ trước khi người dùng vẽ. Phụ thuộc hành vi nội bộ của Firefox, khó kiểm chứng và tốn
   pin/CPU trên mọi trình duyệt.
3. **Hạ ngưỡng riêng cho Firefox ở kịch bản M** (mục 10.4: "hạ ngưỡng kèm ADR giải thích").

## Quyết định

Chọn **phương án 1**. Giữ nguyên kiến trúc và ngưỡng của mục 11.2; không thêm cơ chế làm ấm hay
nhánh xử lý riêng cho Firefox. Trường hợp này là **ngoại lệ đã biết**, không chặn GĐ1.

## Hệ quả

- App vẫn đúng từng pixel trên Firefox; chỉ vài giây đầu của nét vẽ đầu tiên trên ảnh 4K nhiều
  layer bị giật khi Firefox dùng canvas tăng tốc WebGL. Kịch bản S và Chromium không bị ảnh hưởng.
- **GĐ4:** sau khi có Below/Above cache, chạy lại `HEADED=1 BENCH_CUSTOM=3840x2160x5 npm run bench`
  trên Firefox. Nếu vẫn trượt ngưỡng, xem lại phương án 2 hoặc 3 và hỏi chủ dự án.
- **GĐ9:** đo lại cùng kịch bản trước khi phát hành; ghi kết quả vào docs/perf-baseline.md.

## Đo lại ở GĐ4

Có Below/Above cache: nét đầu sau khi mở M chỉ còn ~1 s chậm (7–17 khung/giây), khung dài nhất
133 ms, độ trễ p95 21–33 ms, frame p95 16,7 ms — **đạt mọi ngưỡng vẽ bắt buộc của M**. Không cần
phương án 2 hay 3. Vẫn đo lại ở GĐ9 (docs/perf-baseline.md, GĐ4).
