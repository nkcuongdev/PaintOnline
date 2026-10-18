# Quyết định kiến trúc

Các quyết định lớn của Paint Online, mỗi quyết định giữ số ADR cũ để những ghi chú `ADR 00xx` trong mã
nguồn vẫn tra được. Bản đầy đủ (bối cảnh, phương án, số đo theo từng giai đoạn) nằm trong lịch sử git,
commit `67037c7`, thư mục `docs/adr/`.

Thêm quyết định mới: một mục `## ADR 00xx — <tên>` ở cuối file, gồm **Quyết định** và **Hệ quả**.

| Nhóm               | ADR                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Nền tảng           | [0001](#adr-0001), [0002](#adr-0002), [0004](#adr-0004), [0012](#adr-0012), [0013](#adr-0013), [0014](#adr-0014), [0015](#adr-0015) |
| Engine, hiệu năng  | [0005](#adr-0005), [0006](#adr-0006), [0007](#adr-0007), [0008](#adr-0008), [0016](#adr-0016), [0017](#adr-0017), [0018](#adr-0018) |
| Layer, đối tượng   | [0003](#adr-0003), [0019](#adr-0019), [0020](#adr-0020), [0023](#adr-0023)                                                          |
| Lưu trữ            | [0009](#adr-0009), [0010](#adr-0010), [0021](#adr-0021), [0022](#adr-0022), [0024](#adr-0024), [0029](#adr-0029)                    |
| Tính năng, phạm vi | [0011](#adr-0011), [0025](#adr-0025), [0026](#adr-0026), [0027](#adr-0027), [0028](#adr-0028)                                       |

<a id="adr-0001"></a>

## ADR 0001 — Web app 100% frontend, dùng cá nhân

- Trang web tĩnh chạy hoàn toàn trong trình duyệt: không backend, tài khoản, analytics, Electron/Tauri.
- Host tĩnh miễn phí (Cloudflare Pages đề xuất vì đặt được CSP qua `_headers`, hoặc Netlify).
- **Hệ quả:** không tốn chi phí vận hành. Dữ liệu chỉ nằm trên một trình duyệt, nên cần file `.paint`
  để sao lưu (0010) và xin lưu trữ bền vững (0009). Lỗi chỉ ghi cục bộ.

<a id="adr-0002"></a>

## ADR 0002 — Canvas 2D với engine tự viết

- Engine riêng trên Canvas 2D + OffscreenCanvas, không Fabric/Konva/WebGL. Fabric/Konva mạnh về scene
  graph vector nhưng không giải quyết phần khó: brush raster, flood fill, mask, filter, undo theo pixel.
- Không dùng `ctx.filter` (Safari thiếu): filter viết bằng TypeScript, chạy trong Worker, kết quả giống
  nhau trên mọi trình duyệt.
- Engine là TypeScript thuần, không import React (ESLint `no-restricted-imports` ép buộc).
- **Hệ quả:** chỉ một hệ render và một hệ undo, nên export, blend, autosave, history nhất quán.

<a id="adr-0003"></a>

## ADR 0003 — Hai loại layer: raster và vector

- Raster: `GrowableSurface` chỉ phủ vùng có nội dung, căn 256 px, cấp phát lười.
- Vector (layer chú thích): danh sách `AnnotationObject` (rect, ellipse, line, arrow, polygon, text,
  highlight, redact, step, spotlight, magnifier). Thêm loại = một nhánh union + một `ObjectRenderer`.
- Dùng shape/text trên layer raster thì tự tạo/dùng layer "Chú thích N" ngay trên; dùng tool pixel trên
  layer vector thì hỏi rasterize hoặc tạo layer mới.
- **Hệ quả:** chú thích sửa lại được sau khi vẽ (Win 11 Paint thì rasterize ngay).

<a id="adr-0004"></a>

## ADR 0004 — Engine là nguồn sự thật, Zustand chỉ giữ bản sao

- Engine sở hữu document, layer, tool, option, màu, viewport, selection. `Editor` là điểm vào duy nhất.
- Luồng một chiều: UI → Editor/Command → sự kiện → `engine-bridge` → Zustand → UI. Sự kiện gộp theo
  `requestAnimationFrame`, `viewportChanged` throttle 100 ms.
- Phụ thuộc tiêm qua `EditorDeps` (workers, memory, platform, initialOptions).
- **Hệ quả:** vẽ không gây re-render React; Engine test độc lập được.

<a id="adr-0005"></a>

## ADR 0005 — Undo/Redo bằng Command + diff tile 256×256

- Mọi thay đổi document là `Command` (`execute`, `undo`, `memoryBytes`, `mergeWith?`).
- `PaintCommand` chỉ giữ tile bị chạm, một phiên bản tại một thời điểm (hoán đổi trước/sau).
- History ≤ 25% MemoryBudget, tối đa 100 bước, luôn giữ ≥ 10; không lưu vào IndexedDB.
- **Hệ quả:** một nét nhỏ trên ảnh 4K tốn 1–5 MB thay vì 33 MB.

<a id="adr-0006"></a>

## ADR 0006 — Stroke buffer và cache composite dưới/trên

- Nét đang vẽ nằm trong stroke buffer, ghi vào layer khi `pointerup`.
- Below/Above cache khi có ≥ 2 layer hiển thị dưới/trên layer đang vẽ, để chi phí mỗi frame gần như
  không phụ thuộc số layer. Cache là tùy chọn, luôn có đường vẽ trực tiếp, MemoryBudget thu hồi được.
- **Hệ quả:** benchmark giữ cache (chênh ≥ 20%: Firefox frame p95 −32%, Chromium pan −35–66%).

<a id="adr-0007"></a>

## ADR 0007 — MemoryBudget trung tâm theo tier thiết bị

- Mọi canvas tạo qua `engine/memory` và giải phóng bằng `release()`. ESLint chặn `new OffscreenCanvas`
  và `createElement('canvas')` ở nơi khác (trừ Worker).
- Ngân sách: desktop 1,5 GB / 8192²; RAM thấp 768 MB / 6000²; iOS 320 MB / 4096². Layer ≤ 60%,
  history ≤ 25%, còn lại cho cache.
- Chuỗi thu hồi: mipmap → cache → nén history → bỏ bước cũ nhất. Không đủ thì từ chối có thông báo;
  dữ liệu layer không bao giờ bị thu hồi.

<a id="adr-0008"></a>

## ADR 0008 — Web Worker cho xử lý nặng

- Pool 2–4 Worker (`hardwareConcurrency − 1`), `comlink`, dữ liệu transferable, không giữ state.
- Flood fill, filter, encode/decode, zip, mask vùng chọn chạy trong Worker. WASM chỉ dùng cho encoder
  WebP trên Safari (`@jsquash/webp`, tải lười).
- **Hệ quả:** UI không treo khi xử lý ảnh lớn.

<a id="adr-0009"></a>

## ADR 0009 — IndexedDB, autosave theo revision, ghi nguyên tử

- Database `paint-online` (`idb`); metadata, document JSON và pixel tách riêng.
- Autosave: debounce 1,5 s, tối đa 10 s, ngay khi tab ẩn / `pagehide` / chuyển project / Ctrl+S.
- Một lượt lưu = chụp (main) → mã hóa (Worker) → **một transaction**. Single-flight, từ chối revision
  cũ, Web Locks để chỉ một tab ghi. Có checkpoint và 5 trạng thái lưu hiển thị.
- **Hệ quả:** DB luôn chứa một revision hợp lệ.

<a id="adr-0010"></a>

## ADR 0010 — File `.paint` = ZIP (manifest + PNG từng layer)

- `manifest.json` (`format`, `formatVersion`, `DocumentRecord`), `layers/<id>.png`, `thumbnail.png`.
- Nhập: validate bằng `valibot`, ≤ 200 mục, ≤ 1 GB giải nén, kiểm đường dẫn, decode an toàn.
- Có Redact thì cảnh báo và đề nghị áp dụng vĩnh viễn vùng che.

<a id="adr-0011"></a>

## ADR 0011 — PWA/offline là lớp bổ sung

- `vite-plugin-pwa` (`generateSW`) precache mọi file của bản build; cài đặt là tùy chọn.
- `registerType: 'prompt'`: toast "Lưu và tải lại" lưu project rồi mới kích hoạt bản mới. Tắt trong
  bản dev và bench.
- **Hệ quả:** dùng được khi mất mạng; E2E offline chạy trên Chromium, Firefox (Safari kiểm tay).

<a id="adr-0012"></a>

## ADR 0012 — Lộ trình: bản dùng hằng ngày sau GĐ3

- 10 giai đoạn GĐ0–GĐ9; Screenshot cơ bản lên GĐ2, autosave lên GĐ3. Engine nhiều layer từ GĐ1 nên
  schema lưu trữ GĐ3 là schema cuối. GĐ8 và GĐ9 sau đó được gộp (0028).

<a id="adr-0013"></a>

## ADR 0013 — Ghim TypeScript 6.0

- `typescript-eslint` chưa hỗ trợ TypeScript 7, nên ghim `typescript@6.0.3`. Nâng khi có hỗ trợ.
- Tắt `erasableSyntaxOnly` để dùng parameter property của class.

<a id="adr-0014"></a>

## ADR 0014 — Phụ thuộc bổ sung

- Font tự host qua `@fontsource` (Inter, Patrick Hand, JetBrains Mono; có subset tiếng Việt).
- Phụ thuộc chuẩn của shadcn/ui (`radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`,
  `tw-animate-css`), công cụ test (`jsdom`, `@vitest/browser*`, `playwright`), ESLint, Prettier.
- Thêm ở GĐ8+9: `cmdk`, `vite-plugin-pwa`, `workbox-window`, `@axe-core/playwright` (dev).

<a id="adr-0015"></a>

## ADR 0015 — Áp theme trước lần vẽ đầu bằng localStorage

- `public/theme-init.js` (script tĩnh vì CSP cấm inline) đọc `localStorage['paint-online:theme']` hoặc
  `prefers-color-scheme`, đặt class `dark` và favicon trước khi CSS vẽ.
- IndexedDB `settings` là bản lưu chính; localStorage chỉ là bản nhân phục vụ khởi động.
- **Hệ quả:** không nháy màu khi tải trang. Logic theme ở hai nơi, có E2E kiểm tra.

<a id="adr-0016"></a>

## ADR 0016 — Tile history lưu trên GPU (TileStore)

- Đọc pixel về CPU quá chậm (undo 4K 1,3 s trên Chromium GPU, `getImageData` 13–83 ms/tile trên
  Firefox). Tile history nằm trong canvas "atlas", chép bằng `drawImage` ở tọa độ nguyên, chính xác
  từng pixel.
- Chụp dần bản trước khi nét chạm tile lần đầu; hoán đổi 2 pha khi undo/redo.
- **Hệ quả:** undo/redo 4K 1310 → 5 ms (Chromium), 126 → 60 ms (Firefox).

<a id="adr-0017"></a>

## ADR 0017 — Lấy mẫu `low`, vẽ vùng con, stroke buffer dùng chung

- Renderer dùng `imageSmoothingQuality = 'low'` (`medium`/`high` > 250 ms/frame với layer 4K); thu
  nhỏ đẹp nhờ mipmap tự quản. Export vẫn dùng `high`.
- Compositor chỉ vẽ phần nguồn ứng với vùng cần vẽ (nới 2 px). Stroke buffer dùng chung giữa các nét.
- **Hệ quả:** frame p95 khi vẽ 4K × 5 layer 966 → 16,9 ms.

<a id="adr-0018"></a>

## ADR 0018 — Firefox canvas WebGL: giai đoạn khởi động ở ảnh lớn

- Firefox với canvas tăng tốc WebGL từng giật ~2,5 s ở nét đầu tiên trên ảnh 4K × 5 layer. Chọn giữ
  kiến trúc, không thêm nhánh riêng cho Firefox.
- **Hệ quả:** sau khi có Below/Above cache, đo lại ở GĐ9 đạt mọi ngưỡng vẽ (khung dài nhất 83–150 ms,
  chỉ 1–2 s đầu). Đã hết ảnh hưởng.

<a id="adr-0019"></a>

## ADR 0019 — Màu chú thích theo màu chính/phụ

- Viền/chữ = màu chính, tô/nền chữ = màu phụ (quy ước MS Paint). Option chỉ giữ phần không phải màu
  (`strokeWidth`, `fill`, `dashed`, `head`, `background`…). Highlight chọn trong 5 màu dạ quang.
- Đối tượng lưu màu cụ thể lúc tạo; chọn màu khi đang chọn đối tượng thì đổi màu đối tượng đó.
- Màu đang kéo là tạm thời (`transient`), chỉ vào "màu gần đây" khi thả chuột.

<a id="adr-0020"></a>

## ADR 0020 — Layer chú thích vẽ trực tiếp; layer hoạt động ngoài history

- Compositor vẽ từng đối tượng trực tiếp với ma trận hiện tại: sắc ở mọi zoom, Highlight `multiply`
  trộn đúng với ảnh dưới. Không cache layer vector.
- `activeLayerId` là trạng thái làm việc, không tạo bước history. Mọi thay đổi nội dung vẫn là Command.
- **Hệ quả:** rasterize làm Highlight mất hiệu ứng multiply với layer dưới (hộp thoại có ghi rõ).

<a id="adr-0021"></a>

## ADR 0021 — PNG RGBA tự mã hóa, ArrayBuffer trong IndexedDB, cờ thoát sạch

- PNG encoder của canvas lệch pixel bán trong suốt trên Firefox/WebKit, nên pixel layer được mã hóa
  bằng PNG RGBA 8 bit tự viết (`services/workers/ops/png.ts`, lọc Paeth + `CompressionStream`). File
  vẫn là PNG chuẩn. Ảnh xuất cho người dùng vẫn dùng encoder của trình duyệt.
- Lưu `ArrayBuffer` thay vì `Blob` (WebKit test không lưu được Blob).
- Cờ thoát sạch có bản sao đồng bộ trong localStorage, vì lượt ghi IndexedDB trong `pagehide` có thể
  bị hủy.
- **Hệ quả:** lưu/mở và xuất/nhập `.paint` đúng từng pixel trên cả 3 engine.

<a id="adr-0022"></a>

## ADR 0022 — Lượt lưu đầy đủ nhiều layer 4K vượt ngưỡng 3 s

- Lượt lưu đầy đủ (mọi layer cùng mới) của 5 layer 4K trên Chromium máy 2 nhân mất 3,6–9 s. Chấp nhận
  là ngoại lệ; lượt lưu thường vẫn phải ≤ 3 s, và mọi lượt lưu không có long task > 100 ms.
- **Hệ quả:** lượt lưu chậm chỉ kéo dài trạng thái "Đang lưu", không chặn vẽ. Bench cảnh báo khi > 6 s.

<a id="adr-0023"></a>

## ADR 0023 — Hệ thống layer: ghép chú thích, cache lười, thu hồi, nén history

- Layer chú thích: opacity 1 vẽ thẳng; opacity < 1 dùng pass-through (vẫn trộn Highlight đúng); blend
  khác `normal` ghép nhóm cách ly.
- Below/Above cache và mipmap ½ ¼ dựng lười theo ô 256 px, vô hiệu theo chữ ký cấu trúc + `contentRev`
  - vùng của Command; vùng lớn dựng dần trong `requestIdleCallback`.
- Nén history bước cũ trong Worker lúc rảnh (theo dải ~4 MB), giải nén đồng bộ khi undo/redo tới.
- Merge Down dùng chính hàm ghép của Compositor, không clip. Thuộc tính layer là Command.
- **Hệ quả:** 16 blend mode khớp công thức W3C trên 3 engine (sai khác ≤ 6/255).

<a id="adr-0024"></a>

## ADR 0024 — Chưa làm tiled layer storage

- Tile thưa chỉ tiết kiệm cho nội dung rải rác; layer phủ kín thì tổng tile bằng surface hiện tại. Giữ
  `GrowableSurface`, giữ 60% cho layer. Desktop chứa tối đa 3 layer 8192² phủ kín, layer thứ 4 bị từ
  chối có thông báo. Đo lại ở GĐ9 (0029).

<a id="adr-0025"></a>

## ADR 0025 — Vùng chọn, pixel nổi, biến đổi ảnh

- Vùng chọn là trạng thái làm việc (không vào history); chỉ thay đổi pixel mới là Command.
- Chữ nhật/elip/Lasso giữ path; mask raster dựng trong Worker khi làm mềm, Magic Wand hoặc kết hợp vùng.
- Pixel nổi là surface tạm + hộp biến đổi, commit thành một PaintCommand (dán = AddLayerCommand).
- Alt: kéo trong vùng chọn = nhân bản; bắt đầu ngoài vùng chọn: Shift = thêm, Alt = bớt, Shift+Alt = giao.
- Clipboard giữ bản nội bộ để dán đúng vị trí cũ.
- Biến đổi ảnh (crop, Trim, Resize, Canvas size, xoay, lật) là một DocumentCommand; layer mới dựng
  theo dải ~4 MP trên GPU, trong hạng mục `temp` rồi chuyển sang `layer`.
- **Hệ quả:** biến đổi ảnh L (6000 × 4000, 10 layer) không làm treo UI.

<a id="adr-0026"></a>

## ADR 0026 — Điều chỉnh, bộ lọc và Gradient

- Filter là hàm thuần trong `services/workers/ops/filters/`, đặc tả tham số ở `engine/filters/spec.ts`
  (một nguồn cho Engine, Worker, UI). Blur = 3 hộp xấp xỉ Gauss trên giá trị nhân trước, chính xác khi
  chia dải.
- Khi bảng điều chỉnh mở chỉ xem/zoom/pan/lấy màu; Enter áp dụng, Esc hủy.
- Xem trước: pixel nguồn đọc từ GPU một lần, các mức thu nhỏ trên CPU, dải song song, bản nháp thích
  ứng theo tốc độ máy rồi dựng lại bản đầy đủ khi thôi kéo.
- Áp dụng full-res theo dải ~2 MP, có tiến trình và Hủy; một PaintCommand.
- Gradient thẳng/tỏa tròn trên stroke buffer, tự giới hạn trong vùng chọn.

<a id="adr-0027"></a>

## ADR 0027 — Screenshot Editor

- Hiệu ứng che (khảm, làm mờ) chạy đồng bộ trên main thread qua `drawObjects` của Compositor, nên mọi
  đường ra (màn hình, export, copy, merge) đều đã nướng hiệu ứng. Vùng che luôn đục; thiếu bộ nhớ thì
  tô kín, không bao giờ lộ nền. Cache theo chữ ký nền, tối đa 48 ảnh.
- Renderer mở rộng vùng bẩn cho đối tượng đọc nền (`expandForBackdrops`).
- Spotlight gộp nhiều vùng sáng trong một layer; Step tự đánh số theo thứ tự; Magnifier phóng 1,5–6×.
- Làm đẹp (padding, nền, bo góc, bóng) không phá hủy, lưu trong document, áp khi Copy/Tải xuống.
- Chế độ Screenshot lưu theo project: tool island rút gọn, Copy là nút chính.
- **Hệ quả:** luồng screenshot đầy đủ tự động 2–8 s (≤ 15 s).

<a id="adr-0028"></a>

## ADR 0028 — v1.0 chỉ cho trình duyệt laptop (gộp GĐ8 + GĐ9)

- **Hoãn** (chưa bỏ hẳn): bố cục tablet và điện thoại, cử chỉ chạm, vùng chạm 44 px, chế độ "chỉ vẽ
  bằng bút", kiểm thử iPad, Web Share API. Áp lực bút, `touch-action: none`, pinch trackpad vẫn giữ.
- **Làm:** Command Palette, Zen mode, toàn màn hình, mini toolbar, panel nổi ở 1024–1279 px, PWA,
  accessibility (axe 0 lỗi nghiêm trọng), bảng phím tắt, Cài đặt, nhật ký lỗi cục bộ, lưới/thước/căn
  chỉnh, lưu nhanh ra file (File System Access API), bảng màu từ ảnh, HUD cỡ cọ.
- Canvas Engine tải lười: JS khởi động 240 → ~170 KB gzip.
- Tối ưu có số đo: `readPixels` ghép trên GPU (mở project M 3,26 → 1,33 s), giải mã PNG không rẽ nhánh
  theo byte (Firefox 3,5 → 1,3 s).
- **Hệ quả:** muốn làm lại phần đã hoãn thì mở giai đoạn mới; `InputManager` đã nhận Pointer Events
  cho cả bút và cảm ứng, bố cục chỉ là phần React.

<a id="adr-0029"></a>

## ADR 0029 — Tiled storage: v1.0 giữ surface liền khối

- Đo trên ảnh 6000 × 4000: chú thích tập trung không lãng phí (0,8×), nét rải thưa lãng phí tới 27×
  cho layer đó, nhưng trần vẫn là một layer phủ kín, đúng trường hợp ngân sách đã tính.
- Chủ dự án chọn giữ surface liền khối ở v1.0. Tiled storage (tile 512 px, dùng lại cơ chế tile của
  history) chỉ làm khi thực tế chạm ngân sách, kèm ADR mới.
