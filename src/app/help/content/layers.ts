import type { Category } from '../types';

export const layersCategory: Category = {
  id: 'layer-lich-su',
  title: 'Layer và lịch sử',
  description: 'Xếp nội dung thành nhiều lớp để sửa độc lập; hoàn tác và quay về bất kỳ bước nào.',
  icon: 'layers',
  topics: [
    {
      id: 'layer',
      title: 'Làm việc với layer',
      summary:
        'Layer ảnh và layer chú thích; thêm, nhân bản, sắp xếp, ẩn, khóa, độ mờ, chế độ hòa trộn, gộp và làm phẳng.',
      icon: 'layers',
      level: 'advanced',
      keywords: [
        'layer',
        'lớp',
        'blend',
        'hòa trộn',
        'opacity',
        'độ mờ',
        'merge',
        'gộp',
        'flatten',
        'làm phẳng',
        'rasterize',
        'khóa',
        'ẩn',
        'alpha lock',
      ],
      related: ['qt-ve-tranh', 'lich-su', 'doi-tuong'],
      blocks: [
        {
          type: 'p',
          text: 'Layer giống những tấm kính trong suốt xếp chồng: vẽ trên tấm này không ảnh hưởng tấm khác. Layer ở **đầu danh sách** nằm **trên cùng** trong ảnh. Bảng Layer nằm ở tab **Layer** bên phải (chế độ Paint).',
        },
        {
          type: 'figure',
          shot: 'layers-panel',
          size: 'small',
          markers: [
            { target: 'drag', label: 'Tay nắm kéo thả để đổi thứ tự' },
            { target: 'visibility', label: 'Ẩn / hiện layer' },
            { target: 'list', label: 'Layer đang chọn (nền xanh)' },
            { target: 'add', label: 'Thêm layer' },
            { target: 'duplicate', label: 'Nhân bản' },
            { target: 'merge', label: 'Gộp xuống layer dưới' },
            { target: 'remove', label: 'Xóa layer' },
            { target: 'more', label: 'Thao tác khác' },
            { target: 'objects', label: 'Đối tượng của layer chú thích' },
            { target: 'opacity', label: 'Độ mờ của layer' },
            { target: 'blend', label: 'Chế độ hòa trộn' },
            { target: 'alpha', label: 'Khóa vùng trong suốt' },
          ],
        },
        { type: 'h2', id: 'hai-loai-layer', text: 'Layer ảnh và layer chú thích' },
        {
          type: 'table',
          head: ['', 'Layer ảnh', 'Layer chú thích'],
          rows: [
            ['Chứa', 'Điểm ảnh (pixel)', 'Đối tượng: hình, mũi tên, chữ, số, vùng che, Spotlight…'],
            [
              'Tạo bởi',
              'Ảnh mở/dán, {icon:plus} Thêm layer, [[Shift+N]]',
              '{ui:Thêm layer chú thích}, hoặc tự tạo khi bạn vẽ chú thích',
            ],
            [
              'Công cụ dùng được',
              'Cọ, Bút chì, Tẩy, Tô màu, Gradient, bộ lọc',
              'Các công cụ hình và chú thích, Chọn',
            ],
            ['Tên mặc định', '"Lớp 1", "Lớp 2"…', '"Chú thích 1", "Chú thích 2"…'],
          ],
        },
        {
          type: 'p',
          text: 'Khi bạn dùng công cụ vẽ pixel trên **layer chú thích**, Paint Online hỏi bạn muốn làm gì (nét vừa vẽ chưa được vẽ — chọn xong hãy vẽ lại):',
        },
        { type: 'figure', shot: 'paint-target-dialog', size: 'small' },
        {
          type: 'options',
          items: [
            [
              'Vẽ trên layer mới',
              'Tạo layer ảnh mới ngay trên layer chú thích. Chú thích giữ nguyên, vẫn sửa được. (Cọ, Bút chì, Gradient.)',
            ],
            [
              'Dùng layer ảnh bên dưới',
              'Chuyển sang layer ảnh nằm dưới (nếu có, đang hiện và không khóa). (Tẩy, Tô màu.)',
            ],
            [
              'Rasterize layer chú thích',
              'Biến chú thích thành pixel — không sửa được như đối tượng nữa.',
            ],
            [
              'Nhớ lựa chọn này',
              'Lần sau tự làm theo, không hỏi lại (được lưu trong trình duyệt).',
            ],
          ],
        },
        { type: 'h2', id: 'thao-tac', text: 'Thêm, nhân bản, xóa, đổi tên' },
        {
          type: 'keys',
          rows: [
            ['{icon:plus} hoặc [[Shift+N]]', 'Thêm layer ảnh trống ngay trên layer đang chọn.'],
            ['{icon:more} → {ui:Thêm layer chú thích}', 'Thêm layer chú thích.'],
            [
              '{icon:duplicate} hoặc [[Mod+J]] / [[Shift+J]]',
              'Nhân bản layer đang chọn (tên thêm "(bản sao)").',
            ],
            ['{icon:trash}', 'Xóa layer đang chọn. Không xóa được layer cuối cùng.'],
            [
              'Bấm đúp vào tên',
              'Đổi tên tại chỗ: [[Enter]] lưu, [[Escape]] hủy. Hoặc {icon:more} → {ui:Đổi tên layer}.',
            ],
          ],
        },
        {
          type: 'figure',
          shot: 'layers-more-menu',
          size: 'small',
          caption: 'Menu {icon:more} Thao tác khác.',
        },
        { type: 'h2', id: 'thu-tu', text: 'Đổi thứ tự' },
        {
          type: 'list',
          items: [
            'Kéo tay nắm ⠿ ở đầu dòng lên/xuống.',
            'Bàn phím: chọn tay nắm bằng [[Tab]], nhấn [[Space]] để nhấc, mũi tên lên/xuống để di chuyển, [[Space]] hoặc [[Enter]] để thả, [[Escape]] để hủy.',
            'Hoặc {icon:more} → {ui:Đưa layer lên trên} / {ui:Đưa layer xuống dưới}.',
          ],
        },
        { type: 'h2', id: 'an-khoa', text: 'Ẩn, khóa và khóa vùng trong suốt' },
        {
          type: 'options',
          items: [
            [
              '{icon:eye} Ẩn/hiện',
              'Layer ẩn không hiện trong ảnh, không vẽ lên được và bị bỏ khi làm phẳng.',
            ],
            [
              '{icon:lock} Khóa',
              'Chặn mọi thay đổi nội dung, độ mờ, hòa trộn. Vẫn đổi tên, ẩn/hiện và mở khóa được. Layer chưa khóa thì icon khóa chỉ hiện khi rê chuột lên dòng layer.',
            ],
            [
              'Khóa vùng trong suốt',
              'Nút cạnh **Hòa trộn**: chỉ vẽ lên chỗ đã có pixel — tô lại màu một hình mà không lem ra ngoài. Với Tẩy, layer này được tô màu phụ thay vì xóa.',
            ],
          ],
        },
        { type: 'h2', id: 'do-mo-hoa-tron', text: 'Độ mờ và chế độ hòa trộn' },
        {
          type: 'p',
          text: 'Phía dưới bảng: **Độ mờ** 0–100% của layer đang chọn và **Hòa trộn** — cách màu của layer kết hợp với các layer bên dưới. Có 16 chế độ, chia nhóm như các phần mềm đồ họa phổ biến:',
        },
        {
          type: 'table',
          head: ['Nhóm', 'Chế độ', 'Tác dụng'],
          rows: [
            ['Thường', 'Bình thường', 'Che lên bên dưới'],
            [
              'Tối',
              'Tối hơn, Nhân (Multiply), Color Burn',
              'Làm tối; Multiply hợp để đổ bóng, tô màu lên nét chì',
            ],
            [
              'Sáng',
              'Sáng hơn, Sáng lên (Screen), Color Dodge',
              'Làm sáng; Screen hợp cho ánh sáng, quầng sáng',
            ],
            ['Tương phản', 'Phủ (Overlay), Soft Light, Hard Light', 'Tăng tương phản, phủ màu'],
            [
              'So sánh',
              'Hiệu (Difference), Loại trừ (Exclusion)',
              'Hiệu ứng đảo màu, so sánh hai ảnh',
            ],
            [
              'Màu',
              'Sắc màu (Hue), Độ bão hòa, Màu (Color), Độ sáng (Luminosity)',
              'Đổi riêng sắc màu hoặc độ sáng',
            ],
          ],
        },
        { type: 'figure', shot: 'blend-menu', size: 'small' },
        { type: 'h2', id: 'gop', text: 'Gộp, làm phẳng, rasterize' },
        {
          type: 'options',
          items: [
            [
              'Gộp xuống layer dưới',
              '[[Mod+E]] / [[Shift+E]] hoặc nút {icon:merge-down}. Vẽ layer đang chọn vào layer ngay dưới, giữ đúng độ mờ và hòa trộn. Hai layer chú thích bình thường gộp thì đối tượng vẫn sửa được. Cả hai layer phải đang hiện và không khóa.',
            ],
            [
              'Gộp các layer đang hiện',
              'Mọi layer đang hiện thành một layer ảnh; layer ẩn giữ nguyên.',
            ],
            [
              'Làm phẳng ảnh (Flatten)',
              'Gộp tất cả thành một layer nền. **Layer đang ẩn bị bỏ** (hoàn tác được).',
            ],
            ['Rasterize layer chú thích', 'Biến đối tượng thành pixel để vẽ, tẩy, áp bộ lọc lên.'],
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Nhiều layer tốn bộ nhớ',
          text: 'Mỗi layer ảnh chiếm bộ nhớ bằng cả bức ảnh. Khi thanh trạng thái hiện **Bộ nhớ** màu cam (trên 70%) hoặc có cảnh báo, hãy gộp bớt layer. Layer mới tạo chưa vẽ gì thì gần như chưa tốn bộ nhớ.',
        },
      ],
    },
    {
      id: 'lich-su',
      title: 'Hoàn tác và Lịch sử',
      summary: 'Hoàn tác, làm lại và nhảy thẳng về bất kỳ bước nào trong bảng Lịch sử.',
      icon: 'history',
      level: 'basic',
      keywords: ['undo', 'redo', 'hoàn tác', 'làm lại', 'lịch sử', 'history', 'quay lại'],
      related: ['layer', 'cai-dat', 'luu-tu-dong'],
      blocks: [
        {
          type: 'keys',
          rows: [
            ['[[Mod+Z]] hoặc {icon:undo}', 'Hoàn tác bước gần nhất (giữ phím để lùi liên tục).'],
            ['[[Mod+Shift+Z]] / [[Mod+Y]] hoặc {icon:redo}', 'Làm lại.'],
          ],
        },
        {
          type: 'p',
          text: 'Rê chuột lên nút hoàn tác để xem tên bước sẽ bị hoàn tác, ví dụ "Hoàn tác: Nét cọ".',
        },
        { type: 'h2', id: 'bang-lich-su', text: 'Bảng Lịch sử' },
        { type: 'figure', shot: 'history-panel', size: 'small' },
        {
          type: 'list',
          items: [
            'Tab **Lịch sử** ở bảng bên phải liệt kê các bước từ cũ (trên) tới mới (dưới), kèm giờ.',
            '**Bấm vào một bước** để quay về ngay sau bước đó; bấm **Trạng thái lúc mở** để về như khi vừa mở project.',
            'Các bước đã hoàn tác hiện mờ — bấm vào để làm lại. Làm thao tác mới thì các bước mờ bị bỏ.',
            'Kéo liên tục một thanh trượt, dịch nhiều lần bằng phím mũi tên… được gộp thành một bước.',
          ],
        },
        {
          type: 'callout',
          tone: 'warning',
          text: [
            'Lịch sử **chỉ giữ trong phiên làm việc** — đóng project (về trang chủ, tải lại trang) là mất lịch sử, dù ảnh vẫn được lưu.',
            'Lịch sử giữ tối đa 100 bước và giới hạn theo bộ nhớ. Với ảnh lớn, bước cũ có thể được giải phóng sớm (bảng ghi "Các bước cũ hơn đã được giải phóng…"). Tăng **Bộ nhớ cho lịch sử hoàn tác** trong [Cài đặt](cai-dat) nếu cần hoàn tác xa hơn.',
          ],
        },
      ],
    },
  ],
};
