import type { Category } from '../types';

export const selectionCategory: Category = {
  id: 'vung-chon',
  title: 'Vùng chọn và chỉnh ảnh',
  description:
    'Chọn một phần ảnh, di chuyển, biến đổi, copy/dán; cắt xén, đổi kích thước, xoay, lật và dùng bộ lọc.',
  icon: 'selection',
  topics: [
    {
      id: 'vung-chon',
      title: 'Tạo vùng chọn',
      summary:
        'Chọn hình chữ nhật, elip, tự do (Lasso) hoặc theo màu (Đũa thần); cộng, trừ, giao vùng chọn.',
      icon: 'selection',
      level: 'basic',
      keywords: [
        'selection',
        'vùng chọn',
        'marquee',
        'chữ nhật',
        'elip',
        'lasso',
        'đũa thần',
        'magic wand',
        'feather',
        'làm mềm biên',
        'chọn tất cả',
        'đảo vùng chọn',
      ],
      related: ['thao-tac-vung-chon', 'cat-xen-bien-doi', 'bo-loc'],
      blocks: [
        {
          type: 'p',
          text: 'Vùng chọn (đường viền "kiến bò") giới hạn nơi bạn vẽ, tô, áp bộ lọc, và là phần sẽ được copy, cắt, di chuyển. Các công cụ chọn nằm trong nhóm **Chọn** ở đầu thanh công cụ (chỉ có ở chế độ Paint).',
        },
        {
          type: 'tools',
          items: [
            {
              tool: 'marquee-rect',
              text: 'Kéo chéo. Nhấn [[Shift]] **sau khi** bắt đầu kéo để được hình vuông.',
            },
            {
              tool: 'marquee-ellipse',
              text: 'Kéo chéo. Nhấn [[Shift]] sau khi bắt đầu kéo để được hình tròn.',
            },
            { tool: 'lasso', text: 'Giữ chuột vẽ đường bao tự do; thả ra là khép kín.' },
            { tool: 'wand', text: 'Bấm vào một màu để chọn vùng có màu giống nhau.' },
          ],
        },
        {
          type: 'p',
          text: 'Phím [[M]] chọn kiểu chọn khung dùng gần nhất; đang ở đó nhấn [[M]] lần nữa để đổi chữ nhật ↔ elip.',
        },
        {
          type: 'figure',
          shot: 'marquee-selection',
          caption: 'Vùng chọn chữ nhật quanh mặt trời và mini toolbar.',
        },
        { type: 'h2', id: 'che-do', text: 'Cộng, trừ, giao vùng chọn' },
        {
          type: 'table',
          head: ['Giữ khi bắt đầu kéo/bấm', 'Chế độ', 'Kết quả'],
          rows: [
            ['(không giữ)', 'Mới', 'Thay vùng chọn cũ'],
            ['[[Shift]]', 'Thêm', 'Cộng vào vùng chọn cũ'],
            ['[[Alt]]', 'Bớt', 'Trừ khỏi vùng chọn cũ'],
            ['[[Shift+Alt]]', 'Giao', 'Chỉ giữ phần chung'],
          ],
        },
        {
          type: 'p',
          text: 'Có thể đặt cố định chế độ ở mục **Chế độ** trên thanh tùy chọn. Bấm một lần (không kéo) ở chế độ Mới sẽ bỏ chọn.',
        },
        { type: 'h2', id: 'tuy-chon', text: 'Tùy chọn' },
        {
          type: 'options',
          items: [
            [
              'Làm mềm biên',
              '0–100 px: mép vùng chọn mờ dần — khi tô, xóa hoặc cắt sẽ có viền mềm. (Chữ nhật, elip, Lasso.)',
            ],
            ['Khử răng cưa', 'Mép cong mịn (Elip, Lasso).'],
            ['Dung sai', 'Đũa thần: 0–100% (mặc định 15%), cao hơn = chọn lan sang màu gần giống.'],
            ['Liền kề', 'Đũa thần: chỉ chọn vùng liền với chỗ bấm; tắt để chọn mọi chỗ cùng màu.'],
            [
              'Lấy mẫu mọi layer',
              'Đũa thần: xét màu trên ảnh ghép thay vì layer đang chọn (tự động khi đang ở layer chú thích).',
            ],
          ],
        },
        {
          type: 'figure',
          shot: 'wand-selection',
          caption: 'Đũa thần chọn bầu trời với dung sai 30%.',
        },
        { type: 'h2', id: 'lenh', text: 'Lệnh vùng chọn' },
        {
          type: 'keys',
          rows: [
            ['[[Mod+A]]', 'Chọn tất cả.'],
            ['[[Mod+D]] hoặc [[Escape]]', 'Bỏ chọn.'],
            ['{ui:Ảnh} → {ui:Đảo vùng chọn}', 'Chọn phần còn lại (không có phím tắt).'],
            ['[[Delete]]', 'Xóa pixel trong vùng chọn trên layer đang chọn.'],
            ['{ui:Ảnh} → {ui:Tô vùng chọn bằng màu chính}', 'Đổ màu chính vào vùng chọn.'],
          ],
        },
        {
          type: 'callout',
          tone: 'note',
          text: 'Trên thanh trạng thái, mục "Vùng chọn rộng × cao" cho biết kích thước hình bao của vùng chọn.',
        },
      ],
    },
    {
      id: 'thao-tac-vung-chon',
      title: 'Di chuyển, biến đổi, copy và dán',
      summary:
        'Kéo phần đã chọn, nhân bản bằng Alt, co giãn và xoay tự do, copy/cắt/dán, mini toolbar.',
      icon: 'scale',
      level: 'advanced',
      keywords: [
        'di chuyển',
        'move',
        'transform',
        'biến đổi',
        'co giãn',
        'xoay',
        'copy',
        'paste',
        'dán',
        'cắt',
        'cut',
        'nhân bản',
        'pixel nổi',
      ],
      related: ['vung-chon', 'menu-ngu-canh', 'qt-ghep-anh'],
      blocks: [
        { type: 'h2', id: 'di-chuyen', text: 'Di chuyển phần đã chọn' },
        {
          type: 'list',
          items: [
            'Với công cụ chọn khung hoặc Lasso (chế độ Mới): **kéo bên trong vùng chọn** để nhấc pixel lên và di chuyển.',
            'Giữ [[Alt]] khi bắt đầu kéo bên trong vùng chọn: **nhân bản** phần đó, bản gốc giữ nguyên.',
            'Với {tool:select}: kéo bên trong vùng chọn cũng di chuyển pixel.',
            'Phím mũi tên dịch vùng chọn 1 px ([[Shift]]: 10 px).',
          ],
        },
        {
          type: 'p',
          text: 'Khi đã nhấc lên, phần ảnh đó ở trạng thái **đang di chuyển** (thanh trạng thái ghi "Đang di chuyển vùng chọn"): có khung với 8 ô vuông và một chấm xoay. Thanh tùy chọn hiện nút {ui:Áp dụng} và {ui:Hủy di chuyển}.',
        },
        {
          type: 'figure',
          shot: 'floating-transform',
          markers: [
            { target: 'commit', label: '{ui:Áp dụng} ([[Enter]])' },
            { target: 'cancel', label: '{ui:Hủy di chuyển} ([[Escape]])' },
            { target: 'mini', label: 'Mini toolbar: Áp dụng / Hủy' },
          ],
        },
        { type: 'h2', id: 'bien-doi', text: 'Co giãn và xoay tự do' },
        {
          type: 'keys',
          rows: [
            [
              '[[Shift+T]] hoặc {ui:Co giãn, xoay vùng chọn}',
              'Nhấc vùng chọn để biến đổi (chưa có vùng chọn thì chọn cả layer).',
            ],
            ['Kéo ô vuông', 'Co giãn. [[Shift]] ở góc: giữ tỉ lệ.'],
            ['Kéo chấm phía trên', 'Xoay. [[Shift]]: bắt góc 15°.'],
            ['Kéo bên trong', 'Di chuyển. [[Shift]]: chỉ ngang hoặc dọc.'],
            ['[[Enter]] / bấm ra ngoài', 'Áp dụng — cả quá trình là một bước hoàn tác.'],
            ['[[Escape]]', 'Hủy, pixel trở lại chỗ cũ.'],
          ],
        },
        {
          type: 'callout',
          tone: 'note',
          text: 'Khung biến đổi chỉ hiện khi đang dùng {tool:select} hoặc một công cụ chọn. Chuyển sang công cụ khác (ví dụ Cọ) sẽ **tự áp dụng** phần đang di chuyển.',
        },
        {
          type: 'p',
          text: 'Xoay 90° và lật vùng chọn có trong {ui:Ảnh} → {ui:Xoay, lật vùng chọn} và menu chuột phải.',
        },
        { type: 'h2', id: 'copy-dan', text: 'Copy, cắt và dán' },
        {
          type: 'keys',
          rows: [
            [
              '[[Mod+C]]',
              'Có vùng chọn: copy pixel vùng chọn của layer đang chọn. Không có vùng chọn: copy cả ảnh (kèm khung Làm đẹp nếu bật).',
            ],
            [
              '{ui:Copy ảnh đang thấy trong vùng chọn}',
              'Copy phần ảnh ghép mọi layer trong vùng chọn (menu chuột phải).',
            ],
            ['[[Mod+X]]', 'Cắt: copy rồi xóa vùng chọn.'],
            [
              '[[Mod+V]]',
              'Dán thành phần ảnh **đang di chuyển**; áp dụng xong thành **layer mới**.',
            ],
          ],
        },
        {
          type: 'list',
          items: [
            'Dán ngay sau khi copy trong Paint Online: ảnh dán về **đúng vị trí cũ**. Dán ảnh từ ứng dụng khác: ảnh đặt giữa khung nhìn.',
            'Ảnh dán lớn hơn giới hạn thiết bị sẽ tự thu nhỏ (có thông báo).',
            'Thả file ảnh vào khung vẽ cũng thêm thành layer mới — xem [Ghép nhiều ảnh](qt-ghep-anh).',
          ],
        },
        { type: 'h2', id: 'mini-toolbar', text: 'Mini toolbar' },
        {
          type: 'p',
          text: 'Khi có vùng chọn và đang ở công cụ chọn, một thanh nhỏ hiện ngay cạnh vùng chọn: **Copy**, **Cắt xén theo vùng chọn**, **Tô vùng chọn bằng màu chính**, **Che thông tin trong vùng chọn**, **Xóa vùng chọn**. Khi đang di chuyển pixel: **Áp dụng** và **Hủy di chuyển**. Thanh tự ẩn khi bạn đang kéo chuột.',
        },
        {
          type: 'figure',
          shot: 'selection-menu',
          size: 'small',
          caption: 'Menu chuột phải bên trong vùng chọn.',
        },
      ],
    },
    {
      id: 'cat-xen-bien-doi',
      title: 'Cắt xén, đổi kích thước, xoay và lật',
      summary:
        'Cắt bớt ảnh, bỏ viền trong suốt, đổi kích thước ảnh hoặc khung, xoay 90°/180°, lật ảnh, layer hay vùng chọn.',
      icon: 'crop',
      level: 'basic',
      keywords: [
        'crop',
        'cắt xén',
        'trim',
        'resize',
        'đổi kích thước',
        'canvas size',
        'kích thước khung',
        'xoay',
        'rotate',
        'lật',
        'flip',
      ],
      related: ['qt-chinh-anh', 'vung-chon', 'layer'],
      blocks: [
        { type: 'h2', id: 'cat-xen', text: 'Cắt xén' },
        {
          type: 'steps',
          items: [
            'Nhấn [[C]] hoặc chọn {tool:crop}. Khung cắt ban đầu là cả ảnh, hoặc hình bao vùng chọn nếu đang có vùng chọn.',
            'Kéo một khung mới, hoặc kéo 8 ô vuông ở cạnh và góc. [[Shift]] khi kéo góc: giữ tỉ lệ. Kéo bên trong khung (khi khung nhỏ hơn ảnh) để dời khung.',
            'Nhấn [[Enter]] hoặc **bấm đúp bên trong khung** để cắt. [[Escape]] đặt lại khung về cả ảnh.',
          ],
        },
        {
          type: 'figure',
          shot: 'crop-tool',
          caption: 'Phần ngoài khung tối đi; khung có đường chia 1/3 và nhãn kích thước.',
        },
        {
          type: 'list',
          items: [
            'Cắt xén áp dụng cho **mọi layer**; đối tượng chú thích giữ nguyên và vẫn sửa được.',
            'Khung không vượt ra ngoài ảnh (muốn mở rộng ảnh, dùng **Kích thước khung**).',
            'Nhanh hơn: tạo vùng chọn rồi bấm {icon:crop} **Cắt xén theo vùng chọn** trên mini toolbar hoặc menu {ui:Ảnh}.',
            '{ui:Ảnh} → {ui:Cắt bỏ vùng trong suốt} (Trim): tự cắt hết phần trong suốt quanh nội dung.',
          ],
        },
        { type: 'h2', id: 'doi-kich-thuoc', text: 'Đổi kích thước ảnh' },
        {
          type: 'p',
          text: '{ui:Ảnh} → {ui:Đổi kích thước ảnh…} co giãn mọi layer. Chữ và hình chú thích co giãn theo và vẫn sửa được.',
        },
        {
          type: 'figure',
          shot: 'resize-dialog',
          size: 'small',
          markers: [
            { target: 'ratio', label: 'Giữ tỉ lệ (ổ khóa)' },
            { target: 'result', label: 'Kích thước ảnh mới' },
          ],
        },
        {
          type: 'options',
          items: [
            ['Đơn vị', '**px** hoặc **%**.'],
            ['Giữ tỉ lệ', 'Đổi rộng thì cao tự đổi theo.'],
            [
              'Cách co giãn',
              '**Mượt (ảnh chụp)** cho ảnh thường; **Giữ điểm ảnh (pixel art)** để phóng to mà không bị nhòe.',
            ],
          ],
        },
        {
          type: 'p',
          text: 'Nếu kích thước vượt giới hạn thiết bị (máy tính thông thường: 8192 px mỗi cạnh), hộp thoại báo đỏ và không cho áp dụng.',
        },
        { type: 'h2', id: 'kich-thuoc-khung', text: 'Kích thước khung' },
        {
          type: 'p',
          text: '{ui:Ảnh} → {ui:Kích thước khung…} thêm hoặc bớt vùng quanh ảnh **mà không co giãn nội dung** — ví dụ thêm lề trắng. Chọn **Neo nội dung** (9 vị trí) để quyết định nội dung nằm ở đâu trong khung mới.',
        },
        {
          type: 'figure',
          shot: 'canvas-size-dialog',
          size: 'small',
          markers: [{ target: 'anchor', label: 'Neo nội dung' }],
        },
        { type: 'h2', id: 'xoay-lat', text: 'Xoay và lật' },
        {
          type: 'table',
          head: ['Áp dụng cho', 'Ở đâu', 'Lệnh'],
          rows: [
            [
              'Cả ảnh',
              'Menu {ui:Ảnh}',
              'Xoay phải 90°, Xoay trái 90°, Xoay 180°, Lật ngang, Lật dọc',
            ],
            [
              'Layer đang chọn',
              '{ui:Ảnh} → {ui:Xoay, lật layer hiện tại}',
              'Như trên, chỉ cho một layer',
            ],
            [
              'Vùng chọn',
              '{ui:Ảnh} → {ui:Xoay, lật vùng chọn}, menu chuột phải',
              'Xoay phải/trái 90°, lật ngang/dọc',
            ],
          ],
        },
        { type: 'figure', shot: 'image-menu', size: 'medium', caption: 'Menu Ảnh.' },
        {
          type: 'callout',
          tone: 'tip',
          text: 'Các lệnh này không có phím tắt mặc định nhưng tìm rất nhanh trong Command Palette: [[Mod+K]] rồi gõ "xoay" hoặc "lat".',
        },
      ],
    },
    {
      id: 'bo-loc',
      title: 'Điều chỉnh màu và bộ lọc',
      summary:
        'Độ sáng/Tương phản, Sắc độ/Độ bão hòa, Đen trắng, Sepia, Đảo màu, Làm mờ, Làm sắc nét, Khảm điểm ảnh.',
      icon: 'sliders',
      level: 'basic',
      keywords: [
        'filter',
        'bộ lọc',
        'điều chỉnh',
        'độ sáng',
        'tương phản',
        'brightness',
        'contrast',
        'hue',
        'saturation',
        'đen trắng',
        'grayscale',
        'sepia',
        'đảo màu',
        'invert',
        'blur',
        'làm mờ',
        'sharpen',
        'sắc nét',
        'pixelate',
        'khảm',
      ],
      related: ['qt-chinh-anh', 'vung-chon', 'layer'],
      blocks: [
        {
          type: 'p',
          text: 'Menu {ui:Điều chỉnh} trên thanh trên cùng (chế độ Paint). Bộ lọc tác động lên **layer ảnh đang chọn**; nếu có vùng chọn thì **chỉ trong vùng chọn**.',
        },
        { type: 'figure', shot: 'adjust-menu', size: 'small' },
        {
          type: 'table',
          head: ['Lệnh', 'Tham số', 'Dùng khi'],
          rows: [
            ['Độ sáng/Tương phản…', 'Độ sáng −100…100%, Tương phản −100…100%', 'Ảnh tối, nhạt'],
            [
              'Sắc độ/Độ bão hòa…',
              'Sắc độ −180…180°, Độ bão hòa −100…100%',
              'Đổi tông màu, làm màu rực hoặc nhạt',
            ],
            ['Đen trắng', '— (áp dụng ngay)', 'Ảnh thang xám'],
            ['Sepia…', 'Cường độ 0…100% (mặc định 100%)', 'Tông màu cổ điển'],
            ['Đảo màu', '— (áp dụng ngay)', 'Âm bản'],
            ['Làm mờ…', 'Bán kính 0…100 px (mặc định 4)', 'Làm nhòe nền, giảm chi tiết'],
            ['Làm sắc nét…', 'Mức độ 0…500% (mặc định 100%), Bán kính 0,5…20 px', 'Ảnh hơi nhòe'],
            ['Khảm điểm ảnh…', 'Cỡ ô 2…200 px (mặc định 12)', 'Hiệu ứng mosaic'],
          ],
        },
        { type: 'h2', id: 'bang-dieu-chinh', text: 'Bảng điều chỉnh' },
        {
          type: 'figure',
          shot: 'adjust-panel',
          markers: [
            { target: 'panel', label: 'Thanh trượt và ô nhập số' },
            { target: 'compare', label: 'Giữ để xem ảnh gốc' },
            { target: 'reset', label: 'Đặt lại' },
            { target: 'cancel', label: 'Hủy' },
            { target: 'apply', label: 'Áp dụng' },
          ],
        },
        {
          type: 'list',
          items: [
            'Kéo thanh trượt hoặc gõ số: ảnh **xem trước ngay**. Bảng nổi không che thao tác — vẫn thu phóng, kéo khung nhìn được.',
            'Giữ **So sánh** (chuột hoặc phím [[Space]]/[[Enter]] khi nút đang được chọn) để xem ảnh gốc.',
            '[[Enter]]: Áp dụng. [[Escape]]: Hủy.',
            'Ảnh lớn có thanh tiến trình và nút **Dừng** khi áp dụng.',
            'Trong lúc bảng đang mở, chỉ thu phóng, kéo khung nhìn và lấy màu hoạt động; hãy Áp dụng hoặc Hủy trước khi làm việc khác.',
          ],
        },
        {
          type: 'callout',
          tone: 'note',
          text: 'Bộ lọc không áp dụng cho layer chú thích. Nếu thấy báo "Bộ lọc chỉ áp dụng cho layer ảnh", hãy chọn layer ảnh trong bảng Layer (hoặc Rasterize layer chú thích trước).',
        },
      ],
    },
  ],
};
