# Kiến trúc

Bản đồ nhanh để định hướng trong mã nguồn. Lý do của từng lựa chọn nằm ở
[DECISIONS.md](./DECISIONS.md) (số ADR được ghi trong ngoặc).

## Tổng quan

- Web app **100% frontend**, deploy như trang tĩnh. Ảnh không rời khỏi máy: mọi xử lý và lưu trữ ở
  phía client (IndexedDB).
- Canvas Engine tự viết bằng TypeScript thuần trên Canvas 2D (0002), tách hẳn khỏi React.
- Render theo yêu cầu (không vòng lặp liên tục), chi phí mỗi frame tỉ lệ với kích thước màn hình.

```
UI (React)  ──lệnh──▶  Command Registry  ──▶  Editor (Engine, TS thuần)
   ▲                                             │ phát sự kiện
   └──── Zustand (bản sao để hiển thị) ◀── engine-bridge
                                                 │
                         Services: workers · storage · io · platform (qua EditorDeps)
```

| Lớp      | Thư mục                          | Vai trò                                                                                      |
| -------- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| UI shell | `src/app/`, `src/components/ui/` | Bố cục, panel, dialog, theme, i18n. Không chạm pixel; đổi state Engine qua API hoặc Command  |
| Commands | `src/commands/`                  | Mọi thao tác (nút, phím tắt, menu, Command Palette) đi qua registry: id, nhãn, phím, `run`   |
| Stores   | `src/stores/`                    | Zustand: state UI + bản sao chỉ đọc từ Engine. Không bao giờ là nguồn sự thật (0004)         |
| Engine   | `src/engine/`                    | Nguồn sự thật cho document, layer, tool, màu, viewport, selection. Không import React/stores |
| Services | `src/services/`                  | Worker pool, IndexedDB, import/export, nhận diện tính năng. Tiêm vào Engine qua `EditorDeps` |

ESLint ép ranh giới: `engine/` không được import `app/`, `stores/`, `services/`, `components/`; canvas
chỉ được tạo trong `engine/memory` (0007) hoặc Worker.

## Engine (`src/engine/`)

| Module      | Trách nhiệm                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------- |
| `core`      | `Editor` (facade), `Document`, `EventBus`, Options/Colors API, kiểu dữ liệu (`types.ts`)        |
| `memory`    | `MemoryBudget` + chuỗi thu hồi, `createSurface`, `GrowableSurface`, `ScratchPool` (0007)        |
| `viewport`  | Ma trận document → screen, zoom quanh con trỏ, DPR                                              |
| `input`     | Chuẩn hóa Pointer Events (coalesced, áp lực bút), wheel, pinch trackpad, ghi/phát lại input     |
| `tools`     | `ToolManager` + mỗi tool một file: brush, pencil, bucket, gradient, eyedropper, selection, crop |
| `layers`    | `RasterLayer`, `VectorLayer`, `LayerManager`; `objects/` chứa renderer từng loại đối tượng      |
| `history`   | Command stack, tile 256×256 trên GPU (`TileStore`), nén bước cũ (0005, 0016)                    |
| `render`    | `Renderer` (vùng bẩn, overlay), `Compositor` (dùng chung cho màn hình, export, merge), cache    |
| `selection` | Path/mask, marching ants, pixel nổi (0025)                                                      |
| `document`  | `ImageOps`: crop, Trim, Resize, Canvas size, xoay, lật                                          |
| `filters`   | Đặc tả tham số, nhân blur dùng chung với Worker, `FilterRunner` (xem trước + áp dụng) (0026)    |

### Luồng một nét vẽ

1. `InputManager` đổi Pointer Event sang tọa độ document → `ToolManager`.
2. Brush tạo `BrushStroke` trên stroke buffer dùng chung (0017).
3. Mỗi `pointermove`: nội suy Catmull-Rom, vẽ vào stroke buffer, chép tile lần đầu bị chạm vào
   `TileStore`, báo vùng bẩn.
4. Renderer (rAF) chỉ vẽ vùng bẩn; layer đang vẽ được ghép với stroke buffer.
5. `pointerup`: `PaintCommand` ghép buffer vào layer → `History`, `document.rev++`.

### Layer và ghép ảnh

- Layer raster = `drawImage` với opacity + blend (16 blend mode). Layer chú thích vẽ từng đối tượng
  trực tiếp với ma trận hiện tại nên sắc ở mọi zoom (0020); opacity < 1 dùng pass-through, blend khác
  `normal` ghép nhóm cách ly (0023).
- Cache màn hình: Below cache (nền + layer dưới), Above cache (layer trên), mipmap ½ ¼ khi thu nhỏ ảnh
  > 4K. Dựng lười theo ô 256 px, luôn có đường vẽ trực tiếp (0006, 0023).
- Chuỗi thu hồi bộ nhớ: mipmap → cache → nén history → bỏ bước cũ nhất (giữ ≥ 10) → từ chối có
  thông báo. Dữ liệu layer không bao giờ bị thu hồi.

### Đối tượng chú thích

- Đối tượng là giá trị bất biến; `ObjectCommand` giữ tham chiếu trước/sau, undo không tốn canvas.
- Thêm loại = một nhánh union trong `types.ts` + một `ObjectRenderer` (vẽ, hình bao, hit-test, handle)
  đăng ký trong `objectRegistry`.
- Redact khảm/làm mờ, Magnifier đọc ảnh nền qua `render/backdrop` (đồng bộ, có cache); Spotlight gộp
  vùng sáng; Step tự đánh số (0027).
- Chữ: `TextEditOverlay` đặt một `<textarea>` thật chồng lên canvas nên bộ gõ tiếng Việt chạy như mọi
  ô nhập liệu; khi xong ghi bằng `ObjectCommand`, vẽ bằng `fillText`.

## Worker (`src/services/workers/`)

Pool 2–4 Worker (`hardwareConcurrency − 1`), tạo lười, hàng đợi FIFO, hủy bằng `AbortSignal`. Một
entry duy nhất `image.worker` chứa: flood fill scanline, PNG RGBA (0021), zip, mask vùng chọn, filter
thuần (mỗi filter một file + `pipeline.ts`), bảng màu (median cut), nướng vùng che vào `.paint`. Việc
lớn chia dải theo `WorkerClient.concurrency`. Test dùng `inlineWorkerClient` với cùng hàm thuần.

## Lưu trữ (`src/services/storage/`)

IndexedDB `paint-online`: `projects`, `documents`, `layerBlobs`, `thumbnails`, `checkpoints`,
`settings`, `session`. Schema validate bằng valibot (`schema.ts`), migration theo phiên bản.

```
Editor ──documentChanged──▶ Autosave (debounce 1,5 s / tối đa 10 s; tab ẩn, pagehide, Ctrl+S)
  1. Chụp   (main, đồng bộ): serialize() + ImageBitmap của layer có contentRev mới
  2. Mã hóa (Worker): PNG RGBA tự mã hóa + ảnh thu nhỏ 320 px
  3. Ghi    (một transaction): từ chối revision cũ, xóa blob layer đã bỏ
```

- **Lỗi:** hết quota → xóa checkpoint, thử lại, rồi "Hết dung lượng"; lỗi tạm thời → thử lại 2 s, 5 s,
  15 s; kết nối đóng → mở lại và lưu toàn bộ.
- **Một tab ghi:** Web Locks `paint-online:project:<id>`; tab khác mở chỉ đọc, "Chỉnh sửa ở tab này"
  xin tab kia nhả khóa.
- **Phiên:** bản ghi `session` + token thoát sạch trong localStorage → banner khôi phục ở trang chủ.
- **Vòng đời project** (`app/editor/session.ts`): mỗi lúc một Editor; Canvas Engine được import động
  (trang chủ không tải engine).

## Import, export (`src/services/io/`)

- `.paint` = ZIP (`manifest.json` + PNG từng layer + `thumbnail.png`) (0010). Nhập: ≤ 200 mục,
  ≤ 1 GB giải nén, đường dẫn an toàn, giải mã trong Worker có timeout.
- Xuất ảnh PNG/JPG/WebP, tỉ lệ 0,5×–2×, ước lượng dung lượng bằng mã hóa thật; Safari dùng encoder
  WASM `@jsquash/webp` tải lười.
- Lưu nhanh ra file (`fileSave.ts`): File System Access API trên Chromium, Ctrl+S ghi đè file đã chọn.

## UI (`src/app/`)

| Thư mục          | Nội dung                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `home/`          | Trang chủ: thả ảnh/`.paint`, preset kích thước, lưới project, tìm kiếm, thùng rác, banner                       |
| `editor/`        | `EditorScreen`, `CanvasView`, `ToolIsland`, `OptionsBar` (sinh từ OptionSchema), `MiniToolbar`, menu, clipboard |
| `editor/panels/` | Panel phải: Layers (kéo thả bằng dnd-kit), History, danh sách đối tượng đọc được bằng trình đọc màn hình        |
| `screenshot/`    | Panel Làm đẹp của chế độ Screenshot                                                                             |
| `dialogs/`       | Xuất ảnh, `.paint`, Resize, Canvas size, bảng điều chỉnh, bảng phím tắt, Cài đặt                                |
| `palette/`       | Command Palette (`cmdk`, tải lười, lọc không dấu: "lam mo" → "Làm mờ")                                          |
| `layout/`        | Top bar, phím tắt cấp ứng dụng                                                                                  |
| `dev/`           | Công cụ `__paint` (chỉ có trong bản dev)                                                                        |

Khác: `engine-bridge.ts` (sự kiện Engine → Zustand), `pwa.ts` (service worker, toast "Có bản mới"),
`services/diagnostics/errorLog` (nhật ký lỗi cục bộ kèm 1 500 sự kiện input gần nhất để phát lại).

## Kiểm thử

| Tầng        | Vị trí                               | Chạy                   |
| ----------- | ------------------------------------ | ---------------------- |
| Unit (Node) | `src/**/*.test.ts`                   | `npm test`             |
| Component   | `src/**/*.test.tsx` (jsdom)          | `npm test`             |
| Browser     | `src/**/*.browser.test.ts`, 3 engine | `npm run test:browser` |
| E2E         | `tests/e2e/`, Playwright, CSP thật   | `npm run test:e2e`     |
| Benchmark   | `tests/bench/`                       | `npm run bench`        |

Chi tiết lệnh và ngưỡng hiệu năng: [DEVELOPMENT.md](./DEVELOPMENT.md).
