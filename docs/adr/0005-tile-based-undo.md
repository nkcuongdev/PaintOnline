# 0005 — Undo/Redo bằng Command + diff theo tile 256×256

- **Trạng thái:** Chấp nhận (mục Tóm tắt, 5.6)
- **Ngày:** 2026-10-17

## Quyết định

- Mọi thay đổi document là một `Command` (`execute`, `undo`, `memoryBytes`, `mergeWith?`).
- `PaintCommand` chỉ lưu tile 256×256 bị chạm, **một phiên bản tại một thời điểm** (kỹ thuật hoán
  đổi): giữ bản trước khi tạo; undo chụp bản sau rồi ghi bản trước; redo làm ngược lại.
- History là một hạng mục của MemoryBudget (≤ 25%), tối đa 100 bước, luôn giữ ≥ 10 bước; tile cũ
  hơn 10 bước được nén deflate trong Worker.
- History **không** lưu vào IndexedDB ở v1.

## Hệ quả

- Một nét nhỏ trên ảnh 4K tốn 1–5 MB thô thay vì 33 MB.
- Hạn chế vòng đọc-ghi `getImageData/putImageData` để tránh sai lệch alpha nhân trước; có test hồi
  quy so pixel sau nhiều lần undo/redo.
