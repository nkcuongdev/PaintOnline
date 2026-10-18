import type { Category } from '../types';

export const speedCategory: Category = {
  id: 'lam-nhanh',
  title: 'Khung nhìn và thao tác nhanh',
  description:
    'Thu phóng, lưới, thước đo, Zen mode, Command Palette, menu chuột phải, phím tắt và cài đặt.',
  icon: 'keyboard',
  topics: [
    {
      id: 'khung-nhin',
      title: 'Thu phóng và khung nhìn',
      summary:
        'Phóng to, thu nhỏ, kéo khung nhìn, lưới, thước đo, bám lưới, Zen mode và toàn màn hình.',
      icon: 'tool-zoom',
      level: 'basic',
      keywords: [
        'zoom',
        'thu phóng',
        'phóng to',
        'thu nhỏ',
        'pan',
        'kéo khung nhìn',
        'lưới',
        'grid',
        'thước',
        'ruler',
        'bám lưới',
        'snap',
        'zen',
        'toàn màn hình',
        'fullscreen',
        'cảm ứng',
        'touchpad',
      ],
      related: ['giao-dien', 'phim-tat', 'cai-dat'],
      blocks: [
        { type: 'h2', id: 'thu-phong', text: 'Thu phóng' },
        {
          type: 'keys',
          rows: [
            ['[[Mod]] + lăn chuột, chụm 2 ngón trên touchpad', 'Phóng to/thu nhỏ quanh con trỏ.'],
            ['[[+]] / [[-]] (hoặc [[Mod++]] / [[Mod+-]])', 'Phóng to / thu nhỏ một nấc.'],
            ['[[Shift+1]]', 'Vừa khung: thấy trọn ảnh.'],
            ['[[Shift+0]]', '100%: mỗi pixel ảnh là một pixel màn hình.'],
            [
              '{tool:zoom}',
              'Bấm để phóng to tại chỗ bấm, [[Alt]] + bấm để thu nhỏ, kéo ngang để thu phóng liên tục.',
            ],
            [
              'Thanh trạng thái',
              'Nút − / +, và bấm vào số % để chọn Vừa khung, Phủ kín, 25%, 50%, 100%, 200%, 400%, 800%.',
            ],
          ],
        },
        { type: 'figure', shot: 'zoom-menu', size: 'small' },
        {
          type: 'list',
          items: [
            'Mức thu phóng từ 1% tới 6400%.',
            'Ảnh mới mở lần đầu hiện 100% nếu vừa màn hình, nếu không thì vừa khung. Mở lại project cũ thì giữ mức thu phóng và vị trí lần trước.',
            'Từ 400% các pixel hiện vuông sắc nét; từ 800% có thêm lưới điểm ảnh.',
          ],
        },
        { type: 'h2', id: 'di-chuyen', text: 'Di chuyển khung nhìn' },
        {
          type: 'keys',
          rows: [
            ['Lăn chuột', 'Cuộn lên/xuống (lăn chuột **không** thu phóng).'],
            ['[[Shift]] + lăn chuột', 'Cuộn ngang.'],
            [
              'Giữ [[Space]] + kéo',
              'Kéo khung nhìn từ bất kỳ công cụ nào; nhả ra quay lại công cụ cũ.',
            ],
            ['Kéo bằng nút giữa (con lăn)', 'Kéo khung nhìn.'],
            [
              'Hai ngón tay (màn hình cảm ứng)',
              'Chụm để thu phóng, kéo để di chuyển. Một ngón để vẽ.',
            ],
          ],
        },
        {
          type: 'p',
          text: 'Luôn có ít nhất một phần ảnh nằm trong màn hình nên bạn không thể "lạc" ảnh. Lạc hướng? Nhấn [[Shift+1]].',
        },
        { type: 'h2', id: 'luoi-thuoc', text: 'Lưới, thước đo, bám lưới' },
        {
          type: 'p',
          text: 'Bật/tắt trong menu {ui:Xem} (hoặc Command Palette). Ba tùy chọn được nhớ trong trình duyệt cho mọi project.',
        },
        { type: 'figure', shot: 'view-menu', size: 'small', caption: 'Menu Xem.' },
        {
          type: 'figure',
          shot: 'grid-rulers',
          caption: 'Lưới 32 px và thước đo theo pixel.',
          markers: [{ target: 'rulers', label: 'Thước đo' }],
        },
        {
          type: 'options',
          items: [
            [
              'Lưới',
              'Lưới mờ phủ trên ảnh, chỉ để nhìn (không xuất ra ảnh). Khoảng cách đổi trong [Cài đặt](cai-dat): 8, 16, 32 (mặc định), 50, 64, 100 px.',
            ],
            ['Thước đo', 'Thước ngang và dọc theo pixel của ảnh.'],
            [
              'Bám lưới',
              'Điểm bấm và kéo tự bám vào giao điểm lưới với: Chọn, chọn khung chữ nhật/elip, Cắt xén, Gradient, các hình, mũi tên, chữ, chú thích. Không áp dụng cho Cọ, Bút chì, Tẩy, Tô màu, Lasso, Đũa thần.',
            ],
          ],
        },
        { type: 'h2', id: 'zen', text: 'Zen mode và toàn màn hình' },
        {
          type: 'list',
          items: [
            '**Zen mode** [[\\]]: ẩn mọi thanh công cụ và bảng, chỉ còn ảnh để ngắm hoặc vẽ tập trung. Nhấn [[\\]] lần nữa hoặc nút **Thoát Zen mode** ở góc phải trên.',
            '**Toàn màn hình** [[Shift+F]]: ẩn giao diện trình duyệt. Nhấn lại hoặc [[Escape]] để thoát.',
          ],
        },
        {
          type: 'figure',
          shot: 'zen-mode',
          markers: [{ target: 'exit', label: 'Thoát Zen mode' }],
        },
        {
          type: 'callout',
          tone: 'tip',
          text: 'Trong Zen mode phím tắt vẫn hoạt động: [[B]] chọn cọ, [[[]] [[]]] đổi cỡ, [[Mod+Z]] hoàn tác…',
        },
      ],
    },
    {
      id: 'command-palette',
      title: 'Command Palette: tìm mọi lệnh',
      summary:
        'Nhấn Ctrl+K, gõ vài chữ (không dấu cũng được) để chạy bất kỳ lệnh, công cụ, bộ lọc hay mở project gần đây.',
      icon: 'command',
      level: 'basic',
      keywords: ['command palette', 'tìm lệnh', 'ctrl k', 'search', 'lệnh'],
      related: ['phim-tat', 'menu-ngu-canh'],
      blocks: [
        {
          type: 'p',
          text: 'Không nhớ lệnh nằm ở menu nào? Nhấn [[Mod+K]] (hoặc [[/]], hoặc bấm ô **Tìm lệnh** trên thanh trên cùng) và gõ.',
        },
        {
          type: 'gallery',
          items: [
            {
              type: 'figure',
              shot: 'command-palette-all',
              caption: 'Mở palette: lệnh chia nhóm, phím tắt hiện bên phải.',
            },
            {
              type: 'figure',
              shot: 'command-palette',
              caption: 'Gõ "lam mo" (không dấu) ra "Làm mờ…".',
            },
          ],
        },
        {
          type: 'list',
          items: [
            'Tìm không phân biệt hoa thường và dấu.',
            'Nhóm: **Công cụ**, **Lệnh**, **Điều chỉnh và bộ lọc**, **Khung nhìn**, **Ứng dụng** (giao diện sáng/tối, cài đặt, bảng phím tắt, tạo ảnh mới…), **Project gần đây**.',
            'Mũi tên lên/xuống để chọn, [[Enter]] để chạy, [[Escape]] để đóng.',
            'Phím tắt hiện cạnh mỗi lệnh — cách hay để học dần phím tắt.',
            'Lệnh chưa dùng được lúc đó (ví dụ "Cắt" khi chưa có vùng chọn) hiện mờ.',
            'Ở trang chủ, palette có lệnh ứng dụng và project gần đây để mở nhanh.',
          ],
        },
        {
          type: 'callout',
          tone: 'note',
          text: 'Một số trình duyệt dùng [[Mod+K]] cho ô tìm kiếm; khi đó dùng phím [[/]] thay thế.',
        },
      ],
    },
    {
      id: 'menu-ngu-canh',
      title: 'Menu chuột phải và mini toolbar',
      summary:
        'Menu thay đổi theo chỗ bạn bấm: trên đối tượng, trong vùng chọn hay trên vùng trống.',
      icon: 'click',
      level: 'basic',
      keywords: ['chuột phải', 'context menu', 'menu ngữ cảnh', 'mini toolbar', 'thanh nổi'],
      related: ['doi-tuong', 'thao-tac-vung-chon', 'command-palette'],
      blocks: [
        {
          type: 'p',
          text: 'Bấm chuột phải trên khung vẽ để mở menu của Paint Online (thay cho menu của trình duyệt). Nội dung menu phụ thuộc vào chỗ bạn bấm:',
        },
        {
          type: 'gallery',
          items: [
            {
              type: 'figure',
              shot: 'canvas-menu',
              caption:
                '**Vùng trống:** Hoàn tác, Làm lại, Dán, Chọn tất cả, Copy ảnh, Xuất PNG, Vừa khung, 100%.',
            },
            {
              type: 'figure',
              shot: 'selection-menu',
              caption:
                '**Trong vùng chọn:** Copy, Cắt, Copy ảnh đang thấy, Xóa, Tô, Cắt xén, Co giãn/xoay, Xoay/lật, Đảo vùng chọn, Bỏ chọn.',
            },
          ],
        },
        {
          type: 'figure',
          shot: 'object-menu',
          size: 'medium',
          caption:
            '**Trên đối tượng:** Xóa, Đưa lên trên cùng, Đưa xuống dưới cùng, Căn chỉnh, Copy ảnh. Bấm chuột phải vào đối tượng chưa chọn sẽ chọn nó trước.',
        },
        {
          type: 'p',
          text: 'Khi đang di chuyển pixel, menu vùng chọn có thêm **Áp dụng** và **Hủy di chuyển** ở đầu.',
        },
        { type: 'h2', id: 'mini-toolbar', text: 'Mini toolbar' },
        {
          type: 'p',
          text: 'Thanh nút nhỏ nổi ngay cạnh vùng đang chọn (chỉ khi dùng công cụ Chọn hoặc công cụ chọn vùng, và ẩn trong lúc bạn kéo chuột):',
        },
        {
          type: 'options',
          items: [
            [
              'Vùng chọn pixel',
              'Copy · Cắt xén theo vùng chọn · Tô vùng chọn bằng màu chính · Che thông tin trong vùng chọn · Xóa vùng chọn',
            ],
            ['Đang di chuyển pixel', 'Áp dụng · Hủy di chuyển'],
            ['Đối tượng chú thích', 'Đưa lên trên cùng · Đưa xuống dưới cùng · Xóa'],
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          text: 'Giữ chuột phải + [[Alt]] khi đang dùng Cọ hoặc Tẩy không mở menu mà đổi cỡ và độ cứng cọ — xem [Cọ vẽ](co-ve#phim-co).',
        },
      ],
    },
    {
      id: 'phim-tat',
      title: 'Bảng phím tắt',
      summary:
        'Toàn bộ phím tắt của Paint Online, lấy trực tiếp từ ứng dụng nên luôn đúng với phiên bản bạn dùng.',
      icon: 'keyboard',
      level: 'basic',
      keywords: ['phím tắt', 'shortcut', 'keyboard', 'bàn phím', 'hotkey'],
      related: ['command-palette', 'khung-nhin', 'co-ve'],
      blocks: [
        {
          type: 'p',
          text: 'Trong app, nhấn [[?]] để mở bảng phím tắt có ô tìm kiếm. Trên máy Mac, phím Ctrl được hiển thị là ⌘.',
        },
        {
          type: 'figure',
          shot: 'shortcuts-dialog',
          size: 'medium',
          caption: 'Bảng phím tắt trong app ([[?]]), có ô tìm kiếm.',
        },
        { type: 'shortcuts', groups: ['tools', 'edit', 'view', 'layers', 'brush', 'app'] },
        { type: 'h2', id: 'phim-bo-tro', text: 'Phím bổ trợ khi kéo chuột' },
        {
          type: 'table',
          head: ['Phím', 'Khi dùng', 'Tác dụng'],
          rows: [
            ['[[Shift]]', 'Vẽ chữ nhật, elip, chú thích, chọn vùng', 'Hình vuông / tròn'],
            ['[[Shift]]', 'Đường thẳng, mũi tên, đa giác, xoay', 'Bắt góc 15°'],
            ['[[Shift]]', 'Gradient', 'Bắt góc 45°'],
            ['[[Shift]]', 'Kéo góc khi co giãn, cắt xén', 'Giữ tỉ lệ'],
            ['[[Shift]]', 'Di chuyển đối tượng / pixel', 'Chỉ ngang hoặc dọc'],
            ['[[Shift]] / [[Alt]] / [[Shift+Alt]]', 'Bắt đầu chọn vùng', 'Thêm / Bớt / Giao'],
            ['[[Alt]]', 'Kéo bên trong vùng chọn', 'Nhân bản pixel'],
            ['[[Alt]] (giữ)', 'Công cụ vẽ, hình, chú thích', 'Tạm lấy màu'],
            ['[[Shift]] + bấm', 'Lấy màu', 'Lấy màu phụ'],
            ['[[Alt]] + bấm', 'Thu phóng', 'Thu nhỏ'],
          ],
        },
        {
          type: 'callout',
          tone: 'note',
          title: 'Phím không bao giờ "nuốt" chữ bạn gõ',
          text: 'Khi đang gõ chữ, nhập số trong ô, hay dùng bộ gõ tiếng Việt, phím tắt một chữ cái (B, T, V…) không có tác dụng. Paint Online cũng không chiếm các phím của trình duyệt như [[Mod+T]], [[Mod+W]]. Vài phím có phím dự phòng (dấu "/" trong bảng) phòng khi trình duyệt giành phím chính.',
        },
      ],
    },
    {
      id: 'cai-dat',
      title: 'Cài đặt và giao diện',
      summary:
        'Giao diện sáng/tối, tự động lưu, lưu trữ bền vững, bộ nhớ cho lịch sử, khoảng cách lưới, nhật ký lỗi.',
      icon: 'settings',
      level: 'basic',
      keywords: [
        'cài đặt',
        'settings',
        'giao diện',
        'theme',
        'tối',
        'dark mode',
        'sáng',
        'tự động lưu',
        'bộ nhớ',
        'lưới',
        'nhật ký lỗi',
      ],
      related: ['du-lieu-dung-luong', 'lich-su', 'xu-ly-su-co'],
      blocks: [
        {
          type: 'p',
          text: 'Mở Cài đặt từ biểu tượng {icon:settings} ở trang chủ, menu {icon:more} trong editor, hoặc Command Palette. Cài đặt được lưu trong trình duyệt này.',
        },
        { type: 'figure', shot: 'settings-dialog', size: 'medium' },
        {
          type: 'options',
          items: [
            [
              'Chủ đề màu',
              'Theo hệ thống (mặc định), Sáng, Tối. Đổi nhanh bằng nút {icon:sun} trên thanh trên cùng.',
            ],
            ['Ngôn ngữ', 'Phiên bản này chỉ có tiếng Việt.'],
            ['Tự động lưu', 'Bật (mặc định) / Tắt. Xem [Lưu tự động](luu-tu-dong).'],
            [
              'Lưu trữ bền vững',
              'Bấm {ui:Yêu cầu lưu bền vững} để trình duyệt không tự xóa dữ liệu khi thiếu chỗ. Hiện cả dung lượng đã dùng.',
            ],
            [
              'Bộ nhớ cho lịch sử hoàn tác',
              'Ít (10%), Vừa (25%, mặc định), Nhiều (40%) của ngân sách bộ nhớ. Nhiều hơn = hoàn tác được xa hơn trên ảnh lớn.',
            ],
            ['Khoảng cách lưới', '8, 16, 32, 50, 64, 100 px.'],
            [
              'Nhật ký lỗi',
              'Ghi tối đa 30 lỗi gần nhất, chỉ trong trình duyệt. {ui:Tải nhật ký (JSON)} để gửi khi báo lỗi, {ui:Xóa nhật ký} để xóa.',
            ],
          ],
        },
        { type: 'figure', shot: 'dark-theme', caption: 'Giao diện tối.' },
      ],
    },
  ],
};
