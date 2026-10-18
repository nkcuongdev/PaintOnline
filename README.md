# Paint Online

Vẽ, chỉnh ảnh và chú thích ảnh chụp màn hình ngay trong trình duyệt. Web app 100% frontend, dùng cá
nhân: không tài khoản, không backend, ảnh không rời khỏi máy.

> Trạng thái: **v1.0 — bản hoàn chỉnh cho trình duyệt laptop** (GĐ8 + GĐ9 gộp, ADR 0028). Có Command
> Palette (Ctrl+K), Zen mode (`\`), toàn màn hình (Shift+F), mini toolbar cạnh vùng chọn, bảng phím
> tắt (`?`), Cài đặt và nhật ký lỗi cục bộ, lưới, thước đo, bám lưới, căn chỉnh đối tượng, lưu nhanh ra
> file `.paint` (Chrome/Edge), bảng màu tự trích từ ảnh, HUD đổi cỡ cọ, dùng được khi mất mạng (PWA,
> cài đặt là tùy chọn). Có từ trước: chế độ Screenshot (dán → chú thích → Copy, che thông tin tô
> kín/khảm/làm mờ, Spotlight, số thứ tự, phóng to vùng, Làm đẹp), điều chỉnh và bộ lọc, vùng chọn và
> biến đổi ảnh, layer với 16 blend mode và History, autosave vào IndexedDB, xuất/nhập `.paint`, xuất
> PNG/JPG/WebP. Bố cục tablet, điện thoại và cử chỉ cảm ứng được hoãn (ADR 0028).

## Yêu cầu

- Node.js 22 hoặc 24 LTS (xem `.nvmrc`; Node 25 chạy được nhưng `vitest`/`jsdom` báo cảnh báo engine)
- npm 10+
- Trình duyệt dùng app: Chrome, Edge, Firefox (2 bản mới nhất) hoặc Safari 17+ trên máy tính

## Bắt đầu

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

Giới hạn engine khi chạy browser test local: `VITEST_BROWSERS=chromium npm run test:browser`.

Công cụ dev (chỉ bản `npm run dev`), gõ trong DevTools console: `__paint.record()` /
`__paint.stop()` ghi input thành JSON, `__paint.replay(json)` phát lại, `__paint.memory()` xem bộ
nhớ và số canvas đang sống, `__paint.editor()` lấy Editor để gỡ lỗi.

Benchmark: `BENCH_PARAMS="scenario=S&noobjects"` chọn kịch bản / bỏ đối tượng chú thích,
`BENCH_CUSTOM=3840x2160x5` kịch bản tùy chỉnh (L: `6000x4000x10`), `WARMUP=3000` thời gian chờ
trước khi vẽ. Các bộ đo khác: `layers.spec.ts`, `docops.spec.ts`, `filters.spec.ts`,
`stress.spec.ts` trong `tests/bench/`.

## Tự deploy

Paint Online là trang web tĩnh: sau `npm run build`, toàn bộ app nằm trong `dist/`. Không cần máy chủ
ứng dụng, cơ sở dữ liệu hay biến môi trường.

Yêu cầu với nơi host:

- **HTTPS** (hoặc `localhost`): service worker (dùng offline), clipboard và lưu ra file chỉ chạy trong
  ngữ cảnh an toàn.
- **Header từ `public/_headers`** (Vite chép vào `dist/_headers`): CSP, `nosniff`, `no-referrer`,
  cache dài cho `/assets/*`, không cache `sw.js` và `manifest.webmanifest`. Host không đọc được file
  này thì cần tự đặt các header tương đương.
- Không cần cấu hình chuyển hướng SPA: app dùng hash route (`#/project/<id>`).

### Cloudflare Pages (đề xuất)

1. Tạo project Pages, nguồn là repo Git: build command `npm run build`, output `dist`, Node 22 hoặc 24.
2. Hoặc deploy bằng CLI từ máy: `npm run build` rồi `npx wrangler pages deploy dist --project-name paint-online`.
3. CI có sẵn (`.github/workflows/ci.yml`): khi repo có secrets `CLOUDFLARE_API_TOKEN` và
   `CLOUDFLARE_ACCOUNT_ID`, mỗi lần push chạy typecheck, lint, test, build, E2E smoke rồi deploy bản
   preview (tên project mặc định `paint-online`, đổi bằng biến repo `CLOUDFLARE_PAGES_PROJECT`).

`_headers` được Cloudflare Pages đọc trực tiếp.

### Netlify

Build command `npm run build`, publish directory `dist`. Netlify cũng đọc `dist/_headers`.

### GitHub Pages hoặc host tĩnh khác

GitHub Pages không cho đặt header HTTP. App vẫn chạy được, nhưng mất lớp bảo vệ CSP và các header khác
(mục 10.2). Nếu chấp nhận, thêm thẻ `<meta http-equiv="Content-Security-Policy" …>` với cùng chính sách
vào `index.html`. `frame-ancestors` không có tác dụng trong thẻ meta. App phải nằm ở gốc domain (đường
dẫn tuyệt đối `/`), ví dụ domain riêng hoặc `<user>.github.io`.

### Chạy trên máy, không deploy

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Mở `http://127.0.0.1:4173`. `localhost` được coi là ngữ cảnh an toàn nên service worker, clipboard và
lưu ra file đều chạy.

### Cập nhật phiên bản

Deploy bản mới như lần đầu. Tab đang mở sẽ hiện "Có phiên bản mới" với nút **Lưu và tải lại**: app lưu
project đang mở rồi mới tải bản mới, không tự tải lại giữa lúc đang vẽ.

## Sao lưu dữ liệu

Mọi project nằm trong IndexedDB của **một** trình duyệt trên **một** máy. Không có đồng bộ đám mây.
Dữ liệu có thể mất khi:

- xóa dữ liệu duyệt web / "Xóa dữ liệu trang web" của trang này;
- trình duyệt tự dọn dữ liệu khi thiếu dung lượng (trừ khi đã bật lưu trữ bền vững);
- Safari xóa dữ liệu của trang không được dùng trong 7 ngày (trừ khi cài app lên Dock);
- dùng cửa sổ ẩn danh (dữ liệu mất khi đóng cửa sổ).

Cách giữ an toàn:

1. **Bật lưu trữ bền vững**: Cài đặt → Lưu trữ → "Yêu cầu lưu bền vững". App tự xin quyền sau lượt
   lưu đầu tiên; trình duyệt có thể từ chối.
2. **Tải bản sao lưu `.paint`** cho project quan trọng: menu ⋯ của editor → "Tải bản sao lưu .paint",
   hoặc menu của từng project ở trang chủ. Trang chủ nhắc khi đã lâu chưa sao lưu.
3. **Lưu nhanh ra file** (Chrome, Edge): menu ⋯ → "Lưu ra file .paint…" chọn file một lần. Sau đó
   mỗi lần Ctrl+S ghi đè luôn file đó. Đặt file trong thư mục được đồng bộ (OneDrive, Google Drive,
   Dropbox) nếu muốn có bản trên đám mây.
4. **Chuyển sang máy khác**: mang file `.paint` sang, thả vào trang chủ hoặc dùng "Mở…".

File `.paint` là ZIP chứa `manifest.json` và PNG của từng layer. Nó chứa **ảnh gốc** dưới các vùng
che thông tin, vì Redact không phá hủy ảnh. Khi xuất, app hỏi có "Áp dụng vĩnh viễn vùng che" không;
chọn có thì pixel gốc bị thay hẳn (tô kín, khảm hoặc làm mờ đúng kiểu đã chọn) trước khi ghi file.

Thùng rác giữ project đã xóa 7 ngày.

## Báo lỗi

Lỗi chỉ được ghi trong trình duyệt (Cài đặt → Nhật ký lỗi), kèm các thao tác gần nhất để tái hiện.
Bấm "Tải nhật ký (JSON)" rồi gửi file đó khi báo lỗi. App không gửi gì ra ngoài.

## Tài liệu

- [Kiến trúc](docs/ARCHITECTURE.md)
- [Architecture Decision Records](docs/adr/README.md)
- [Perf baseline](docs/perf-baseline.md)
- [Kiểm thử thủ công](docs/manual-testing.md)
