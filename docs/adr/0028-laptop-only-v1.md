# 0028 — Gộp GĐ8 + GĐ9 thành một giai đoạn chỉ cho trình duyệt laptop

- **Trạng thái:** Chấp nhận (chủ dự án yêu cầu ngày 2026-10-18)
- **Ngày:** 2026-10-18
- **Liên quan:** mục 2, 7.2, 7.3, 7.5, 7.6, 7.7, 7.8, 9 (GĐ8, GĐ9), 10.3, 10.4, 11.2, 11.4; ADR 0011

## Bối cảnh

Chủ dự án chỉ dùng Paint Online trên trình duyệt laptop. Họ yêu cầu gộp GĐ8 (Responsive, cảm ứng,
offline) và GĐ9 (Ổn định và hoàn thiện) thành một giai đoạn, bỏ phần dành cho tablet, điện thoại và
cảm ứng, và ghi lại phần bị cắt để có thể làm lại sau.

Quy tắc của dự án không cho tự ý bỏ tính năng đã lên kế hoạch. ADR này là bản ghi chính thức cho phần
bị cắt theo yêu cầu của chủ dự án.

## Quyết định

### Phần bị cắt (hoãn, chưa bỏ hẳn)

| Mục plan | Nội dung bị cắt                                                                            |
| -------- | ------------------------------------------------------------------------------------------ |
| 7.5, GĐ8 | Bố cục tablet 768–1023 px: tool rail dọc, options nổi, sheet Layers/History, Undo/Redo nổi |
| 7.5, GĐ8 | Bố cục điện thoại < 768 px: thanh tool dưới đáy, bottom sheet                              |
| 7.5, GĐ8 | Cử chỉ chạm: 2 ngón = Undo, 3 ngón = Redo, pinch zoom và 2 ngón pan trên màn hình cảm ứng  |
| 7.5      | Vùng chạm tối thiểu 44 × 44 px, handle đối tượng phóng to khi dùng cảm ứng                 |
| 7.5, 7.3 | Con trỏ hover của bút, chế độ "chỉ vẽ bằng bút" (cả mục trong hộp thoại Cài đặt)           |
| GĐ8      | Nghiệm thu thủ công trên iPad + Apple Pencil                                               |
| 11.2     | Thiết bị tham chiếu T1 (iPad + Safari) trong ma trận benchmark                             |
| 11.4     | Ưu tiên 2: Safari iPad/iPhone, Chrome Android; lượt thử iPad/iPhone ở mỗi mốc              |
| 10.3     | Web Share API chia sẻ file ảnh trên di động                                                |

Những gì đã có từ trước vẫn giữ nguyên và không bị gỡ: áp lực bút (GĐ2), `touch-action: none` trên
canvas, pinch trên trackpad bằng Ctrl+wheel (GĐ1), `100dvh`. App vẫn mở được trên tablet, nhưng chỉ
với bố cục desktop và không được kiểm thử.

### Phần giữ lại (giai đoạn gộp "GĐ8+9 laptop")

- **Trải nghiệm desktop (GĐ8, 7.6):** Command Palette (Ctrl+K, phím dự phòng `/`), Zen mode (`\`),
  toàn màn hình (Shift+F và nút trên top bar), mini toolbar cạnh vùng chọn/đối tượng.
- **Bố cục laptop 1024–1279 px (7.5):** panel phải thành ngăn trượt nổi và tự đóng khi vẽ. Đây là
  màn hình laptop nên không bị cắt.
- **PWA (GĐ8, ADR 0011):** precache app shell, manifest, thông báo khi có bản mới. Tắt mạng rồi
  reload vẫn dùng đầy đủ.
- **Accessibility (7.8):** axe không còn lỗi nghiêm trọng; rà soát điều hướng bàn phím, aria-live.
- **Phím tắt (7.7):** kiểm lại bảng phím trên Chrome, Edge, Firefox (Safari macOS nếu có máy).
- **GĐ9:** chạy ma trận benchmark trên máy hiện có, quyết định tiled storage (10.4), sửa điểm nghẽn có
  số đo; Grid, thước đo, căn chỉnh (P2); lưu nhanh ra file bằng File System Access API (P2); rà soát
  bảo mật và CSP; README hướng dẫn tự deploy và sao lưu.
- **Tính năng đã lên kế hoạch nhưng chưa giai đoạn nào làm**, cần có ở v1.0: bảng phím tắt mở bằng
  `?` (7.3), hộp thoại Cài đặt (7.3, trừ mục "chỉ vẽ bằng bút"), nhật ký lỗi cục bộ (10.3), bảng màu
  tự trích từ ảnh import (7.6), HUD đổi cỡ cọ bằng Alt + kéo chuột phải (7.6), danh sách đối tượng
  vector đọc được bằng trình đọc màn hình (7.8).
- **Còn lại từ GĐ3–GĐ7:** đo lại các ngoại lệ đã chấp nhận (ADR 0018, 0022, 0024), Firefox vẽ lại
  sau thao tác ảnh trên L, xem trước bộ lọc Firefox, kéo vùng làm mờ, `.paint` nướng vùng khảm/làm
  mờ, E2E WebKit chập chờn.

### Phụ thuộc mới

- `cmdk` (Command Palette) và `vite-plugin-pwa` + `workbox-window` (PWA) có sẵn trong mục 3.3.
- `@axe-core/playwright` (chỉ dev): không có trong mục 3.3, thêm theo ADR này vì nghiệm thu GĐ8 yêu cầu
  "axe không còn lỗi nghiêm trọng".

### Quyết định triển khai

1. **Canvas Engine tải lười**: `session.ts` import `Editor` động — engine thành chunk riêng (67,6 KB
   gzip), tải khi tạo/mở project đầu tiên và được tải trước lúc trình duyệt rảnh. JS khởi động giảm
   từ 240,7 KB (sau khi thêm tính năng GĐ8+9) xuống ~170 KB gzip; đây là phương án dự phòng đã ghi ở GĐ5.
2. **Lệnh cấp ứng dụng** (`commands/global.ts`): Command Palette, bảng phím tắt, Cài đặt, toàn màn
   hình, theme — dùng được cả ở trang chủ, gắn phím bằng cùng `ShortcutManager` (đã tổng quát hóa
   theo kiểu ngữ cảnh). Lệnh của Editor thêm cờ `palette: false` cho phím giữ, nudge, Esc.
3. **Command Palette** (`cmdk`, tải lười): lọc theo từ, không phân biệt dấu ("lam mo" → "Làm mờ"),
   không khớp mờ; lệnh chưa dùng được hiện mờ kèm lý do. Bảng phím tắt sinh từ Command Registry nên
   luôn khớp phím thật.
4. **Zen mode, toàn màn hình**: trạng thái trong `uiStore`; Zen ẩn top bar, tool island, options bar,
   panel, thanh trạng thái, chỉ còn một nút nổi; rời editor thì tự thoát Zen.
5. **Mini toolbar**: nổi cạnh vùng chọn pixel (Copy, Cắt xén, Tô, Che thông tin, Xóa; Áp dụng/Hủy
   khi pixel đang nổi) hoặc đối tượng (Lên trên, Xuống dưới, Xóa); chỉ ở tool Chọn, ẩn khi đang
   nhấn chuột trên canvas. "Che thông tin" là API mới `selection.redact()`: Redact phủ hình bao vùng
   chọn theo option Redact hiện tại.
6. **Laptop 1024–1279 px**: panel phải là ngăn nổi (`panelOverlayOpen`, không lưu, mặc định đóng, tự
   đóng khi nhấn chuột trên canvas); từ 1280 px giữ panel gắn cố định như cũ. Nhãn nút trên top bar
   thu gọn dưới 1280 px để vừa 1024 px.
7. **Cài đặt** (lưu trong IndexedDB `settings`, ghi ngay khi đổi): theme, ngôn ngữ (chỉ tiếng Việt),
   tự động lưu bật/tắt (tắt vẫn lưu khi Ctrl+S, ẩn tab, rời project), phần bộ nhớ cho lịch sử
   10/25/40% (`MemoryBudget.setHistoryShare`, giảm thì bỏ bước cũ ngay), cỡ lưới, lưu trữ bền vững,
   nhật ký lỗi.
8. **Nhật ký lỗi cục bộ** (`services/diagnostics/errorLog`): lỗi chưa xử lý của trang, lỗi render React,
   lỗi ghi autosave, lỗi thao tác ảnh của Engine (`EditorDeps.reportError`); lưu trong localStorage
   (tối đa 30 lỗi), 3 lỗi mới nhất kèm "hộp đen" input của Editor (1 500 sự kiện gần nhất) để phát lại
   bằng `__paint.replay()`. Không gửi đi đâu.
9. **Lưới, thước đo, căn chỉnh**: lưới vẽ trên overlay (ẩn khi hai đường < 6 px); thước đo bằng SVG
   (không tạo canvas ngoài `engine/memory`), canvas lùi vào 20 px khi bật; bám lưới làm tròn tọa độ của
   tool hình học — tool Chọn giữ điểm bấm để hit-test đúng rồi dời theo bội số lưới; căn chỉnh 6 kiểu
   (nhiều đối tượng theo hình bao chung, một đối tượng theo khung ảnh). Lưới/thước/bám lưới là cài
   đặt trình duyệt, không thuộc project.
10. **Lưu nhanh ra file** (Chromium): "Lưu ra file .paint…" mở hộp chọn ngay trong thao tác người dùng,
    rồi hỏi về vùng che như "Xuất .paint"; file gắn với project trong `ProjectMeta.fileLink` (handle
    lưu bằng structured clone). Ctrl+S lưu IndexedDB rồi ghi đè file, hỏi lại quyền nếu cần. Trình
    duyệt khác: tải file `.paint`.
11. **Bảng màu từ ảnh**: median cut trong Worker trên ảnh mẫu ≤ 64 px, gộp màu gần nhau, bỏ màu < 3%
    điểm ảnh, tối đa 6 màu; lưu trong `ProjectMeta.palette` (không thuộc document, không có history).
12. **HUD cọ**: Alt + kéo chuột phải (kéo ngang đổi cỡ theo bán kính trên màn hình, kéo dọc đổi độ
    cứng), `[` `]` hiện thoáng vòng tròn; menu chuột phải sau khi kéo bị bỏ qua.
13. **PWA**: `vite-plugin-pwa` generateSW, precache mọi file của bản build (JS, CSS, font, WASM, icon);
    hash route nên mọi điều hướng trả `index.html`; `registerType: 'prompt'` — toast "Lưu và tải lại".
    Service worker tắt trong bản bench và bản dev.
14. **`.paint` "áp dụng vĩnh viễn vùng che"** nay nướng đúng kiểu: tô kín, khảm (lưới căn theo góc
    vùng che), làm mờ (kèm phần đệm) — điểm còn treo của GĐ7.
15. **Accessibility**: nhãn và `aria-valuetext` của slider đặt trên thumb (`role="slider"`); `<kbd>`
    đọc bằng chữ ẩn thay vì `aria-label`; menu trên top bar, panel và thẻ project không modal (axe:
    phần trang bị `aria-hidden` vẫn focus được khi menu modal mở); panel Làm đẹp không làm mờ chữ khi
    tắt. Menu trên canvas (nút tách của tool island, options bar) giữ modal để lần bấm đóng menu không
    vẽ lên ảnh.

### Tối ưu có số đo (ổn định — GĐ9)

16. **`readPixels` ghép trên canvas GPU** rồi chỉ đọc ngược vùng cần đọc (trước đây ghép vào canvas
    CPU `willReadFrequently` khiến Chromium đọc ngược cả texture của mọi layer): đọc 1 pixel trên ảnh 4K
    × 5 layer 266 → 3 ms (lấy màu, mở project, Paint Bucket "mọi layer"); cùng sửa ở `backdrop` (ảnh nền
    Redact). Mở project M Chromium 3,26 → 1,33 s.
17. **Giải mã PNG của layer**: `unfilter` viết lại thành vòng riêng cho từng bộ lọc, không rẽ nhánh
    theo byte: mở project M Firefox 3,5 → 1,3 s (giải mã 5 layer 4K 3,3 → 1,2 s).
18. **Undo/redo biến đổi ảnh lớn**: bộ layer rời document chuyển sang hạng mục `temp` trước khi giải
    nén bộ quay lại — undo Canvas size trên L không còn bị "hết bộ nhớ layer" khi layer cũ đã được nén
    lúc rảnh (lỗi phụ thuộc thời điểm, thấy trên Firefox).

## Hệ quả

- Lộ trình rút từ 4 tuần (GĐ8 + GĐ9) xuống khoảng 2 tuần cho một giai đoạn.
- Nghiệm thu chỉ trên trình duyệt laptop: tắt mạng rồi reload vẫn dùng đầy đủ; axe không còn lỗi
  serious/critical; mọi ngưỡng bắt buộc đạt trên máy tham chiếu hiện có (D1); không còn bug P0/P1 đã
  biết; `docs/perf-baseline.md` được cập nhật.
- Muốn làm lại phần đã cắt: tạo giai đoạn mới theo mục 7.5 của plan. Kiến trúc không chặn việc đó:
  `InputManager` đã nhận Pointer Events cho cả bút và cảm ứng; bố cục chỉ là phần UI React.
