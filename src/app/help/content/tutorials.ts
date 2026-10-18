import type { Category } from '../types';

export const tutorialsCategory: Category = {
  id: 'thuc-hanh',
  title: 'Thực hành theo ví dụ',
  description:
    'Các quy trình trọn vẹn từ đầu tới cuối: chú thích ảnh chụp, che thông tin, vẽ tranh, chỉnh ảnh.',
  icon: 'route',
  topics: [
    {
      id: 'qt-chu-thich-anh-chup',
      title: 'Chú thích ảnh chụp màn hình',
      summary:
        'Từ ảnh chụp tới ảnh có mũi tên, khung, số thứ tự, chữ và khung nền đẹp — sẵn sàng gửi đồng nghiệp.',
      icon: 'camera',
      level: 'tutorial',
      keywords: ['annotate', 'chú thích', 'screenshot', 'báo lỗi', 'hướng dẫn đồng nghiệp'],
      related: ['che-thong-tin', 'danh-dau', 'lam-dep', 'doi-tuong'],
      blocks: [
        {
          type: 'p',
          text: 'Ví dụ: bạn muốn chỉ cho đồng nghiệp nút cần bấm trên một màn hình phần mềm, đánh số các bước và giấu email khách hàng. Ảnh minh họa dùng một **màn hình mẫu** (không phải dữ liệu thật).',
        },
        {
          type: 'figure',
          shot: 'screenshot-overview',
          caption: 'Kết quả sau khi làm xong các bước dưới.',
        },
        { type: 'h2', id: 'chuan-bi', text: '1. Dán ảnh' },
        {
          type: 'p',
          text: 'Chụp màn hình rồi nhấn [[Mod+V]] ở trang chủ. Ảnh mở ở chế độ Screenshot với {tool:arrow} được chọn sẵn.',
        },
        { type: 'h2', id: 'mui-ten', text: '2. Mũi tên chỉ vào nút' },
        {
          type: 'steps',
          items: [
            'Trong {ui:Kiểu nhanh} trên thanh tùy chọn, chọn **Mũi tên đỏ nổi bật** (ô đầu tiên).',
            'Kéo từ chỗ trống tới sát nút cần chỉ. Giữ [[Shift]] khi kéo để mũi tên thẳng theo các góc 15°.',
            'Mũi tên vừa vẽ vẫn đang được chọn: kéo các chấm tròn ở hai đầu để chỉnh, kéo chấm giữa để uốn cong.',
          ],
        },
        { type: 'figure', shot: 'arrow-presets', caption: 'Kiểu nhanh và tùy chọn của Mũi tên.' },
        { type: 'h2', id: 'khung', text: '3. Khung quanh vùng quan trọng' },
        {
          type: 'p',
          text: 'Nhấn [[Escape]] để bỏ chọn mũi tên, rồi chọn {tool:rect}, bấm kiểu **Khung đỏ** và kéo một khung quanh vùng cần chú ý.',
        },
        {
          type: 'callout',
          tone: 'warning',
          title: 'Nhớ bỏ chọn trước khi đổi màu',
          text: 'Đối tượng vừa vẽ vẫn được chọn. Lúc đó, chọn màu mới sẽ đổi **luôn đối tượng đang chọn** — kể cả khi bạn đã đổi sang công cụ khác. {ui:Kiểu nhanh} chỉ đổi đối tượng cùng loại, nên bấm **Khung đỏ** không làm đổi mũi tên. Nhấn [[Escape]] trước khi đổi màu cho đối tượng tiếp theo.',
        },
        { type: 'h2', id: 'che', text: '4. Che thông tin cá nhân' },
        {
          type: 'p',
          text: 'Nhấn [[K]] để chọn {tool:redact}, chọn **Kiểu che** rồi kéo phủ lên email, số tài khoản… Với thông tin thật sự nhạy cảm, dùng **Tô kín**. Xem kỹ ở [Che thông tin](che-thong-tin).',
        },
        {
          type: 'figure',
          shot: 'redact-modes',
          size: 'medium',
          caption: 'Từ trên xuống: Khảm, khung đỏ (không che), Tô kín, Làm mờ.',
        },
        { type: 'h2', id: 'so-thu-tu', text: '5. Đánh số các bước' },
        {
          type: 'p',
          text: 'Nhấn [[N]] ({tool:step}) và bấm lần lượt vào các vị trí: số tự tăng 1, 2, 3… Xóa một số thì các số sau tự đánh lại. Màu của vòng tròn là màu chính đang chọn.',
        },
        {
          type: 'figure',
          shot: 'highlight-steps',
          size: 'medium',
          caption: 'Số thứ tự và Bút dạ quang (vệt vàng trên “Tổng chi tiêu năm nay”).',
        },
        { type: 'h2', id: 'chu', text: '6. Thêm chữ giải thích' },
        {
          type: 'steps',
          items: [
            'Nhấn [[T]], chọn kiểu nhanh **Nhãn nền đỏ**.',
            'Bấm vào ảnh và gõ (bộ gõ tiếng Việt dùng bình thường). [[Enter]] để xuống dòng.',
            'Nhấn [[Mod+Enter]] hoặc [[Escape]] để xong. Muốn sửa lại, chọn {tool:select} rồi bấm đúp vào chữ.',
          ],
        },
        { type: 'h2', id: 'lam-dep-va-gui', text: '7. Làm đẹp và gửi đi' },
        {
          type: 'steps',
          items: [
            'Ở bảng bên phải, tab **Làm đẹp**, bật **Khung làm đẹp** và chọn một nền.',
            'Bấm {ui:Copy} rồi dán vào ứng dụng chat/email; hoặc {ui:Tải xuống} để lưu file PNG.',
          ],
        },
        {
          type: 'figure',
          shot: 'quick-result',
          caption: 'Khung Làm đẹp được áp dụng khi Copy, Tải xuống và Xuất ảnh.',
        },
        {
          type: 'callout',
          tone: 'tip',
          text: 'Mọi chú thích vẫn là **đối tượng sửa được** cho tới khi bạn xuất ảnh. Có thể quay lại project bất cứ lúc nào từ trang chủ để sửa tiếp.',
        },
      ],
    },
    {
      id: 'qt-che-thong-tin-nhay-cam',
      title: 'Che thông tin nhạy cảm trước khi chia sẻ',
      summary:
        'Quy trình an toàn để giấu email, số điện thoại, số tài khoản và chắc chắn người nhận không khôi phục được.',
      icon: 'eye-off',
      level: 'tutorial',
      keywords: ['bảo mật', 'redact', 'giấu', 'che', 'riêng tư', 'mật khẩu', 'số tài khoản'],
      related: ['che-thong-tin', 'xuat-anh', 'sao-luu-file-paint'],
      blocks: [
        {
          type: 'p',
          text: 'Khi gửi ảnh chụp ra ngoài, điều quan trọng là thông tin đã che **không thể khôi phục**. Paint Online thiết kế công cụ Che thông tin cho đúng việc này, nhưng có vài điểm bạn cần biết.',
        },
        {
          type: 'steps',
          items: [
            {
              title: 'Chọn công cụ Che thông tin',
              text: 'Nhấn [[K]] hoặc chọn {tool:redact}. Trên thanh tùy chọn, để **Kiểu che** là **Tô kín** (mặc định).',
              figure: {
                type: 'figure',
                shot: 'redact-options',
                caption: 'Ba kiểu che; chọn Làm mờ sẽ có cảnh báo.',
              },
            },
            {
              title: 'Kéo phủ vùng cần che',
              text: 'Kéo một hình chữ nhật trùm kín chữ. Nên kéo rộng hơn chữ một chút. Có thể kéo các cạnh của vùng che để chỉnh sau.',
            },
            {
              title: 'Kiểm tra lại toàn ảnh',
              text: 'Nhấn [[Shift+1]] để xem vừa khung, soát xem còn sót thông tin nào (tên file, thanh địa chỉ, avatar…).',
            },
            {
              title: 'Chia sẻ bằng Copy hoặc Xuất ảnh',
              text: 'Ảnh PNG/JPG/WebP xuất ra đã **thay hẳn pixel gốc** dưới vùng che và không kèm metadata (EXIF, GPS).',
            },
          ],
        },
        {
          type: 'callout',
          tone: 'important',
          title: 'File .paint vẫn chứa ảnh gốc',
          text: [
            'Trong project, vùng che là một đối tượng sửa được — ảnh gốc bên dưới vẫn còn để bạn chỉnh lại. Vì vậy **file `.paint` vẫn chứa nội dung bị che**.',
            'Khi tải bản sao lưu `.paint` của project có vùng che, Paint Online sẽ hỏi. Nếu định gửi file `.paint` cho người khác, chọn **Áp dụng vĩnh viễn vùng che trước khi xuất**.',
          ],
        },
        {
          type: 'figure',
          shot: 'paint-export-dialog',
          size: 'medium',
          caption: 'Hộp thoại xuất `.paint` khi project có vùng che.',
        },
        {
          type: 'callout',
          tone: 'warning',
          text: 'Kiểu **Làm mờ** nhẹ có thể bị khôi phục một phần bằng phần mềm chuyên dụng. Với mật khẩu, số thẻ, số tài khoản: dùng **Tô kín**.',
        },
        { type: 'h2', id: 'nhanh-hon', text: 'Cách nhanh hơn: che từ vùng chọn' },
        {
          type: 'p',
          text: 'Ở chế độ Paint, tạo vùng chọn (ví dụ {tool:marquee-rect}) quanh thông tin, rồi bấm nút {icon:eye-off} **Che thông tin trong vùng chọn** trên mini toolbar cạnh vùng chọn. Một vùng che (theo kiểu đang đặt cho công cụ Che thông tin) phủ đúng hình bao vùng chọn.',
        },
      ],
    },
    {
      id: 'qt-ve-tranh',
      title: 'Vẽ tranh nhiều layer',
      summary:
        'Vẽ một bức phong cảnh đơn giản: bầu trời Gradient, mặt trời bằng cọ mềm, đồi bằng Lasso, chim bằng cọ thư pháp, tiêu đề chữ.',
      icon: 'brush',
      level: 'tutorial',
      keywords: ['vẽ', 'tranh', 'phong cảnh', 'gradient', 'lasso', 'brush'],
      related: ['co-ve', 'layer', 'to-mau-gradient', 'vung-chon'],
      blocks: [
        { type: 'figure', shot: 'paint-overview', caption: 'Bức tranh hoàn thành với 4 layer.' },
        {
          type: 'p',
          text: 'Bài này dùng nhiều công cụ của chế độ Paint. Mỗi phần vẽ trên một **layer** riêng để sửa từng phần mà không ảnh hưởng phần khác.',
        },
        { type: 'h2', id: 'tao-anh', text: '1. Tạo ảnh mới' },
        {
          type: 'p',
          text: 'Ở trang chủ chọn {ui:Tùy chỉnh…}, nhập 1600 × 1000 và bấm {ui:Tạo}. Ảnh mới có một layer nền trắng tên "Lớp 1".',
        },
        { type: 'h2', id: 'bau-troi', text: '2. Bầu trời bằng Gradient' },
        {
          type: 'steps',
          items: [
            'Bấm ô màu trên thanh công cụ, đặt **màu chính** xanh trời và **màu phụ** vàng nhạt.',
            'Nhấn [[G]] hai lần để chọn {tool:gradient} (lần đầu chọn Tô màu, lần sau đổi sang Gradient).',
            'Kéo từ mép trên xuống gần đáy ảnh. Giữ [[Shift]] để kéo thẳng đứng.',
          ],
        },
        { type: 'h2', id: 'mat-troi', text: '3. Mặt trời bằng cọ mềm' },
        {
          type: 'steps',
          items: [
            'Nhấn [[Shift+N]] tạo layer mới (layer trống, nằm trên layer đang chọn).',
            'Nhấn [[B]] chọn {tool:brush}, đặt **Kiểu** là **Mềm** và **Cỡ** khoảng 230 px, màu vàng. Bấm một lần để có quầng sáng.',
            'Đổi **Kiểu** sang **Tròn**, cỡ 120 px và bấm đúng chỗ đó lần nữa để có lõi mặt trời.',
          ],
        },
        { type: 'h2', id: 'doi', text: '4. Ngọn đồi bằng Lasso và Tô vùng chọn' },
        {
          type: 'steps',
          items: [
            'Tạo thêm một layer ([[Shift+N]]).',
            'Nhấn [[L]] chọn {tool:lasso}, giữ chuột vẽ đường bao ngọn đồi rồi thả — vùng chọn tự khép kín.',
            'Chọn màu xanh lá, mở menu {ui:Ảnh} → {ui:Tô vùng chọn bằng màu chính}.',
            'Nhấn [[Mod+D]] (hoặc [[Escape]]) bỏ chọn; làm tương tự cho ngọn đồi thứ hai với màu đậm hơn.',
          ],
        },
        { type: 'h2', id: 'chim', text: '5. Đàn chim bằng cọ thư pháp' },
        {
          type: 'p',
          text: 'Chọn {tool:brush}, **Kiểu** **Thư pháp**, cỡ khoảng 14 px, màu xám đậm. Mỗi con chim là một nét chữ "v" mở rộng. Ngòi thư pháp nghiêng nên nét dày mỏng tự nhiên theo hướng kéo.',
        },
        { type: 'h2', id: 'tieu-de', text: '6. Tiêu đề' },
        {
          type: 'p',
          text: 'Nhấn [[T]], chọn kiểu nhanh **Tiêu đề lớn**, bấm vào góc trên và gõ "Bình minh trên đồi". Chữ được đặt trên một **layer chú thích** tự tạo, nên luôn sửa được.',
        },
        {
          type: 'figure',
          shot: 'layers-panel',
          size: 'small',
          caption: 'Bảng Layer: 3 layer ảnh và 1 layer chú thích.',
        },
        { type: 'h2', id: 'hoan-thien', text: '7. Hoàn thiện' },
        {
          type: 'list',
          items: [
            'Muốn đổi màu cả ngọn đồi? Chọn layer đồi rồi dùng {ui:Điều chỉnh} → {ui:Sắc độ/Độ bão hòa…}.',
            'Mặt trời quá gắt? Giảm **Độ mờ** của layer mặt trời trong bảng Layer.',
            'Xuất ảnh: [[Mod+Shift+S]], chọn PNG hoặc JPG.',
          ],
        },
      ],
    },
    {
      id: 'qt-chinh-anh',
      title: 'Chỉnh sửa một bức ảnh chụp',
      summary: 'Cắt bố cục, làm sáng, tăng sắc nét, thu nhỏ kích thước và xuất JPG nhẹ để gửi đi.',
      icon: 'sliders',
      level: 'tutorial',
      keywords: [
        'chỉnh ảnh',
        'photo',
        'crop',
        'sáng',
        'sắc nét',
        'resize',
        'jpg',
        'giảm dung lượng',
      ],
      related: ['cat-xen-bien-doi', 'bo-loc', 'xuat-anh'],
      blocks: [
        {
          type: 'steps',
          items: [
            {
              title: 'Mở ảnh',
              text: 'Ở trang chủ bấm {ui:Mở ảnh…} hoặc kéo thả file ảnh vào. Ảnh mở ở chế độ Paint.',
            },
            {
              title: 'Cắt bố cục',
              text: 'Nhấn [[C]] ({tool:crop}), kéo khung mới hoặc kéo các ô vuông ở cạnh, góc. Giữ [[Shift]] khi kéo góc để giữ tỉ lệ. Nhấn [[Enter]] hoặc bấm đúp trong khung để cắt.',
              figure: {
                type: 'figure',
                shot: 'crop-tool',
                caption: 'Phần tối bên ngoài khung sẽ bị cắt bỏ; đường chia 1/3 giúp căn bố cục.',
              },
            },
            {
              title: 'Làm sáng',
              text: 'Menu {ui:Điều chỉnh} → {ui:Độ sáng/Tương phản…}. Kéo thanh trượt, ảnh đổi ngay. Giữ nút {ui:So sánh} để xem ảnh gốc. Bấm {ui:Áp dụng}.',
              figure: {
                type: 'figure',
                shot: 'adjust-panel',
                caption: 'Bảng điều chỉnh nổi, không che ảnh.',
              },
            },
            {
              title: 'Tăng sắc nét',
              text: '{ui:Điều chỉnh} → {ui:Làm sắc nét…}, thử **Mức độ** 80–150% và **Bán kính** 1–2 px.',
            },
            {
              title: 'Thu nhỏ để gửi',
              text: '{ui:Ảnh} → {ui:Đổi kích thước ảnh…}, chọn đơn vị **%**, nhập 50. Giữ **Giữ tỉ lệ** và cách co giãn **Mượt (ảnh chụp)**.',
              figure: { type: 'figure', shot: 'resize-dialog', size: 'small' },
            },
            {
              title: 'Xuất JPG',
              text: '[[Mod+Shift+S]], chọn **JPG**, chất lượng 80–90%. Ô ước lượng cho biết dung lượng file trước khi tải.',
              figure: { type: 'figure', shot: 'export-dialog-jpg', size: 'medium' },
            },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          text: 'Bộ lọc tác động lên **layer đang chọn** (và chỉ trong vùng chọn nếu có). Muốn chỉnh riêng bầu trời, chọn bầu trời bằng {tool:wand} trước khi mở bảng điều chỉnh.',
        },
      ],
    },
    {
      id: 'qt-anh-huong-dan',
      title: 'Làm ảnh hướng dẫn từng bước',
      summary:
        'Kết hợp Số thứ tự, Spotlight, Phóng to vùng và mũi tên cong để tạo ảnh hướng dẫn dễ hiểu.',
      icon: 'tool-step',
      level: 'tutorial',
      keywords: ['hướng dẫn', 'tutorial', 'bước', 'step', 'spotlight', 'magnifier', 'phóng to'],
      related: ['lam-noi-bat', 'danh-dau', 'hinh-khoi'],
      blocks: [
        {
          type: 'p',
          text: 'Ảnh hướng dẫn tốt dẫn mắt người xem đi theo thứ tự. Gợi ý một quy trình:',
        },
        {
          type: 'steps',
          items: [
            'Dùng {tool:spotlight} kéo quanh khu vực chính — phần còn lại tối đi, người xem biết nhìn vào đâu.',
            'Dùng {tool:magnifier} kéo quanh chi tiết nhỏ (một con số, một nút) — bản phóng to tự đặt bên cạnh; kéo tâm của nó sang chỗ trống.',
            'Đánh số các bước bằng {tool:step}. Số tự đánh lại khi xóa bớt.',
            'Nối các bước bằng {tool:arrow}; kéo chấm giữa của mũi tên để uốn cong tránh che nội dung.',
            'Thêm chú thích bằng {tool:text} kiểu **Ghi chú nền vàng**.',
          ],
        },
        {
          type: 'figure',
          shot: 'spotlight-magnifier',
          size: 'medium',
          caption: 'Spotlight làm tối phần còn lại; Phóng to vùng phóng 2× số tiền.',
        },
        {
          type: 'figure',
          shot: 'arrow-curve',
          size: 'medium',
          caption: 'Mũi tên đang chọn: chấm giữa dùng để uốn cong.',
        },
        {
          type: 'callout',
          tone: 'note',
          text: 'Spotlight và Phóng to vùng không có phím tắt riêng. Ở chế độ Paint chúng nằm chung một nút trên thanh công cụ (nút có ▾).',
        },
      ],
    },
    {
      id: 'qt-ghep-anh',
      title: 'Ghép nhiều ảnh thành một',
      summary:
        'Thả hoặc dán thêm ảnh vào project đang mở — mỗi ảnh thành một layer mới để di chuyển, co giãn, hòa trộn.',
      icon: 'layers',
      level: 'tutorial',
      keywords: ['ghép ảnh', 'collage', 'thêm ảnh', 'kéo thả', 'dán', 'layer mới'],
      related: ['mo-nhap-anh', 'thao-tac-vung-chon', 'layer'],
      blocks: [
        {
          type: 'steps',
          items: [
            'Tạo ảnh nền (ví dụ preset **Full HD**) hoặc mở ảnh nền.',
            'Kéo file ảnh thứ hai từ máy thả vào khung vẽ. Màn hình hiện "Thả ảnh để thêm thành layer mới". Hoặc copy ảnh rồi nhấn [[Mod+V]].',
            'Ảnh mới nằm giữa khung nhìn ở trạng thái **đang di chuyển**. Nếu chưa thấy khung có ô vuông, nhấn [[V]] (hoặc [[M]]): khung biến đổi chỉ hiện ở công cụ Chọn và các công cụ vùng chọn. Kéo để đặt chỗ, kéo các ô vuông để co giãn (giữ [[Shift]] ở góc để giữ tỉ lệ), kéo chấm phía trên để xoay.',
            'Nhấn [[Enter]] (hoặc {ui:Áp dụng} trên thanh tùy chọn) để đặt ảnh thành layer mới. [[Escape]] để hủy.',
            'Trong bảng Layer, đổi **Độ mờ** hoặc **Hòa trộn** (ví dụ Multiply, Screen) để ảnh hòa vào nền.',
          ],
        },
        {
          type: 'figure',
          shot: 'floating-transform',
          caption: 'Phần ảnh đang di chuyển có khung và các ô vuông để co giãn, xoay.',
        },
        {
          type: 'callout',
          tone: 'note',
          text: 'Thả file `.paint` vào editor sẽ không có tác dụng — file project chỉ nhập được ở trang chủ.',
        },
      ],
    },
  ],
};
