# 0022 — Lượt lưu đầy đủ nhiều layer 4K là ngoại lệ của ngưỡng autosave 3 s

- **Trạng thái:** Chấp nhận — chủ dự án chọn ngày 2026-10-17
- **Ngày:** 2026-10-17 (GĐ3)
- **Liên quan:** mục 6.6, 10.4, 11.2, 13.4; ADR 0021

## Bối cảnh

Mục 11.2 đặt ngưỡng bắt buộc cho một lượt autosave: không gây long task > 100 ms trên main thread
và hoàn tất ≤ 3 s cho kịch bản M (3840 × 2160, 5 layer). Đo cuối GĐ3 (docs/perf-baseline.md) trên
máy tham chiếu i7-7500U (2 nhân / 4 luồng → pool 3 Worker):

| Lượt lưu                                        | Chromium | Firefox  |
| ----------------------------------------------- | -------- | -------- |
| Thường — chỉ layer vừa đổi được mã hóa lại      | 743 ms   | 430 ms   |
| Đầy đủ — cả 5 layer 4K đều mới                  | 3 654 ms | 1 885 ms |
| Long task dài nhất trong lúc lưu (chỉ Chromium) | 68 ms    | —        |

Lượt lưu đầy đủ chỉ xảy ra khi mọi layer cùng lúc chưa có trong DB: lượt lưu đầu của một project
đã có nhiều layer lớn được vẽ trong cùng một khoảng debounce, hoặc sau khi kết nối DB bị đóng ngoài
ý muốn / DB thiếu pixel (autosave lưu lại toàn bộ cho chắc — mục 6.6). Project mới tạo từ ảnh hay
preset chỉ có một layer; nhập `.paint` ghi thẳng PNG có sẵn, không mã hóa lại.

Đã tối ưu hai lần có số đo (bộ lọc Paeth cố định; nén bằng `CompressionStream` native; giãn nhịp
ảnh thu nhỏ). Phần còn lại là nén zlib ~1 s/layer 4K trên Chromium, 5 layer chia cho 3 Worker. Hướng
tiếp theo (nén song song theo dải trong một luồng zlib) phức tạp so với lợi ích cho trường hợp hiếm.

## Quyết định

Chấp nhận **lượt lưu đầy đủ của nhiều layer lớn** là ngoại lệ của ngưỡng "hoàn tất ≤ 3 s". Ngưỡng
áp dụng cho lượt autosave thường (chỉ layer có `contentRev` mới) và vẫn bắt buộc; ngưỡng long task
≤ 100 ms áp dụng cho mọi lượt lưu, kể cả lượt đầy đủ.

## Hệ quả

- Lượt lưu đầy đủ vẫn nguyên tử và single-flight: chậm hơn chỉ kéo dài thời gian ở trạng thái
  "Đang lưu", không ảnh hưởng thao tác vẽ (main thread không bị chặn) hay tính hợp lệ của DB.
- Benchmark (`tests/bench/bench.spec.ts`) kiểm ngưỡng 3 s cho lượt lưu thường; lượt lưu đầy đủ
  được ghi số đo và chỉ cảnh báo nếu vượt 6 s (gấp đôi ngưỡng — phát hiện hồi quy).
- Đo lại ở GĐ9 trên thiết bị tham chiếu; nếu lượt lưu đầy đủ thành trường hợp thường gặp (ví dụ
  panel Layers ở GĐ4 cho phép tạo/nhân bản nhiều layer lớn cùng lúc) thì xem lại quyết định này.
