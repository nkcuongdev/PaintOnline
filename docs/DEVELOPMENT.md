# Phát triển

## Yêu cầu

- Node.js 22 hoặc 24 LTS (xem `.nvmrc`; Node 25 chạy được nhưng `vitest`/`jsdom` báo cảnh báo engine)
- npm 10+

```bash
npm install
npx playwright install chromium firefox webkit
npm run dev
```

## Lệnh

| Lệnh                   | Việc                                                    |
| ---------------------- | ------------------------------------------------------- |
| `npm run dev`          | Dev server Vite (không có service worker)               |
| `npm run build`        | Typecheck + build production vào `dist/`                |
| `npm run preview`      | Phục vụ `dist/` với đúng CSP của bản deploy             |
| `npm run typecheck`    | TypeScript strict                                       |
| `npm run lint`         | ESLint (kèm quy tắc ranh giới module của `engine/`)     |
| `npm run format`       | Prettier                                                |
| `npm test`             | Unit test (Node) + component test (jsdom)               |
| `npm run test:browser` | Vitest browser mode trên Chromium, Firefox, WebKit      |
| `npm run test:e2e`     | Build + Playwright E2E trên 3 engine                    |
| `npm run check`        | Chạy toàn bộ: typecheck, lint, format, mọi test, build  |
| `npm run bench`        | Benchmark S/M + khởi động (`HEADED=1` để dùng GPU thật) |

Chỉ chạy một engine khi test browser trên máy: `VITEST_BROWSERS=chromium npm run test:browser`.

## Công cụ dev

Chỉ có trong bản `npm run dev`, gõ trong DevTools console:

| Lệnh                                  | Việc                                             |
| ------------------------------------- | ------------------------------------------------ |
| `__paint.record()` / `__paint.stop()` | Ghi input thành JSON                             |
| `__paint.replay(json)`                | Phát lại input (cả "hộp đen" lấy từ nhật ký lỗi) |
| `__paint.memory()`                    | Xem bộ nhớ và số canvas đang sống                |
| `__paint.editor()`                    | Lấy `Editor` để gỡ lỗi                           |

## Benchmark

**Kịch bản:** S 1920×1080, 1 raster + 1 vector · M 3840×2160, 5 layer · L 6000×4000, 10 layer ·
XL 8192×8192, 3 layer.

| Biến                                  | Việc                                                       |
| ------------------------------------- | ---------------------------------------------------------- |
| `HEADED=1`                            | Mở cửa sổ thật để dùng GPU (headless vẽ bằng CPU)          |
| `BENCH_PARAMS="scenario=S&noobjects"` | Chọn kịch bản, bỏ đối tượng chú thích; `quick=1` bỏ lưu/mở |
| `BENCH_CUSTOM=3840x2160x5`            | Kịch bản tùy chỉnh (L: `6000x4000x10`)                     |
| `BENCH_LAYERS=1`                      | Đo Below/Above cache, mipmap với 5/20 layer                |
| `STRESS=1`                            | Áp lực bộ nhớ                                              |
| `WARMUP=3000`                         | Thời gian chờ trước khi vẽ (ms)                            |

Các bộ đo khác trong `tests/bench/`: `layers.spec.ts`, `docops.spec.ts` (biến đổi ảnh trên L),
`filters.spec.ts` (xem trước bộ lọc), `stress.spec.ts`. Chạy một bộ:
`HEADED=1 npm run bench -- filters`.

> [!TIP]
> Cửa sổ bench chạy headed có thể bị Windows hạ còn 0–5 fps. Nếu số đo lạ, kiểm tra fps của một trang
> trống trước, và đừng chạy việc nặng khác (typecheck, build) song song.

### Ngưỡng

| Chỉ số                    | Bắt buộc                                   | Mục tiêu                        |
| ------------------------- | ------------------------------------------ | ------------------------------- |
| Frame time khi vẽ, p95    | S, M ≤ 33 ms; L ≤ 50 ms                    | ≤ 16,7 ms cho S, M              |
| Frame dài nhất khi vẽ     | Không frame nào > 200 ms                   | ≤ 50 ms                         |
| Độ trễ pointer → hiển thị | ≤ 50 ms                                    | ≤ 20 ms                         |
| Undo/redo một nét         | ≤ 200 ms (M)                               | ≤ 50 ms                         |
| Paint Bucket              | ≤ 1 s (M), UI không treo                   | ≤ 300 ms                        |
| Xem trước filter          | ≤ 100 ms mỗi lần cập nhật                  | ≤ 50 ms                         |
| Một lượt autosave         | Không long task > 100 ms; ≤ 3 s (M)        | Main thread ≤ 16 ms; ≤ 1 s      |
| Mở project                | ≤ 3 s (M)                                  | ≤ 1,5 s                         |
| Khởi động app             | Lần sau (đã cache) ≤ 1,5 s                 | Lần đầu ≤ 2 s; JS ≤ 250 KB gzip |
| Bộ nhớ                    | Không vượt ngân sách tier; không crash tab | —                               |

Lượt lưu đầy đủ nhiều layer 4K là ngoại lệ của ngưỡng 3 s ([ADR 0022](./DECISIONS.md#adr-0022)).

### Kết quả v1.0 (2026-10-18)

Máy D1: Dell Vostro 5568, Core i7-7500U (2 nhân / 4 luồng), RAM 7,9 GB, Intel HD 620 + NVIDIA 940MX,
Windows 10 · Chromium 156, Firefox 157, `HEADED=1`.

| Kịch bản · trình duyệt | Frame p95 / max | Độ trễ p95 | Undo   | Paint Bucket | Lưu thường | Lưu đầy đủ  | Mở project |
| ---------------------- | --------------- | ---------- | ------ | ------------ | ---------- | ----------- | ---------- |
| S · Chromium           | 16,8 / 18,5 ms  | 14,9 ms    | 4 ms   | 157 ms       | 165 ms     | 220 ms      | 100 ms     |
| M · Chromium           | 16,8 / 17,4 ms  | 14,7 ms    | 5 ms   | 353 ms       | 747 ms     | 4 353 ms ⚠️ | 1 330 ms   |
| S · Firefox            | 16,7 / 16,7 ms  | 17 ms      | 32 ms  | 192 ms       | 129 ms     | 149 ms      | 103 ms     |
| M · Firefox            | 16,7 / 83 ms    | 19 ms      | 54 ms  | 555 ms       | 412 ms     | 1 662 ms    | 1 291 ms   |
| L · Chromium           | 16,8 / 20,6 ms  | 15,5 ms    | 23 ms  | 898 ms       | 1,6 s      | 14,1 s      | 15,3 s     |
| L · Firefox            | 16,7 / 100 ms   | 18 ms      | 105 ms | 1 736 ms     | 1,2 s      | 7,0 s       | 5,7 s      |

- **Đạt mọi ngưỡng bắt buộc.** Long task khi lưu 0 ms. L không có ngưỡng cho lưu/mở/Paint Bucket.
- Khởi động: Chromium lần đầu 501 ms, lần sau 293 ms; Firefox 693 / 347 ms. JS khởi động 170,7 KB gzip.
- Xem trước bộ lọc (M): Chromium p95 ≤ 67 ms, Firefox ≤ 86 ms (lần mở bảng đầu tiên khi đang thu nhỏ
  ảnh: 264 ms).
- Áp lực bộ nhớ: 57 canvas 4K tới 1,8 GB, từ chối an toàn, không crash tab.
- Luồng screenshot tự động: Chromium 2,5–3,2 s, Firefox 5,2–7,9 s, WebKit 5,4–6,4 s (≤ 15 s).
- axe: 0 lỗi serious/critical trên mọi màn hình chính, 2 theme × 3 engine.

### Giới hạn đã biết

- Firefox, ảnh L: khung vẽ lại đầu tiên sau biến đổi ảnh 0,1–0,9 s (cache/mipmap dựng lại); khoảng
  3/30 lần "Canvas +10%" bị từ chối an toàn (ảnh giữ nguyên), chưa tái hiện được.
- Nhiều layer có nét rải thưa trên ảnh ≥ 24 MP chạm ngân sách bộ nhớ sớm hơn số pixel thật sự vẽ
  ([ADR 0029](./DECISIONS.md#adr-0029)).

## Kiểm thử thủ công

Playwright không mô phỏng được phím mà trình duyệt xử lý trước trang web, hộp chọn file của hệ điều
hành hay toàn màn hình thật. Kiểm tay ở mỗi mốc. Ghi: ✅ phím chính chạy · ↪ trình duyệt giành phím,
phím dự phòng chạy · ❌ lỗi.

### Phím dễ xung đột với trình duyệt

| Phím                       | Lệnh                | Dự phòng                  | Chrome | Edge | Firefox | Safari |
| -------------------------- | ------------------- | ------------------------- | ------ | ---- | ------- | ------ |
| Ctrl/⌘ + `+` / `−` / wheel | Zoom ảnh            | `+` / `-`, thanh zoom     |        |      |         |        |
| Ctrl/⌘ + J                 | Nhân bản layer      | Shift+J                   |        |      |         |        |
| Ctrl/⌘ + E                 | Merge down          | Shift+E                   |        |      |         |        |
| Ctrl/⌘ + D                 | Bỏ chọn             | Esc                       |        |      |         |        |
| Ctrl/⌘ + K                 | Command Palette     | `/`, ô "Tìm lệnh"         |        |      |         |        |
| Ctrl/⌘ + S                 | Lưu ngay (+ file)   | menu ⋯ → Lưu              |        |      |         |        |
| Ctrl/⌘ + Shift + S         | Xuất ảnh            | nút Xuất, Command Palette |        |      |         |        |
| Giữ Alt                    | Lấy màu tạm thời    | phím I                    |        |      |         |        |
| Alt + kéo chuột phải       | HUD cỡ/độ cứng cọ   | `[` `]`, `Shift+[` `]`    |        |      |         |        |
| Shift + F                  | Toàn màn hình       | nút trên top bar          |        |      |         |        |
| `\`                        | Zen mode            | menu ⋯ / Xem → Zen mode   |        |      |         |        |
| `?`                        | Bảng phím tắt       | menu ⋯ → Bảng phím tắt    |        |      |         |        |
| Esc trong toàn màn hình    | Thoát toàn màn hình | lần Esc thứ hai tới app   |        |      |         |        |

App **không** được chặn phím trình duyệt giữ riêng: Ctrl+N/T/W, Ctrl+Shift+N/T/W, Ctrl+Tab, Ctrl+1…9,
F12, Ctrl+Shift+I/J/C, Ctrl+Shift+E/K (Firefox). Gõ tiếng Việt (Unikey/EVKey Telex, bộ gõ macOS) trong
ô chữ và ô tìm kiếm không bị nuốt phím.

### Tình huống riêng của trình duyệt

| Tình huống                                                      | Chrome | Edge | Firefox  | Safari   |
| --------------------------------------------------------------- | ------ | ---- | -------- | -------- |
| Tắt mạng rồi reload                                             |        |      |          |          |
| Có bản mới: toast "Lưu và tải lại" → mở đúng project            |        |      |          |          |
| Zoom trang 125%: ảnh sắc nét, tọa độ vẽ đúng                    |        |      |          |          |
| Kéo cửa sổ giữa hai màn hình khác DPR                           |        |      |          |          |
| Đóng tab giữa chừng → mở lại có banner khôi phục                |        |      |          |          |
| Mở cùng project ở hai tab: tab sau chỉ đọc                      |        |      |          |          |
| Lưu ra file .paint (chọn file, Ctrl+S ghi đè, reload hỏi quyền) |        |      | (tải về) | (tải về) |
| Khung 1024–1279 px: panel phải nổi, tự đóng khi vẽ              |        |      |          |          |

### Luồng screenshot dưới 15 giây

Tự đo 5 lần trên trình duyệt dùng hằng ngày: chụp màn hình bằng công cụ hệ điều hành → chuyển tab →
Ctrl+V → mũi tên, khung, che, chữ, số thứ tự → Copy.

| Lần | Thời gian (s) | Ghi chú |
| --- | ------------- | ------- |
| 1   |               |         |
| 2   |               |         |
| 3   |               |         |
| 4   |               |         |
| 5   |               |         |
