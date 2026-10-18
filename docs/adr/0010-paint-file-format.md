# 0010 — File `.paint` = ZIP (manifest + PNG từng layer)

- **Trạng thái:** Chấp nhận (mục Tóm tắt, 6.5, 10.2)
- **Ngày:** 2026-10-17

## Quyết định

- ZIP (`fflate`) gồm `manifest.json` (`format: 'paint-online'`, `formatVersion`, `DocumentRecord`),
  `layers/<layerId>.png`, `thumbnail.png`.
- Import: validate `manifest.json` bằng `valibot`, giới hạn ≤ 200 mục, ≤ 1 GB giải nén, kiểm tra
  đường dẫn; ảnh layer đi qua đường decode an toàn.
- Export `.paint` có đối tượng Redact → cảnh báo và đề nghị áp dụng vĩnh viễn vùng che.

## Hệ quả

- Sao lưu, chuyển máy, mở được bằng công cụ giải nén thông thường.
