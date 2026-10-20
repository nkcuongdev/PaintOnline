import type { Category } from '../types';

export const annotateCategory: Category = {
  id: 'chu-thich',
  title: 'Chú thích ảnh chụp',
  description:
    'Đánh dấu, đánh số, che thông tin, làm nổi bật, sửa đối tượng chú thích và làm đẹp ảnh trước khi chia sẻ.',
  icon: 'camera',
  topics: [
    {
      id: 'danh-dau',
      title: 'Bút dạ quang và Số thứ tự',
      summary: 'Tô vệt dạ quang lên chữ quan trọng và đặt các vòng số 1, 2, 3 tự đánh số.',
      icon: 'tool-highlight',
      level: 'basic',
      keywords: ['highlight', 'dạ quang', 'đánh dấu', 'số thứ tự', 'step', 'đánh số', 'badge'],
      related: ['che-thong-tin', 'lam-noi-bat', 'doi-tuong'],
      blocks: [
        {
          type: 'figure',
          shot: 'highlight-steps',
          size: 'medium',
          caption: 'Vệt dạ quang vàng và ba số thứ tự.',
        },
        { type: 'h2', id: 'but-da-quang', text: 'Bút dạ quang' },
        {
          type: 'list',
          items: [
            'Nhấn [[H]] hoặc chọn {tool:highlight}, kéo một hình chữ nhật trùm lên chữ. [[Shift]]: hình vuông.',
            'Chọn một trong 5 màu ở thanh tùy chọn: **Vàng** (mặc định), **Xanh lá**, **Xanh dương**, **Hồng**, **Cam**. Bút dạ quang không dùng màu chính.',
            'Màu được hòa kiểu "nhân" (multiply) nên chữ đen bên dưới vẫn rõ như bút dạ thật.',
            'Vệt dạ quang co giãn và xoay được như hình chữ nhật.',
          ],
        },
        { type: 'h2', id: 'so-thu-tu', text: 'Số thứ tự' },
        {
          type: 'list',
          items: [
            'Nhấn [[N]] hoặc chọn {tool:step}, **bấm** vào chỗ cần đặt số. Giữ chuột và kéo trước khi thả để dời vị trí.',
            'Số tự tăng **theo từng layer chú thích**: 1, 2, 3… Xóa một số hoặc đổi thứ tự trên/dưới thì các số tự đánh lại.',
            'Màu vòng tròn là **màu chính**, có viền trắng; số tự đen hoặc trắng cho dễ đọc.',
            '**Cỡ**: bán kính 8–80 px (mặc định 18).',
            'Bấm vào một số **chưa chọn** sẽ đặt thêm số mới; muốn kéo số có sẵn, chọn nó trước (hoặc dùng {tool:select}).',
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          text: 'Muốn hai dãy số riêng (ví dụ 1–3 cho phần trên, 1–2 cho phần dưới)? Thêm một layer chú thích mới (bảng Layer → {icon:more} → {ui:Thêm layer chú thích}) — mỗi layer đánh số riêng.',
        },
      ],
    },
    {
      id: 'che-thong-tin',
      title: 'Che thông tin',
      summary:
        'Che email, số điện thoại, số tài khoản bằng Tô kín, Khảm hoặc Làm mờ — ảnh xuất ra không còn pixel gốc.',
      icon: 'eye-off',
      level: 'basic',
      keywords: [
        'redact',
        'che',
        'giấu',
        'bảo mật',
        'khảm',
        'pixelate',
        'làm mờ',
        'blur',
        'tô kín',
        'mosaic',
      ],
      related: ['qt-che-thong-tin-nhay-cam', 'xuat-anh', 'sao-luu-file-paint'],
      blocks: [
        {
          type: 'p',
          text: 'Nhấn [[K]] hoặc chọn {tool:redact}, rồi kéo hình chữ nhật phủ lên thông tin cần giấu. [[Shift]] khi kéo: hình vuông.',
        },
        {
          type: 'figure',
          shot: 'redact-modes',
          size: 'medium',
          caption: 'Khảm (email), Tô kín (số tài khoản), Làm mờ (địa chỉ).',
        },
        { type: 'h2', id: 'kieu-che', text: 'Ba kiểu che' },
        {
          type: 'options',
          items: [
            ['Tô kín', 'Khối đen đặc. **An toàn nhất** — dùng cho mật khẩu, số thẻ, số tài khoản.'],
            [
              'Khảm',
              'Ô vuông kiểu mosaic. **Cỡ ô** 12–64 px (mặc định 16): ô càng to càng khó đoán.',
            ],
            [
              'Làm mờ',
              'Nhòe nội dung. **Độ mờ** 4–40 (mặc định 12). Thanh tùy chọn hiện cảnh báo **Có thể bị khôi phục**: làm mờ nhẹ có thể bị khôi phục một phần — rê chuột vào để xem đầy đủ.',
            ],
          ],
        },
        {
          type: 'figure',
          shot: 'redact-options',
          caption: 'Chọn Làm mờ sẽ hiện cảnh báo màu cam.',
        },
        { type: 'h2', id: 'an-toan', text: 'Vùng che có an toàn không?' },
        {
          type: 'list',
          items: [
            '**Ảnh xuất ra** (Copy, Tải xuống, Xuất PNG/JPG/WebP): pixel gốc dưới vùng che bị thay hẳn. Mép vùng che được làm tròn ra ngoài theo điểm ảnh nên không sót viền chữ.',
            '**Trong project**: vùng che là đối tượng sửa được, ảnh gốc vẫn ở bên dưới để bạn chỉnh lại vị trí. Do đó **file `.paint` vẫn chứa ảnh gốc** — khi tải `.paint`, chọn **Áp dụng vĩnh viễn vùng che** nếu sẽ gửi file đó cho người khác.',
            'Vùng che luôn đục hoàn toàn, không xoay được và không dùng độ mờ.',
          ],
        },
        {
          type: 'callout',
          tone: 'important',
          text: 'Xem quy trình đầy đủ ở [Che thông tin nhạy cảm trước khi chia sẻ](qt-che-thong-tin-nhay-cam).',
        },
        { type: 'h2', id: 'tu-vung-chon', text: 'Che từ vùng chọn' },
        {
          type: 'p',
          text: 'Ở chế độ Paint, sau khi tạo vùng chọn (chữ nhật, elip, Lasso, Đũa thần), mini toolbar cạnh vùng chọn có nút {icon:eye-off} **Che thông tin trong vùng chọn**: một vùng che phủ đúng hình chữ nhật bao quanh vùng chọn, theo kiểu che đang đặt.',
        },
      ],
    },
    {
      id: 'lam-noi-bat',
      title: 'Spotlight và Phóng to vùng',
      summary:
        'Làm tối phần còn lại để dồn chú ý vào một vùng; phóng to một chi tiết nhỏ ngay cạnh nó.',
      icon: 'tool-spotlight',
      level: 'basic',
      keywords: [
        'spotlight',
        'làm nổi bật',
        'làm tối',
        'magnifier',
        'phóng to vùng',
        'kính lúp',
        'zoom chi tiết',
      ],
      related: ['qt-anh-huong-dan', 'danh-dau', 'doi-tuong'],
      blocks: [
        { type: 'figure', shot: 'spotlight-magnifier', size: 'medium' },
        {
          type: 'tools',
          items: [
            { tool: 'spotlight', text: 'Kéo quanh vùng cần chú ý; mọi thứ bên ngoài tối đi.' },
            {
              tool: 'magnifier',
              text: 'Kéo quanh chi tiết cần phóng to; bản phóng to hiện bên cạnh.',
            },
          ],
        },
        {
          type: 'p',
          text: 'Hai công cụ không có phím tắt. Ở chế độ Paint chúng nằm chung một nút ▾ trên thanh công cụ; ở chế độ Screenshot mỗi công cụ một nút.',
        },
        { type: 'figure', shot: 'split-focus-menu', size: 'small' },
        { type: 'h2', id: 'spotlight', text: 'Spotlight' },
        {
          type: 'list',
          items: [
            '**Hình**: Chữ nhật hoặc Elip. [[Shift]] khi kéo: vuông/tròn.',
            '**Độ tối**: 20–90% (mặc định 60%).',
            'Nhiều spotlight trong cùng layer chú thích dùng chung một lớp tối, mỗi spotlight là một "lỗ sáng".',
            'Chú thích vẽ **sau** spotlight (và các layer phía trên) không bị làm tối — mũi tên, chữ vẫn nổi bật.',
          ],
        },
        { type: 'h2', id: 'phong-to-vung', text: 'Phóng to vùng' },
        {
          type: 'list',
          items: [
            'Kéo chọn vùng nguồn (ít nhất 4 px). Bản phóng to tự đặt bên phải; hết chỗ thì bên trái, rồi bên dưới.',
            '**Phóng to**: 1,5× – 6× (mặc định 2×). **Hình**: Elip (mặc định) hoặc Chữ nhật.',
            'Viền dùng **màu chính**, có bóng đổ.',
            'Khi đang chọn: kéo **tâm bản phóng to** để dời nó, kéo ô ở mép phải của bản phóng to để đổi mức phóng, kéo các góc vùng nguồn để đổi vùng.',
            'Nội dung phóng to luôn cập nhật theo ảnh bên dưới.',
          ],
        },
      ],
    },
    {
      id: 'doi-tuong',
      title: 'Chọn và sửa đối tượng chú thích',
      summary:
        'Chọn một hay nhiều đối tượng, di chuyển, co giãn, xoay, căn chỉnh, đưa lên trên, xóa.',
      icon: 'pointer',
      level: 'basic',
      keywords: [
        'select',
        'chọn',
        'di chuyển',
        'xoay',
        'co giãn',
        'căn chỉnh',
        'align',
        'xóa',
        'đối tượng',
        'object',
        'handle',
      ],
      related: ['hinh-khoi', 'chu', 'menu-ngu-canh', 'layer'],
      blocks: [
        {
          type: 'p',
          text: 'Mũi tên, khung, chữ, số thứ tự, vùng che… đều là **đối tượng**. Dùng {tool:select} để chỉnh chúng sau khi vẽ.',
        },
        {
          type: 'figure',
          shot: 'object-selected',
          caption: 'Mũi tên đang chọn: thanh tùy chọn hiện thuộc tính của nó, mini toolbar ở cạnh.',
          markers: [
            { target: 'props', label: 'Loại đối tượng đang chọn' },
            { target: 'presets', label: 'Kiểu nhanh áp cho đối tượng' },
            { target: 'delete', label: 'Xóa đối tượng' },
            { target: 'mini', label: 'Mini toolbar: lên trên cùng, xuống dưới cùng, xóa' },
          ],
        },
        { type: 'h2', id: 'chon', text: 'Chọn' },
        {
          type: 'keys',
          rows: [
            ['Bấm', 'Chọn đối tượng trên cùng tại chỗ bấm.'],
            ['[[Shift]] + bấm', 'Thêm vào / bớt khỏi nhóm đang chọn.'],
            [
              'Kéo khung trên chỗ trống',
              'Chọn mọi đối tượng chạm khung. Thêm [[Shift]] để cộng vào nhóm đang chọn.',
            ],
            ['[[Escape]]', 'Bỏ chọn.'],
            [
              'Danh sách **Đối tượng** trong bảng Layer',
              'Bấm tên đối tượng để chọn (tiện khi đối tượng nhỏ hoặc bị che).',
            ],
          ],
        },
        {
          type: 'p',
          text: 'Công cụ Chọn tìm đối tượng trên mọi layer chú thích đang hiện và không khóa; chọn một đối tượng sẽ chuyển layer hoạt động sang layer của nó.',
        },
        { type: 'h2', id: 'chinh-sua', text: 'Di chuyển, co giãn, xoay' },
        {
          type: 'keys',
          rows: [
            ['Kéo thân đối tượng', 'Di chuyển. Giữ [[Shift]]: chỉ theo chiều ngang hoặc dọc.'],
            [
              '[[ArrowLeft]] [[ArrowRight]] [[ArrowUp]] [[ArrowDown]]',
              'Dịch 1 px; thêm [[Shift]]: 10 px.',
            ],
            ['Kéo ô vuông ở góc/cạnh', 'Co giãn. Giữ [[Shift]] ở góc: giữ tỉ lệ.'],
            ['Kéo chấm phía trên khung', 'Xoay. Giữ [[Shift]]: bắt góc 15°.'],
            [
              'Kéo chấm ở hai đầu',
              'Đường thẳng, mũi tên: đổi điểm đầu/cuối. Chấm giữa mũi tên: uốn cong.',
            ],
            ['Bấm đúp vào chữ / [[Enter]]', 'Sửa nội dung chữ.'],
            ['[[Delete]] / [[Backspace]]', 'Xóa đối tượng đang chọn.'],
          ],
        },
        {
          type: 'p',
          text: 'Ô vuông và chấm xoay chỉ hiện khi chọn **một** đối tượng. Không phải đối tượng nào cũng xoay được: vùng che, Spotlight và số thứ tự không xoay; số thứ tự luôn tròn.',
        },
        { type: 'h2', id: 'thuoc-tinh', text: 'Đổi màu và kiểu' },
        {
          type: 'p',
          text: 'Khi đang chọn, thanh tùy chọn hiện thuộc tính của đối tượng (nét, đầu mũi tên, font…). Đổi gì là áp ngay. Chọn màu trong ô màu cũng đổi màu đối tượng đang chọn. Chọn nhiều đối tượng cùng loại thì sửa được cùng lúc.',
        },
        { type: 'h2', id: 'sap-xep', text: 'Thứ tự trên dưới và căn chỉnh' },
        {
          type: 'p',
          text: 'Bấm chuột phải vào đối tượng để mở menu: **Xóa**, **Đưa lên trên cùng**, **Đưa xuống dưới cùng**, **Căn chỉnh** và **Copy ảnh**.',
        },
        {
          type: 'figure',
          shot: 'object-menu',
          size: 'medium',
          caption: 'Menu chuột phải trên đối tượng, mở menu con Căn chỉnh.',
        },
        {
          type: 'list',
          items: [
            'Chọn **một** đối tượng: căn theo khung ảnh (ví dụ Căn giữa ngang đưa nó vào giữa ảnh).',
            'Chọn **nhiều** đối tượng: căn theo hình bao chung của nhóm (ví dụ Căn trên đưa mọi đối tượng thẳng hàng với cái cao nhất).',
            'Thứ tự trên/dưới chỉ đổi **trong cùng layer**. Muốn đặt lên trên đối tượng ở layer khác, đổi thứ tự layer.',
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          text: 'Bật **Bám lưới** (menu {ui:Xem}) để đối tượng di chuyển theo từng ô lưới — dễ căn thẳng hàng.',
        },
      ],
    },
    {
      id: 'lam-dep',
      title: 'Làm đẹp ảnh',
      summary:
        'Thêm nền gradient, khoảng nền, bo góc và bóng đổ quanh ảnh khi Copy, Tải xuống và Xuất.',
      icon: 'sparkles',
      level: 'basic',
      keywords: ['beautify', 'làm đẹp', 'khung', 'nền', 'gradient', 'bo góc', 'bóng đổ', 'padding'],
      related: ['xuat-anh', 'qt-chu-thich-anh-chup', 'hai-che-do'],
      blocks: [
        {
          type: 'p',
          text: 'Ảnh chụp màn hình trông chuyên nghiệp hơn khi có khung nền. Tab **Làm đẹp** ở bảng bên phải (có ở cả hai chế độ) thêm khung này mà không đổi ảnh gốc.',
        },
        {
          type: 'gallery',
          items: [
            {
              type: 'figure',
              shot: 'beautify-off',
              caption: 'Khi đang tắt: đổi bất kỳ mục nào sẽ bật khung.',
            },
            {
              type: 'figure',
              shot: 'beautify-panel',
              caption: 'Khi đã bật.',
              markers: [
                { target: 'toggle', label: 'Bật/tắt khung làm đẹp' },
                { target: 'bg', label: 'Nền: 8 lựa chọn' },
                { target: 'padding', label: 'Khoảng nền 0–400 px' },
                { target: 'radius', label: 'Bo góc ảnh 0–96 px' },
                { target: 'shadow', label: 'Bóng đổ' },
              ],
            },
          ],
        },
        {
          type: 'options',
          items: [
            [
              'Nền',
              'Đại dương, Hoàng hôn, Bạc hà, Đào, Đêm (gradient chéo), Xám nhạt, Trắng, Trong suốt.',
            ],
            ['Khoảng nền', 'Độ rộng phần nền quanh ảnh (mặc định 64 px).'],
            ['Bo góc', 'Bo tròn góc ảnh (mặc định 12 px).'],
            ['Bóng đổ', 'Bóng mềm dưới ảnh (bật sẵn).'],
          ],
        },
        {
          type: 'list',
          items: [
            'Bật khung thì khung nhìn tự **vừa khung** để bạn thấy toàn bộ.',
            'Khi đang tắt, đổi bất kỳ tùy chọn nào cũng sẽ bật khung.',
            'Cài đặt được lưu cùng project và có trong Lịch sử (hoàn tác được).',
          ],
        },
        {
          type: 'figure',
          shot: 'quick-result',
          caption: 'Khung nền Đại dương, khoảng nền 64 px, bo góc 12 px, có bóng.',
        },
        { type: 'h2', id: 'khi-nao-ap-dung', text: 'Khi nào khung được áp dụng?' },
        {
          type: 'table',
          head: ['Thao tác', 'Có khung Làm đẹp?'],
          rows: [
            ['{ui:Copy} / {ui:Copy ảnh} / [[Mod+C]] khi không có vùng chọn', 'Có'],
            ['{ui:Tải xuống} (chế độ Screenshot)', 'Có'],
            ['Hộp thoại Xuất ảnh', 'Có, khi đánh dấu **Gồm khung Làm đẹp** (mặc định bật)'],
            ['Xuất **Chỉ vùng chọn**', 'Không'],
            ['File `.paint`', 'Lưu cài đặt khung, không nướng vào ảnh'],
          ],
        },
      ],
    },
  ],
};
