# Perf baseline

Kết quả đo hiệu năng theo từng mốc (mục 11.2). Mỗi lần đo ghi rõ model máy, trình duyệt và phiên
bản. Benchmark đầy đủ chạy tay trên thiết bị thật cuối mỗi giai đoạn; CI chỉ chạy kịch bản S rút
gọn (từ GĐ1) và báo lỗi khi chậm hơn baseline trên 30%.

**Thiết bị tham chiếu:** D1 = máy dùng hằng ngày của chủ dự án · D2 = laptop ~4 nhân, 8 GB RAM, đồ
họa tích hợp (Chrome, Firefox) · T1 = iPad + Safari.

**Kịch bản:** S 1920×1080, 1 raster + 1 vector · M 3840×2160, 5 layer · L 6000×4000, 10 layer ·
XL 8192×8192, 3 layer.

## Ngưỡng (giá trị khởi điểm, chốt cuối GĐ1 — mục 10.4)

| Chỉ số                    | Bắt buộc                                   | Mục tiêu                        |
| ------------------------- | ------------------------------------------ | ------------------------------- |
| Frame time khi vẽ, p95    | S, M trên D2 ≤ 33 ms; L trên D1 ≤ 50 ms    | ≤ 16,7 ms cho S, M              |
| Frame dài nhất khi vẽ     | Không frame nào > 200 ms                   | ≤ 50 ms                         |
| Độ trễ pointer → hiển thị | ≤ 50 ms                                    | ≤ 20 ms                         |
| Undo/redo một nét         | ≤ 200 ms (M)                               | ≤ 50 ms                         |
| Paint Bucket              | ≤ 1 s (M), UI không treo                   | ≤ 300 ms                        |
| Xem trước filter          | ≤ 100 ms mỗi lần cập nhật                  | ≤ 50 ms                         |
| Một lượt autosave         | Không long task > 100 ms; ≤ 3 s (M)        | Main thread ≤ 16 ms; ≤ 1 s      |
| Mở project                | ≤ 3 s (M)                                  | ≤ 1,5 s                         |
| Khởi động app             | Lần sau (đã cache) ≤ 1,5 s trên D2         | Lần đầu ≤ 2 s; JS ≤ 250 KB gzip |
| Bộ nhớ                    | Không vượt ngân sách tier; không crash tab | —                               |

## GĐ0 — Nền tảng (2026-10-17)

Chưa có Engine nên chưa có kịch bản vẽ; chỉ đo kích thước bundle khởi động (`vite build`,
Vite 8.3.4).

| Tài nguyên                                                               | Kích thước | gzip         |
| ------------------------------------------------------------------------ | ---------- | ------------ |
| JS khởi động (`index-*.js`)                                              | 372,9 KB   | **119,5 KB** |
| JS Editor (tải lười, `EditorScreen-*.js`)                                | 3,5 KB     | 1,5 KB       |
| CSS                                                                      | 41,4 KB    | 8,3 KB       |
| Font Inter (chỉ tải subset cần theo `unicode-range`; latin + vietnamese) | 58,5 KB    | woff2        |

Kết luận: JS khởi động 119,5 KB gzip, trong ngân sách mục tiêu ≤ 250 KB.

## GĐ1 — Engine lõi (2026-10-17)

**Thiết bị:** máy của chủ dự án (D1) — Intel Core i7-7500U (2 nhân / 4 luồng, 2,7 GHz), RAM 8 GB,
Intel HD Graphics 620 (+ NVIDIA 940MX), Windows 10. Cấu hình này trùng hạng **D2** của plan
(~4 luồng, 8 GB, đồ họa tích hợp) nên số đo dùng được cho cả hai. Chưa đo được T1 (iPad).

**Trình duyệt:** Chromium 156.0.8078.4, Firefox 157.0 (Playwright 1.64.1). "GPU" = trình duyệt có
cửa sổ (`HEADED=1`), dùng GPU thật; "headless" = render canvas bằng phần mềm.

**Cách đo** (`npm run bench`, trang `tests/bench/index.html`): khung nhìn 1280 × 720, mở document,
chờ 1 s, phát Pointer Events 120 Hz theo đường Lissajous phủ gần hết ảnh: 5 s nét cứng 24 px rồi
5 s nét mềm 60 px; sau đó undo/redo một nét, pan 2 s. Frame time = khoảng cách rAF; độ trễ ước
lượng = sự kiện pointer → frame vẽ kế tiếp; undo/redo gồm cả vẽ lại khung hình.

### Kết quả (bản cuối GĐ1)

| Kịch bản · trình duyệt      | Frame p95 | Frame max     | Độ trễ p95    | Undo / Redo  | Commit nét | Bộ nhớ |
| --------------------------- | --------- | ------------- | ------------- | ------------ | ---------- | ------ |
| S · Chromium GPU            | 16,9 ms   | 18,2 ms       | 15,3 ms       | 4,7 / 0,9 ms | 2,5 ms     | 47 MB  |
| M · Chromium GPU            | 16,9 ms   | 17,3 ms       | 14,6 ms       | 5,3 / 2,4 ms | 1,2 ms     | 227 MB |
| S · Chromium headless       | 16,7 ms   | 16,8 ms       | 14,6 ms       | 19 / 17 ms   | 1,1 ms     | 37 MB  |
| M · Chromium headless       | 16,7 ms   | 50 ms         | 15 ms         | 61 / 65 ms   | 0,7 ms     | 227 MB |
| S · Firefox canvas phần mềm | 16,7 ms   | 33 ms         | 20 ms         | 32 / 13 ms   | 6 ms       | 45 MB  |
| M · Firefox canvas phần mềm | 16,7 ms   | 50 ms         | 20 ms         | 96 / 44 ms   | 43 ms      | 249 MB |
| S · Firefox canvas WebGL    | 16,7 ms   | 22,5 ms       | 17 ms         | 32 / 23 ms   | 5 ms       | 47 MB  |
| M · Firefox canvas WebGL    | 16,7 ms   | **850 ms** ❌ | **876 ms** ❌ | 60 / 49 ms   | 23 ms      | 265 MB |

Ngưỡng bắt buộc (S, M trên D2): frame p95 ≤ 33 ms · không frame nào > 200 ms · độ trễ ≤ 50 ms ·
undo/redo ≤ 200 ms. **Đạt toàn bộ** trên Chromium và trên Firefox khi canvas chạy phần mềm. **Chưa
đạt** một trường hợp: Firefox dùng canvas tăng tốc WebGL, kịch bản M (4K × 5 layer) — khoảng 2,5 s
đầu của nét vẽ ĐẦU TIÊN sau khi mở document chỉ 2–3 khung/giây, sau đó ổn định 60 khung/giây
(diễn biến mỗi 500 ms, khung dài nhất / số khung: `317/3 317/2 283/2 333/2 317/2 33/29 17/31 17/31`).
Không phụ thuộc đọc pixel, cấp phát stroke buffer hay thời gian chờ trước khi vẽ (đã thử từng yếu
tố); `willReadFrequently` không tránh được và làm Chromium chậm 600×. Xem ADR 0018.

**Khởi động app** (bản production, `vite preview`): Chromium lần đầu 334 ms, lần sau 167 ms;
Firefox lần đầu 821 ms, lần sau 263 ms — đạt (bắt buộc: lần sau ≤ 1,5 s; mục tiêu: lần đầu ≤ 2 s).
JS khởi động 144,3 KB gzip (≤ 250 KB).

### Các lần tối ưu có số đo trước/sau (mục 11.2: chỉ tối ưu khi ngưỡng bắt buộc trượt)

| #   | Vấn đề đo được                                                      | Nguyên nhân (đã kiểm chứng)                                                                                                        | Thay đổi                                                                                | Trước → sau                                  |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | Frame khi vẽ M (Chromium GPU) p95 966 ms                            | `imageSmoothingQuality = 'medium'` dựng mipmap cho cả texture nguồn mỗi lần vẽ (micro-benchmark: `low` 16,7 ms, `medium` > 250 ms) | Màn hình luôn dùng `low`; thu nhỏ đẹp ở zoom thấp để cho mipmap riêng của Engine (GĐ4)  | 966 → 16,9 ms                                |
| 2   | Undo M (Chromium GPU) 1310 ms                                       | Đọc tile qua scratch `willReadFrequently` buộc đọc ngược cả texture layer                                                          | Đọc thẳng vùng con trên context layer                                                   | 1310 → 141 ms                                |
| 3   | Mỗi `getImageData` một tile trên Firefox 13–83 ms; commit 4K 276 ms | Đồng bộ GPU→CPU theo từng lần gọi                                                                                                  | Lưu tile history trên GPU (TileStore, ADR 0016): chép bằng `drawImage`, không đọc pixel | commit 276 → 23 ms; undo Chromium 141 → 5 ms |
| 4   | Undo M headless (canvas phần mềm) 3976 ms                           | Xen kẽ đọc/ghi cùng layer buộc chụp lại cả layer cho từng tile                                                                     | Hoán đổi 2 pha + kho mới mỗi lần                                                        | 3976 → 61 ms                                 |
| 5   | Commit nét lớn gây frame dài                                        | Chụp "bản trước" 130 tile dồn vào lúc nhả chuột                                                                                    | Chụp dần khi nét chạm tile lần đầu (TileCapture)                                        | 276 → 1–23 ms                                |
| 6   | `pointermove` lâu nhất 51 ms                                        | Stroke buffer cấp phát lại nhiều lần mỗi nét                                                                                       | Buffer dùng chung giữa các nét + biên nở 384 px                                         | 51 → 2–5 ms (Chromium)                       |

### Quyết định 10.4 đến hạn ở GĐ1

| Quyết định                                       | Kết quả đo                                                                                                                                                    | Chốt                                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ngân sách bộ nhớ theo tier                       | Áp lực có giới hạn (`tests/bench/stress.spec.ts`): Chromium và Firefox cấp phát 57 canvas 4K có nội dung (1,8 GB) không lỗi, dừng ở trần an toàn của máy 8 GB | Giữ 1,5 GB / 768 MB / 320 MB. Mức gây lỗi trên desktop > 1,8 GB nên 1,5 GB ≤ 83% mức đã kiểm; chưa xác định được 70% mức lỗi thật — đo lại ở GĐ4 (kịch bản L). Chưa đo iOS. |
| Ngưỡng hiệu năng bắt buộc                        | Bảng trên                                                                                                                                                     | Giữ nguyên các ngưỡng của mục 11.2; ngoại lệ Firefox canvas WebGL (M) được chấp nhận, đo lại ở GĐ4 (ADR 0018)                                                               |
| `desynchronized` trên Chromium                   | Độ trễ sự kiện → frame p95 15 ms; benchmark tự động không đo được độ trễ hiển thị thật và xé hình                                                             | Giữ bật (mặc định của plan); kiểm tra xé hình bằng mắt ở mốc Alpha                                                                                                          |
| `overscroll-behavior` chặn vuốt Back trên Safari | Chưa có máy Mac để thử                                                                                                                                        | Chưa chốt — kiểm tay ở mốc Alpha; lớp dự phòng (hash route) đã có                                                                                                           |

## GĐ2 — Màu, hình khối, chữ, chú thích (2026-10-17)

**Thiết bị, trình duyệt:** như GĐ1 (i7-7500U, 8 GB, HD 620 · Chromium 156.0.8078.4, Firefox 157.0).

**Thay đổi cách đo:** layer chú thích của kịch bản S có **24 đối tượng thật** (8 mũi tên, 6 khung,
4 highlight `multiply`, 2 vùng che, 4 chữ tiếng Việt) — nét vẽ thử đi qua chúng. Thêm phép đo
**Paint Bucket tô toàn ảnh** (dung sai 100% — trường hợp xấu nhất: mặt nạ 8,3 MP cho M) trên layer
raster trên cùng: thời gian từ click tới khi ảnh mới hiện ra, và khung dài nhất trong lúc tô ("UI
không bị treo"). Mỗi cấu hình chạy 2 lần, ghi lần chậm hơn.

| Kịch bản · trình duyệt      | Frame p95 | Frame max     | Độ trễ p95    | Undo / Redo  | Paint Bucket | Khung dài nhất khi tô |
| --------------------------- | --------- | ------------- | ------------- | ------------ | ------------ | --------------------- |
| S · Chromium GPU            | 16,9 ms   | 19,4 ms       | 15,6 ms       | 2,9 / 1,1 ms | 178 ms       | 51 ms                 |
| M · Chromium GPU            | 16,9 ms   | 18,3 ms       | 15,3 ms       | 8 / 1,7 ms   | 564 ms       | 133 ms                |
| S · Chromium headless       | 16,7 ms   | 16,8 ms       | 14,8 ms       | 24 / 19 ms   | 186 ms       | 33 ms                 |
| M · Chromium headless       | 16,8 ms   | 50 ms         | 15,2 ms       | 101 / 109 ms | 489 ms       | 167 ms                |
| S · Firefox canvas phần mềm | 16,7 ms   | 43 ms         | 17 ms         | 25 / 23 ms   | 182 ms       | 50 ms                 |
| M · Firefox canvas phần mềm | 16,7 ms   | 60 ms         | 18 ms         | 60 / 55 ms   | 570 ms       | 133 ms                |
| S · Firefox canvas WebGL    | 16,7 ms   | 33 ms         | 18 ms         | 33 / 37 ms   | 203 ms       | 33 ms                 |
| M · Firefox canvas WebGL    | 16,7 ms   | **317 ms** ⚠️ | **304 ms** ⚠️ | 60 / 51 ms   | 551 ms       | 100 ms                |

Ngưỡng bắt buộc: frame p95 ≤ 33 ms · không frame > 200 ms · độ trễ ≤ 50 ms · undo/redo ≤ 200 ms ·
**Paint Bucket ≤ 1 s (M), UI không treo**. **Đạt toàn bộ**, trừ ngoại lệ đã chấp nhận ở ADR 0018
(Firefox canvas WebGL, M: ~2,5 s đầu của nét đầu tiên; diễn biến `217/3 300/4 283/2 300/2 317/2
17/31…` giống GĐ1 — đo lại ở GĐ4). 24 đối tượng chú thích không làm chậm kịch bản S (frame p95 giữ
16,7–16,9 ms) nên chưa cần cache layer vector (ADR 0020).

Một lần đo Firefox WebGL S (trong lượt chạy đầu sau khi build) có một khung 383 ms; ba lần chạy
lại sau đó đều ≤ 33 ms — ghi nhận là nhiễu lúc khởi động trình duyệt, theo dõi tiếp ở GĐ4.

**Paint Bucket** chưa đạt mức mục tiêu (≤ 300 ms) ở M: phần main thread (đọc pixel layer 33 MB,
dựng ảnh vùng tô, ghi vào layer) chiếm khung dài nhất 100–167 ms. Hướng tối ưu khi cần (chỉ tối ưu
khi ngưỡng bắt buộc trượt — mục 11.2): chuyển `ImageBitmap` của layer sang Worker để đọc pixel và
dựng ảnh vùng tô ngoài main thread.

**Khởi động app** (bản production): Chromium lần đầu 305 ms, lần sau 132 ms; Firefox lần đầu
942 ms, lần sau 457 ms — đạt. **JS khởi động 164,7 KB gzip** (GĐ1: 144,3 KB; ≤ 250 KB). Editor
(tải lười) 25,7 KB gzip; Worker xử lý ảnh 5,9 KB; font chú thích chỉ tải khi vẽ chữ bằng font đó.

## GĐ3 — Project, lưu trữ, autosave (2026-10-17)

**Thiết bị, trình duyệt:** như GĐ1 (i7-7500U 2 nhân/4 luồng → pool 3 Worker, 8 GB · Chromium
156.0.8078.4, Firefox 157.0), headless.

**Cách đo** (`tests/bench/bench.ts → measureSave`): sau phần vẽ/undo/bucket của mỗi kịch bản, chạy
`Autosave` thật trên IndexedDB thật + Worker pool: (1) **lượt lưu đầy đủ** — mọi layer đều mới (lượt
đầu của project, hoặc sau khi kết nối DB bị đóng); (2) **lượt lưu thường** — sau một nét vẽ, chỉ
layer vừa vẽ được mã hóa lại; (3) **mở lại project** — đọc DB + giải mã mọi layer + dựng document.
Trong lúc lưu đo khung dài nhất (rAF) và long task (`PerformanceObserver`, chỉ Chromium có).

| Kịch bản · trình duyệt | Lượt lưu thường | Lượt lưu đầy đủ | Long task / khung dài nhất khi lưu | Mở project |
| ---------------------- | --------------- | --------------- | ---------------------------------- | ---------- |
| S · Chromium           | 131 ms          | 156 ms          | 0 / 17 ms                          | 110 ms     |
| M · Chromium           | 743 ms          | **3 654 ms** ⚠️ | 68 / 67 ms                         | 1 374 ms   |
| S · Firefox            | 113 ms          | 122 ms          | — / 17 ms                          | 182 ms     |
| M · Firefox            | 430 ms          | 1 885 ms        | — / 42 ms                          | 2 140 ms   |

Ngưỡng bắt buộc (11.2): một lượt autosave không gây long task > 100 ms và hoàn tất ≤ 3 s (M); mở
project ≤ 3 s (M). **Đạt**, trừ lượt lưu đầy đủ của M trên Chromium (5 layer 4K đều mới: 3 Worker
phải mã hóa 2 đợt, ~1,3 s mỗi layer) — trường hợp hiếm (lượt lưu thường chỉ mã hóa layer vừa đổi);
chủ dự án chấp nhận là ngoại lệ ([ADR 0022](./adr/0022-full-save-exception.md)). Các chỉ số vẽ của S/M không đổi so với GĐ2.

**Hai lần tối ưu có số đo** (bộ mã hóa PNG RGBA tự viết — ADR 0021):

| Lần                                                                                              | M · lưu thường (Chromium / Firefox) | M · lưu đầy đủ | Long task M |
| ------------------------------------------------------------------------------------------------ | ----------------------------------- | -------------- | ----------- |
| Ban đầu: chọn bộ lọc theo từng dòng (4 bộ lọc), nén fflate mức 4, ảnh thu nhỏ mỗi lượt           | 1 809 / 3 595 ms                    | 7 326 / 10 476 | 103 ms      |
| 1. Bộ lọc Paeth cố định, một lượt (lọc 4K: ~0,7 s → ~0,29 s)                                     | (chỉ đo theo bước)                  | —              | —           |
| 2. Nén bằng `CompressionStream('deflate')` native (fallback fflate); ảnh thu nhỏ tối đa mỗi 20 s | 743 / 430 ms                        | 3 654 / 1 885  | 68 ms       |

Đo riêng từng bước cho một layer 4K (browser test tạm): đọc pixel 47–65 ms; lọc Paeth ~290 ms; nén
fflate mức 1: 0,8–1,1 s; `CompressionStream`: Chromium ~1,0 s (nén tốt hơn ~30%), Firefox ~0,22 s.

**Quyết định 10.4 đến hạn ở GĐ3:**

- _`createImageBitmap(surface)` chụp nội dung ngay khi gọi_ — **đúng** trên Chromium, Firefox, WebKit
  (test "chụp rồi vẽ ngay" trong `storage.browser.test.ts`, kể cả khi nét sau làm surface cấp phát
  lại). Giữ thiết kế, không cần surface tạm.
- _Khoảng autosave 1,5 s / tối đa 10 s, mã hóa PNG_ — giữ nguyên khoảng; PNG mã hóa bằng bộ mã hóa
  riêng (ADR 0021) vì bộ mã hóa PNG của canvas trên Firefox/WebKit không bảo toàn pixel bán trong
  suốt. Không cần chuyển sang RGBA thô.

**Khởi động app** (bản production): Chromium lần đầu 374 ms, lần sau 147 ms; Firefox lần đầu
1 287 ms, lần sau 420 ms — đạt. **JS khởi động 192,3 KB gzip** (GĐ2: 164,7 KB; ≤ 250 KB): thêm
repository/autosave/khóa tab (idb, valibot) và trang chủ quản lý project. Phần chỉ dùng khi cần được
tải lười: module `.paint` 2,1 KB, codec main thread (fallback) 10,5 KB, encoder WebP WASM 7,5 KB JS +
116–129 KB WASM (chỉ khi trình duyệt không tự mã hóa WebP). Worker xử lý ảnh 29,9 KB (gồm fflate,
PNG, ZIP).

## GĐ4 — Hệ thống layer đầy đủ (2026-10-17)

**Thiết bị, trình duyệt:** như GĐ1 (i7-7500U, 8 GB, HD 620 — hạng D2) · Chromium 156.0.8078.4,
Firefox 157.0. "GPU" = `HEADED=1` (GPU thật); "headless" = canvas phần mềm.

### Ngưỡng bắt buộc — kịch bản S, M (`npm run bench`, headless, 3 lần đo lặp cho M)

| Kịch bản · trình duyệt | Frame p95 / max | Độ trễ p95 | Undo / Redo | Paint Bucket | Lưu thường | Long task khi lưu | Mở project  |
| ---------------------- | --------------- | ---------- | ----------- | ------------ | ---------- | ----------------- | ----------- |
| S · Chromium           | 16,7 / 16,8 ms  | 14 ms      | 28 / 19 ms  | 244 ms       | 179 ms     | 0 ms              | 144 ms      |
| M · Chromium           | 16,7 / 33–50 ms | 15 ms      | 54–96 ms    | 397–533 ms   | 545–741 ms | 77–91 ms          | 1,63–1,69 s |
| S · Firefox            | 16,7 / 45 ms    | 17 ms      | 27 / 20 ms  | 257 ms       | 145 ms     | —                 | 229 ms      |
| M · Firefox            | 16,7 / 39–57 ms | 17 ms      | 44–50 ms    | 581–592 ms   | 413–464 ms | —                 | 2,32–2,36 s |

**Đạt mọi ngưỡng bắt buộc của mục 11.2 cho S và M** (nghiệm thu GĐ4: "ngưỡng bắt buộc đạt cho kịch
bản M"). Lượt lưu đầy đủ M (ngoại lệ ADR 0022): Chromium 4,2–4,5 s, Firefox 1,8 s — dưới mốc hồi
quy 6 s; so với GĐ3 (3,65 s) chậm hơn ~0,3 s do Below cache chiếm GPU (đo tắt cache: 3,9 s), phần
còn lại là dao động của máy (mở project cũng chậm hơn GĐ3 ~20% ở cả hai trình duyệt, mã không
đổi). Long task khi lưu 77–91 ms (GĐ3: 68 ms) — vẫn dưới 100 ms, cần theo dõi ở GĐ9.

### Quyết định 10.4: Below/Above cache (M, L × 5, 20 layer — `BENCH_LAYERS=1 HEADED=1`)

`tests/bench/layers.spec.ts`: layer hoạt động ở giữa (cache dưới và trên đều dùng), 5 layer đầu phủ
kín, layer thêm phủ 1/3 × 1/3 ảnh. Vẽ 2 × 5 s, undo/redo, pan 2 s ở mức vừa khung và ở zoom 25%,
đổi layer hoạt động 4 lần (frame kế tiếp + thời gian dựng dần cache lúc rảnh).

| GPU · kịch bản    | Vẽ p95 (có / không cache) | Vẽ max       | Độ trễ p95  | Pan p95     | Pan 25% p95 | Undo        |
| ----------------- | ------------------------- | ------------ | ----------- | ----------- | ----------- | ----------- |
| Chromium · M × 5  | 16,9 / 16,9 ms            | 20 / 22 ms   | 16 / 16 ms  | 21,7 / 33,4 | 17,9 / 19,0 | 5,7 / 5,1   |
| Chromium · M × 20 | 17,0 / 17,0 ms            | 17 / 18 ms   | 16 / 16 ms  | 17,7 / 51,5 | 17,2 / 51,7 | 3,7 / 11,7  |
| Chromium · L × 5  | 17,1 / 17,0 ms            | 20 / 84 ms   | 16 / 16 ms  | 17,3 / 18,2 | 16,9 / 17,9 | 31,5 / 28,2 |
| Chromium · L × 20 | 17,1 / 17,1 ms            | 19 / 23 ms   | 16 / 16 ms  | 17,2 / 33,2 | 17,1 / 22,5 | 26,4 / 8,7  |
| Firefox · M × 5   | **22,4 / 32,8 ms**        | 221 / 371 ms | 19 / 274 ms | 33,3 / 33,4 | 16,7 / 37,6 | 60 / 65     |
| Firefox · M × 20  | **22,4 / 33,3 ms**        | 183 / 961 ms | 83 / 873 ms | 33,4 / 50,0 | 33,2 / 50,0 | 60 / 83     |
| Firefox · L × 5   | 22,4 / 35,3 ms            | 83 / 145 ms  | 20 / 30 ms  | 21,4 / 33,3 | 16,7 / 16,7 | 113 / 115   |
| Firefox · L × 20  | 22,7 / 23,0 ms            | 100 / 117 ms | 21 / 22 ms  | 45,0 / 33,4 | 33,4 / 19,0 | 153 / 128   |

**Quyết định: giữ Below/Above cache.** Chênh lệch ≥ 20% ở kịch bản M với cả 5 và 20 layer:
Firefox (canvas WebGL) frame p95 khi vẽ giảm 32%, độ trễ và khung dài nhất giảm mạnh (giai đoạn
"khởi động" của ADR 0018); Chromium pan giảm 35–66%, undo M × 20 giảm 68%. Frame khi vẽ trên
Chromium như nhau vì Renderer chỉ vẽ lại vùng bẩn. Headless (canvas phần mềm) cho chênh lệch nhỏ và
nhiễu hơn — quyết định dựa trên số đo GPU như mục 11.2.

Đổi layer hoạt động (cache phải dựng lại): frame kế tiếp vẽ trực tiếp, cache dựng dần lúc rảnh
(≤ 8 ms mỗi lượt). Chromium GPU: frame kế tiếp 1–20 ms, dựng xong sau 50–275 ms. **Firefox L × 20:
frame kế tiếp 335 ms** (vẽ trực tiếp 20 layer 24 MP chưa có mipmap riêng) — một lần khựng khi đổi
layer ở mức vừa khung, không xảy ra khi vẽ. Trước khi có dựng dần: ~550 ms (headless, dựng cả cache
trong một frame).

### Quyết định 10.4: mipmap (pan ở zoom thấp, kịch bản L, cache bật)

| GPU · kịch bản    | Pan vừa khung (~19%) có / không mipmap | Pan 25% có / không mipmap | Vẽ p95 có / không mipmap |
| ----------------- | -------------------------------------- | ------------------------- | ------------------------ |
| Chromium · L × 5  | 17,3 / 34,5 ms                         | 16,9 / 17,3 ms            | 17,1 / 17,0 ms           |
| Chromium · L × 20 | 17,2 / 34,1 ms                         | 17,1 / 17,3 ms            | 17,1 / 17,0 ms           |
| Firefox · L × 5   | 21,4 / 450 ms                          | 16,7 / 479 ms             | 22,4 / 396 ms            |
| Firefox · L × 20  | 45,0 / 433 ms                          | 33,4 / 433 ms             | 22,7 / 596 ms            |

**Quyết định: giữ mipmap.** Firefox thu nhỏ texture lớn rất chậm (400–600 ms mỗi frame khi không có
mipmap); Chromium pan ở mức vừa khung giảm 50%. Thêm ~1/3 bộ nhớ của bề mặt được mipmap (thu hồi
đầu tiên trong chuỗi).

### ADR 0018 đo lại (Firefox canvas WebGL, M, `HEADED=1 BENCH_CUSTOM=3840x2160x5`)

Nét đầu sau khi mở: ~1 s đầu 7–17 khung/giây (GĐ1: ~2,5 s ở 2–3 khung/giây), **khung dài nhất
133 ms** (GĐ1: ~850 ms), độ trễ p95 21–33 ms (GĐ1: ~880 ms), frame p95 16,7 ms. Đạt mọi ngưỡng vẽ
bắt buộc của M — Below cache giảm số surface 4K ghép mỗi frame từ 5 xuống 2.

### Bộ nhớ theo tier (kiểm lại ở GĐ4)

L × 20 dùng 1,07–1,32 GB ước lượng (layer 712 MB, cache + mipmap 0,2–0,46 GB) trên cả hai trình
duyệt, không lỗi cấp phát, không mất tab; khi layer chạm phần 60% (benchmark L × 20 phủ 1/2 × 1/2:
866 MB) nét vẽ mới bị từ chối có thông báo và cache được thu hồi trước — đúng chuỗi của mục 5.11.
Giữ 1,5 GB / 768 MB / 320 MB; chưa đo iOS.

### Quyết định 10.4: tiled layer storage — không làm ở GĐ4 (ADR 0024)

Điều kiện (b) "p95 > 50 ms trên L do composite" **không xảy ra** (L × 5, L × 20: p95 16,7–22,7 ms,
cả GPU lẫn headless). Điều kiện (a) "XL ≥ 5 layer vượt ngân sách desktop" **đúng về số học** khi
layer phủ kín: một layer 8192² = 256 MB, phần layer 60% của 1,5 GB = 921,6 MB → tối đa 3 layer
phủ kín (đúng kịch bản XL của plan); layer thứ 4 bị từ chối có thông báo. Lưu theo tile thưa không
giảm bộ nhớ cho layer phủ kín, chỉ giúp layer có nội dung rải rác (hình bao 256 px của
GrowableSurface lớn hơn tổng tile thật). Chủ dự án chọn không làm tile ở GĐ4 (ADR 0024); GĐ9 đo
thêm mức lãng phí của hình bao với nội dung rải rác trên L và XL.

**Khởi động app** (production): Chromium lần đầu 395 ms, lần sau 209 ms; Firefox lần đầu 464 ms,
lần sau 278 ms — đạt. **JS khởi động 196,1 KB gzip** (GĐ3: 192,3 KB; ≤ 250 KB): panel
Layers/History, dnd-kit nằm trong chunk editor tải lười (47,4 KB gzip).

## GĐ5 — Selection và biến đổi ảnh (2026-10-18)

**Thiết bị, trình duyệt:** như GĐ1 (i7-7500U, 8 GB, HD 620 — hạng D2) · Chromium 156.0.8078.4,
Firefox 157.0. Mọi số đo dưới đây với `HEADED=1` (GPU thật).

### Nghiệm thu: crop/resize trên kịch bản L không làm treo UI (`HEADED=1 npm run bench -- docops`)

Kịch bản L: 6000 × 4000, 10 layer (5 phủ kín + 5 phủ 1/3 × 1/3). "Xử lý" = từ lúc bấm tới khi
command vào history; "khung dài nhất" = khoảng cách lớn nhất giữa hai frame trong lúc đó; "vẽ lại" =
frame đầu tiên sau khi mọi layer đổi (cache, mipmap dựng lại).

| Thao tác    | Chromium: xử lý / khung dài nhất / vẽ lại | Firefox: xử lý / khung dài nhất / vẽ lại |
| ----------- | ----------------------------------------- | ---------------------------------------- |
| Crop 80%    | 119 ms / 50 ms / 17 ms                    | 459 ms / 33 ms / 317 ms                  |
| Undo crop   | 1 ms / — / 167 ms                         | 1 ms / — / 400 ms                        |
| Resize 50%  | 51 ms / 17 ms / 100 ms                    | 351 ms / 67 ms / 150 ms                  |
| Undo resize | 1 ms / — / 67 ms                          | 1 ms / — / 483 ms                        |
| Xoay 90°    | 159 ms / 17 ms / 283 ms                   | 2,0 s / 100 ms / 383 ms                  |
| Undo xoay   | 1 ms / — / 166 ms                         | 1 ms / — / 367 ms                        |
| Canvas +10% | 162 ms / 17 ms / 17 ms                    | 774 ms / 67 ms / 100 ms                  |
| Undo canvas | 3 ms / — / 17 ms                          | 1 ms / — / 383 ms                        |

Lượt chạy lại (có `TRACE=1`): khung vẽ lại Chromium tới 363 ms (Canvas +10%), không khoảng nào > 0,5
s kể cả lúc rảnh khi history đang nén layer cũ. Không long task nào trong lúc xử lý (Chromium; Firefox
không có API long task). **Mọi thao tác hoàn
thành, trong lúc xử lý không khung nào > 117 ms** → đạt nghiệm thu "UI không bị treo". Khung vẽ lại
đầu tiên trên Firefox 100–490 ms: cùng nguyên nhân với ghi nhận GĐ4 (vẽ trực tiếp nhiều layer 24 MP
khi cache/mipmap đang dựng lại — ADR 0023), đo lại ở GĐ9.

### Các lần tối ưu có số đo trước/sau

| #   | Triệu chứng (GPU thật)                                     | Nguyên nhân                                                        | Sửa                                                                        | Kết quả                                  |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | Xoay, Canvas size trên L bị từ chối "hết bộ nhớ layer"     | Layer cũ (snapshot cho undo) + layer mới vượt phần 60% của layer   | Dựng layer mới trong hạng mục `temp`, chuyển sang `layer` khi vào document | Chạy được; vẫn từ chối khi vượt tổng     |
| 2   | Resize sau một lần undo crop bị từ chối                    | Layer của nhánh redo vẫn giữ bộ nhớ                                | Bỏ nhánh redo trước khi dựng layer mới                                     | Chạy được                                |
| 3   | Khung 1,4 s lúc rảnh ngay sau crop/resize (cả Flatten GĐ4) | Nén history đọc cả layer 96 MB từ GPU một lần                      | Nén theo dải ~4 MB, nghỉ lúc rảnh giữa các dải                             | Hết khung > 1 s lúc rảnh                 |
| 4   | Resize: khung 1,4 s trên Chromium                          | Resample trong Worker: chép ảnh 96 MB qua lại giữa các GPU context | Resample trên GPU ngay main thread (giảm từng nửa + song tuyến)            | Vẽ lại 1 384 → 100 ms; xử lý 130 → 51 ms |
| 5   | Xoay trên Firefox: khung 300–667 ms mỗi layer              | Chép cả layer 24 MP trong một lượt `drawImage`                     | Chép theo dải ~4 MP, nhường main thread giữa các dải                       | Khung dài nhất khi xử lý 667 → 100 ms    |

### Ngưỡng bắt buộc — kịch bản S, M kiểm lại (`HEADED=1 npm run bench -- bench.spec`)

| Kịch bản · trình duyệt | Frame p95 / max | Độ trễ p95 | Undo  | Paint Bucket | Lưu thường | Mở project |
| ---------------------- | --------------- | ---------- | ----- | ------------ | ---------- | ---------- |
| S · Chromium           | 16,8 / 20 ms    | 16 ms      | 4 ms  | 171 ms       | 165 ms     | 141 ms     |
| M · Chromium           | 16,8 / 19 ms    | 15 ms      | 7 ms  | 378 ms       | 599 ms     | 2,00 s     |
| S · Firefox            | 16,7 / 83 ms    | 18 ms      | 26 ms | 189 ms       | 128 ms     | 183 ms     |
| M · Firefox            | 16,7 / 100 ms   | 22 ms      | 54 ms | 558 ms       | 398 ms     | 2,45 s     |

Không hồi quy: vùng chọn không tốn gì khi không dùng (nét vẽ chỉ bị cắt khi có vùng chọn). Long task
khi lưu (Chromium): 0 ms.

**Khởi động app** (production): Chromium lần đầu 575 ms, lần sau 185 ms; Firefox lần đầu 1 036 ms,
lần sau 487 ms — đạt (lần sau ≤ 1,5 s). **JS khởi động 220,6 KB gzip** (GĐ4: 196,1 KB; mục tiêu ≤ 250
KB): engine vùng chọn và biến đổi ảnh nằm trong chunk khởi động cùng phần còn lại của engine; hộp
thoại, menu Ảnh, tool island ở chunk editor tải lười (55,6 KB gzip). Còn ~29 KB cho GĐ6–GĐ8 — nếu
vượt, tách engine sang chunk tải lười khi mở editor.

## GĐ6 — Điều chỉnh và bộ lọc (2026-10-18)

**Thiết bị, trình duyệt:** như GĐ1 (i7-7500U, 8 GB, HD 620 — hạng D2, pool 3 Worker) · Chromium
156.0.8078.4, Firefox 157.0. Kịch bản M: 3840 × 2160, 5 layer.

### Nghiệm thu: xem trước filter khi kéo slider ≤ 100 ms (`HEADED=1 npm run bench -- filters`)

Mỗi pipeline: kéo slider 1,5 s (đổi tham số mỗi frame, ~90 lần), ở zoom vừa khung (31%) và 100%.
"Độ trễ" = từ lúc đổi tham số tới cuối frame đầu tiên vẽ bản xem trước của nó (`onFrame` của
renderer); lần đổi bị gộp vì Worker đang bận không tính. "Thả tay" = dừng kéo 0,3 s rồi đổi một lần.

Chromium, GPU thật — lượt đo trên bản build cuối (các lượt trước trong cùng bản tối ưu: mọi p95 ≤ 69
ms):

| Pipeline             | Vừa khung: p50 / p95 / thả tay | 100%: p50 / p95 / thả tay | Áp dụng full-res (vừa khung / 100%) |
| -------------------- | ------------------------------ | ------------------------- | ----------------------------------- |
| Độ sáng + tương phản | 30 / 41 / 33 ms                | 35 / 44 / 33 ms           | 169 / 127 ms                        |
| Sắc độ + độ bão hòa  | 37 / 67 / 50 ms                | 39 / 56 / 49 ms           | 536 / 193 ms                        |
| Sepia                | 36 / 71 / 31 ms                | 40 / 65 / 33 ms           | 178 / 331 ms                        |
| Đen trắng            | 38 / 58 / 66 ms                | 37 / 66 / 38 ms           | 148 / 140 ms                        |
| Làm mờ (σ 2→40)      | 50 / 67 / 34 ms                | 32 / 51 / 69 ms           | 1,84 / 1,16 s                       |
| Làm sắc nét          | 19 / 50 / 33 ms                | 34 / 67 / 59 ms           | 2,10 / 1,83 s                       |
| Khảm (ô 4→64)        | 33 / 53 / 34 ms                | 34 / 79 / 28 ms           | 309 / 344 ms                        |

Khung dài nhất khi kéo slider ≤ 20 ms (một lần 167 ms ở Sepia vừa khung). Khi áp dụng: khung dài
nhất ≤ 117 ms (một lượt trước có một khung 250 ms ở Sepia 100%); undo ≤ 31 ms. **Đạt ngưỡng bắt buộc
(≤ 100 ms); p50 đạt mục tiêu ≤ 50 ms.** Mở bảng khi đang thu nhỏ ảnh M: lần đọc pixel nguồn đầu tiên từ
GPU khựng 80–150 ms (một lần).

Firefox, GPU thật (cửa sổ headed; trong phiên đo, Windows hạ nhịp cửa sổ — trang trống cũng tụt 11–62
khung/giây, nên số liệu nhiễu): p95 58–88 ms cho Đen trắng, Sepia vừa khung, Làm mờ, Khảm, Độ sáng
100%; **sát/vượt nhẹ**: Sắc độ vừa khung 105 ms, Sắc độ 100% 100 ms, Làm sắc nét 100% 106 ms; hai
dòng có khựng do môi trường (Độ sáng vừa khung chỉ 9 lần cập nhật, Sepia 100% khung 241 ms). Headless
(vẽ bằng CPU): p95 55–134 ms. **Cần đo lại Firefox GPU khi máy không bị hạ nhịp** (GĐ9 hoặc sớm hơn).
Cấu hình benchmark nay tắt hạ nhịp cửa sổ bị che (Firefox `widget.windows.window_occlusion_tracking`,
Chromium `--disable-backgrounding-occluded-windows`).

### Các lần tối ưu có số đo trước/sau (mục 13.4: sau lần 2 đã hỏi chủ dự án — chọn tối ưu lần 3)

| #   | Triệu chứng (Chromium, M)                                                  | Nguyên nhân (profile)                                                                             | Sửa                                                                                                      | Kết quả                                                 |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 0   | Đo đầu: Blur p95 185–268 ms, Sắc độ 150, LUT vừa khung 98; khung kéo 51 ms | —                                                                                                 | —                                                                                                        | —                                                       |
| 1   | LUT vừa khung chậm gấp 3 lần ở 100%                                        | Compositor dựng scratch cỡ document (8,3 MP) mỗi frame dù bản xem trước chỉ ~0,75 MP              | Vẽ thẳng ảnh lọc ở độ phân giải màn hình; ngoài khung xem trước vẽ layer như thường                      | Khung kéo 51 → 19 ms; LUT p95 98 → 53 ms                |
| 1   | Sắc độ, Blur, Sharpen: tính toán chiếm hết                                 | Chỉ một Worker làm việc; vòng lặp Sắc độ có phép chia dư                                          | Chia dải song song trên cả pool; viết lại vòng lặp Sắc độ                                                | Sắc độ p95 150 → 69 ms; Blur vẫn 185–207 ms             |
| 2   | Blur, Sharpen > 100 ms                                                     | Blur JS ~200 ms / 1,45 MP (giới hạn tính toán); kéo bán kính đổi vùng đọc → đọc ngược GPU mỗi lần | Bản nháp thích ứng khi kéo (theo tốc độ đo được), lưới pixel cố định + đọc nguồn một lần, Blur số nguyên | Blur 100% p95 207 → 67 ms; Blur vừa khung còn 99–152 ms |
| 3   | Blur vừa khung p95 99–152 ms, thả tay 117–158 ms                           | Đổi mức nháp → đọc lại GPU; bản đầy đủ sau khi thả tay giữ hết Worker; lưới mức cha tính sai 1 px | Mức 1/2^k thu nhỏ trên CPU, Blur lấy mẫu σ ≥ 4 px, bản đầy đủ nhường ngay khi tham số đổi, sửa lưới      | Mọi p95 ≤ 79 ms (3 lượt), thả tay ≤ 100 ms              |
| 3   | Áp dụng: khung tới 450 ms                                                  | Commit chụp ~135 tile history một lượt                                                            | Chụp tile dần theo từng dải                                                                              | Khung khi áp dụng ≤ 117 ms (một lần 250 ms)             |

### Ngưỡng bắt buộc — kịch bản S, M kiểm lại (`HEADED=1 BENCH_PARAMS=quick=1 npm run bench -- bench.spec`)

| Kịch bản · trình duyệt | Frame p95 / max | Độ trễ p95 | Undo   |
| ---------------------- | --------------- | ---------- | ------ |
| S · Chromium           | 16,8 / 17 ms    | 16 ms      | 2,7 ms |
| M · Chromium           | 16,8 / 17,1 ms  | 16,1 ms    | 2,9 ms |

Không hồi quy: bản xem trước filter chỉ được ghép khi bảng điều chỉnh mở.

**Khởi động app** (production): Chromium lần đầu 504 ms, lần sau 280 ms; Firefox lần đầu 2 426 ms,
lần sau 720 ms — đạt bắt buộc (lần sau ≤ 1,5 s; lần đầu của Firefox vượt mục tiêu 2 s trong lượt đo bị
hạ nhịp ở trên). **JS khởi động 227,3 KB gzip** (GĐ5: 220,6 KB; mục tiêu ≤ 250 KB): FilterRunner nằm
trong engine; các filter thuần nằm trong chunk Worker; menu và bảng điều chỉnh ở chunk editor tải lười
(58,4 KB gzip). Còn ~23 KB cho GĐ7–GĐ8.

## GĐ7 — Screenshot Editor hoàn chỉnh (2026-10-18)

Máy D1, Windows 10, bản production (E2E) / bản dev (đo kéo đối tượng). ADR 0027.

### Nghiệm thu: luồng screenshot đầy đủ dưới 15 giây

Luồng: dán ảnh 1000 × 600 ở trang chủ → kéo mũi tên → U khung → K, chọn Khảm, kéo vùng che → T gõ
"Lỗi ở đây" → N đặt 2 số thứ tự → bật Làm đẹp → Copy (tới khi có thông báo "Đã copy"). Tự động
(`tests/e2e/screenshot.spec.ts`), 5 lần mỗi trình duyệt:

| Trình duyệt | 5 lần (ms)                        |
| ----------- | --------------------------------- |
| Chromium    | 2 279, 1 968, 2 058, 2 243, 2 231 |
| Firefox     | 4 329, 6 105, 4 923, 4 948, 4 564 |
| WebKit      | 4 704, 4 691, 4 848, 5 181, 5 878 |

Đây là thời gian phản hồi của app; người dùng cần **tự đo 5 lần trên trình duyệt dùng hằng ngày**
(chụp màn hình bằng công cụ hệ điều hành → chuyển tab → Ctrl+V → mũi tên, khung, che, chữ, số thứ tự →
Copy) và ghi kết quả vào bảng dưới:

| Lần | Thời gian (s) | Ghi chú |
| --- | ------------- | ------- |
| 1   |               |         |
| 2   |               |         |
| 3   |               |         |
| 4   |               |         |
| 5   |               |         |

### Redact khảm/làm mờ khi kéo (ảnh 1920 × 1080, vùng che 600 × 300, Chromium GPU, bản dev)

| Kiểu        | Lần 1: đọc GPU mỗi khung | Sau tối ưu: khung p50 / p95 | Thả tay (tính chính xác) |
| ----------- | ------------------------ | --------------------------- | ------------------------ |
| Khảm 16 px  | 33 / 38 ms               | 8 / 12 ms                   | 2 ms                     |
| Làm mờ σ 12 | 67 / 91 ms               | 27 / 38 ms (bản nháp ½)     | 57 ms                    |
| Làm mờ σ 40 | 101 / 109 ms             | 45 / 50 ms (bản nháp ½)     | 109 ms                   |

Nguyên nhân lần 1: `getImageData` ~28 ms mỗi khung — vẽ canvas GPU sang canvas CPU khiến Chromium đọc
cả texture nguồn. Sửa: pixel nền đọc một lần cho mỗi trạng thái nền, kéo chỉ chép từ bộ nhớ.

### Ngưỡng bắt buộc — kịch bản S, M kiểm lại (`HEADED=1 BENCH_PARAMS=quick=1`)

| Kịch bản · trình duyệt | Frame p95 / max | Độ trễ p95 | Undo   |
| ---------------------- | --------------- | ---------- | ------ |
| S · Chromium           | 16,8 / 17,7 ms  | 15,6 ms    | 5,2 ms |
| M · Chromium           | 16,8 / 20,5 ms  | 14,9 ms    | 6,7 ms |

Không hồi quy: vùng bẩn chỉ mở rộng khi có Redact khảm/làm mờ hoặc Magnifier đọc nền ở đó.

**JS khởi động 234,2 KB gzip** (GĐ6: 227,3 KB; ≤ 250 KB). Chunk editor tải lười 61,9 KB gzip. Còn
~16 KB cho GĐ8.

## GĐ8+9 gộp — v1.0 cho trình duyệt laptop (2026-10-18)

**Thiết bị D1** (máy dùng hằng ngày của chủ dự án): Dell Vostro 5568, Intel Core i7-7500U (2 nhân /
4 luồng), RAM 7,9 GB, Intel HD 620 + NVIDIA 940MX, Windows 10 · Chromium 156.0.8078.4, Firefox 157.0,
`HEADED=1` (GPU thật). Máy D2 riêng và T1 (iPad) không có — T1 đã bị cắt theo ADR 0028; XL (8192²,
cần RAM ≥ 16 GB) không chạy được trên máy 8 GB này. Mọi số dưới đây đo khi không chạy việc nặng khác
song song: lượt đo đầu (song song với typecheck) cho số sai lệch tới 2–10 lần và đã bị bỏ.

### Ngưỡng bắt buộc — S, M (`HEADED=1 npm run bench -- bench.spec`)

| Kịch bản · trình duyệt | Frame p95 / max | Độ trễ p95 | Undo  | Paint Bucket (khung dài nhất) | Lưu thường | Lưu đầy đủ  | Mở project |
| ---------------------- | --------------- | ---------- | ----- | ----------------------------- | ---------- | ----------- | ---------- |
| S · Chromium           | 16,8 / 18,5 ms  | 14,9 ms    | 4 ms  | 157 ms (50 ms)                | 165 ms     | 220 ms      | 100 ms     |
| M · Chromium           | 16,8 / 17,4 ms  | 14,7 ms    | 5 ms  | 353 ms (100 ms)               | 747 ms     | 4 353 ms ⚠️ | 1 330 ms   |
| S · Firefox            | 16,7 / 16,7 ms  | 17 ms      | 32 ms | 192 ms (33 ms)                | 129 ms     | 149 ms      | 103 ms     |
| M · Firefox            | 16,7 / 83 ms    | 19 ms      | 54 ms | 555 ms (117 ms)               | 412 ms     | 1 662 ms    | 1 291 ms   |

**Đạt mọi ngưỡng bắt buộc.** Long task khi lưu (Chromium) 0 ms. Lưu đầy đủ M trên Chromium là ngoại
lệ ADR 0022: 4,35 s ở lượt chốt, dao động 5,5–9,0 s giữa các lần chạy (CPU 2 nhân bão hòa khi 3
Worker mã hóa song song) — xem ADR 0022 mục GĐ9. Firefox M: 3 lần đo thêm cho khung dài nhất
117–150 ms, độ trễ p95 21–44 ms (ADR 0018 đã hết ảnh hưởng nghiệm thu).

**Khởi động app** (production): Chromium lần đầu 501 ms, lần sau 293 ms; Firefox lần đầu 693 ms, lần
sau 347 ms — đạt (lần sau ≤ 1,5 s; lần đầu ≤ 2 s). **JS khởi động 170,7 KB gzip** (GĐ7: 234,2 KB;
≤ 250 KB): Canvas Engine thành chunk riêng tải lười (67,1 KB gzip, tải trước lúc rảnh), editor
58,5 KB, Command Palette 6,0 KB, Cài đặt 2,2 KB. Service worker precache 62 file (2,4 MB, gồm WASM).

### Hai lần tối ưu có số đo

| #   | Triệu chứng                            | Nguyên nhân                                                                     | Sửa                                                           | Kết quả                                                      |
| --- | -------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | Mở project M Chromium 3,26 s (> 3 s)   | Đọc 1 pixel sau khi mở mất 1,65 s: ghép vào canvas CPU nên đọc ngược cả texture | `readPixels` ghép trên canvas GPU, chỉ đọc ngược vùng cần đọc | Đọc 1 px: 266 → 3 ms; mở M 3,26 → 1,33 s                     |
| 2   | Mở project M Firefox 3,5–3,7 s (> 3 s) | Giải mã 5 layer 4K 3,3 s: `unfilter` rẽ nhánh theo từng byte                    | Vòng riêng cho từng bộ lọc PNG                                | Giải mã 3,3 → 1,2 s; mở M 1,29 s (Chromium cũng 1,5 → 1,2 s) |

Phát hiện nhờ benchmark có thêm chi tiết từng bước khi mở project (`[bench] mở project: đọc DB …,
giải mã …, dựng document …, khung đầu …`). GĐ7 chỉ đo `quick=1` (bỏ lưu/mở) nên hồi quy này không bị
thấy sớm hơn.

### Kịch bản L (`BENCH_CUSTOM=6000x4000x10`) — ngưỡng bắt buộc: frame p95 ≤ 50 ms trên D1

| Trình duyệt | Frame p95 / max | Độ trễ p95 | Undo   | Paint Bucket | Lưu thường | Lưu đầy đủ | Mở project | Bộ nhớ   |
| ----------- | --------------- | ---------- | ------ | ------------ | ---------- | ---------- | ---------- | -------- |
| Chromium    | 16,8 / 20,6 ms  | 15,5 ms    | 23 ms  | 898 ms       | 1,6 s      | 14,1 s     | 15,3 s     | 1 142 MB |
| Firefox     | 16,7 / 100 ms   | 18 ms      | 105 ms | 1 736 ms     | 1,2 s      | 7,0 s      | 5,7 s      | 1 164 MB |

**Đạt** (frame p95 16,8 ms). Lưu/mở/Paint Bucket không có ngưỡng bắt buộc cho L (mục 11.2 chỉ áp cho
M); ghi lại là giới hạn của máy 8 GB / 2 nhân với 10 layer 24 MP (240 MP dữ liệu).

### Quyết định 10.4 kiểm lại

- **Below/Above cache, mipmap** (`BENCH_LAYERS=1`): Chromium mọi kịch bản frame p95 16,8 ms; cache
  giảm pan p95 M × 5 từ 35 → 18 ms, M × 20 từ 48 → 17 ms. Firefox: tắt cache thì M × 20 frame p95
  817 ms; tắt mipmap thì L p95 ~600 ms. **Giữ cache và mipmap.**
- **Tiled storage**: đo lãng phí khi nội dung rải thưa trên L — 0,8× (chú thích tập trung) tới 27×
  (2 nét ở hai góc), trần là một layer phủ kín. **Đề xuất giữ surface liền khối ở v1.0**, tiled
  storage cho v1.x nếu cần — [ADR 0029](./adr/0029-tiled-storage-v1x.md), chờ chủ dự án quyết định.
- **Áp lực bộ nhớ** (`STRESS=1`): 57 canvas 4K tới 1,8 GB trên cả hai trình duyệt, từ chối an toàn,
  không crash tab.

### Xem trước bộ lọc (M, `filters.spec`) và biến đổi ảnh (L, `docops.spec`)

- Chromium: mọi bộ lọc p95 ≤ 67 ms. Firefox: mọi bộ lọc p95 ≤ 86 ms (GĐ6: Hue 105, Sharpen 106 ms —
  **đã đạt**), trừ lần mở bảng đầu tiên khi ảnh đang thu nhỏ: 264 ms (đọc pixel nguồn lần đầu từ GPU).
- Biến đổi ảnh L: mọi thao tác hoàn thành, trong lúc xử lý khung dài nhất ≤ 167 ms (Chromium ≤ 17 ms).
  Khung vẽ lại đầu tiên trên Firefox 112–939 ms (cache/mipmap dựng lại — giới hạn đã biết từ GĐ5).
  Undo Canvas size trên Firefox từng bị "hết bộ nhớ layer" khi layer cũ đã được nén lúc rảnh — đã sửa
  (ADR 0028 mục 18), có test hồi quy; 14 lần chạy lại sau khi sửa đều undo được (636–711 ms).
- **Còn treo (Firefox, L)**: khoảng 3/30 lần chạy, "Canvas +10%" bị từ chối `image.failed` (thao tác
  hủy an toàn, ảnh giữ nguyên) — không tái hiện được trong 22 lần chạy sau khi thêm ghi chi tiết lỗi;
  lần sau xảy ra, nhật ký lỗi (Cài đặt) và console của bench sẽ có nguyên nhân. Khung dài nhất khi xoay
  90° trên Firefox 133–240 ms (mốc 200 ms của bench thỉnh thoảng bị vượt, GĐ5: 100 ms).

### Luồng screenshot (nghiệm thu GĐ7, đo lại sau khi engine tải lười)

Tự động 5 lần, cả bộ E2E chạy song song 2 worker: Chromium 2,5–3,2 s, Firefox 5,2–7,9 s, WebKit
5,4–6,4 s (≤ 15 s). Bảng tự đo của chủ dự án ở mục GĐ7 vẫn cần điền.

### Accessibility, offline

- axe (`tests/e2e/a11y.spec.ts`): **0 lỗi serious/critical** ở trang chủ, editor Paint và Screenshot,
  menu Xem, mini toolbar, Command Palette, Cài đặt, bảng phím tắt, hộp thoại Xuất — 2 theme × 3 engine.
- Offline (`tests/e2e/offline.spec.ts`): tắt mạng rồi reload — mở lại project, vẽ, Ctrl+S, về trang
  chủ, tạo ảnh mới, mở Command Palette — đạt trên Chromium và Firefox. Safari kiểm tay
  ([manual-testing.md](./manual-testing.md)).
