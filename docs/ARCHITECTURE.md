# Kiến trúc Paint Online

Tóm tắt mục 4–6 của _Paint Online — Implementation Plan_. Bản kế hoạch là tài liệu kỹ thuật
chính; file này là bản đồ nhanh để định hướng trong mã nguồn. Mọi thay đổi so với kế hoạch được
ghi thành ADR trong [`docs/adr/`](./adr/README.md).

## Định hướng

- Web app **100% frontend**, deploy như trang tĩnh. Không backend, tài khoản, analytics,
  Electron/Tauri.
- Trình duyệt desktop là trải nghiệm chính; tablet/điện thoại được hỗ trợ responsive.
- Ảnh không rời khỏi máy: mọi xử lý và lưu trữ ở phía client (IndexedDB).

## Năm lớp, luồng một chiều

```
UI (React)  ──lệnh──▶  Command Registry  ──▶  Editor (Engine, TS thuần)
   ▲                                             │ phát sự kiện
   └──── Zustand (bản sao để hiển thị) ◀── engine-bridge
                                                 │
                         Services: workers · storage · io · platform (qua EditorDeps)
```

1. **UI shell** (`src/app/`, `src/components/ui/`) — bố cục, panel, dialog, theme, i18n. Không chạm
   pixel; đổi state Engine qua `editor.options`, `editor.colors`, `editor.tools` hoặc Command.
2. **Commands** (`src/commands/`) — mọi thao tác (nút, phím tắt, menu, Command Palette) đi qua
   registry: `id`, nhãn, icon, phím tắt, `enabled`, `run`.
3. **Stores** (`src/stores/`) — Zustand: state thuần UI + bản sao chỉ đọc từ Engine. Không bao giờ
   là nguồn sự thật cho state của Engine.
4. **Engine** (`src/engine/`) — TypeScript thuần, **không import React, Zustand, `app/`, `stores/`,
   `services/`, `components/`** (ESLint `no-restricted-imports` ép buộc). Là nguồn sự thật cho
   document, layer, tool, option, màu, viewport, selection.
5. **Services** (`src/services/`) — Worker pool, IndexedDB, import/export, feature detection.
   Được tiêm vào Engine qua `EditorDeps`.

## Engine (mục 5)

| Module             | Trách nhiệm                                                             |
| ------------------ | ----------------------------------------------------------------------- |
| `engine/core`      | `Editor` (facade), `Document`, `EventBus`, Options/Colors API, kiểu     |
| `engine/memory`    | `MemoryBudget`, `createSurface`, `GrowableSurface` — **mọi canvas**     |
| `engine/viewport`  | Ma trận `DOMMatrix` document→screen, zoom quanh con trỏ, DPR            |
| `engine/input`     | Chuẩn hóa Pointer Events, coalesced events, cử chỉ                      |
| `engine/tools`     | `ToolManager` + mỗi tool một file, đăng ký qua registry                 |
| `engine/layers`    | Layer raster (surface lười, căn 256 px) và vector (đối tượng chú thích) |
| `engine/history`   | Command stack, diff theo tile 256×256, kỹ thuật hoán đổi                |
| `engine/render`    | Render theo vùng bẩn, Below/Above cache, mipmap, overlay                |
| `engine/selection` | Path/mask, marching ants, floating selection                            |

Nguyên tắc: render theo yêu cầu (không vòng lặp liên tục), chi phí mỗi frame tỉ lệ với kích thước
màn hình; mọi thay đổi document đi qua Command, vào history và tăng `document.rev`.

## Dữ liệu (mục 6)

- Kiểu lõi nằm trong [`src/engine/core/types.ts`](../src/engine/core/types.ts); bản ghi lưu trữ
  và schema validate (valibot) trong [`src/services/storage/schema.ts`](../src/services/storage/schema.ts).
- IndexedDB `paint-online`: `projects`, `documents`, `layerBlobs`, `thumbnails`, `checkpoints`,
  `settings`, `session` — migration theo phiên bản ở `migrations.ts`.
- Autosave theo revision, single-flight, một transaction nguyên tử mỗi lượt; checkpoint dự phòng.
- File `.paint` = ZIP gồm `manifest.json` + PNG từng layer + `thumbnail.png`.

## Lưu trữ và autosave (mục 6.4–6.6) — GĐ3

```
Editor ──documentChanged──▶ Autosave (debounce 1,5 s / tối đa 10 s; tab ẩn, pagehide, Ctrl+S, đóng)
  1. Chụp   (main, đồng bộ): editor.serialize() + editor.captureLayers(saved) → ImageBitmap
            của layer có contentRev mới (createImageBitmap chụp ngay — test quyết định 10.4)
  2. Mã hóa (Worker): PNG RGBA tự mã hóa (ADR 0021) + ảnh thu nhỏ 320 px
  3. Ghi    (một transaction projects + documents + layerBlobs + thumbnails): từ chối revision cũ
            hơn, xóa blob layer đã bỏ, kiểm tra layer "đã lưu" thật có trong DB
```

- **Revision**: `document.rev` tăng sau mỗi Command (kể cả undo/redo); mở lại project thì đếm tiếp
  từ revision đã lưu. `contentRev` của layer lấy từ một bộ đếm chung nên không bao giờ trùng giá
  trị cũ (redo rasterize, vẽ lại sau undo).
- **Lỗi** (bảng ở 6.6): hết quota → xóa checkpoint, thử lại một lần, rồi trạng thái "Hết dung lượng"
  (hộp thoại gợi ý, tự thử lại khi có chỗ); lỗi tạm thời → 2 s, 5 s, 15 s rồi "Lỗi lưu" (Thử lại);
  kết nối đóng → mở lại, lưu lại toàn bộ; mã hóa lỗi → mã hóa từng layer; revision cũ hơn → xung đột.
  Điểm chèn lỗi `Database.faults.beforeCommit` cho test fault-injection.
- **Một tab ghi**: Web Locks `paint-online:project:<id>` (fallback BroadcastChannel); tab không giữ
  khóa mở chỉ đọc (`editor.setReadOnly`), "Chỉnh sửa ở tab này" xin tab kia lưu và nhả khóa (quá
  5 s thì lấy hẳn), rồi mở lại project từ DB.
- **Phiên làm việc**: bản ghi `session` (project, khung nhìn, tool, `cleanExit`) + token thoát sạch
  trong localStorage (ADR 0021) → banner khôi phục ở trang chủ, toast "đã khôi phục bản lưu lúc…".
- **Mở project**: đọc + validate bản ghi; giải mã từng layer trong Worker (timeout 10 s); layer hỏng
  thành layer trống kèm cảnh báo; bản ghi hỏng → đề nghị mở checkpoint.
- **Vòng đời** (`app/editor/session.ts`): mỗi lúc một Editor; về trang chủ = lưu `strict` +
  checkpoint + nhả khóa; không lưu được thì giữ project trong tab (không mất bài).
- **Cài đặt** (`settings` store): tool options + màu (debounce 1 s), bảng màu tùy chỉnh, lựa chọn
  layer đích đã nhớ → `EditorDeps.initialOptions` khi mở project.

## File .paint và xuất ảnh (mục 6.5, 10.2) — GĐ3

- Xuất: dữ liệu từ Editor (project đang mở) hoặc bản đã lưu → ZIP trong Worker (`fflate`, PNG lưu
  nguyên). Có Redact → cảnh báo, "Áp dụng vĩnh viễn vùng che" thay pixel dưới vùng che trong file.
- Nhập: ≤ 200 mục, ≤ 1 GB sau giải nén (đếm byte thật), đường dẫn an toàn, manifest validate bằng
  valibot (bỏ trường lạ), mỗi PNG layer kiểm tra header + giải mã trong Worker có timeout → project
  mới (id mới).
- Xuất ảnh: PNG/JPG/WebP, chất lượng, tỉ lệ 0,5×–2×, nền JPG, ước lượng dung lượng bằng mã hóa thật
  và xem trước; WebP sai định dạng (Safari) → encoder WASM `@jsquash/webp` tải lười trong Worker.

## Layer, cache và bộ nhớ (mục 5.2, 5.4, 5.6, 5.11) — GĐ4

- **Panel Layers/History** (`app/editor/panels/`) chỉ đọc bản sao trong documentStore và gọi
  `editor.layers.*` / `editor.historyGoTo`. Mọi thao tác là Command (`LayerManager` →
  `AddLayer`, `RemoveLayer`, `MoveLayer`, `LayerProps`, `ReplaceLayers`, `SetObjects`,
  `Transaction`); kéo slider opacity gộp thành một bước.
- **Ghép layer** (`render/Compositor`): layer raster = `drawImage` với opacity + blend
  (`globalCompositeOperation`); layer chú thích: vẽ thẳng / pass-through (opacity < 1) / ghép
  cách ly (blend khác normal) — ADR 0023. Merge Down dùng chính hàm ghép này để vẽ layer trên vào
  layer dưới.
- **Cache màn hình** (`render/layerCaches`, `render/cache`): Below cache (nền + layer dưới),
  Above cache (layer trên khi không layer nào phụ thuộc nền), mipmap ½ ¼ khi thu nhỏ ảnh > 4K —
  bề mặt dẫn xuất dựng lười theo ô 256 px, vô hiệu theo chữ ký cấu trúc + `contentRev` + vùng của
  Command. Luôn có đường vẽ trực tiếp.
- **Chuỗi thu hồi** (`MemoryBudget.reclaim`): mipmap → cache → (cache vector: không có) → nén
  history → bỏ bước cũ nhất (giữ ≥ 10); rồi từ chối có thông báo. Dữ liệu layer không bao giờ bị
  thu hồi.
- **Nén history** (`history/archive`): bước cũ hơn 10 bước và layer đã rời document được nén zlib
  trong Worker lúc rảnh (`WorkerClient.compressPixels`), giải nén đồng bộ khi undo/redo tới.

## Vùng chọn và biến đổi ảnh (mục 5.5, 5.7, 2) — GĐ5

- **Vùng chọn** (`engine/selection`): `Selection` giữ path (chữ nhật, elip, Lasso) hoặc mask alpha
  dựng trong Worker (`WorkerClient.buildMask`: kết hợp thêm/bớt/giao, làm mềm biên, marching squares
  cho viền). `SelectionManager` (Editor sở hữu, tool dùng qua `ToolContext.selection`) giữ vùng chọn,
  vẽ marching ants, nhấc pixel thành `FloatingSelection`, commit thành **một** PaintCommand (hoặc
  AddLayerCommand khi dán), copy/cắt/xóa/tô. Vùng chọn không vào history (ADR 0025).
- **Cắt nét theo vùng chọn**: `commitStroke` áp `destination-in` lên stroke buffer trước khi ghi;
  Compositor cắt bản xem trước (`StrokePreview.clip`) — brush, pencil, eraser, bucket đều qua đường này.
- **Pixel nổi trên màn hình**: `FloatingPreview` trong `CompositeOptions` — layer gốc có lỗ + nội
  dung đã biến đổi, hoặc "layer mới" ngay trên layer hoạt động (ảnh dán/thả).
- **Biến đổi ảnh** (`engine/document/ImageOps`, `history/commands/DocumentCommand`): crop, Trim,
  Resize (GPU, thu nhỏ từng nửa), Canvas size (neo 9 hướng), xoay 90°/180°, lật — cả ảnh hoặc một
  layer. Layer mới dựng từng layer theo dải, nhường main thread; dựng trong hạng mục `temp` rồi chuyển
  sang `layer`; layer cũ là snapshot cho undo, nén theo dải lúc rảnh. Đối tượng chú thích biến đổi
  theo ma trận (`layers/objects/transform`).
- **Clipboard** (`app/editor/clipboard`): copy giữ bản nội bộ (ảnh + vị trí) và ghi PNG; dán ưu tiên
  bản nội bộ để giữ đúng vị trí. Ctrl+C/X/V đi qua sự kiện `copy`/`cut`/`paste` của trình duyệt.

## Điều chỉnh và bộ lọc (mục 2, 5.8) — GĐ6

- **Filter thuần** (`services/workers/ops/filters/`, mỗi filter một file): Brightness, Contrast,
  Saturation, Hue, Grayscale, Invert, Sepia (LUT/ma trận), Blur (3 hộp xấp xỉ Gauss, nhân trước theo
  thang nguyên — chính xác khi chia dải), Sharpen (unsharp mask), Pixelate (lưới theo gốc document).
  `pipeline.ts` chạy dãy bước, gộp LUT liền nhau. Đặc tả tham số và phần đệm: `engine/filters/spec`.
- **Phiên điều chỉnh** (`engine/filters/FilterRunner`, `editor.filters`): gắn với layer hoạt động;
  khi mở chỉ xem/zoom/pan/lấy màu. Xem trước: lưới pixel cố định theo tỉ lệ (≤ 1 MP của phần đang
  thấy), nguồn đọc từ GPU một lần, các mức 1/2^k thu nhỏ trên CPU, dải song song trên pool, bản nháp
  thích ứng khi kéo slider (theo tốc độ đo được) rồi dựng lại bản đầy đủ. Renderer ghép
  `FilterPreview` ở độ phân giải màn hình (vùng chọn: gốc × (1 − m) + lọc × m).
- **Áp dụng**: dải ~2 MP có phần đệm, 4 dải song song, tiến trình, Hủy (`AbortSignal`); tile history
  chụp dần theo dải; một PaintCommand. ADR 0026.
- **UI**: menu Điều chỉnh (`app/editor/AdjustMenu`, lệnh `filter.*`), bảng nổi
  (`app/dialogs/AdjustmentsPanel`: slider sinh từ đặc tả, giữ So sánh, Đặt lại, tiến trình + Dừng).
- **Gradient** (`tools/gradient`): thẳng/tỏa tròn, màu chính → phụ hoặc → trong suốt, trên stroke
  buffer (cắt theo vùng chọn), nút tách "Tô ▾" + phím G.

## Screenshot Editor (mục 2, 5.4, 7.3) — GĐ7

- **Ảnh nền của đối tượng** (`render/backdrop`, gắn vào `ObjectEnv.backdrop`): Redact khảm/làm mờ và
  Magnifier lấy pixel các layer bên dưới + đối tượng đứng trước trong layer (`drawObjects` của
  Compositor truyền vị trí), xử lý đồng bộ bằng hàm thuần (`layers/objects/redactEffect`, nhân blur
  `engine/filters/kernels` dùng chung với Worker), cache tới khi nền đổi. Pixel nền đọc từ GPU một lần
  cho mỗi trạng thái nền; kéo vùng làm mờ lớn dùng bản nháp ½. Thiếu ảnh nền thì tô kín.
- **Vùng vẽ lại phụ thuộc nền**: Renderer mở rộng vùng bẩn/vùng cache bằng `expandForBackdrops`.
- **Spotlight** (nhiều cái trong layer gộp một lớp làm tối), **Step** (số theo thứ tự trong layer, do
  Compositor tính), **Magnifier** (`layers/objects/spotlight|step|magnifier`); tool tương ứng ở
  `tools/objects/shapes`.
- **Làm đẹp** (`render/beautify`, `Document.beautify`, `BeautifyCommand`, `editor.beautify`): khung nền
  gradient, bo góc, bóng — vẽ trên màn hình (Fit tính cả khung) và khi xuất (`beautify: true`).
- **UI**: chế độ Screenshot (`ProjectMeta.mode`, `session.setProjectMode`) — tool island rút gọn
  (`SCREENSHOT_TOOLS`), Copy + Tải xuống, panel phải Làm đẹp + Lịch sử (`app/screenshot/BeautifyPanel`);
  kiểu nhanh mũi tên/khung/chữ (`app/editor/presets`, `StylePresets`, `objects.applyPreset`). ADR 0027.

## Cấu trúc thư mục hiện tại (sau GĐ7)

```
src/
  app/              UI shell
    editor/         EditorScreen, CanvasView, ToolIsland (nút tách Chọn/Tô/Hình/Làm nổi bật; bản rút
                    gọn của chế độ Screenshot), StylePresets + presets (kiểu nhanh), OptionsBar (sinh từ
                    OptionSchema, cả thuộc tính đối tượng đang chọn, Áp dụng/Hủy pixel nổi),
                    ColorControl (HSV + hex + alpha, bảng màu tùy chỉnh), TextEditOverlay (textarea
                    gõ chữ/IME), CanvasContextMenu (đối tượng / vùng chọn / vùng trống), ImageMenu
                    (menu Ảnh), ImageDropZone (thả ảnh thành layer), clipboard (copy/dán vùng chọn),
                    AdjustMenu (menu Điều chỉnh), adjustments (bảng điều chỉnh ↔ pipeline filter),
                    PaintTargetDialog, EditorStatusBar, SaveStatusIndicator, session (vòng đời
                    project: mở/tạo/đóng, khóa tab, autosave, phiên), actions (mở/copy/xuất/.paint)
      panels/       RightPanel (tab Layers/History/Làm đẹp, thu gọn được), LayersPanel (dnd-kit),
                    LayerRow, LayerThumbnail, LayerProperties (opacity, blend, khóa trong suốt),
                    HistoryPanel
    screenshot/     BeautifyPanel (khung nền, khoảng nền, bo góc, bóng)
    home/           StartScreen, DropZone (ảnh + .paint), PresetList (+ tùy chỉnh, từ clipboard),
                    ProjectsSection (lưới, tìm kiếm, sắp xếp, thùng rác), ProjectCard, HomeBanners
                    (khôi phục phiên, nhắc sao lưu, không lưu được), StorageMeter
    dialogs/        ExportDialog (+ chỉ vùng chọn), PaintExportDialog (cảnh báo Redact), QuotaDialog,
                    RenameDialog, NewImageDialog, ConfirmDialog, ImageSizeDialogs (Resize, Canvas size),
                    AdjustmentsPanel (bảng điều chỉnh nổi: xem trước, so sánh, tiến trình)
    storage.ts      kết nối IndexedDB, repository, cài đặt, phiên — khởi tạo một lần
    projects.ts     danh sách project + ảnh thu nhỏ cho trang chủ, đồng bộ giữa các tab
    shared/         IconButton, Kbd, ThemeMenu, color (HSV ↔ hex)…
    engine-bridge.ts  sự kiện Engine → Zustand (đồng bộ / gộp rAF / throttle 100 ms)
    dev/            công cụ dev (input recorder, __paint.editor()) — chỉ có trong bản dev
  commands/         Command Registry + ShortcutManager có phạm vi; definitions/ (edit — gồm vùng chọn và
                    clipboard, view, tools, layers, image, filters)
  engine/
    core/           Editor (facade), Document, EventBus, options/colors API, types
    memory/         MemoryBudget (+ chuỗi thu hồi), createSurface, ScratchPool, GrowableSurface
    viewport/       transform.ts (toán tọa độ thuần), Viewport
    input/          InputManager (Pointer Events, wheel, pinch, chuột phải), recorder, replay
    render/         Renderer (vùng bẩn, overlay, ô caro, khung Làm đẹp), Compositor (dùng chung cho
                    export, Merge; drawObjects tính số Step, nhóm Spotlight, ảnh nền), layerCaches
                    (Below/Above cache, mipmap), cache (bề mặt dẫn xuất dựng lười), backdrop (ảnh nền
                    Redact khảm/làm mờ, Magnifier), beautify (khung Làm đẹp)
    layers/         RasterLayer, VectorLayer, LayerManager (thao tác panel Layers)
    selection/      Selection (path/mask), SelectionManager, FloatingSelection, shape, maskOps (kết
                    hợp, làm mềm, marching squares — chạy trong Worker)
    document/       ImageOps (crop, Trim, Resize, Canvas size, xoay, lật)
    filters/        spec (tham số, phần đệm), kernels (blur số nguyên — dùng chung với Worker),
                    FilterRunner (phiên xem trước + áp dụng theo dải)
      objects/      objectRegistry + renderer từng loại (rect/ellipse, line/arrow/polygon, text,
                    highlight/redact, step, spotlight, magnifier), redactEffect (khảm, làm mờ),
                    geometry, textLayout, style (option ↔ thuộc tính), env (đo chữ,
                    tải font lười), transform (đối tượng theo biến đổi ảnh)
    tools/          ToolManager, registry, paint (layer đích, commit), brush/ (BrushStroke, dây kéo),
                    pencil, bucket, gradient, eyedropper, view (pan, zoom), selection (Marquee,
                    Lasso, Đũa thần, kéo/handle pixel nổi), crop
      objects/      ObjectController (chọn, tìm, bản nháp, ghi Command), drag (handle/di chuyển),
                    shapes (rect, ellipse, line, arrow, polygon, highlight, redact, step, spotlight,
                    magnifier), selectText
                    (Select, Text), TextSession
    history/        History (nhảy bước, nén bước cũ), tiles, TileStore (ADR 0016), archive (nén
                    lossless theo dải); commands/ PaintCommand, ObjectCommand, LayerCommand,
                    DocumentCommand, BeautifyCommand
    testing/        tiện ích test/benchmark dùng canvas thật, blend (ảnh chuẩn W3C)
    utils/          rect, color, geometry
  services/
    workers/        pool (2–4 Worker, comlink, hủy tác vụ), image.worker (entry duy nhất), codec
                    (ImageCodec + bản main thread), ops/ floodFill, encode, png (PNG RGBA), zip,
                    selection (mask vùng chọn, hình bao alpha), filters/ (mỗi filter một file +
                    pipeline)
    storage/        db, schema, migrations, projectRepo, autosave, saveStatus, restore, locks,
                    session, settings, quota, channel (BroadcastChannel)
    io/             imageHeader (magic bytes), importImage (giải mã trong Worker), clipboard,
                    download, exportImage (JPG/WebP + WASM), projectFile (.paint)
    platform/       features, deviceTier, browserGuards
  stores/           ui (theme, toast, aria-live, dialog, menu), tool, document, settings, project
tests/
  e2e/              Playwright trên 3 engine (GĐ1, chú thích GĐ2, lưu trữ/.paint/fault-injection GĐ3,
                    panel Layers/History GĐ4, vùng chọn/biến đổi ảnh GĐ5, điều chỉnh/Gradient GĐ6,
                    chế độ Screenshot/luồng đầy đủ đo 5 lần GĐ7)
  bench/            benchmark S/M (+ chú thích, Paint Bucket, autosave, mở project), khởi động;
                    layers.spec (M/L × 5/20 layer, cache, mipmap — BENCH_LAYERS=1), docops.spec
                    (crop/Resize/xoay/Canvas size trên L), filters.spec (xem trước filter khi kéo
                    slider trên M, áp dụng full-res)
```

## Đối tượng vector (mục 5.3, 5.4, 6.2) — GĐ2

- Đối tượng là **giá trị bất biến** (kiểu ở `types.ts`); mọi phép biến đổi trả đối tượng mới.
  `ObjectCommand` giữ tham chiếu trước/sau — undo không tốn bộ nhớ canvas.
- Thêm loại đối tượng = một nhánh union + một `ObjectRenderer` (vẽ, hình bao, hit-test, khung chọn,
  kéo handle) đăng ký trong `objectRegistry`.
- Compositor vẽ đối tượng trực tiếp với ma trận hiện tại (ADR 0020): sắc nét ở mọi zoom, Highlight
  trộn `multiply` với ảnh bên dưới, Redact luôn đục và căn ra ngoài pixel nguyên.
- Shape/text trên layer raster tự dùng layer chú thích ngay phía trên hoặc tạo "Chú thích N" (một
  bước undo). Tool pixel trên layer chú thích hỏi: vẽ trên layer mới / layer ảnh bên dưới /
  rasterize, có tùy chọn nhớ (mục 5.3).
- Màu viền/chữ = màu chính, tô/nền = màu phụ (ADR 0019).

## Chữ (mục 5.10)

1. Tool Text (click hoặc kéo khung) / double-click / Enter mở `TextSession` → sự kiện
   `textEditChanged`.
2. `TextEditOverlay` đặt `<textarea>` thật chồng đúng vị trí (cỡ chữ × zoom, xoay theo đối tượng);
   gõ bằng bộ gõ tiếng Việt như mọi ô nhập liệu; ShortcutManager bỏ qua phím trong ô nhập liệu và
   khi `isComposing`.
3. Esc / Ctrl+Enter / click ra ngoài: chữ được ghi bằng ObjectCommand, vẽ bằng `fillText` sau khi
   `document.fonts.load()` tải đúng subset.

## Worker (mục 5.8)

Pool 2–4 Worker (`hardwareConcurrency − 1`) tạo lười, hàng đợi FIFO, hủy bằng `AbortSignal` (dừng
Worker đang chạy). Paint Bucket: main thread đọc pixel một lần → Worker tô loang scanline (dung sai
RGBA, liền kề, nới 0–2 px) → mặt nạ chuyển ngược (transferable) → `PaintCommand`. Document đổi trong
lúc chờ thì bỏ kết quả. Filter (`applyFilter`) thuần JS trên pixel nên luôn chạy trong Worker; việc
lớn chia dải theo `WorkerClient.concurrency`. Test dùng `inlineWorkerClient` (cùng hàm thuần).

## Luồng một nét vẽ (mục 4.3) — hiện thực GĐ1

1. `InputManager` đổi Pointer Event sang tọa độ document (kèm coalesced/predicted) → `ToolManager`.
2. Brush lấy bản chụp option, tạo `BrushStroke` trên stroke buffer dùng chung, `TileCapture`.
3. Mỗi `pointermove`: nội suy Catmull-Rom, vẽ vào stroke buffer, chép tile layer lần đầu bị chạm
   vào TileStore (GPU), báo vùng bẩn.
4. Renderer (rAF): chỉ vẽ vùng bẩn; layer đang vẽ được ghép với stroke buffer trên scratch.
5. `pointerup`: `PaintCommand` (bản trước đã chụp sẵn) ghép buffer vào layer → `History`, `rev++`.

## Kiểm thử (mục 11.1)

| Lệnh                   | Tầng                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| `npm test`             | Unit (Node) + component (jsdom)                                          |
| `npm run test:browser` | Vitest browser mode trên 3 engine thật (gồm IndexedDB + fault-injection) |
| `npm run test:e2e`     | Build production + Playwright E2E, chạy CSP thật                         |
