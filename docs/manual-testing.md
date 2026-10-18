# Kiểm thử thủ công (mục 7.7, 11.1, 11.4)

Playwright không mô phỏng được những phím mà trình duyệt xử lý trước trang web, hộp chọn file của hệ
điều hành, hay chuyển đổi toàn màn hình thật. Bảng dưới được kiểm tra tay ở mỗi mốc trên các trình
duyệt dùng thật. Phạm vi v1.0 chỉ gồm trình duyệt laptop (ADR 0028).

Cách ghi: ✅ chạy đúng phím chính · ↪ trình duyệt giành phím, phím dự phòng chạy · ❌ lỗi (ghi chú).
Nếu phím chính thực tế không chặn được, phím dự phòng trở thành phím chính: chỉ cần cập nhật bảng ở
mục 7.7, không cần ADR.

## 1. Bảng phím dễ xung đột với trình duyệt (mục 7.7)

| Phím                       | Lệnh                | Dự phòng                  | Chrome | Edge | Firefox | Safari |
| -------------------------- | ------------------- | ------------------------- | ------ | ---- | ------- | ------ |
| Ctrl/⌘ + `+` / `−` / wheel | Zoom ảnh            | `+` / `-`, thanh zoom     |        |      |         |        |
| Ctrl/⌘ + J                 | Nhân bản layer      | Shift+J                   |        |      |         |        |
| Ctrl/⌘ + E                 | Merge down          | Shift+E                   |        |      |         |        |
| Ctrl/⌘ + D                 | Bỏ chọn             | Esc                       |        |      |         |        |
| Ctrl/⌘ + K                 | Command Palette     | `/`, ô "Tìm lệnh"         |        |      |         |        |
| Ctrl/⌘ + S                 | Lưu ngay (+ file)   | menu ⋯ → Lưu              |        |      |         |        |
| Ctrl/⌘ + Shift + S         | Xuất ảnh            | nút Xuất, Command Palette |        |      |         |        |
| Giữ Alt                    | Lấy màu tạm thời    | phím I                    |        |      |         |        |
| Alt + kéo chuột phải       | HUD cỡ/độ cứng cọ   | `[` `]`, `Shift+[` `]`    |        |      |         |        |
| Shift + F                  | Toàn màn hình       | nút trên top bar          |        |      |         |        |
| `\`                        | Zen mode            | menu ⋯ / Xem → Zen mode   |        |      |         |        |
| `?`                        | Bảng phím tắt       | menu ⋯ → Bảng phím tắt    |        |      |         |        |
| Esc trong toàn màn hình    | Thoát toàn màn hình | lần Esc thứ hai tới app   |        |      |         |        |

Phím trình duyệt giữ riêng phải **không** bị app chặn: Ctrl+N/T/W, Ctrl+Shift+N/T/W, Ctrl+Tab,
Ctrl+1…9, F12, Ctrl+Shift+I/J/C, Ctrl+Shift+E/K (Firefox).

Gõ tiếng Việt (Unikey/EVKey Telex, bộ gõ macOS) trong ô chữ, ô tìm của Command Palette, ô tìm của bảng
phím tắt: không phím nào bị nuốt.

## 2. Tình huống riêng của trình duyệt (mục 11.4)

| Tình huống                                                      | Chrome | Edge | Firefox  | Safari   |
| --------------------------------------------------------------- | ------ | ---- | -------- | -------- |
| Tắt mạng (DevTools → Offline hoặc rút mạng) rồi reload          |        |      |          |          |
| Có bản mới: toast "Lưu và tải lại" → mở đúng project            |        |      |          |          |
| Zoom trang 125%: ảnh sắc nét, tọa độ vẽ đúng                    |        |      |          |          |
| Kéo cửa sổ giữa hai màn hình khác DPR                           |        |      |          |          |
| Đóng tab giữa chừng → mở lại có banner khôi phục                |        |      |          |          |
| Mở cùng project ở hai tab: tab sau chỉ đọc                      |        |      |          |          |
| Lưu ra file .paint (chọn file, Ctrl+S ghi đè, reload hỏi quyền) |        |      | (tải về) | (tải về) |
| Khung 1024–1279 px: panel phải nổi, tự đóng khi vẽ              |        |      |          |          |

## 3. Luồng screenshot dưới 15 giây (nghiệm thu GĐ7)

Tự đo 5 lần trên trình duyệt dùng hằng ngày; ghi vào bảng "tự đo" của mục GĐ7 trong
[perf-baseline.md](perf-baseline.md).
