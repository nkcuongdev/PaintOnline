# 0019 — Màu của chú thích theo màu chính/phụ; mở rộng tool options

- **Trạng thái:** Chấp nhận
- **Ngày:** 2026-10-17 (GĐ2)
- **Liên quan:** mục 4.2, 6.2, 6.3, 7.2

## Bối cảnh

Mục 6.3 phác thảo `shape: { stroke: Stroke; fill: Color | null; cornerRadius }` và
`text: { family; size; weight; align }`, tức màu viền và màu tô nằm trong option riêng của nhóm
shape. Khi hiện thực, cách đó tạo hai nguồn màu song song: bảng màu trên tool island (màu chính/phụ
— mục 4.2, `editor.colors`) không áp dụng cho hình và chữ, người dùng phải chỉnh màu ở hai nơi.
Plan cũng yêu cầu "Options bar sinh từ OptionSchema" với control dạng slider/select/toggle — màu
lồng trong `stroke.color` không có control tương ứng.

Mũi tên cần thêm thuộc tính (kiểu đầu, hai đầu); Highlight cần màu dạ quang (vẽ bằng `multiply`,
màu tối như đen sẽ thành khối đen).

## Quyết định

- **Màu viền/màu chữ = màu chính, màu tô/nền chữ = màu phụ** — quy ước của MS Paint. Option chỉ
  giữ phần không phải màu:
  - `shape: { strokeWidth, fill: boolean, cornerRadius, dashed, shadow }` (Rectangle — gồm bo góc,
    Ellipse, Line, Polygon);
  - `arrow: { strokeWidth, head: 'triangle' | 'open' | 'none', bothEnds, dashed, shadow }`;
  - `text: { family, size, weight, italic, align, background: boolean, outline: boolean }`;
  - `highlight: { color }` — chọn trong 5 màu dạ quang.
- Đối tượng vẫn lưu màu cụ thể theo đúng mục 6.2 (`stroke.color`, `fill`, `color`, `background`):
  màu chỉ được lấy từ màu chính/phụ **lúc tạo**. Chọn màu khi đang có đối tượng được chọn (hoặc
  đang gõ chữ) sẽ đổi màu đối tượng đó (`editor.pickColor`).
- Option lồng nhau (`brush.pressure.size`) được khai báo trong schema bằng khóa `pressure.size`;
  `validateOptions` validate từng cấp.
- Màu đang kéo trong bộ chọn màu là "tạm thời" (`setPrimary(c, { transient: true })`): không ghi
  vào "màu gần đây" cho tới khi thả chuột.

## Hệ quả

- Một nguồn màu duy nhất cho mọi tool; Options bar dùng chung schema cho tool và cho thuộc tính
  đối tượng đang chọn.
- Schema IndexedDB (GĐ3) lưu đối tượng theo mục 6.2 không đổi; chỉ phần tool options lưu trong
  settings có hình dạng như trên.
