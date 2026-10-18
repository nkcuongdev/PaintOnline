import type { Category } from '../types';

export const filesCategory: Category = {
  id: 'luu-xuat',
  title: 'Lưu, xuất và sao lưu',
  description:
    'Lưu tự động, quản lý project, mở và nhập ảnh, xuất PNG/JPG/WebP, sao lưu và chuyển máy bằng file .paint.',
  icon: 'save',
  topics: [
    {
      id: 'luu-tu-dong',
      title: 'Lưu tự động và trạng thái lưu',
      summary:
        'Paint Online lưu khi nào, đọc trạng thái lưu, Lưu ngay, và chuyện gì xảy ra khi trình duyệt bị đóng đột ngột.',
      icon: 'save',
      level: 'basic',
      keywords: [
        'lưu',
        'save',
        'autosave',
        'tự động lưu',
        'ctrl s',
        'khôi phục',
        'mất bài',
        'checkpoint',
        'bản dự phòng',
      ],
      related: ['du-lieu-dung-luong', 'sao-luu-file-paint', 'cai-dat'],
      blocks: [
        {
          type: 'p',
          text: 'Bạn **không cần bấm lưu**. Paint Online lưu project vào trình duyệt khoảng **1,5 giây sau thay đổi cuối** (khi vẽ liên tục, không quá 10 giây một lần). Ngoài ra luôn lưu ngay khi bạn chuyển sang tab khác, rời project, đóng tab hoặc nhấn [[Mod+S]].',
        },
        { type: 'h2', id: 'trang-thai', text: 'Trạng thái lưu' },
        {
          type: 'p',
          text: 'Cạnh tên project trên thanh trên cùng có chỉ báo trạng thái. Tiêu đề tab cũng có dấu "•" khi còn thay đổi chưa lưu.',
        },
        {
          type: 'table',
          head: ['Hiển thị', 'Ý nghĩa'],
          rows: [
            ['Đã lưu', 'Mọi thay đổi đã nằm an toàn trong trình duyệt.'],
            ['Có thay đổi chưa lưu', 'Sắp được lưu tự động.'],
            ['Đang lưu…', 'Đang ghi.'],
            [
              'Lỗi lưu',
              'Ghi thất bại nhiều lần — bấm vào để xem lý do, **Thử lại** hoặc tải file `.paint`.',
            ],
            [
              'Hết dung lượng',
              'Trình duyệt hết chỗ — xem [Dữ liệu và dung lượng](du-lieu-dung-luong#het-dung-luong).',
            ],
            ['Chỉ đọc', 'Project đang được sửa ở tab khác.'],
            [
              'Không lưu tự động',
              'Trình duyệt không cho lưu (thường do cửa sổ ẩn danh). Hãy tải file `.paint`.',
            ],
          ],
        },
        {
          type: 'figure',
          shot: 'save-status',
          size: 'small',
          caption: 'Bấm vào trạng thái để xem giờ lưu gần nhất và nút Lưu ngay.',
          markers: [{ target: 'now', label: '{ui:Lưu ngay} ([[Mod+S]])' }],
        },
        {
          type: 'callout',
          tone: 'warning',
          text: 'Khi trạng thái là **Lỗi lưu**, dữ liệu vẫn còn trong tab đang mở. **Đừng đóng tab** trước khi lưu được hoặc tải file `.paint`.',
        },
        { type: 'h2', id: 'luu-ngay', text: 'Lưu ngay' },
        {
          type: 'p',
          text: 'Nhấn [[Mod+S]], bấm {ui:Lưu ngay} trong chỉ báo trạng thái, hoặc menu {icon:more} → {ui:Lưu ngay}. Nếu project đã được gắn với một file `.paint` trên máy (xem [Lưu ra file](sao-luu-file-paint#luu-ra-file)), [[Mod+S]] còn ghi đè luôn file đó.',
        },
        { type: 'h2', id: 'tat-tu-dong', text: 'Tắt lưu tự động' },
        {
          type: 'p',
          text: 'Trong [Cài đặt](cai-dat) → **Tự động lưu** → **Tắt**. Khi tắt, app vẫn lưu khi bạn nhấn [[Mod+S]], chuyển tab, rời project hoặc đóng tab.',
        },
        { type: 'h2', id: 'khoi-phuc', text: 'Khi trình duyệt bị đóng đột ngột' },
        {
          type: 'list',
          items: [
            'Mở lại Paint Online: trang chủ hiện thông báo **Phiên trước kết thúc đột ngột** kèm giờ của bản lưu gần nhất. Bấm {ui:Tiếp tục}.',
            'Project mở lại đúng mức thu phóng, vị trí và công cụ đang dùng trước khi bị đóng.',
            'Nếu bản lưu bị hỏng, Paint Online đề nghị mở **bản dự phòng (checkpoint)** — bản được ghi mỗi khi bạn đóng project và sau mỗi 15 phút làm việc.',
          ],
        },
        {
          type: 'callout',
          tone: 'note',
          text: 'Lưu tự động giữ **ảnh hiện tại**, không giữ lịch sử hoàn tác. Mở lại project là bắt đầu lịch sử mới.',
        },
      ],
    },
    {
      id: 'quan-ly-project',
      title: 'Quản lý project',
      summary:
        'Đổi tên, nhân bản, tìm kiếm, sắp xếp, chuyển vào thùng rác, khôi phục và xóa vĩnh viễn.',
      icon: 'folder',
      level: 'basic',
      keywords: [
        'project',
        'đổi tên',
        'rename',
        'nhân bản',
        'duplicate',
        'xóa',
        'thùng rác',
        'trash',
        'khôi phục',
        'tìm kiếm',
        'sắp xếp',
      ],
      related: ['trang-chu', 'sao-luu-file-paint', 'du-lieu-dung-luong'],
      blocks: [
        { type: 'h2', id: 'menu-project', text: 'Menu thao tác' },
        {
          type: 'p',
          text: 'Mỗi thẻ project ở trang chủ có nút {icon:more}:',
        },
        { type: 'figure', shot: 'home-card-menu', size: 'small' },
        {
          type: 'options',
          items: [
            ['Mở', 'Mở project.'],
            [
              'Đổi tên…',
              'Tối đa 120 ký tự. Trong editor, bấm vào tên project trên thanh trên cùng cũng đổi được.',
            ],
            ['Nhân bản', 'Tạo bản sao "(bản sao)" giữ nguyên chế độ và nội dung đã lưu.'],
            [
              'Tải bản sao lưu .paint',
              'Tải file project về máy. Xem [Sao lưu với file .paint](sao-luu-file-paint).',
            ],
            ['Chuyển vào thùng rác', 'Ẩn project khỏi danh sách; khôi phục được trong 7 ngày.'],
          ],
        },
        { type: 'h2', id: 'tim-sap-xep', text: 'Tìm và sắp xếp' },
        {
          type: 'list',
          items: [
            'Ô **Tìm theo tên** không phân biệt hoa thường và dấu: gõ "anh dan" vẫn ra "Ảnh dán…".',
            '**Sắp xếp**: Mới sửa (mặc định), Mới tạo, Tên A–Z, Dung lượng.',
          ],
        },
        { type: 'h2', id: 'thung-rac', text: 'Thùng rác' },
        {
          type: 'figure',
          shot: 'home-trash',
          caption: 'Thùng rác: mỗi dòng hiện số ngày còn lại.',
        },
        {
          type: 'list',
          items: [
            'Bấm {ui:Thùng rác} cạnh ô sắp xếp (có số lượng trong ngoặc khi không trống).',
            '**Khôi phục** đưa project về danh sách.',
            '**Xóa vĩnh viễn** hoặc **Dọn thùng rác** sẽ hỏi lại trước khi xóa — không thể hoàn tác.',
            'Project nằm trong thùng rác quá 7 ngày bị xóa vĩnh viễn ở lần mở app tiếp theo.',
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          text: 'Trước khi xóa vĩnh viễn project quan trọng, hãy tải bản sao lưu `.paint`.',
        },
      ],
    },
    {
      id: 'mo-nhap-anh',
      title: 'Mở, dán và thả ảnh',
      summary:
        'Định dạng hỗ trợ, giới hạn kích thước, và khác nhau giữa dán ở trang chủ với dán trong editor.',
      icon: 'clipboard',
      level: 'basic',
      keywords: [
        'mở ảnh',
        'import',
        'dán',
        'paste',
        'kéo thả',
        'drag drop',
        'định dạng',
        'png',
        'jpg',
        'webp',
        'gif',
        'bmp',
        'svg',
        'heic',
        'giới hạn',
      ],
      related: ['trang-chu', 'qt-ghep-anh', 'gioi-han'],
      blocks: [
        {
          type: 'table',
          head: ['Ở đâu', 'Thao tác', 'Kết quả'],
          rows: [
            ['Trang chủ', '[[Mod+V]] hoặc {ui:Từ clipboard}', 'Project mới, **chế độ Screenshot**'],
            [
              'Trang chủ',
              '{ui:Mở ảnh…} hoặc thả file',
              'Project mới, **chế độ Paint** (file `.paint`: nhập project)',
            ],
            ['Editor', '[[Mod+V]]', 'Ảnh đang di chuyển → **layer mới** khi áp dụng'],
            ['Editor', 'Thả file ảnh vào khung vẽ', 'Như dán: layer mới ở giữa khung nhìn'],
          ],
        },
        { type: 'h2', id: 'dinh-dang', text: 'Định dạng và giới hạn' },
        {
          type: 'list',
          items: [
            '**Ảnh:** PNG, JPG, WebP, GIF (khung đầu tiên), BMP. Hộp chọn file còn nhận AVIF và SVG (SVG không có kích thước sẽ thành 1024 × 1024).',
            '**Project:** file `.paint` — chỉ nhập ở trang chủ.',
            'File tối đa **50 MB**, ảnh tối đa **16384 px** mỗi cạnh.',
            'Ảnh lớn hơn giới hạn của thiết bị (máy tính: 8192 px mỗi cạnh) **tự thu nhỏ** và có thông báo kích thước mới.',
            'Hướng xoay của ảnh chụp điện thoại (EXIF) được áp dụng tự động.',
            'Mỗi lần mở/thả chỉ nhận một file (nếu thả nhiều, file `.paint` được ưu tiên, sau đó là ảnh đầu tiên).',
          ],
        },
        {
          type: 'callout',
          tone: 'note',
          text: 'Định dạng như HEIC (iPhone) hay RAW không được hỗ trợ. Hãy xuất sang JPG hoặc PNG trước.',
        },
        { type: 'h2', id: 'loi', text: 'Thông báo lỗi thường gặp' },
        {
          type: 'options',
          items: [
            [
              'Clipboard không có ảnh',
              'Bạn chưa chụp màn hình, hoặc đã copy chữ thay vì ảnh. Chụp lại rồi nhấn [[Mod+V]].',
            ],
            ['Định dạng không được hỗ trợ', 'File không phải ảnh hợp lệ.'],
            ['File quá lớn (tối đa 50 MB)', 'Giảm kích thước file trước khi mở.'],
            ['Không đọc được ảnh', 'File bị hỏng.'],
            ['Giải mã ảnh quá lâu nên đã dừng', 'Ảnh quá nặng với máy (đọc quá 10 giây).'],
          ],
        },
      ],
    },
    {
      id: 'xuat-anh',
      title: 'Copy và xuất ảnh',
      summary:
        'Copy vào clipboard, tải PNG nhanh, hoặc xuất PNG, JPG, WebP với tỉ lệ, chất lượng, nền và vùng tùy chọn.',
      icon: 'download',
      level: 'basic',
      keywords: [
        'xuất',
        'export',
        'tải xuống',
        'download',
        'copy',
        'png',
        'jpg',
        'jpeg',
        'webp',
        'chất lượng',
        'tỉ lệ',
        'metadata',
        'exif',
      ],
      related: ['lam-dep', 'sao-luu-file-paint', 'che-thong-tin'],
      blocks: [
        { type: 'h2', id: 'copy', text: 'Copy ảnh' },
        {
          type: 'list',
          items: [
            'Bấm {ui:Copy} (chế độ Screenshot) / {ui:Copy ảnh} (chế độ Paint), hoặc [[Mod+C]] khi không có vùng chọn.',
            'Ảnh PNG đầy đủ (gồm khung Làm đẹp nếu đang bật) được đưa vào clipboard; dán vào ứng dụng khác bằng [[Mod+V]].',
            'Nếu trình duyệt không cho ghi ảnh vào clipboard, Paint Online **tự tải file PNG xuống** và báo cho bạn.',
          ],
        },
        { type: 'h2', id: 'tai-xuong', text: 'Tải xuống nhanh' },
        {
          type: 'p',
          text: 'Ở chế độ Screenshot, nút {ui:Tải xuống} lưu ngay file **PNG** đúng kích thước gốc (kèm khung Làm đẹp nếu bật), không qua hộp thoại.',
        },
        { type: 'h2', id: 'hop-thoai-xuat', text: 'Hộp thoại Xuất ảnh' },
        {
          type: 'p',
          text: 'Mở bằng [[Mod+Shift+S]], nút {ui:Xuất} (chế độ Paint) hoặc menu {icon:more} → {ui:Xuất ảnh…}.',
        },
        {
          type: 'figure',
          shot: 'export-dialog',
          size: 'medium',
          markers: [
            { target: 'format', label: 'Định dạng' },
            { target: 'beautify', label: 'Gồm khung Làm đẹp' },
            { target: 'size', label: 'Kích thước ảnh xuất' },
            { target: 'estimate', label: 'Dung lượng ước tính' },
            { target: 'download', label: 'Tải xuống' },
          ],
        },
        {
          type: 'options',
          items: [
            [
              'PNG',
              'Không mất chất lượng, giữ nền trong suốt. Hợp với ảnh chụp màn hình, hình vẽ.',
            ],
            [
              'JPG',
              'Nhẹ, hợp với ảnh chụp; **không có nền trong suốt** — chỗ trong suốt được tô bằng **Màu nền (JPG)** (mặc định trắng).',
            ],
            ['WebP', 'Nhẹ nhất, giữ nền trong suốt.'],
            ['Chất lượng', 'JPG/WebP: 10–100% (mặc định 90%).'],
            ['Tỉ lệ', '0,5× – 2× (bước 0,25×) — xuất nhỏ hơn hoặc lớn hơn ảnh gốc.'],
            [
              'Chỉ vùng chọn',
              'Chỉ hiện khi đang có vùng chọn: xuất phần trong vùng chọn (không kèm khung Làm đẹp).',
            ],
            ['Gồm khung Làm đẹp', 'Chỉ hiện khi đang bật Làm đẹp; mặc định đánh dấu.'],
          ],
        },
        {
          type: 'figure',
          shot: 'export-dialog-jpg',
          size: 'medium',
          caption: 'Chọn JPG: có thanh Chất lượng và Màu nền.',
        },
        {
          type: 'list',
          items: [
            'Khung xem trước và dung lượng ước tính được tính từ lần mã hóa thật, cập nhật khi bạn đổi tùy chọn.',
            'Tên file là tên project (ký tự không hợp lệ được thay bằng khoảng trắng).',
            'Lựa chọn được nhớ cho lần xuất sau trong cùng tab.',
          ],
        },
        {
          type: 'callout',
          tone: 'important',
          title: 'Ảnh xuất ra là ảnh "phẳng"',
          text: 'Mọi chú thích và vùng che được vẽ thẳng vào ảnh, ảnh không mang metadata (EXIF, vị trí GPS). Pixel dưới vùng che bị thay hẳn. Muốn giữ layer và chữ còn sửa được, dùng [file .paint](sao-luu-file-paint).',
        },
      ],
    },
    {
      id: 'sao-luu-file-paint',
      title: 'Sao lưu và chuyển máy với file .paint',
      summary:
        'File .paint giữ nguyên layer, chú thích và chế độ; tải về để sao lưu, chuyển sang máy khác, hoặc lưu thẳng ra một file trên máy.',
      icon: 'file-paint',
      level: 'basic',
      keywords: [
        '.paint',
        'sao lưu',
        'backup',
        'chuyển máy',
        'nhập project',
        'lưu ra file',
        'save as',
        'onedrive',
        'google drive',
      ],
      related: ['du-lieu-dung-luong', 'xuat-anh', 'che-thong-tin'],
      blocks: [
        {
          type: 'p',
          text: 'File `.paint` là bản đóng gói **toàn bộ project**: mọi layer (dạng PNG), đối tượng chú thích còn sửa được, khung Làm đẹp, chế độ Screenshot/Paint. Đây là cách duy nhất để mang project sang máy hoặc trình duyệt khác.',
        },
        { type: 'h2', id: 'tai-ban-sao-luu', text: 'Tải bản sao lưu' },
        {
          type: 'list',
          items: [
            'Trong editor: menu {icon:more} → {ui:Tải bản sao lưu .paint} (lấy cả thay đổi chưa kịp lưu).',
            'Ở trang chủ: menu {icon:more} trên thẻ project → {ui:Tải bản sao lưu .paint}.',
          ],
        },
        {
          type: 'p',
          text: 'Nếu project có vùng che thông tin, một hộp thoại hỏi bạn có muốn **Áp dụng vĩnh viễn vùng che trước khi xuất** (pixel gốc bị thay hẳn trong file; project trong trình duyệt không đổi) hay **Xuất nguyên bản**.',
        },
        {
          type: 'figure',
          shot: 'paint-export-dialog',
          size: 'medium',
          markers: [
            { target: 'bake', label: 'Khuyên dùng khi gửi file cho người khác' },
            { target: 'original', label: 'Giữ ảnh gốc dưới vùng che (để tự sửa sau)' },
          ],
        },
        { type: 'h2', id: 'nhap', text: 'Mở file .paint trên máy khác' },
        {
          type: 'steps',
          items: [
            'Mở Paint Online trên máy mới.',
            'Kéo thả file `.paint` vào trang chủ, hoặc bấm {ui:Mở ảnh…} và chọn file.',
            'Project được nhập thành **project mới** (không ghi đè project có sẵn) và mở ngay.',
          ],
        },
        {
          type: 'p',
          text: 'Lỗi có thể gặp: "Đây không phải file .paint của Paint Online", "File .paint bị hỏng", "File .paint được tạo bởi phiên bản Paint Online mới hơn" (hãy cập nhật app), "Không đủ dung lượng để nhập project".',
        },
        { type: 'h2', id: 'luu-ra-file', text: 'Lưu ra file (Chrome, Edge)' },
        {
          type: 'steps',
          items: [
            'Menu {icon:more} → {ui:Lưu ra file .paint…}.',
            'Chọn thư mục và tên file trong hộp thoại của hệ điều hành. Đặt file trong thư mục OneDrive, Google Drive hay Dropbox nếu muốn có bản trên đám mây.',
            'Từ đó, menu ghi "Ctrl+S lưu vào tên-file.paint": mỗi lần nhấn [[Mod+S]], Paint Online lưu vào trình duyệt rồi **ghi đè file đó**.',
          ],
        },
        {
          type: 'callout',
          tone: 'note',
          text: [
            'Firefox và Safari chưa hỗ trợ ghi file trực tiếp: lệnh này sẽ tải file `.paint` xuống như bình thường.',
            'Sau khi tải lại trang, trình duyệt có thể hỏi lại quyền ghi file. Nếu bị từ chối, chọn "Lưu ra file .paint…" lần nữa.',
          ],
        },
        { type: 'h2', id: 'nhac-sao-luu', text: 'Nhắc sao lưu' },
        {
          type: 'p',
          text: 'Project đã sửa mà hơn 7 ngày chưa tải `.paint` sẽ có biểu tượng khiên trên thẻ ở trang chủ, và trang chủ hiện lời nhắc. Tải bản sao lưu là hết nhắc.',
        },
      ],
    },
    {
      id: 'du-lieu-dung-luong',
      title: 'Dữ liệu, dung lượng và nhiều tab',
      summary:
        'Dữ liệu được lưu ở đâu, khi nào có thể mất, lưu trữ bền vững, hết dung lượng, và mở cùng project ở hai tab.',
      icon: 'shield',
      level: 'advanced',
      keywords: [
        'dữ liệu',
        'indexeddb',
        'dung lượng',
        'quota',
        'hết chỗ',
        'lưu trữ bền vững',
        'persistent',
        'ẩn danh',
        'incognito',
        'nhiều tab',
        'chỉ đọc',
        'safari',
      ],
      related: ['sao-luu-file-paint', 'luu-tu-dong', 'cai-dat'],
      blocks: [
        {
          type: 'p',
          text: 'Project được lưu trong bộ nhớ của trình duyệt (IndexedDB) trên máy bạn. Không có máy chủ, không có đồng bộ đám mây.',
        },
        {
          type: 'callout',
          tone: 'important',
          title: 'Khi nào dữ liệu có thể mất?',
          text: [
            'Khi bạn **xóa dữ liệu duyệt web** (cookie và dữ liệu trang) của trình duyệt.',
            'Khi dùng **cửa sổ ẩn danh**: dữ liệu mất khi đóng cửa sổ (app báo "Không lưu tự động").',
            'Khi trình duyệt **tự dọn** lúc ổ đĩa sắp đầy (nếu chưa bật lưu trữ bền vững).',
            'Trên **Safari**: dữ liệu của trang có thể bị xóa sau 7 ngày không mở (trừ khi bạn thêm app vào Dock).',
          ],
        },
        { type: 'h2', id: 'giu-an-toan', text: 'Cách giữ an toàn' },
        {
          type: 'steps',
          items: [
            '**Bật lưu trữ bền vững:** [Cài đặt](cai-dat) → Lưu trữ → {ui:Yêu cầu lưu bền vững}. Trình duyệt sẽ không tự xóa dữ liệu khi thiếu chỗ.',
            '**Tải bản sao lưu `.paint`** cho project quan trọng, đặc biệt khi trang chủ nhắc.',
            '**Lưu ra file** (Chrome, Edge) vào thư mục đồng bộ đám mây — [xem cách làm](sao-luu-file-paint#luu-ra-file).',
          ],
        },
        { type: 'h2', id: 'dung-luong', text: 'Xem dung lượng' },
        {
          type: 'p',
          text: 'Dưới danh sách project ở trang chủ (và trong Cài đặt) có thanh "Đã dùng … / …". Thanh chuyển đỏ khi dùng trên 80%. Dòng chữ bên dưới cho biết dữ liệu có được bảo vệ khỏi việc trình duyệt tự dọn hay không.',
        },
        { type: 'h2', id: 'het-dung-luong', text: 'Hết dung lượng' },
        {
          type: 'p',
          text: 'Khi không còn chỗ, trạng thái lưu thành **Hết dung lượng** và hộp thoại gợi ý giải phóng. Thay đổi mới vẫn nằm trong tab; app tự lưu lại khi có chỗ.',
        },
        {
          type: 'options',
          items: [
            ['Tải file .paint ngay', 'Giữ bài đang làm ra file trước đã.'],
            ['Dọn thùng rác', 'Xóa vĩnh viễn các project trong thùng rác.'],
            ['Xóa bản dự phòng (checkpoint)', 'Bỏ các bản dự phòng của mọi project để lấy chỗ.'],
            ['Xóa project cũ ở trang chủ', 'Về trang chủ để chọn project cần xóa.'],
          ],
        },
        { type: 'h2', id: 'nhieu-tab', text: 'Mở cùng project ở hai tab' },
        {
          type: 'p',
          text: 'Để tránh hai tab ghi đè lẫn nhau, mỗi project chỉ được **sửa ở một tab**. Tab mở sau sẽ ở chế độ **chỉ đọc**: ẩn thanh công cụ, có thanh thông báo.',
        },
        {
          type: 'figure',
          shot: 'read-only',
          markers: [{ target: 'take', label: 'Lấy quyền chỉnh sửa về tab này' }],
        },
        {
          type: 'p',
          text: 'Bấm {ui:Chỉnh sửa ở tab này}: tab kia lưu lại rồi chuyển sang chỉ đọc, tab này tải bản mới nhất và cho sửa.',
        },
      ],
    },
  ],
};
