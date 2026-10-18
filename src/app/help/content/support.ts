import type { Category } from '../types';

export const supportCategory: Category = {
  id: 'ho-tro',
  title: 'Mẹo và hỗ trợ',
  description: 'Mẹo làm nhanh, dùng offline, xử lý sự cố thường gặp và các giới hạn cần biết.',
  icon: 'help',
  topics: [
    {
      id: 'meo-hay',
      title: 'Mẹo làm nhanh hơn',
      summary: 'Những thao tác nhỏ giúp tiết kiệm nhiều thời gian mỗi ngày.',
      icon: 'lightbulb',
      level: 'basic',
      keywords: ['mẹo', 'tips', 'thủ thuật', 'nhanh'],
      related: ['phim-tat', 'command-palette', 'menu-ngu-canh'],
      blocks: [
        {
          type: 'cards',
          items: [
            {
              icon: 'clipboard',
              title: 'Chụp → dán → Copy',
              text: 'Không cần lưu file trung gian: [[Mod+V]] ở trang chủ, chú thích, rồi {ui:Copy} và dán thẳng vào chat.',
            },
            {
              icon: 'command',
              title: 'Quên lệnh ở đâu?',
              text: '[[Mod+K]] rồi gõ vài chữ không dấu: "xoay", "lam mo", "xuat".',
            },
            {
              icon: 'pointer',
              title: 'Escape trước khi đổi màu',
              text: 'Đối tượng vừa vẽ vẫn đang chọn; nhấn [[Escape]] trước khi đổi màu hay kiểu nhanh cùng loại cho đối tượng tiếp theo.',
            },
            {
              icon: 'palette',
              title: 'Lấy màu tức thì',
              text: 'Đang vẽ, giữ [[Alt]] và bấm vào ảnh để lấy màu, nhả ra là vẽ tiếp.',
            },
            {
              icon: 'brush',
              title: 'Đổi cỡ cọ không rời tay',
              text: '[[[]] [[]]] đổi cỡ; [[Alt]] + kéo chuột phải đổi cỡ và độ cứng trực quan.',
            },
            {
              icon: 'maximize',
              title: 'Lạc khung nhìn?',
              text: '[[Shift+1]] đưa cả ảnh vào màn hình; [[Shift+0]] về 100%.',
            },
            {
              icon: 'sparkles',
              title: 'Ảnh chụp đẹp hơn',
              text: 'Bật **Làm đẹp** với nền gradient — ảnh gửi đi trông như ảnh minh họa chuyên nghiệp.',
            },
            {
              icon: 'layers',
              title: 'Hai dãy số thứ tự',
              text: 'Mỗi layer chú thích đánh số riêng; thêm layer chú thích mới để bắt đầu lại từ 1.',
            },
            {
              icon: 'selection',
              title: 'Tô không lem',
              text: 'Tạo vùng chọn trước khi vẽ: nét chỉ nằm trong vùng chọn. Hoặc bật **Khóa vùng trong suốt** cho layer.',
            },
            {
              icon: 'eye-off',
              title: 'Che nhanh từ vùng chọn',
              text: 'Chọn vùng bằng Đũa thần hay Lasso rồi bấm {icon:eye-off} trên mini toolbar.',
            },
            {
              icon: 'history',
              title: 'Quay về nhiều bước',
              text: 'Bấm thẳng vào một bước trong tab **Lịch sử** thay vì nhấn [[Mod+Z]] nhiều lần.',
            },
            {
              icon: 'file-paint',
              title: 'Sao lưu một chạm',
              text: 'Chrome/Edge: "Lưu ra file .paint…" một lần, sau đó mỗi [[Mod+S]] cập nhật file.',
            },
          ],
        },
      ],
    },
    {
      id: 'offline-cai-dat',
      title: 'Dùng offline và cài như ứng dụng',
      summary: 'Paint Online chạy được khi mất mạng và có thể cài vào máy như một ứng dụng riêng.',
      icon: 'offline',
      level: 'basic',
      keywords: [
        'offline',
        'mất mạng',
        'pwa',
        'cài đặt app',
        'install',
        'cập nhật',
        'phiên bản mới',
      ],
      related: ['gioi-thieu', 'du-lieu-dung-luong'],
      blocks: [
        {
          type: 'list',
          items: [
            'Sau lần mở đầu tiên khi có mạng, Paint Online lưu sẵn mọi thứ cần thiết. Thông báo "Paint Online đã sẵn sàng dùng cả khi mất mạng" xác nhận điều đó.',
            'Khi mất mạng, bạn vẫn mở app, vẽ, lưu, xuất ảnh bình thường.',
            'Hướng dẫn sử dụng này cũng dùng được offline; riêng ảnh minh họa chỉ có sẵn sau khi đã được xem lúc có mạng.',
          ],
        },
        { type: 'h2', id: 'cai-dat-app', text: 'Cài như ứng dụng' },
        {
          type: 'p',
          text: 'Việc cài là tùy chọn — không tính năng nào cần cài. Nếu muốn mở Paint Online trong cửa sổ riêng, dùng chức năng cài của trình duyệt: trên Chrome/Edge, biểu tượng **Cài đặt ứng dụng** ở cuối thanh địa chỉ (hoặc menu trình duyệt → Cài đặt Paint Online); trên Safari, **Thêm vào Dock**.',
        },
        {
          type: 'callout',
          tone: 'tip',
          text: 'Trên Safari, thêm vào Dock còn giúp dữ liệu không bị xóa sau 7 ngày không mở trang.',
        },
        { type: 'h2', id: 'cap-nhat', text: 'Cập nhật phiên bản mới' },
        {
          type: 'p',
          text: 'Khi có phiên bản mới, góc màn hình hiện thông báo "Có phiên bản mới của Paint Online" với nút {ui:Lưu và tải lại}. App **không tự tải lại** giữa lúc bạn đang vẽ; bấm nút khi tiện — project đang mở được lưu trước khi tải lại.',
        },
      ],
    },
    {
      id: 'xu-ly-su-co',
      title: 'Xử lý sự cố',
      summary:
        'Không dán được ảnh, không vẽ được, phím tắt không chạy, lỗi lưu, thiếu bộ nhớ… và cách khắc phục.',
      icon: 'wrench',
      level: 'basic',
      keywords: [
        'lỗi',
        'sự cố',
        'không được',
        'không vẽ được',
        'troubleshoot',
        'faq',
        'hỏi đáp',
        'bộ nhớ',
        'chậm',
      ],
      related: ['gioi-han', 'du-lieu-dung-luong', 'cai-dat'],
      blocks: [
        { type: 'h2', id: 'dan-anh', text: 'Nhấn Ctrl+V không có gì xảy ra' },
        {
          type: 'list',
          items: [
            'Clipboard đang chứa chữ hoặc file thay vì ảnh: app báo "Clipboard không có ảnh". Chụp màn hình lại.',
            'Con trỏ đang ở trong một ô nhập liệu (ô tìm kiếm…): bấm ra chỗ trống rồi dán lại.',
            'Thử nút {ui:Từ clipboard} ở trang chủ; trình duyệt có thể hỏi quyền đọc clipboard — chọn Cho phép.',
          ],
        },
        { type: 'h2', id: 'khong-ve-duoc', text: 'Kéo chuột mà không vẽ được' },
        {
          type: 'table',
          head: ['Thông báo / dấu hiệu', 'Cách xử lý'],
          rows: [
            ['"Layer đang bị khóa"', 'Mở khóa {icon:lock} ở dòng layer trong bảng Layer.'],
            ['"Layer đang ẩn — hãy hiện layer trước khi vẽ"', 'Bấm {icon:eye} để hiện layer.'],
            [
              'Hộp thoại "Đây là layer chú thích"',
              'Bạn dùng công cụ vẽ pixel trên layer chú thích — chọn một cách, rồi vẽ lại. Xem [Layer](layer#hai-loai-layer).',
            ],
            [
              'Nét chỉ hiện một phần',
              'Đang có vùng chọn: nét bị giới hạn trong vùng chọn. Nhấn [[Mod+D]].',
            ],
            [
              'Không thấy thanh công cụ',
              'Đang ở Zen mode ([[\\]] để thoát) hoặc tab chỉ đọc (bấm {ui:Chỉnh sửa ở tab này}).',
            ],
            ['"Đang mở bảng điều chỉnh — hãy Áp dụng hoặc Hủy trước"', 'Đóng bảng bộ lọc đang mở.'],
            [
              'Vẽ được nhưng không thấy gì',
              'Độ mờ cọ hoặc độ đục màu quá thấp, hoặc layer đang vẽ bị layer khác che. Kiểm tra bảng Layer.',
            ],
          ],
        },
        { type: 'h2', id: 'phim-tat', text: 'Phím tắt không chạy' },
        {
          type: 'list',
          items: [
            'Con trỏ đang ở ô nhập (tên layer, ô tìm, ô số…): phím một chữ cái được giữ cho ô đó. Bấm vào khung vẽ rồi thử lại.',
            'Đang gõ chữ trên ảnh: nhấn [[Escape]] để kết thúc trước.',
            'Trình duyệt hoặc tiện ích giành phím (ví dụ [[Mod+K]], [[Mod+Shift+S]] trên Firefox): dùng phím dự phòng trong [Bảng phím tắt](phim-tat) hoặc Command Palette.',
          ],
        },
        { type: 'h2', id: 'bo-nho', text: 'Báo thiếu bộ nhớ, app chậm' },
        {
          type: 'list',
          items: [
            'Gộp bớt layer ([[Mod+E]], Gộp các layer đang hiện, Làm phẳng).',
            'Giảm kích thước ảnh nếu không cần độ phân giải cao.',
            'Đóng các project, tab khác đang mở.',
            'Ảnh rất lớn (trên 4K) với nhiều layer có thể làm bộ lọc, cắt xén chạy vài giây — theo dõi "Đang xử lý ảnh…" trên thanh trạng thái.',
          ],
        },
        { type: 'h2', id: 'loi-luu', text: 'Báo "Lỗi lưu" hoặc "Hết dung lượng"' },
        {
          type: 'p',
          text: 'Dữ liệu vẫn còn trong tab. Bấm vào trạng thái lưu để **Thử lại** hoặc **Tải bản sao lưu .paint** ngay. Với hết dung lượng, xem [Hết dung lượng](du-lieu-dung-luong#het-dung-luong).',
        },
        { type: 'h2', id: 'mat-project', text: 'Không thấy project cũ' },
        {
          type: 'list',
          items: [
            'Kiểm tra **Thùng rác** ở trang chủ.',
            'Project chỉ có ở trình duyệt và máy đã tạo ra nó — mở đúng trình duyệt đó.',
            'Dữ liệu trình duyệt đã bị xóa: chỉ khôi phục được từ file `.paint` đã tải trước đó.',
          ],
        },
        { type: 'h2', id: 'bao-loi', text: 'Báo lỗi cho nhóm phát triển' },
        {
          type: 'p',
          text: 'Mở [Cài đặt](cai-dat) → **Nhật ký lỗi** → {ui:Tải nhật ký (JSON)} và gửi file đó kèm mô tả các bước. Nhật ký chỉ nằm trong trình duyệt của bạn; app không tự gửi gì ra ngoài.',
        },
      ],
    },
    {
      id: 'gioi-han',
      title: 'Giới hạn và lưu ý',
      summary: 'Kích thước tối đa, những gì chưa hỗ trợ và các hành vi nên biết để tránh bất ngờ.',
      icon: 'warning',
      level: 'advanced',
      keywords: ['giới hạn', 'limit', 'tối đa', 'chưa hỗ trợ', 'lưu ý', 'known issues'],
      related: ['xu-ly-su-co', 'du-lieu-dung-luong', 'mo-nhap-anh'],
      blocks: [
        { type: 'h2', id: 'kich-thuoc', text: 'Kích thước và bộ nhớ' },
        {
          type: 'table',
          head: ['Thiết bị', 'Cạnh tối đa', 'Số điểm ảnh tối đa', 'Ngân sách bộ nhớ'],
          rows: [
            ['Máy tính thông thường', '8192 px', '≈ 67 triệu (8192²)', '1,5 GB'],
            ['Máy ít RAM (Chrome báo ≤ 4 GB)', '6000 px', '36 triệu', '768 MB'],
            ['iPhone, iPad', '4096 px', '≈ 16,7 triệu', '320 MB'],
          ],
        },
        {
          type: 'list',
          items: [
            'File mở tối đa 50 MB, ảnh nguồn tối đa 16384 px mỗi cạnh (lớn hơn giới hạn thiết bị thì tự thu nhỏ).',
            'Lịch sử tối đa 100 bước, chỉ trong phiên làm việc.',
            'Thùng rác giữ 7 ngày.',
          ],
        },
        { type: 'h2', id: 'chua-ho-tro', text: 'Chưa hỗ trợ' },
        {
          type: 'list',
          items: [
            'Đồng bộ đám mây, tài khoản, làm việc nhiều người cùng lúc.',
            'Mở file Photoshop (PSD), HEIC, RAW; xuất PDF.',
            'Giao diện cho điện thoại (phiên bản 1.0 dành cho màn hình từ 1024 px).',
            'Ngôn ngữ khác ngoài tiếng Việt.',
          ],
        },
        { type: 'h2', id: 'hanh-vi-nen-biet', text: 'Hành vi nên biết' },
        {
          type: 'options',
          items: [
            [
              'Đối tượng vừa vẽ vẫn được chọn',
              'Đổi màu lúc này sẽ đổi luôn đối tượng đó, kể cả khi đã đổi sang công cụ khác. Kiểu nhanh chỉ đổi đối tượng cùng loại (bấm kiểu khung không làm đổi mũi tên đang chọn). Nhấn [[Escape]] trước.',
            ],
            ['Escape khi gõ chữ', 'Ghi lại chữ, không hủy. Hoàn tác bằng [[Mod+Z]] nếu muốn bỏ.'],
            [
              'Vùng che trong file .paint',
              'File `.paint` giữ ảnh gốc dưới vùng che trừ khi chọn "Áp dụng vĩnh viễn".',
            ],
            [
              'Tùy chọn Xuất ảnh',
              'Chỉ được nhớ trong tab đang mở; tải lại trang là về mặc định (PNG, 90%, 1×).',
            ],
            ['Chọn nhiều file', 'Mở/thả nhiều file cùng lúc chỉ nhận một file.'],
          ],
        },
      ],
    },
  ],
};
