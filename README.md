# Paint Online

Vẽ, chỉnh ảnh và chú thích ảnh chụp màn hình ngay trong trình duyệt. Web app 100% frontend, dùng cá
nhân: không tài khoản, không backend, ảnh không rời khỏi máy.

> Trạng thái: **GĐ7 — Screenshot Editor hoàn chỉnh (Mốc Beta)**: dán ảnh chụp màn hình mở chế độ
> Screenshot với tool island rút gọn, nút Copy nổi bật và Tải xuống; che thông tin bằng tô kín, khảm
> hoặc làm mờ (ảnh xuất không còn pixel gốc); Spotlight, số thứ tự tự đánh lại, phóng to vùng; kiểu
> nhanh cho mũi tên, khung, chữ; panel Làm đẹp (nền gradient, khoảng nền, bo góc, bóng); chuyển qua lại
> chế độ Paint đầy đủ. Có từ trước: menu Điều chỉnh (Độ sáng/Tương phản, Sắc độ/Độ bão hòa, Đen trắng,
> Sepia, Đảo màu, Làm mờ, Làm sắc nét, Khảm) xem trước trực tiếp, tool Gradient; vùng chọn
> (chữ nhật, elip, Lasso, Đũa thần), di chuyển/co giãn/xoay pixel, copy-dán giữ vị trí, Crop, Resize,
> Kích thước khung, xoay, lật; panel Layers (16 blend mode) và History; vẽ, hình khối, mũi tên, chữ
> tiếng Việt, che thông tin; dán ảnh chụp màn hình → chú thích → copy; mọi project tự lưu vào
> IndexedDB, xuất/nhập `.paint`, xuất PNG/JPG/WebP. Dữ liệu chỉ nằm trên trình duyệt này — hãy tải
> bản sao lưu `.paint`.

## Yêu cầu

- Node.js 22 hoặc 24 LTS (xem `.nvmrc`; Node 25 chạy được nhưng `vitest`/`jsdom` báo cảnh báo engine)
- npm 10+

## Bắt đầu

```bash
npm install
npx playwright install chromium firefox webkit
npm run dev
```

## Lệnh

| Lệnh                   | Việc                                                    |
| ---------------------- | ------------------------------------------------------- |
| `npm run dev`          | Dev server Vite                                         |
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

Giới hạn engine khi chạy browser test local: `VITEST_BROWSERS=chromium npm run test:browser`.

Công cụ dev (chỉ bản `npm run dev`), gõ trong DevTools console: `__paint.record()` /
`__paint.stop()` ghi input thành JSON, `__paint.replay(json)` phát lại, `__paint.memory()` xem bộ
nhớ và số canvas đang sống, `__paint.editor()` lấy Editor để gỡ lỗi.

Benchmark: `BENCH_PARAMS="scenario=S&noobjects"` chọn kịch bản / bỏ đối tượng chú thích,
`BENCH_CUSTOM=3840x2160x5` kịch bản tùy chỉnh, `WARMUP=3000` thời gian chờ trước khi vẽ.

## Tài liệu

- [Kiến trúc](docs/ARCHITECTURE.md)
- [Architecture Decision Records](docs/adr/README.md)
- [Perf baseline](docs/perf-baseline.md)

## Deploy

CI (`.github/workflows/ci.yml`) chạy typecheck, lint, test, build, browser test và E2E smoke, rồi
deploy bản preview lên Cloudflare Pages khi repo có secrets `CLOUDFLARE_API_TOKEN` và
`CLOUDFLARE_ACCOUNT_ID` (tên project mặc định `paint-online`, đổi bằng biến repo
`CLOUDFLARE_PAGES_PROJECT`). Header bảo mật và CSP nằm trong `public/_headers`.
