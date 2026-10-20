import type { Category } from '../types';

export const drawCategory: Category = {
  id: 've',
  title: 'Vẽ và tô màu',
  description: 'Chọn màu, dùng cọ, bút chì, tẩy, tô màu, Gradient, vẽ hình khối, mũi tên và chữ.',
  icon: 'brush',
  topics: [
    {
      id: 'mau-sac',
      title: 'Chọn màu',
      summary:
        'Màu chính và màu phụ, bộ chọn màu, mã hex, độ đục, bảng màu, màu gần đây và lấy màu từ ảnh.',
      icon: 'palette',
      level: 'basic',
      keywords: [
        'màu',
        'color',
        'hex',
        'bảng màu',
        'palette',
        'eyedropper',
        'lấy màu',
        'độ đục',
        'alpha',
      ],
      related: ['co-ve', 'hinh-khoi', 'chu'],
      blocks: [
        {
          type: 'p',
          text: 'Paint Online luôn có hai màu: **màu chính** và **màu phụ**, hiện ở ô màu cuối thanh công cụ (ô trên là màu chính). Mỗi công cụ dùng chúng theo cách riêng:',
        },
        {
          type: 'table',
          head: ['Công cụ', 'Màu chính', 'Màu phụ'],
          rows: [
            ['{tool:brush}, {tool:pencil}, {tool:bucket}', 'Màu vẽ, màu tô', '—'],
            ['{tool:gradient}', 'Màu đầu', 'Màu cuối'],
            [
              '{tool:rect}, {tool:ellipse}, {tool:polygon}',
              'Màu viền',
              'Màu tô bên trong (khi bật **Tô màu phụ**)',
            ],
            ['{tool:line}, {tool:arrow}, {tool:magnifier}', 'Màu nét', '—'],
            ['{tool:text}', 'Màu chữ', 'Màu nền chữ (khi bật **Nền chữ**)'],
            ['{tool:step}', 'Màu vòng tròn', '—'],
            ['{tool:eraser}', '—', 'Màu tô thay vì xóa khi layer bật **Khóa vùng trong suốt**'],
          ],
        },
        {
          type: 'callout',
          tone: 'note',
          text: '{tool:highlight} có 5 màu dạ quang riêng; {tool:redact} luôn dùng màu đen.',
        },
        { type: 'h2', id: 'bo-chon-mau', text: 'Bộ chọn màu' },
        {
          type: 'p',
          text: 'Bấm ô màu trên thanh công cụ để mở bảng màu. Chọn ô **Màu chính** hoặc **Màu phụ** ở đầu bảng để biết mình đang chỉnh màu nào.',
        },
        {
          type: 'figure',
          shot: 'color-popover',
          size: 'medium',
          markers: [
            { target: 'slots', label: 'Đang chỉnh màu chính hay màu phụ' },
            { target: 'picker', label: 'Vùng chọn màu, thanh sắc độ và thanh độ đục' },
            { target: 'eyedropper', label: 'Lấy màu từ ảnh' },
            { target: 'add', label: 'Lưu màu đang chỉnh vào **Bảng màu của bạn**' },
          ],
        },
        {
          type: 'options',
          items: [
            ['Mã màu', 'Gõ mã hex, ví dụ `#3B5BDB`. Mã sai sẽ có cảnh báo đỏ.'],
            ['Độ đục', 'Thanh dưới cùng; 0% là trong suốt hoàn toàn.'],
            ['Bảng màu', '20 màu cơ bản. **Bấm** để đặt màu chính, **chuột phải** để đặt màu phụ.'],
            ['Màu từ ảnh', 'Khi bạn mở hoặc dán ảnh, các màu chủ đạo của ảnh được gợi ý ở đây.'],
            [
              'Bảng màu của bạn',
              'Bấm **+** để lưu màu hay dùng. Chuột phải vào một ô để xóa. Bảng này được nhớ trong trình duyệt.',
            ],
            ['Màu gần đây', '10 màu dùng gần nhất.'],
          ],
        },
        { type: 'h2', id: 'doi-mau', text: 'Đổi chỗ hai màu' },
        {
          type: 'p',
          text: 'Nhấn [[X]] hoặc bấm biểu tượng ⇆ cạnh ô màu để đổi chỗ màu chính và màu phụ.',
        },
        { type: 'h2', id: 'lay-mau', text: 'Lấy màu từ ảnh' },
        {
          type: 'p',
          text: 'Chọn {tool:eyedropper} rồi bấm vào ảnh: **bấm** lấy màu chính, **[[Shift]] + bấm** lấy màu phụ. Kính lúp tròn hiện màu sắp lấy (nửa trên) và màu hiện tại (nửa dưới). Công cụ lấy màu của **ảnh đang thấy** (mọi layer ghép lại), bỏ qua chỗ trong suốt hoàn toàn.',
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Lấy màu nhanh khi đang vẽ',
          text: 'Khi đang dùng cọ, bút chì, tô màu, Gradient, hình khối, chữ và các công cụ chú thích, **giữ [[Alt]]** để tạm chuyển sang lấy màu, nhả ra là quay lại công cụ cũ. (Không áp dụng cho Tẩy, các công cụ chọn và Cắt xén — ở đó [[Alt]] có tác dụng khác.)',
        },
        {
          type: 'callout',
          tone: 'warning',
          text: 'Khi đang chọn một đối tượng chú thích (mũi tên, khung, chữ…), đổi màu sẽ **đổi màu luôn đối tượng đó**. Đây là cách nhanh để sửa màu; nếu chỉ muốn đổi màu cho lần vẽ sau, nhấn [[Escape]] bỏ chọn trước.',
        },
      ],
    },
    {
      id: 'co-ve',
      title: 'Cọ vẽ, Bút chì và Tẩy',
      summary:
        'Vẽ tự do với 4 kiểu cọ, chỉnh cỡ, độ mờ, độ cứng, làm mượt nét; dùng bút chì từng pixel và tẩy.',
      icon: 'brush',
      level: 'basic',
      keywords: [
        'brush',
        'cọ',
        'bút chì',
        'pencil',
        'tẩy',
        'eraser',
        'áp lực bút',
        'pressure',
        'làm mượt',
        'HUD',
        'cỡ cọ',
      ],
      related: ['mau-sac', 'layer', 'qt-ve-tranh'],
      blocks: [
        {
          type: 'tools',
          items: [
            {
              tool: 'brush',
              text: 'Nét mềm mại, khử răng cưa, có nhiều kiểu đầu cọ. Dùng cho hầu hết việc vẽ.',
            },
            {
              tool: 'pencil',
              text: 'Nét đúng 1 pixel, không khử răng cưa — hợp với pixel art, sửa từng điểm ảnh.',
            },
            { tool: 'eraser', text: 'Xóa về trong suốt trên layer ảnh.' },
          ],
        },
        {
          type: 'callout',
          tone: 'note',
          text: 'Ba công cụ này vẽ **pixel** nên chỉ dùng trên **layer ảnh**. Nếu đang chọn layer chú thích, Paint Online sẽ hỏi bạn vẽ ở đâu — xem [Layer ảnh và layer chú thích](layer#hai-loai-layer).',
        },
        { type: 'h2', id: 'tuy-chon-co', text: 'Tùy chọn của Cọ' },
        {
          type: 'figure',
          shot: 'brush-options',
          markers: [
            { target: 'preset', label: 'Kiểu đầu cọ' },
            { target: 'size', label: 'Cỡ 1–500 px' },
            { target: 'opacity', label: 'Độ mờ' },
            { target: 'hardness', label: 'Độ cứng của mép' },
            { target: 'smoothing', label: 'Làm mượt' },
            { target: 'advanced', label: 'Tùy chọn nâng cao' },
            { target: 'pressure', label: 'Áp lực bút (trong bảng nâng cao)' },
          ],
        },
        {
          type: 'options',
          items: [
            ['Tròn', 'Đầu tròn, mép sắc (độ cứng 100%). Nét gọn, đều.'],
            ['Mềm', 'Đầu tròn mép mờ dần (độ cứng 30%) — tô bóng, quầng sáng.'],
            ['Marker', 'Đầu vuông bo nhẹ, như bút dạ.'],
            ['Thư pháp', 'Ngòi dẹt nghiêng 45°: nét dày hay mỏng tùy hướng kéo.'],
            [
              'Cỡ',
              'Đường kính 1–500 px. Thanh trượt chia theo thang log nên dễ chỉnh cả cỡ nhỏ lẫn lớn.',
            ],
            ['Độ mờ', '1–100%. Một nét không tự đậm lên ở chỗ nó tự chồng lên mình.'],
            ['Độ cứng', '0–100%: thấp là mép mờ. Không áp dụng cho Marker và Thư pháp.'],
            [
              'Làm mượt',
              '0–60. Lớn hơn = nét bám theo chuột chậm hơn nhưng mượt, bỏ qua tay run; khi bật sẽ thấy một "sợi dây" nét đứt nối con trỏ với đầu cọ.',
            ],
            [
              'Lưu lượng (nâng cao)',
              'Lượng màu mỗi lần chấm; thấp thì phải tô nhiều lần mới đậm. Không hiện ở kiểu Tròn.',
            ],
            [
              'Áp lực bút (nâng cao)',
              '**Áp lực bút đổi cỡ nét** (bật sẵn) và **Áp lực bút đổi độ đậm**. Chỉ có tác dụng với bút cảm ứng có lực nhấn; chuột luôn coi như nhấn vừa.',
            ],
          ],
        },
        { type: 'h2', id: 'phim-co', text: 'Đổi cỡ, độ cứng, độ mờ bằng phím' },
        {
          type: 'keys',
          rows: [
            ['[[[]] / [[]]]', 'Giảm / tăng cỡ cọ (bước 1, 5, 10 hoặc 25 px tùy cỡ hiện tại).'],
            ['[[Shift+[]] / [[Shift+]]]', 'Giảm / tăng độ cứng 10%.'],
            ['[[1]] … [[9]], [[0]]', 'Độ mờ 10% … 90%, phím 0 là 100%.'],
            [
              '[[Alt]] + kéo chuột phải',
              'Kéo ngang đổi cỡ, kéo dọc đổi độ cứng; vòng tròn hiện cỡ thật trên ảnh.',
            ],
          ],
        },
        {
          type: 'figure',
          shot: 'brush-hud',
          size: 'small',
          caption: 'Vòng xem trước cỡ cọ hiện khi đổi cỡ bằng phím hoặc Alt + kéo chuột phải.',
        },
        {
          type: 'p',
          text: 'Các phím trên chỉ tác dụng khi đang chọn {tool:brush} hoặc {tool:eraser}.',
        },
        { type: 'h2', id: 'but-chi', text: 'Bút chì' },
        {
          type: 'p',
          text: 'Bút chì không có tùy chọn cỡ: mỗi nét đúng 1 pixel với màu chính (kể cả độ đục của màu). Bấm một lần để chấm một điểm. Phóng to từ 800% trở lên sẽ thấy lưới điểm ảnh, rất tiện để vẽ pixel art.',
        },
        { type: 'h2', id: 'tay', text: 'Tẩy' },
        {
          type: 'list',
          items: [
            'Tùy chọn: **Cỡ** (mặc định 24 px), **Độ mờ**, **Độ cứng**.',
            'Tẩy xóa về trong suốt. Nếu layer bật **Khóa vùng trong suốt**, tẩy sẽ **tô màu phụ** thay vì xóa (giống MS Paint).',
            'Muốn xóa sạch một vùng? Tạo vùng chọn rồi nhấn [[Delete]].',
          ],
        },
        { type: 'h2', id: 'luu-y', text: 'Lưu ý khi vẽ' },
        {
          type: 'list',
          items: [
            'Khi có vùng chọn, nét vẽ chỉ hiện **bên trong vùng chọn** — tiện để tô không lem.',
            'Layer bật **Khóa vùng trong suốt** chỉ cho vẽ lên chỗ đã có pixel.',
            'Layer bị khóa hoặc đang ẩn sẽ không vẽ được; Paint Online sẽ báo.',
            'Mỗi nét là một bước trong Lịch sử, hoàn tác bằng [[Mod+Z]].',
          ],
        },
      ],
    },
    {
      id: 'to-mau-gradient',
      title: 'Tô màu và Gradient',
      summary:
        'Đổ màu vào vùng cùng màu bằng Tô màu; tô chuyển màu tuyến tính hoặc tỏa tròn bằng Gradient.',
      icon: 'tool-bucket',
      level: 'basic',
      keywords: [
        'bucket',
        'tô màu',
        'đổ màu',
        'fill',
        'gradient',
        'chuyển màu',
        'dung sai',
        'tolerance',
      ],
      related: ['mau-sac', 'vung-chon', 'co-ve'],
      blocks: [
        {
          type: 'tools',
          items: [
            {
              tool: 'bucket',
              text: 'Bấm vào một vùng để đổ màu chính vào các pixel có màu giống nhau.',
            },
            { tool: 'gradient', text: 'Kéo để tô dải màu chuyển từ màu chính sang màu phụ.' },
          ],
        },
        {
          type: 'p',
          text: 'Hai công cụ dùng chung phím [[G]] và chung một nút trên thanh công cụ: nhấn [[G]] chọn kiểu dùng gần nhất, nhấn lần nữa để đổi giữa Tô màu và Gradient.',
        },
        { type: 'figure', shot: 'split-fill-menu', size: 'small' },
        { type: 'h2', id: 'to-mau', text: 'Tô màu' },
        {
          type: 'options',
          items: [
            ['Dung sai', '0–100% (mặc định 15%). Cao hơn = tô lan sang cả các màu gần giống.'],
            [
              'Liền kề',
              'Bật: chỉ tô vùng liền với chỗ bấm. Tắt: tô mọi pixel cùng màu trên cả layer.',
            ],
            [
              'Lấy mẫu mọi layer',
              'Xác định vùng tô theo ảnh đã ghép (thấy gì tô nấy), nhưng màu vẫn đổ vào layer đang chọn.',
            ],
            ['Nới vùng tô', '0–2 px: tô lấn ra ngoài viền một chút để không còn khe hở răng cưa.'],
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          text: 'Độ đục của màu chính chính là độ mờ của vùng tô. Có vùng chọn thì phần tô bị giới hạn trong vùng chọn.',
        },
        { type: 'h2', id: 'gradient', text: 'Gradient' },
        {
          type: 'steps',
          items: [
            'Chọn màu chính (đầu dải) và màu phụ (cuối dải).',
            'Chọn **Kiểu**: **Thẳng** (tuyến tính) hoặc **Tỏa tròn** (tâm là điểm bắt đầu kéo, bán kính là độ dài kéo).',
            'Kéo từ điểm đầu tới điểm cuối. Giữ [[Shift]] để bắt góc 45°. Thả chuột là tô.',
          ],
        },
        {
          type: 'options',
          items: [
            [
              'Tới trong suốt',
              'Dải màu đi từ màu chính tới trong suốt (bỏ qua màu phụ) — hợp để làm bóng mờ dần.',
            ],
            ['Độ mờ', 'Độ mờ của cả dải màu.'],
          ],
        },
        {
          type: 'p',
          text: 'Gradient phủ toàn bộ layer, hoặc chỉ vùng chọn nếu có. Có xem trước trong lúc kéo.',
        },
      ],
    },
    {
      id: 'hinh-khoi',
      title: 'Hình khối, đường thẳng và mũi tên',
      summary:
        'Vẽ hình chữ nhật, elip, đường thẳng, đa giác và mũi tên — tất cả là đối tượng sửa được bất cứ lúc nào.',
      icon: 'tool-rect',
      level: 'basic',
      keywords: [
        'hình',
        'shape',
        'chữ nhật',
        'vuông',
        'tròn',
        'elip',
        'đường thẳng',
        'đa giác',
        'polygon',
        'mũi tên',
        'arrow',
        'cong',
        'nét đứt',
        'bóng đổ',
      ],
      related: ['doi-tuong', 'mau-sac', 'chu'],
      blocks: [
        {
          type: 'figure',
          shot: 'shapes-demo',
          caption:
            'Chữ nhật bo góc có bóng, elip nét đứt, đường thẳng, đa giác, mũi tên cong và mũi tên hai đầu, số thứ tự.',
        },
        {
          type: 'tools',
          items: [
            { tool: 'rect', text: 'Kéo chéo để vẽ. [[Shift]]: hình vuông. Có bo góc.' },
            { tool: 'ellipse', text: 'Kéo chéo để vẽ. [[Shift]]: hình tròn.' },
            { tool: 'line', text: 'Kéo từ điểm đầu tới điểm cuối. [[Shift]]: bắt góc 15°.' },
            { tool: 'polygon', text: 'Bấm từng đỉnh; xem cách vẽ bên dưới.' },
            { tool: 'arrow', text: 'Kéo từ đuôi tới mũi. [[Shift]]: bắt góc 15°. Uốn cong được.' },
          ],
        },
        {
          type: 'p',
          text: 'Bốn hình đầu dùng chung phím [[U]] và một nút trên thanh công cụ (nhớ hình dùng gần nhất). Mũi tên có phím riêng [[A]].',
        },
        { type: 'h2', id: 'doi-tuong-chu-thich', text: 'Hình là đối tượng, không phải pixel' },
        {
          type: 'p',
          text: 'Mọi hình đều là **đối tượng chú thích** nằm trên **layer chú thích**. Nếu bạn đang ở layer ảnh, Paint Online tự dùng layer chú thích ngay phía trên, hoặc tạo layer "Chú thích 1" mới. Nhờ vậy hình luôn sửa được: đổi màu, cỡ nét, kéo lại kích thước, xóa — mà không làm hỏng ảnh bên dưới.',
        },
        {
          type: 'p',
          text: 'Hình vừa vẽ được **chọn sẵn**: kéo các ô vuông để chỉnh ngay, hoặc đổi tùy chọn trên thanh tùy chọn để áp cho nó. Kéo ngắn dưới 3 px được coi là bấm và không tạo hình.',
        },
        { type: 'h2', id: 'tuy-chon', text: 'Tùy chọn' },
        {
          type: 'options',
          items: [
            ['Nét', 'Độ dày nét viền 1–60 px (mặc định 4, mũi tên 6).'],
            ['Tô màu phụ', 'Chữ nhật, elip, đa giác: tô bên trong bằng màu phụ.'],
            ['Bo góc', 'Chỉ chữ nhật, 0–100 px.'],
            ['Nét đứt', 'Viền nét đứt.'],
            ['Bóng đổ', 'Thêm bóng mờ phía dưới cho nổi khối.'],
            ['Đầu (mũi tên)', '**Tam giác**, **Mở** (hai nét), **Không** (thành đường thẳng).'],
            ['Hai đầu (mũi tên)', 'Mũi tên ở cả hai đầu.'],
          ],
        },
        { type: 'h2', id: 'kieu-nhanh', text: 'Kiểu nhanh' },
        {
          type: 'p',
          text: 'Với Mũi tên, Chữ nhật, Elip và Chữ, thanh tùy chọn có mục **Kiểu nhanh**: một cú bấm đặt sẵn màu và tùy chọn đẹp mắt.',
        },
        {
          type: 'table',
          head: ['Cho', 'Các kiểu'],
          rows: [
            ['Mũi tên', 'Mũi tên đỏ nổi bật · Mũi tên mảnh · Mũi tên nét đứt · Mũi tên hai đầu'],
            ['Chữ nhật, Elip', 'Khung đỏ · Khung bo góc có bóng · Khung nét đứt · Khung tô nhạt'],
            ['Chữ', 'Chữ chú thích có viền · Nhãn nền đỏ · Ghi chú nền vàng · Tiêu đề lớn'],
          ],
        },
        { type: 'figure', shot: 'arrow-presets' },
        {
          type: 'callout',
          tone: 'warning',
          text: 'Bấm kiểu nhanh khi đang chọn đối tượng **cùng loại** (vd. kiểu mũi tên khi đang chọn mũi tên) sẽ đổi luôn đối tượng đó; đối tượng khác loại giữ nguyên. Nhấn [[Escape]] trước nếu chỉ muốn đặt kiểu cho lần vẽ sau.',
        },
        { type: 'h2', id: 'da-giac', text: 'Vẽ đa giác' },
        {
          type: 'steps',
          items: [
            'Chọn {tool:polygon} (nút hình khối ▾ → Đa giác, hoặc [[U]] nếu đó là hình dùng gần nhất).',
            'Bấm để đặt từng đỉnh. Giữ [[Shift]] để cạnh mới bắt góc 15°.',
            'Bấm lại vào **đỉnh đầu tiên** để khép kín (cần ít nhất 3 đỉnh) — chỉ hình khép kín mới tô màu được.',
            'Hoặc **bấm đúp** / nhấn [[Enter]] để kết thúc thành đường gấp khúc hở.',
          ],
        },
        {
          type: 'figure',
          shot: 'polygon-drawing',
          size: 'small',
          caption: 'Đang vẽ đa giác: đỉnh đầu to hơn để bấm vào khép kín.',
        },
        {
          type: 'keys',
          rows: [
            ['[[Backspace]]', 'Xóa đỉnh vừa đặt'],
            ['[[Escape]]', 'Bỏ đa giác đang vẽ'],
            ['[[Enter]] / bấm đúp', 'Kết thúc (hở)'],
          ],
        },
        { type: 'h2', id: 'mui-ten-cong', text: 'Uốn cong mũi tên' },
        {
          type: 'p',
          text: 'Chọn mũi tên (bằng {tool:select} hoặc ngay sau khi vẽ): ngoài hai chấm ở hai đầu còn một **chấm ở giữa**. Kéo chấm giữa để uốn cong; kéo nó về sát đường thẳng để duỗi lại.',
        },
        { type: 'figure', shot: 'arrow-curve', size: 'medium' },
      ],
    },
    {
      id: 'chu',
      title: 'Chữ',
      summary:
        'Thêm chữ chú thích một dòng hoặc khung chữ tự xuống dòng, gõ tiếng Việt, đổi font, cỡ, nền, viền.',
      icon: 'tool-text',
      level: 'basic',
      keywords: [
        'text',
        'chữ',
        'font',
        'gõ',
        'tiếng việt',
        'nhãn',
        'tiêu đề',
        'viền chữ',
        'nền chữ',
      ],
      related: ['doi-tuong', 'hinh-khoi', 'qt-chu-thich-anh-chup'],
      blocks: [
        { type: 'h2', id: 'them-chu', text: 'Thêm chữ' },
        {
          type: 'steps',
          items: [
            'Nhấn [[T]] hoặc chọn {tool:text}.',
            '**Bấm** vào ảnh để có dòng chữ tự giãn theo nội dung; hoặc **kéo ngang** (ít nhất 8 px) để tạo khung có độ rộng cố định, chữ tự xuống dòng.',
            'Gõ nội dung. Bộ gõ tiếng Việt (Unikey, EVKey, bộ gõ của hệ điều hành) hoạt động bình thường. [[Enter]] để xuống dòng.',
            'Nhấn [[Mod+Enter]] hoặc [[Escape]], hoặc bấm ra ngoài để xong.',
          ],
        },
        {
          type: 'figure',
          shot: 'text-editing',
          caption: 'Đang gõ chữ: thanh tùy chọn hiện các tùy chọn chữ, áp ngay cho chữ đang gõ.',
          markers: [
            { target: 'editor', label: 'Ô đang gõ (viền nét đứt)' },
            { target: 'font', label: 'Font chữ' },
            { target: 'size', label: 'Cỡ chữ' },
          ],
        },
        {
          type: 'callout',
          tone: 'note',
          text: '[[Escape]] **không hủy** chữ đang gõ mà ghi lại. Muốn bỏ, hoàn tác bằng [[Mod+Z]]. Chữ để trống sẽ không được tạo; xóa hết nội dung của chữ cũ sẽ xóa đối tượng chữ đó.',
        },
        { type: 'h2', id: 'tuy-chon-chu', text: 'Tùy chọn chữ' },
        {
          type: 'options',
          items: [
            [
              'Font',
              'Inter, Viết tay, Mono (đi kèm app nên hiển thị giống nhau trên mọi máy), và Arial, Georgia, Times New Roman, Courier New của hệ điều hành.',
            ],
            ['Cỡ', '8–300 px.'],
            ['Độ đậm chữ', 'Thường, Vừa, Đậm.'],
            ['Căn', 'Trái, Giữa, Phải.'],
            ['Chữ nghiêng', 'Bật/tắt kiểu chữ nghiêng.'],
            ['Nền chữ', 'Hộp nền phía sau chữ, màu là màu phụ.'],
            [
              'Viền chữ',
              'Viền trắng hoặc đen (tự chọn để tương phản với màu chữ) giúp chữ dễ đọc trên ảnh rối.',
            ],
          ],
        },
        {
          type: 'p',
          text: 'Màu chữ là **màu chính**. Bốn **Kiểu nhanh**: Chữ chú thích có viền, Nhãn nền đỏ, Ghi chú nền vàng, Tiêu đề lớn.',
        },
        { type: 'h2', id: 'sua-chu', text: 'Sửa chữ đã có' },
        {
          type: 'list',
          items: [
            'Với {tool:text}: bấm vào chữ có sẵn để sửa nội dung.',
            'Với {tool:select}: **bấm đúp** vào chữ, hoặc chọn chữ rồi nhấn [[Enter]].',
            'Muốn đổi độ rộng khung chữ: chọn chữ và kéo ô vuông ở cạnh trái/phải. Kéo chấm phía trên để xoay.',
          ],
        },
      ],
    },
  ],
};
