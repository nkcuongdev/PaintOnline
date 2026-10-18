# 0008 — Web Worker + OffscreenCanvas cho xử lý nặng

- **Trạng thái:** Chấp nhận (mục Tóm tắt, 5.8)
- **Ngày:** 2026-10-17

## Quyết định

- Pool 2–4 Worker (`hardwareConcurrency − 1`, tối đa 4), giao tiếp qua `comlink`, dữ liệu là
  `ArrayBuffer`/`ImageBitmap` transferable.
- Worker không giữ state giữa các lần gọi (trừ cache WASM), không truy cập DOM.
- Flood fill scanline, filter (LUT, box blur 3 lượt O(n)), encode/decode, zip đều chạy trong Worker.
- WASM chỉ dùng cho encoder WebP trên Safari (`@jsquash/webp`, lazy-load).

## Hệ quả

- UI không treo khi xử lý ảnh lớn; xem trước filter trên bản thu nhỏ ≤ 1 MP.
- Worker là luồng riêng không có MemoryBudget nên được phép tạo OffscreenCanvas cục bộ
  (ngoại lệ ESLint cho `src/services/workers/`).
