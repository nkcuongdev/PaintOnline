# Tự deploy

Paint Online là trang web tĩnh: sau `npm run build`, toàn bộ app nằm trong `dist/`. Không cần máy chủ
ứng dụng, cơ sở dữ liệu hay biến môi trường.

## Yêu cầu với nơi host

- **HTTPS** (hoặc `localhost`): service worker (dùng offline), clipboard và lưu ra file chỉ chạy trong
  ngữ cảnh an toàn.
- **Header từ `public/_headers`** (Vite chép vào `dist/_headers`): CSP, `nosniff`, `no-referrer`, cache
  dài cho `/assets/*`, không cache `sw.js` và `manifest.webmanifest`. Host không đọc được file này thì
  cần tự đặt các header tương đương.
- Không cần cấu hình chuyển hướng SPA: app dùng hash route (`#/project/<id>`).

## Cloudflare Pages (đề xuất)

1. Tạo project Pages từ repo Git: build command `npm run build`, output `dist`, Node 22 hoặc 24.
2. Hoặc deploy từ máy:

   ```bash
   npm run build
   npx wrangler pages deploy dist --project-name paint-online
   ```

3. CI có sẵn (`.github/workflows/ci.yml`): khi repo có secrets `CLOUDFLARE_API_TOKEN` và
   `CLOUDFLARE_ACCOUNT_ID`, mỗi lần push lên `main` chạy typecheck, lint, test, build, E2E smoke rồi
   deploy production. Pull request trong cùng repo được deploy preview sau khi kiểm tra đạt.
   Tên project mặc định `paint-online`, đổi bằng biến repo `CLOUDFLARE_PAGES_PROJECT`.

### Tự cập nhật từ GitHub

Project hiện tại là Direct Upload, cập nhật qua GitHub Actions:

- Website: https://paint-online-awt.pages.dev
- Cloudflare Pages project: `paint-online`, production branch: `main`.
- Repo: https://github.com/nkcuongdev/PaintOnline
- Repo **Settings → Secrets and variables → Actions**: thêm `CLOUDFLARE_ACCOUNT_ID` và
  `CLOUDFLARE_API_TOKEN`.
- Tạo API token Cloudflare với quyền **Account → Cloudflare Pages → Edit**, giới hạn trong tài khoản
  chứa project. Chỉ lưu token trong GitHub Actions secrets, không commit vào repo.

Sau khi cấu hình, push hoặc merge vào `main` sẽ cập nhật website tại cùng địa chỉ khi các bước kiểm
tra đạt. Có thể chạy thủ công workflow **CI** trong tab **Actions**, chọn nhánh `main`.
Các bộ test trình duyệt chạy song song trên Chromium, Firefox và WebKit; cả ba phải đạt trước khi deploy.
Nếu kiểm tra hoặc deploy thất bại, bản website đã deploy trước đó vẫn được giữ nguyên.

Với project Direct Upload, đổi production branch bằng Cloudflare API **Update project**; cần đồng bộ
với nhánh `main` trong workflow để cập nhật website chính thay vì tạo preview.

Cloudflare Pages đọc `_headers` trực tiếp.

## Netlify

Build command `npm run build`, publish directory `dist`. Netlify cũng đọc `dist/_headers`.

## GitHub Pages hoặc host tĩnh khác

GitHub Pages không cho đặt header HTTP. App vẫn chạy được nhưng mất lớp bảo vệ CSP và các header khác.
Nếu chấp nhận, thêm thẻ `<meta http-equiv="Content-Security-Policy" …>` với cùng chính sách vào
`index.html` (`frame-ancestors` không có tác dụng trong thẻ meta). App phải nằm ở gốc domain (đường dẫn
tuyệt đối `/`), ví dụ domain riêng hoặc `<user>.github.io`.

## Chạy trên máy, không deploy

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Mở `http://127.0.0.1:4173`. `localhost` được coi là ngữ cảnh an toàn nên service worker, clipboard và
lưu ra file đều chạy.

## Cập nhật phiên bản

Deploy bản mới như lần đầu. Tab đang mở sẽ hiện "Có phiên bản mới" với nút **Lưu và tải lại**: app lưu
project đang mở rồi mới tải bản mới, không tự tải lại giữa lúc đang vẽ.
