# 0004 — Engine là nguồn sự thật, Zustand chỉ giữ bản sao

- **Trạng thái:** Chấp nhận (mục Tóm tắt, 4.1, 4.2)
- **Ngày:** 2026-10-17

## Bối cảnh

Nếu React/Zustand giữ state ảnh hưởng tới render, mỗi nét vẽ sẽ kéo theo re-render và engine phải
đọc store — gây giật và ràng buộc engine vào UI.

## Quyết định

- Engine sở hữu document, layer, tool đang chọn, tool options, màu chính/phụ, viewport, selection.
- `Editor` là điểm vào duy nhất: `execute`, `tools.setActive`, `options.set`, `colors.setPrimary`,
  `viewport.zoomTo`, `on(event)`.
- Luồng một chiều: UI → Editor API/Command → Engine validate + phát sự kiện → `engine-bridge` →
  Zustand → UI. `toolOptionsChanged` cập nhật đồng bộ; sự kiện khác gộp theo `requestAnimationFrame`;
  `viewportChanged` throttle 100 ms.
- Phụ thuộc vào Engine qua `EditorDeps` (workers, memory, platform, initialOptions).

## Hệ quả

- Không re-render React khi vẽ; Engine test được độc lập với phụ thuộc giả.
- `stores/` không bao giờ là nguồn sự thật cho state của Engine (quy tắc 13.1.3).
