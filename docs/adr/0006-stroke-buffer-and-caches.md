# 0006 — Stroke buffer và cache composite dưới/trên

- **Trạng thái:** Chấp nhận (mục Tóm tắt, 5.2, 5.5)
- **Ngày:** 2026-10-17

## Quyết định

- Nét đang vẽ được vẽ vào **stroke buffer** chỉ phủ vùng nét; commit vào layer khi `pointerup`.
- Khi có ≥ 2 layer hiển thị phía dưới/trên layer đang vẽ, dùng **Below/Above cache** để số bề mặt
  ghép mỗi frame gần như không phụ thuộc số layer. Layer phía trên có blend khác `normal` → bỏ Above
  cache, ghép từng layer.
- Cache là tùy chọn, không phải điều kiện đúng: renderer luôn có đường vẽ trực tiếp; cache có thể bị
  MemoryBudget thu hồi bất cứ lúc nào.
- Không dùng `willReadFrequently` cho layer surface.

## Hệ quả

- Giữ cache hay không được chốt bằng benchmark GĐ4 (bỏ nếu chênh lệch < 20%). **GĐ4: giữ** — kịch bản
  M với 5 và 20 layer chênh lệch ≥ 20% (Firefox frame p95 khi vẽ −32%, Chromium pan −35–66%); hiện
  thực dựng lười theo ô, dựng dần lúc rảnh (ADR 0023, docs/perf-baseline.md).
