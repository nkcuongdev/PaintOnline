import type { Category } from '../types';

export const gettingStartedCategory: Category = {
  id: 'bat-dau',
  title: 'Bắt đầu',
  description:
    'Paint Online là gì, cách mở ảnh đầu tiên và làm quen với các khu vực trên màn hình.',
  icon: 'rocket',
  topics: [
    {
      id: 'gioi-thieu',
      title: 'Paint Online là gì?',
      summary:
        'Ứng dụng vẽ, chỉnh ảnh và chú thích ảnh chụp màn hình chạy ngay trong trình duyệt — không cần tài khoản, ảnh không rời khỏi máy.',
      icon: 'book',
      level: 'basic',
      keywords: ['giới thiệu', 'tổng quan', 'riêng tư', 'trình duyệt hỗ trợ', 'about'],
      related: ['bat-dau-nhanh', 'hai-che-do', 'giao-dien'],
      blocks: [
        {
          type: 'p',
          text: 'Paint Online là một ứng dụng web để **vẽ**, **chỉnh sửa ảnh** và **chú thích ảnh chụp màn hình**. Bạn chỉ cần mở trang web là dùng được: không cài đặt, không đăng ký, không tải ảnh lên máy chủ nào.',
        },
        {
          type: 'cards',
          items: [
            {
              icon: 'shield',
              title: 'Riêng tư tuyệt đối',
              text: 'Mọi xử lý diễn ra trong trình duyệt của bạn. Ảnh không bao giờ được gửi đi đâu.',
            },
            {
              icon: 'save',
              title: 'Tự động lưu',
              text: 'Bài làm được lưu liên tục vào trình duyệt, mở lại vẫn còn — kể cả khi tab bị đóng đột ngột.',
              link: 'luu-tu-dong',
            },
            {
              icon: 'offline',
              title: 'Dùng được khi mất mạng',
              text: 'Sau lần mở đầu tiên, Paint Online vẫn chạy khi không có Internet.',
              link: 'offline-cai-dat',
            },
          ],
        },
        { type: 'h2', id: 'lam-duoc-gi', text: 'Bạn có thể làm gì?' },
        {
          type: 'cards',
          items: [
            {
              icon: 'camera',
              title: 'Chú thích ảnh chụp màn hình',
              text: 'Dán ảnh bằng [[Mod+V]], thêm mũi tên, khung, chữ, số thứ tự, che thông tin nhạy cảm rồi Copy gửi đi.',
              link: 'qt-chu-thich-anh-chup',
            },
            {
              icon: 'brush',
              title: 'Vẽ tranh',
              text: 'Cọ có nhiều kiểu, bút chì, tẩy, tô màu, Gradient, nhiều layer với 16 chế độ hòa trộn.',
              link: 'qt-ve-tranh',
            },
            {
              icon: 'sliders',
              title: 'Chỉnh ảnh',
              text: 'Cắt xén, đổi kích thước, xoay, lật, chỉnh độ sáng, màu sắc, làm mờ, làm sắc nét.',
              link: 'qt-chinh-anh',
            },
            {
              icon: 'selection',
              title: 'Chọn và biến đổi',
              text: 'Chọn hình chữ nhật, elip, tự do (Lasso) hay theo màu (Đũa thần); di chuyển, co giãn, xoay phần đã chọn.',
              link: 'vung-chon',
            },
            {
              icon: 'download',
              title: 'Xuất và chia sẻ',
              text: 'Copy vào clipboard, tải PNG, JPG, WebP; thêm khung nền đẹp mắt trước khi chia sẻ.',
              link: 'xuat-anh',
            },
            {
              icon: 'archive',
              title: 'Sao lưu, chuyển máy',
              text: 'Lưu cả project (giữ layer, chữ còn sửa được) thành file `.paint`.',
              link: 'sao-luu-file-paint',
            },
          ],
        },
        { type: 'h2', id: 'hai-che-do', text: 'Hai chế độ làm việc' },
        {
          type: 'p',
          text: 'Mỗi project mở ở một trong hai chế độ. **Chế độ Screenshot** gọn gàng, chỉ có công cụ chú thích — dành cho việc dán ảnh chụp, đánh dấu và gửi đi trong vài giây. **Chế độ Paint** có đầy đủ công cụ vẽ, layer, vùng chọn và bộ lọc. Bạn chuyển qua lại bất cứ lúc nào mà không mất gì. Xem [Chế độ Screenshot và chế độ Paint](hai-che-do).',
        },
        {
          type: 'gallery',
          items: [
            {
              type: 'figure',
              shot: 'screenshot-overview',
              caption: 'Chế độ Screenshot: chú thích ảnh chụp.',
            },
            { type: 'figure', shot: 'paint-overview', caption: 'Chế độ Paint: vẽ nhiều layer.' },
          ],
        },
        { type: 'h2', id: 'trinh-duyet', text: 'Trình duyệt và thiết bị' },
        {
          type: 'list',
          items: [
            '**Trình duyệt:** Chrome, Edge, Firefox (hai phiên bản mới nhất) và Safari 17 trở lên trên máy tính.',
            '**Màn hình:** phiên bản 1.0 được thiết kế cho laptop và máy tính, chiều rộng từ 1024 px. Từ 1280 px bảng bên phải luôn hiện cạnh ảnh; hẹp hơn, bảng trượt ra khi cần.',
            '**Bút cảm ứng và màn hình cảm ứng:** dùng được. Bút có lực nhấn sẽ đổi cỡ nét cọ; hai ngón tay để thu phóng và kéo khung nhìn.',
            '**Ngôn ngữ:** giao diện tiếng Việt.',
          ],
        },
        {
          type: 'callout',
          tone: 'important',
          title: 'Dữ liệu chỉ nằm trên máy này',
          text: 'Project được lưu trong bộ nhớ của **một** trình duyệt trên **một** máy, không có đồng bộ đám mây. Hãy thường xuyên tải bản sao lưu `.paint` cho bài quan trọng. Xem [Dữ liệu, dung lượng và nhiều tab](du-lieu-dung-luong).',
        },
      ],
    },
    {
      id: 'bat-dau-nhanh',
      title: 'Bắt đầu trong 1 phút',
      summary:
        'Dán một ảnh chụp màn hình, thêm mũi tên và chữ, rồi Copy gửi đi — bài thực hành đầu tiên.',
      icon: 'rocket',
      level: 'basic',
      keywords: ['bắt đầu', 'lần đầu', 'nhanh', 'quick start', 'dán ảnh'],
      related: ['qt-chu-thich-anh-chup', 'giao-dien', 'trang-chu'],
      blocks: [
        {
          type: 'p',
          text: 'Cách nhanh nhất để làm quen là chú thích một ảnh chụp màn hình. Toàn bộ chỉ mất chừng một phút.',
        },
        {
          type: 'steps',
          items: [
            {
              title: 'Chụp màn hình',
              text: 'Dùng phím chụp của máy: trên Windows nhấn [[Win+Shift+S]] rồi chọn vùng; trên macOS nhấn [[Cmd+Ctrl+Shift+4]]. Ảnh được giữ trong clipboard.',
            },
            {
              title: 'Mở Paint Online và dán',
              text: 'Ở trang chủ, nhấn [[Mod+V]]. Ảnh mở ngay ở **chế độ Screenshot** và công cụ {tool:arrow} đã được chọn sẵn.',
              figure: {
                type: 'figure',
                shot: 'screenshot-start',
                caption: 'Ảnh vừa dán mở ở chế độ Screenshot.',
                markers: [
                  { target: 'island', label: 'Thanh công cụ chú thích' },
                  { target: 'options', label: 'Tùy chọn của công cụ đang chọn' },
                  { target: 'copy', label: 'Copy ảnh đã chú thích' },
                  { target: 'panel', label: 'Bảng Làm đẹp và Lịch sử' },
                ],
              },
            },
            {
              title: 'Vẽ mũi tên',
              text: 'Kéo chuột từ chỗ muốn đặt đuôi tới chỗ cần chỉ. Muốn mũi tên đỏ nổi bật, bấm ô đầu tiên trong {ui:Kiểu nhanh} trước khi vẽ.',
            },
            {
              title: 'Thêm chữ',
              text: 'Nhấn [[T]] (hoặc chọn {tool:text}), bấm vào ảnh và gõ. Nhấn [[Mod+Enter]] hoặc [[Escape]] để xong.',
            },
            {
              title: 'Copy và gửi',
              text: 'Bấm {ui:Copy} ở góc phải (hoặc [[Mod+C]] khi không có vùng chọn). Mở Zalo, Slack, email… và dán.',
              figure: {
                type: 'figure',
                shot: 'quick-result',
                caption: 'Ảnh đã chú thích, bật thêm khung Làm đẹp trước khi Copy.',
                markers: [
                  { target: 'copy', label: 'Copy vào clipboard' },
                  { target: 'download', label: 'Hoặc tải file PNG' },
                  { target: 'toggle', label: 'Bật khung Làm đẹp (tùy chọn)' },
                ],
              },
            },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          text: 'Không cần lưu: Paint Online tự lưu vào trình duyệt. Project vừa làm sẽ nằm trong mục **Project gần đây** ở trang chủ.',
        },
        {
          type: 'p',
          text: 'Tiếp theo: xem bài [Chú thích ảnh chụp màn hình](qt-chu-thich-anh-chup) để biết thêm khung, số thứ tự, che thông tin và Làm đẹp.',
        },
      ],
    },
    {
      id: 'trang-chu',
      title: 'Trang chủ',
      summary:
        'Nơi dán ảnh, mở file, tạo ảnh mới theo kích thước có sẵn và quản lý các project gần đây.',
      icon: 'image',
      level: 'basic',
      keywords: ['home', 'màn hình đầu', 'tạo ảnh mới', 'preset', 'kích thước'],
      related: ['quan-ly-project', 'mo-nhap-anh', 'bat-dau-nhanh'],
      blocks: [
        {
          type: 'figure',
          shot: 'home',
          caption: 'Trang chủ khi đã có vài project.',
          markers: [
            { target: 'dropzone', label: 'Vùng dán ảnh, thả file' },
            { target: 'open', label: '{ui:Mở ảnh…} từ máy (cả file `.paint`)' },
            { target: 'presets', label: 'Tạo ảnh mới theo kích thước có sẵn' },
            { target: 'custom', label: 'Tự nhập kích thước' },
            { target: 'clipboard', label: 'Mở ảnh đang có trong clipboard' },
            { target: 'projects', label: 'Project gần đây' },
            { target: 'palette', label: 'Tìm lệnh (Command Palette)' },
            { target: 'settings', label: 'Cài đặt' },
            { target: 'theme', label: 'Giao diện sáng/tối' },
          ],
        },
        {
          type: 'figure',
          shot: 'home-empty',
          size: 'medium',
          caption: 'Lần đầu mở: chưa có project nào, chỉ cần dán ảnh hoặc chọn một kích thước.',
        },
        { type: 'h2', id: 'mo-anh', text: 'Bắt đầu với một ảnh' },
        {
          type: 'table',
          head: ['Cách làm', 'Kết quả'],
          rows: [
            [
              'Nhấn [[Mod+V]] khi đang có ảnh chụp trong clipboard',
              'Mở ở **chế độ Screenshot**, tên "Ảnh dán giờ:phút", chọn sẵn {tool:arrow}.',
            ],
            [
              'Bấm {ui:Từ clipboard}',
              'Giống [[Mod+V]]; trình duyệt có thể hỏi quyền đọc clipboard.',
            ],
            [
              'Bấm {ui:Mở ảnh…} hoặc kéo thả file vào vùng nét đứt',
              'Mở ở **chế độ Paint**, tên project là tên file. File `.paint` được nhập thành project.',
            ],
            [
              'Bấm một kích thước trong {ui:Tạo ảnh mới}',
              'Ảnh trắng mới ở chế độ Paint, tên "Ảnh mới rộng × cao".',
            ],
          ],
        },
        {
          type: 'p',
          text: 'Mỗi lần mở hoặc thả chỉ dùng **một** file. Định dạng nhận: PNG, JPG, WebP, GIF, BMP (cùng AVIF và SVG nếu trình duyệt đọc được) và file `.paint`. Xem chi tiết giới hạn ở [Mở, dán và thả ảnh](mo-nhap-anh).',
        },
        { type: 'h2', id: 'tao-anh-moi', text: 'Tạo ảnh mới' },
        {
          type: 'options',
          items: [
            ['Full HD', '1920 × 1080 px — màn hình, slide trình chiếu.'],
            ['Vuông', '1080 × 1080 px — ảnh mạng xã hội.'],
            ['A4 · 150 dpi', '1240 × 1754 px — trang giấy in dọc.'],
            [
              'Tùy chỉnh…',
              'Tự nhập chiều rộng và cao (số nguyên, tối đa 8192 px mỗi cạnh trên máy tính thông thường). Mặc định 1280 × 720.',
            ],
          ],
        },
        {
          type: 'figure',
          shot: 'new-image-dialog',
          size: 'small',
          caption: 'Hộp thoại {ui:Ảnh mới} khi chọn {ui:Tùy chỉnh…}.',
        },
        { type: 'h2', id: 'project-gan-day', text: 'Project gần đây' },
        {
          type: 'p',
          text: 'Mọi ảnh bạn dán, mở hoặc tạo đều trở thành một **project** và hiện ở đây với ảnh thu nhỏ, kích thước và thời gian sửa. Bấm vào thẻ để mở lại đúng chỗ đang làm. Thẻ có nhãn {icon:camera} **Ảnh chụp** là project ở chế độ Screenshot; biểu tượng khiên ở góc phải nghĩa là project đã sửa nhưng **chưa sao lưu `.paint` hơn 7 ngày**.',
        },
        {
          type: 'figure',
          shot: 'home-projects',
          markers: [
            { target: 'search', label: 'Tìm theo tên (gõ không dấu cũng được)' },
            { target: 'sort', label: 'Sắp xếp: Mới sửa, Mới tạo, Tên A–Z, Dung lượng' },
            { target: 'trash', label: 'Thùng rác' },
            { target: 'menu', label: 'Menu thao tác của project' },
            { target: 'meter', label: 'Dung lượng đã dùng trong trình duyệt' },
          ],
        },
        {
          type: 'p',
          text: 'Đổi tên, nhân bản, tải bản sao lưu, xóa và khôi phục project được hướng dẫn ở bài [Quản lý project](quan-ly-project).',
        },
        { type: 'h2', id: 'thong-bao', text: 'Các thông báo ở trang chủ' },
        {
          type: 'options',
          items: [
            [
              'Bạn đang làm dở “…”',
              'Lần trước bạn đóng tab khi đang mở project. Bấm {ui:Tiếp tục} để mở lại, {ui:Bỏ qua} để ẩn.',
            ],
            [
              'Phiên trước kết thúc đột ngột',
              'Trình duyệt bị đóng hoặc treo khi đang làm. Project đã được khôi phục từ bản lưu gần nhất.',
            ],
            [
              '… project chưa sao lưu ra file .paint',
              'Nhắc tải bản sao lưu cho project đã sửa mà hơn 7 ngày chưa sao lưu. {ui:Ẩn} để tắt nhắc trong 7 ngày.',
            ],
            [
              'Không lưu tự động',
              'Trình duyệt không cho lưu dữ liệu (thường do cửa sổ ẩn danh). Bài chỉ tồn tại trong tab — hãy tải file `.paint`.',
            ],
          ],
        },
      ],
    },
    {
      id: 'giao-dien',
      title: 'Làm quen giao diện editor',
      summary:
        'Tên và công dụng của từng khu vực: thanh trên cùng, thanh công cụ, tùy chọn, khung vẽ, bảng bên phải, thanh trạng thái.',
      icon: 'monitor',
      level: 'basic',
      keywords: [
        'giao diện',
        'màn hình',
        'thanh công cụ',
        'tool island',
        'options bar',
        'panel',
        'status bar',
      ],
      related: ['hai-che-do', 'khung-nhin', 'menu-ngu-canh'],
      blocks: [
        {
          type: 'figure',
          shot: 'paint-overview',
          caption: 'Editor ở chế độ Paint.',
          markers: [
            { target: 'back', label: 'Về trang chủ' },
            { target: 'name', label: 'Tên project — bấm để đổi tên' },
            { target: 'status', label: 'Trạng thái lưu' },
            { target: 'undo', label: 'Hoàn tác / Làm lại' },
            { target: 'image', label: 'Menu {ui:Ảnh}, {ui:Điều chỉnh}, {ui:Xem}' },
            { target: 'palette', label: 'Tìm lệnh' },
            { target: 'export', label: 'Copy ảnh và Xuất' },
            { target: 'more', label: 'Thêm thao tác {icon:more}' },
            { target: 'island', label: 'Thanh công cụ' },
            { target: 'options', label: 'Thanh tùy chọn' },
            { target: 'canvas', label: 'Khung vẽ' },
            { target: 'panel', label: 'Bảng Layer, Lịch sử, Làm đẹp' },
            { target: 'statusbar', label: 'Thanh trạng thái' },
            { target: 'zoom', label: 'Mức thu phóng' },
          ],
        },
        { type: 'h2', id: 'thanh-tren', text: 'Thanh trên cùng' },
        {
          type: 'options',
          items: [
            ['{icon:back} Về trang chủ', 'Đóng project (đã tự lưu) và quay về danh sách project.'],
            ['Tên project', 'Bấm vào để đổi tên.'],
            [
              'Trạng thái lưu',
              '"Đã lưu", "Có thay đổi chưa lưu", "Đang lưu…". Bấm vào để xem giờ lưu và nút {ui:Lưu ngay}. Xem [Lưu tự động](luu-tu-dong).',
            ],
            [
              '{icon:undo} {icon:redo}',
              'Hoàn tác [[Mod+Z]], làm lại [[Mod+Shift+Z]]. Rê chuột lên nút để xem tên bước sẽ hoàn tác.',
            ],
            ['{ui:Ảnh}', 'Vùng chọn, cắt xén, đổi kích thước, xoay, lật (chỉ ở chế độ Paint).'],
            ['{ui:Điều chỉnh}', 'Độ sáng, màu sắc và bộ lọc (chỉ ở chế độ Paint).'],
            [
              '{ui:Xem}',
              'Thu phóng, lưới, thước đo, bám lưới, Zen mode, toàn màn hình (chỉ ở chế độ Paint).',
            ],
            ['{icon:search} Tìm lệnh', 'Mở Command Palette [[Mod+K]] để tìm mọi lệnh bằng chữ.'],
            [
              '{ui:Copy ảnh} / {ui:Xuất}',
              'Copy ảnh vào clipboard; mở hộp thoại xuất PNG, JPG, WebP [[Mod+Shift+S]]. Ở chế độ Screenshot là {ui:Tải xuống} và {ui:Copy}.',
            ],
            [
              '{icon:more} Thêm thao tác',
              'Lưu ngay, xuất, sao lưu `.paint`, lưu ra file, đổi chế độ, Zen mode, toàn màn hình, bảng phím tắt, cài đặt.',
            ],
            ['{icon:maximize} {icon:sun}', 'Toàn màn hình [[Shift+F]] và đổi giao diện sáng/tối.'],
          ],
        },
        {
          type: 'figure',
          shot: 'editor-menu',
          size: 'small',
          caption: 'Menu {icon:more} Thêm thao tác.',
        },
        { type: 'h2', id: 'thanh-cong-cu', text: 'Thanh công cụ' },
        {
          type: 'p',
          text: 'Thanh nổi phía trên ảnh chứa các công cụ, chia nhóm: **Chọn**, **Vẽ**, **Hình**, **Chữ và chú thích**, **Khung nhìn**, và ô **màu** ở cuối. Rê chuột lên một nút để xem tên và phím tắt.',
        },
        {
          type: 'figure',
          shot: 'tool-island-paint',
          caption: 'Thanh công cụ ở chế độ Paint.',
          markers: [
            { target: 'select', label: 'Nhóm Chọn (nút có mũi tên ▾)' },
            { target: 'crop', label: 'Cắt xén' },
            { target: 'brush', label: 'Bút chì, Cọ, Tẩy' },
            { target: 'fill', label: 'Tô màu / Gradient ▾' },
            { target: 'eyedropper', label: 'Lấy màu' },
            { target: 'shapes', label: 'Hình khối ▾' },
            { target: 'arrow', label: 'Mũi tên' },
            { target: 'text', label: 'Chữ và các công cụ chú thích' },
            { target: 'focus', label: 'Spotlight / Phóng to vùng ▾' },
            { target: 'pan', label: 'Di chuyển khung nhìn, Thu phóng' },
            { target: 'color', label: 'Màu chính, màu phụ' },
          ],
        },
        {
          type: 'p',
          text: 'Một số nút gộp nhiều công cụ cùng loại, có mũi tên nhỏ ▾ bên cạnh: bấm phần icon để dùng công cụ đang hiện, bấm ▾ để chọn công cụ khác trong nhóm. Nút luôn nhớ công cụ bạn dùng gần nhất.',
        },
        {
          type: 'gallery',
          items: [
            {
              type: 'figure',
              shot: 'split-select-menu',
              caption: 'Nhóm Chọn: Chọn đối tượng, chữ nhật, elip, Lasso, Đũa thần.',
            },
            {
              type: 'figure',
              shot: 'split-shape-menu',
              caption: 'Nhóm Hình: chữ nhật, elip, đường thẳng, đa giác — chung phím [[U]].',
            },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          text: 'Công cụ đang dùng có nền xanh. Khi bạn giữ [[Space]] (kéo khung nhìn) hay [[Alt]] (lấy màu), nút công cụ tạm thời sáng lên và công cụ gốc có viền mỏng để bạn biết sẽ quay lại đâu khi nhả phím.',
        },
        { type: 'h2', id: 'thanh-tuy-chon', text: 'Thanh tùy chọn' },
        {
          type: 'p',
          text: 'Ngay dưới thanh công cụ là các tùy chọn của **công cụ đang chọn**: cỡ, độ mờ, kiểu nét, font chữ… Khi bạn chọn một đối tượng chú thích (mũi tên, khung, chữ…), thanh này hiện **thuộc tính của đối tượng đó** để sửa trực tiếp. Tùy chọn ít dùng nằm trong nút {icon:sliders} **Tùy chọn nâng cao**. Với nhiều công cụ, thanh còn có một dòng gợi ý cách dùng.',
        },
        {
          type: 'figure',
          shot: 'brush-options',
          caption: 'Tùy chọn của Cọ vẽ, mở thêm bảng Tùy chọn nâng cao.',
        },
        { type: 'h2', id: 'khung-ve', text: 'Khung vẽ' },
        {
          type: 'p',
          text: 'Ảnh nằm giữa vùng làm việc màu xám. Phần trong suốt hiện dạng ô caro. Lăn chuột để cuộn, [[Mod]] + lăn chuột để thu phóng quanh con trỏ, giữ [[Space]] rồi kéo để di chuyển. Bấm chuột phải để mở menu theo ngữ cảnh. Xem [Thu phóng và khung nhìn](khung-nhin).',
        },
        { type: 'h2', id: 'bang-ben-phai', text: 'Bảng bên phải' },
        {
          type: 'list',
          items: [
            '**Layer** — danh sách layer, thuộc tính, danh sách đối tượng chú thích. Xem [Làm việc với layer](layer).',
            '**Lịch sử** — các bước đã làm, bấm để quay lại bất kỳ bước nào. Xem [Hoàn tác và Lịch sử](lich-su).',
            '**Làm đẹp** — khung nền, bo góc, bóng đổ quanh ảnh khi chia sẻ. Xem [Làm đẹp ảnh](lam-dep).',
          ],
        },
        {
          type: 'p',
          text: 'Bấm {icon:close} để thu gọn bảng, {icon:panel} trên thanh trên cùng để mở lại. Trên màn hình rộng từ 1280 px bảng luôn nằm cạnh ảnh; hẹp hơn, bảng trượt nổi lên trên ảnh và tự đóng khi bạn bắt đầu vẽ.',
        },
        { type: 'h2', id: 'thanh-trang-thai', text: 'Thanh trạng thái' },
        {
          type: 'options',
          items: [
            ['Tọa độ con trỏ', 'Vị trí pixel dưới con trỏ (x, y) khi con trỏ nằm trong ảnh.'],
            ['Kích thước ảnh', 'Rộng × cao theo pixel.'],
            [
              'Vùng chọn',
              'Kích thước vùng chọn; "Đang di chuyển vùng chọn" khi phần chọn đang được kéo.',
            ],
            ['Đang xử lý ảnh…', 'Hiện khi một thao tác nặng (bộ lọc, tô màu…) đang chạy nền.'],
            ['Bộ nhớ', 'Chỉ hiện (màu cam) khi bộ nhớ dùng vượt 70% — nên gộp bớt layer.'],
            [
              '− 100% +',
              'Thu nhỏ, mức thu phóng (bấm để chọn Vừa khung, Phủ kín, 25%–800%), phóng to.',
            ],
          ],
        },
      ],
    },
    {
      id: 'hai-che-do',
      title: 'Chế độ Screenshot và chế độ Paint',
      summary: 'Khác nhau thế nào, khi nào dùng chế độ nào và cách chuyển qua lại.',
      icon: 'camera',
      level: 'basic',
      keywords: ['chế độ', 'mode', 'screenshot', 'paint đầy đủ', 'chuyển chế độ'],
      related: ['giao-dien', 'qt-chu-thich-anh-chup', 'lam-dep'],
      blocks: [
        {
          type: 'table',
          head: ['', 'Chế độ Screenshot', 'Chế độ Paint'],
          rows: [
            [
              'Dành cho',
              'Chú thích nhanh ảnh chụp rồi chia sẻ',
              'Vẽ, chỉnh ảnh, làm việc nhiều layer',
            ],
            [
              'Mở khi',
              'Dán ảnh [[Mod+V]] hoặc {ui:Từ clipboard} ở trang chủ',
              'Mở file, tạo ảnh mới, nhập `.paint` chế độ Paint',
            ],
            [
              'Công cụ',
              'Chọn, Mũi tên, Khung, Bút dạ quang, Chữ, Che thông tin, Số thứ tự, Spotlight, Phóng to vùng, Cắt xén',
              'Tất cả công cụ',
            ],
            [
              'Thanh trên cùng',
              '{ui:Paint đầy đủ}, {ui:Tải xuống}, {ui:Copy}',
              'Menu {ui:Ảnh}, {ui:Điều chỉnh}, {ui:Xem}, {ui:Copy ảnh}, {ui:Xuất}',
            ],
            ['Bảng bên phải', 'Làm đẹp, Lịch sử', 'Layer, Lịch sử, Làm đẹp'],
          ],
        },
        {
          type: 'figure',
          shot: 'screenshot-overview',
          caption: 'Chế độ Screenshot.',
          markers: [
            { target: 'island', label: 'Công cụ chú thích rút gọn' },
            { target: 'paint', label: 'Chuyển sang chế độ Paint đầy đủ' },
            { target: 'download', label: 'Tải xuống PNG' },
            { target: 'copy', label: 'Copy vào clipboard' },
            { target: 'panel', label: 'Bảng Làm đẹp' },
          ],
        },
        {
          type: 'figure',
          shot: 'tool-island-screenshot',
          size: 'medium',
          caption: 'Thanh công cụ của chế độ Screenshot.',
          markers: [
            { target: 'select', label: 'Chọn, sửa đối tượng' },
            { target: 'arrow', label: 'Mũi tên' },
            { target: 'rect', label: 'Khung' },
            { target: 'highlight', label: 'Bút dạ quang' },
            { target: 'text', label: 'Chữ' },
            { target: 'redact', label: 'Che thông tin' },
            { target: 'step', label: 'Số thứ tự' },
            { target: 'spotlight', label: 'Spotlight' },
            { target: 'magnifier', label: 'Phóng to vùng' },
            { target: 'crop', label: 'Cắt xén' },
            { target: 'color', label: 'Màu' },
          ],
        },
        { type: 'h2', id: 'chuyen-che-do', text: 'Chuyển chế độ' },
        {
          type: 'list',
          items: [
            'Từ Screenshot sang Paint: bấm {ui:Paint đầy đủ} trên thanh trên cùng.',
            'Từ Paint sang Screenshot: menu {icon:more} → {ui:Chế độ Screenshot}.',
          ],
        },
        {
          type: 'figure',
          shot: 'editor-menu-screenshot',
          size: 'small',
          caption: 'Menu {icon:more} ở chế độ Screenshot có mục chuyển sang chế độ Paint đầy đủ.',
        },
        {
          type: 'p',
          text: 'Chuyển chế độ chỉ đổi giao diện, **không thay đổi ảnh**: layer, chú thích và lịch sử đều giữ nguyên. Chế độ được nhớ theo từng project nên lần sau mở lại vẫn đúng chế độ cũ.',
        },
        {
          type: 'callout',
          tone: 'tip',
          text: 'Ở chế độ Screenshot vẫn dùng được nhiều phím tắt của chế độ Paint, ví dụ [[Mod+Shift+S]] mở hộp thoại Xuất ảnh để chọn JPG hay WebP.',
        },
      ],
    },
  ],
};
