# 0002 — Canvas 2D API với engine tự viết

- **Trạng thái:** Chấp nhận (mục Tóm tắt, 3.1, 3.2)
- **Ngày:** 2026-10-17

## Bối cảnh

Phần khó nhất của app Paint — brush raster, flood fill, selection mask, filter, undo theo pixel,
compositing nhiều layer — nằm ngoài những gì Fabric.js hay Konva.js cung cấp. Thế mạnh của hai thư
viện này (scene graph đối tượng, handle transform, text) chỉ phục vụ layer vector với 8–10 loại đối
tượng đơn giản.

## Quyết định

- Viết Canvas Engine riêng trên **Canvas 2D API + OffscreenCanvas**; không dùng Fabric, Konva hay
  WebGL/WebGPU ở v1.
- **Không dùng `ctx.filter`** (chưa Baseline, Safari thiếu): mọi filter viết bằng TypeScript trên
  `ImageData`, chạy trong Worker, cho kết quả giống hệt nhau trên mọi trình duyệt.
- Engine là TypeScript thuần, không phụ thuộc React — ép bằng ESLint `no-restricted-imports`.

## Hệ quả

- Tốn công ban đầu (handle transform, text overlay ~1–2 tuần) nhưng chỉ có **một** hệ render và
  **một** hệ undo; export, blend mode, autosave, history nhất quán tuyệt đối.
- Xem xét lại nếu sau v1.0 sản phẩm chuyển sang thiết kế vector nặng (có thể nhúng Konva riêng cho
  loại layer đó).
