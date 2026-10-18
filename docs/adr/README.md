# Architecture Decision Records

Mỗi quyết định lớn một file. ADR 0001–0012 ghi lại các quyết định trong mục _Tóm tắt các quyết
định cốt lõi_ của Implementation Plan; từ 0013 là quyết định phát sinh khi triển khai.

Khi phải lệch khỏi kế hoạch (quy tắc 13.1.2) hoặc thêm phụ thuộc ngoài mục 3.3 (quy tắc 13.1.11),
viết ADR mới theo mẫu: **Bối cảnh → Quyết định → Hệ quả**, kèm trạng thái.

| #                                                | Quyết định                                                       | Trạng thái |
| ------------------------------------------------ | ---------------------------------------------------------------- | ---------- |
| [0001](./0001-web-app-100-frontend.md)           | Web app 100% frontend, dùng cá nhân, desktop trước               | Chấp nhận  |
| [0002](./0002-canvas-2d-custom-engine.md)        | Canvas 2D + engine tự viết, không Fabric/Konva                   | Chấp nhận  |
| [0003](./0003-hybrid-raster-vector-layers.md)    | Hai loại layer: raster và vector                                 | Chấp nhận  |
| [0004](./0004-engine-source-of-truth.md)         | Engine là nguồn sự thật, Zustand chỉ giữ bản sao                 | Chấp nhận  |
| [0005](./0005-tile-based-undo.md)                | Undo/Redo bằng Command + diff tile 256×256                       | Chấp nhận  |
| [0006](./0006-stroke-buffer-and-caches.md)       | Stroke buffer + cache composite dưới/trên                        | Chấp nhận  |
| [0007](./0007-memory-budget.md)                  | MemoryBudget trung tâm, giới hạn theo tier thiết bị              | Chấp nhận  |
| [0008](./0008-workers-for-heavy-processing.md)   | Web Worker + OffscreenCanvas, WASM chỉ cho WebP                  | Chấp nhận  |
| [0009](./0009-indexeddb-atomic-autosave.md)      | IndexedDB, autosave theo revision, ghi nguyên tử                 | Chấp nhận  |
| [0010](./0010-paint-file-format.md)              | File `.paint` = ZIP (manifest + PNG)                             | Chấp nhận  |
| [0011](./0011-pwa-optional.md)                   | PWA/offline là lớp bổ sung                                       | Chấp nhận  |
| [0012](./0012-roadmap-usable-after-gd3.md)       | Lộ trình: bản dùng hằng ngày sau GĐ3                             | Chấp nhận  |
| [0013](./0013-typescript-6.md)                   | Ghim TypeScript 6.0 thay vì 7.0                                  | Chấp nhận  |
| [0014](./0014-additional-dependencies.md)        | Phụ thuộc bổ sung ngoài mục 3.3                                  | Chấp nhận  |
| [0015](./0015-theme-bootstrap.md)                | Áp theme trước lần vẽ đầu bằng localStorage                      | Chấp nhận  |
| [0016](./0016-gpu-tile-history.md)               | Tile history lưu trên GPU (TileStore)                            | Chấp nhận  |
| [0017](./0017-render-sampling-and-buffers.md)    | Lấy mẫu `low`, vẽ vùng con, stroke buffer dùng chung             | Chấp nhận  |
| [0018](./0018-firefox-accelerated-canvas.md)     | Firefox canvas WebGL: giai đoạn khởi động ở ảnh lớn              | Chấp nhận  |
| [0019](./0019-annotation-colors-and-options.md)  | Màu chú thích theo màu chính/phụ; mở rộng tool options           | Chấp nhận  |
| [0020](./0020-vector-layer-rendering.md)         | Layer chú thích vẽ trực tiếp; layer hoạt động ngoài history      | Chấp nhận  |
| [0021](./0021-storage-implementation.md)         | PNG RGBA tự mã hóa, ArrayBuffer trong IndexedDB, thoát sạch      | Chấp nhận  |
| [0022](./0022-full-save-exception.md)            | Lượt lưu đầy đủ nhiều layer 4K: ngoại lệ ngưỡng 3 s              | Chấp nhận  |
| [0023](./0023-layer-system-implementation.md)    | GĐ4: ghép layer chú thích, cache dựng lười, thu hồi, nén history | Chấp nhận  |
| [0024](./0024-tiled-storage-decision.md)         | Không làm tiled layer storage ở GĐ4, đo lại ở GĐ9                | Chấp nhận  |
| [0025](./0025-selection-and-image-transforms.md) | GĐ5: vùng chọn ngoài history, pixel nổi, biến đổi ảnh theo dải   | Chấp nhận  |
| [0026](./0026-filters-and-adjustments.md)        | GĐ6: filter thuần trong Worker, xem trước thích ứng, Gradient    | Chấp nhận  |
| [0027](./0027-screenshot-editor.md)              | GĐ7: Redact khảm/làm mờ đồng bộ, chế độ Screenshot, Làm đẹp      | Chấp nhận  |
