import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { pastePng, sampleScreenshotBase64, shot, writeManifest, type Rect } from './capture';

/**
 * Kịch bản chụp ảnh minh họa cho trung tâm hướng dẫn (`npm run guide:shots`). Mọi ảnh là giao diện
 * thật của Paint Online sau khi thao tác bằng chuột/phím như người dùng; chỉ ảnh được chú thích
 * (màn hình "Ứng dụng mẫu") là ảnh mẫu vẽ bằng canvas. Các bước chạy nối tiếp trên cùng một trang
 * để trang chủ cuối cùng có sẵn các project vừa tạo.
 *
 * Chụp lại một phần: `npm run guide:shots -- -g "Paint"` (manifest giữ ảnh của phần còn lại).
 */

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

test.describe.configure({ mode: 'serial' });

let page: Page;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    colorScheme: 'light',
    serviceWorkers: 'block',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  context.setDefaultTimeout(20_000);
  page = await context.newPage();
  await page.goto('/');
  await expect(page.getByTestId('start-screen')).toBeVisible();
});

test.afterAll(() => {
  writeManifest(pkg.version);
});

// ---------------------------------------------------------------------------
// Tiện ích thao tác
// ---------------------------------------------------------------------------

const id = (testId: string): Locator => page.getByTestId(testId);

async function settle(ms = 250): Promise<void> {
  await page.waitForTimeout(ms);
}

/** Đưa chuột ra chỗ trống (thanh trạng thái) để tooltip/hover không lọt vào ảnh. */
async function calm(): Promise<void> {
  await page.mouse.move(720, 897);
  await settle(350);
}

async function ready(): Promise<void> {
  await expect(id('editor-screen')).toBeVisible();
  await expect(page.locator('[data-testid=canvas-view] canvas')).toHaveCount(2);
  await settle(400);
}

/** Điểm document → tọa độ trang. */
async function at(x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await id('canvas-view').boundingBox();
  if (!box) throw new Error('canvas-view không hiện');
  const p = await page.evaluate(
    ([dx, dy]) => {
      const api = (
        window as unknown as {
          __paint: {
            editor(): {
              viewport: { docToScreen(p: { x: number; y: number }): { x: number; y: number } };
            };
          };
        }
      ).__paint;
      return api.editor().viewport.docToScreen({ x: dx, y: dy });
    },
    [x, y] as const,
  );
  return { x: box.x + p.x, y: box.y + p.y };
}

/** Vùng document → vùng trang (để cắt ảnh quanh một phần canvas). */
async function docRect(x: number, y: number, w: number, h: number): Promise<Rect> {
  const a = await at(x, y);
  const b = await at(x + w, y + h);
  return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
}

/** Bỏ chọn đối tượng vừa tạo: đổi màu/kiểu nhanh khi còn chọn sẽ đổi luôn đối tượng đó. */
async function deselect(): Promise<void> {
  await page.keyboard.press('Escape');
  await settle(100);
}

async function drag(points: readonly (readonly [number, number])[], steps = 10): Promise<void> {
  const [first, ...rest] = points;
  if (!first) return;
  const p0 = await at(first[0], first[1]);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  for (const [x, y] of rest) {
    const p = await at(x, y);
    await page.mouse.move(p.x, p.y, { steps });
  }
  await page.mouse.up();
  await settle(150);
}

async function clickDoc(
  x: number,
  y: number,
  options: { button?: 'left' | 'right' } = {},
): Promise<void> {
  const p = await at(x, y);
  await page.mouse.click(p.x, p.y, options);
  await settle(150);
}

async function editorEval(fn: string): Promise<void> {
  await page.evaluate(`(() => { const editor = window.__paint.editor(); ${fn} })()`);
  await settle(120);
}

async function tool(toolId: string): Promise<void> {
  await editorEval(`editor.tools.setActive(${JSON.stringify(toolId)});`);
}

async function color(primary: string, secondary?: string): Promise<void> {
  await editorEval(
    `editor.pickColor('primary', '${primary}FF');${secondary ? ` editor.pickColor('secondary', '${secondary}FF');` : ''}`,
  );
}

async function options(group: string, patch: Record<string, unknown>): Promise<void> {
  await editorEval(`editor.options.set(${JSON.stringify(group)}, ${JSON.stringify(patch)});`);
}

/**
 * Rời project ngay sau một thay đổi để lượt lưu khi đóng vẽ lại ảnh thu nhỏ (lượt tự lưu thường chỉ
 * vẽ ảnh thu nhỏ mỗi 20 giây; lúc đóng mà không còn gì chưa lưu thì không vẽ lại).
 */
async function leaveToHome(): Promise<void> {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  await page.goto('/#/');
  await expect(id('start-screen')).toBeVisible();
  await settle(600);
}

async function fit(): Promise<void> {
  await page.keyboard.press('Shift+1');
  await settle(300);
}

async function waitIdle(): Promise<void> {
  await expect(id('status-busy')).toHaveCount(0, { timeout: 20_000 });
  await settle(200);
}

async function typeText(text: string): Promise<void> {
  await expect(id('text-editor')).toBeVisible();
  await page.keyboard.type(text, { delay: 5 });
}

async function commitText(): Promise<void> {
  await page.keyboard.press('Control+Enter');
  await settle(200);
}

async function openMenu(trigger: string): Promise<Locator> {
  await id(trigger).click();
  const menu = page.locator('[role=menu]').last();
  await expect(menu).toBeVisible();
  await settle(250);
  return menu;
}

async function closeMenus(): Promise<void> {
  await page.keyboard.press('Escape');
  await settle(200);
}

const workspace: Rect = { x: 0, y: 48, width: 1440 - 0, height: 900 - 48 - 28 };

// ---------------------------------------------------------------------------
// 1. Chế độ Screenshot: dán ảnh chụp và chú thích
// ---------------------------------------------------------------------------

test('Screenshot: dán ảnh và chú thích', async () => {
  const sample = await sampleScreenshotBase64(page.context());
  await shot(page, 'home-empty', {
    boxes: { dropzone: id('drop-zone'), presets: id('preset-full-hd') },
  });
  await pastePng(page, sample);
  await ready();
  await calm();
  await shot(page, 'screenshot-start', {
    boxes: {
      island: id('tool-island'),
      options: id('options-bar'),
      copy: id('copy-image'),
      download: id('download-image'),
      paint: id('mode-paint'),
      panel: id('right-panel'),
    },
  });

  // Mũi tên đỏ nổi bật chỉ vào nút Lưu thay đổi.
  await tool('arrow');
  await id('preset-arrow-bold').click();
  await drag([
    [520, 610],
    [236, 674],
  ]);
  await deselect();
  await calm();
  await shot(page, 'arrow-presets', {
    area: [id('tool-island'), id('options-bar')],
    pad: 10,
    boxes: {
      presets: id('style-presets'),
      width: id('option-strokeWidth'),
      head: id('option-head'),
    },
  });

  // Khung đỏ quanh số điện thoại.
  await tool('rect');
  await id('preset-frame-red').click();
  await drag([
    [62, 404],
    [780, 488],
  ]);
  await deselect();

  // Che email bằng khảm, số tài khoản bằng tô kín, địa chỉ bằng làm mờ.
  await tool('redact');
  await options('redact', { mode: 'pixelate' });
  await drag([
    [84, 364],
    [312, 398],
  ]);
  await deselect();
  await options('redact', { mode: 'solid' });
  await drag([
    [84, 516],
    [250, 550],
  ]);
  await deselect();
  await options('redact', { mode: 'blur' });
  await drag([
    [84, 592],
    [420, 626],
  ]);
  await calm();
  await shot(page, 'redact-options', {
    area: [id('tool-island'), id('options-bar')],
    pad: 10,
    boxes: { mode: id('option-mode'), warning: id('redact-blur-warning') },
  });
  await options('redact', { mode: 'solid' });

  // Số thứ tự.
  await tool('step');
  await color('#E03131');
  await clickDoc(812, 381);
  await clickDoc(812, 457);
  await clickDoc(156, 744);
  await deselect();

  // Bút dạ quang trên tổng chi tiêu.
  await tool('highlight');
  await drag([
    [872, 566],
    [1086, 598],
  ]);
  await deselect();

  // Nhãn chữ.
  await tool('text');
  await id('preset-text-label').click();
  await clickDoc(530, 586);
  await typeText('Bấm để lưu');
  await calm();
  await shot(page, 'text-editing', {
    area: { x: 0, y: 48, width: 1160, height: 640 },
    boxes: {
      options: id('options-bar'),
      editor: id('text-editor'),
      presets: id('style-presets'),
      font: id('option-family'),
      size: id('option-size'),
    },
  });
  await commitText();

  await tool('select');
  await page.keyboard.press('Escape');
  await calm();
  await shot(page, 'screenshot-overview', {
    boxes: {
      island: id('tool-island'),
      options: id('options-bar'),
      copy: id('copy-image'),
      download: id('download-image'),
      paint: id('mode-paint'),
      panel: id('right-panel'),
      undo: id('undo'),
      name: id('project-name'),
      status: id('save-status'),
    },
  });
  await shot(page, 'tool-island-screenshot', {
    area: id('tool-island'),
    pad: 6,
    boxes: {
      select: id('tool-select'),
      arrow: id('tool-arrow'),
      rect: id('tool-rect'),
      highlight: id('tool-highlight'),
      text: id('tool-text'),
      redact: id('tool-redact'),
      step: id('tool-step'),
      spotlight: id('tool-spotlight'),
      magnifier: id('tool-magnifier'),
      crop: id('tool-crop'),
      color: id('color-control'),
    },
  });
  await shot(page, 'redact-modes', { area: await docRect(40, 300, 760, 360) });
  await shot(page, 'highlight-steps', { area: await docRect(560, 340, 680, 380) });

  // Chọn mũi tên: handle, mini toolbar, thuộc tính đối tượng.
  await tool('select');
  await clickDoc(390, 645);
  await calm();
  await shot(page, 'object-selected', {
    area: { x: 0, y: 48, width: 1160, height: 720 },
    boxes: {
      options: id('options-bar'),
      mini: id('mini-toolbar'),
      props: id('object-props'),
      presets: id('style-presets'),
      delete: id('delete-object'),
    },
  });
  // Menu chuột phải trên đối tượng, mở menu con Căn chỉnh.
  await clickDoc(390, 645, { button: 'right' });
  const objectMenu = page.getByTestId('canvas-menu');
  await expect(objectMenu).toBeVisible();
  await id('menu-object-align').hover();
  await settle(400);
  await shot(page, 'object-menu', {
    area: [objectMenu, page.locator('[role=menu]').last()],
    pad: 16,
  });
  await closeMenus();
  await closeMenus();

  // Spotlight + phóng to vùng (chụp xong hoàn tác để giữ ảnh gọn).
  await tool('spotlight');
  await drag([
    [846, 180],
    [1226, 290],
  ]);
  await deselect();
  await tool('magnifier');
  await drag([
    [1110, 200],
    [1210, 230],
  ]);
  await deselect();
  await tool('select');
  await calm();
  await shot(page, 'spotlight-magnifier', { area: await docRect(560, 70, 720, 420) });
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await settle(300);

  // Làm đẹp.
  await id('tab-beautify').click();
  await settle(200);
  await calm();
  await shot(page, 'beautify-off', { area: id('right-panel') });
  await id('beautify-toggle').click();
  await settle(500);
  await calm();
  await shot(page, 'quick-result', {
    boxes: {
      panel: id('beautify-panel'),
      toggle: id('beautify-toggle'),
      backgrounds: id('beautify-bg-ocean'),
      copy: id('copy-image'),
      download: id('download-image'),
    },
  });
  await shot(page, 'beautify-panel', {
    area: id('right-panel'),
    boxes: {
      toggle: id('beautify-toggle'),
      bg: id('beautify-bg-ocean'),
      padding: id('beautify-padding'),
      radius: id('beautify-radius'),
      shadow: id('beautify-shadow'),
    },
  });

  // Xuất ảnh (Ctrl+Shift+S cũng có ở chế độ Screenshot).
  await page.keyboard.press('Control+Shift+S');
  await expect(id('export-dialog')).toBeVisible();
  await settle(900);
  await shot(page, 'export-dialog', {
    area: id('export-dialog'),
    pad: 12,
    boxes: {
      format: id('export-format-png'),
      beautify: id('export-beautify'),
      size: id('export-size'),
      estimate: id('export-estimate'),
      download: id('export-download'),
    },
  });
  await id('export-format-jpeg').click();
  await settle(900);
  await shot(page, 'export-dialog-jpg', {
    area: id('export-dialog'),
    pad: 12,
    boxes: { background: id('export-background') },
  });
  await closeMenus();

  // Tải bản sao lưu .paint: có vùng che nên hỏi áp dụng vĩnh viễn.
  const more = await openMenu('editor-menu');
  await calm();
  await shot(page, 'editor-menu-screenshot', { area: [more, id('editor-menu')], pad: 12 });
  await id('menu-export-paint').click();
  await expect(id('paint-export-dialog')).toBeVisible();
  await settle(300);
  await shot(page, 'paint-export-dialog', {
    area: id('paint-export-dialog'),
    pad: 12,
    boxes: { bake: id('paint-export-bake'), original: id('paint-export-original') },
  });
  await closeMenus();

  // Lưu ngay rồi xem trạng thái lưu.
  await page.keyboard.press('Control+s');
  await settle(800);
  await id('save-status').click();
  await settle(300);
  await shot(page, 'save-status', {
    area: [id('save-status'), id('save-status-details')],
    pad: 12,
    boxes: { now: id('save-now') },
  });
  await closeMenus();
});

// ---------------------------------------------------------------------------
// 2. Chế độ Paint: vẽ tranh nhiều layer
// ---------------------------------------------------------------------------

test('Paint: vẽ tranh nhiều layer', async () => {
  await leaveToHome();
  await settle(400);
  await id('preset-custom').click();
  await expect(id('new-image-dialog')).toBeVisible();
  await id('new-image-width').fill('1600');
  await id('new-image-height').fill('1000');
  await settle(200);
  await shot(page, 'new-image-dialog', { area: id('new-image-dialog'), pad: 12 });
  await id('new-image-create').click();
  await ready();
  await fit();

  // Trời: Gradient tuyến tính xanh → vàng nhạt.
  await color('#4DABF7', '#FFF3BF');
  await tool('gradient');
  await drag([
    [800, 0],
    [800, 720],
  ]);
  await waitIdle();

  // Mặt trời: layer mới, cọ mềm.
  await page.keyboard.press('Shift+N');
  await settle(200);
  await tool('brush');
  await options('brush', { preset: 'soft', size: 230, opacity: 1, hardness: 0.3 });
  await color('#FFD43B');
  await clickDoc(1180, 300);
  await options('brush', { preset: 'round', size: 120, hardness: 1 });
  await clickDoc(1180, 300);

  // Đồi: layer mới, Lasso rồi tô vùng chọn.
  await page.keyboard.press('Shift+N');
  await settle(200);
  await tool('lasso');
  await drag(
    [
      [0, 640],
      [220, 560],
      [480, 590],
      [760, 700],
      [1000, 760],
      [1000, 1000],
      [0, 1000],
      [0, 640],
    ],
    6,
  );
  await color('#40C057');
  await page.getByTestId('image-menu').click();
  await page.getByTestId('menu-selection.fill').click();
  await waitIdle();
  await page.keyboard.press('Control+d');
  await drag(
    [
      [560, 760],
      [900, 620],
      [1240, 600],
      [1600, 680],
      [1600, 1000],
      [520, 1000],
      [560, 760],
    ],
    6,
  );
  await color('#2F9E44');
  await page.getByTestId('image-menu').click();
  await page.getByTestId('menu-selection.fill').click();
  await waitIdle();
  await page.keyboard.press('Control+d');

  // Chim: cọ thư pháp.
  await tool('brush');
  await options('brush', { preset: 'calligraphy', size: 14 });
  await color('#343A40');
  for (const [x, y] of [
    [470, 330],
    [580, 270],
    [680, 350],
  ] as const) {
    await drag([
      [x - 30, y - 12],
      [x, y],
      [x + 30, y - 12],
    ]);
  }

  // Tiêu đề: chữ trên layer chú thích (tự tạo).
  await tool('text');
  await id('preset-text-title').click();
  await color('#1E293B');
  await clickDoc(90, 140);
  await typeText('Bình minh trên đồi');
  await commitText();
  await tool('select');
  await tool('brush');
  await options('brush', { preset: 'round', size: 24 });
  await page.keyboard.press('Escape');
  await calm();

  await shot(page, 'paint-overview', {
    boxes: {
      top: id('top-bar'),
      back: id('back-to-home'),
      name: id('project-name'),
      status: id('save-status'),
      undo: id('undo'),
      image: id('image-menu'),
      adjust: id('adjust-menu'),
      view: id('view-menu'),
      palette: id('palette-button'),
      copy: id('copy-image'),
      export: id('export-image'),
      more: id('editor-menu'),
      island: id('tool-island'),
      options: id('options-bar'),
      canvas: id('canvas-view'),
      panel: id('right-panel'),
      statusbar: id('status-bar'),
      zoom: id('zoom-level'),
    },
  });
  await shot(page, 'tool-island-paint', {
    area: id('tool-island'),
    pad: 6,
    boxes: {
      select: id('tool-select-variants'),
      crop: id('tool-crop'),
      pencil: id('tool-pencil'),
      brush: id('tool-brush'),
      eraser: id('tool-eraser'),
      fill: id('tool-fill-variants'),
      eyedropper: id('tool-eyedropper'),
      shapes: id('tool-shape-variants'),
      arrow: id('tool-arrow'),
      text: id('tool-text'),
      highlight: id('tool-highlight'),
      redact: id('tool-redact'),
      step: id('tool-step'),
      focus: id('tool-focus-variants'),
      pan: id('tool-pan'),
      zoom: id('tool-zoom'),
      color: id('color-control'),
    },
  });

  // Nút tách: các kiểu chọn và các hình khối.
  let menu = await openMenu('tool-select-variants');
  await shot(page, 'split-select-menu', { area: [menu, id('tool-island')], pad: 10 });
  await closeMenus();
  menu = await openMenu('tool-shape-variants');
  await shot(page, 'split-shape-menu', { area: [menu, id('tool-shape-variants')], pad: 10 });
  await closeMenus();
  menu = await openMenu('tool-fill-variants');
  await shot(page, 'split-fill-menu', { area: [menu, id('tool-fill-variants')], pad: 10 });
  await closeMenus();
  menu = await openMenu('tool-focus-variants');
  await shot(page, 'split-focus-menu', { area: [menu, id('tool-focus-variants')], pad: 10 });
  await closeMenus();

  // Tùy chọn cọ + nâng cao.
  await tool('brush');
  await id('options-advanced').click();
  await settle(300);
  const advanced = page.locator('[data-radix-popper-content-wrapper]').last();
  await shot(page, 'brush-options', {
    area: [id('options-bar'), advanced, id('tool-island')],
    pad: 10,
    boxes: {
      preset: id('option-preset'),
      size: id('option-size'),
      opacity: id('option-opacity'),
      hardness: id('option-hardness'),
      smoothing: id('option-smoothing'),
      advanced: id('options-advanced'),
      flow: id('option-flow'),
      pressure: id('option-pressure.size'),
    },
  });
  await closeMenus();

  // HUD cỡ cọ hiện khi nhấn ] [.
  await options('brush', { size: 90, hardness: 0.6 });
  const center = await at(760, 520);
  await page.mouse.move(center.x, center.y);
  await settle(200);
  await page.keyboard.press(']');
  await settle(120);
  await shot(page, 'brush-hud', {
    area: { x: center.x - 150, y: center.y - 120, width: 300, height: 250 },
  });
  await options('brush', { size: 24, hardness: 1 });

  // Bảng màu.
  await id('color-control').click();
  await expect(id('color-popover')).toBeVisible();
  await settle(300);
  await shot(page, 'color-popover', {
    area: [id('color-popover'), id('color-control')],
    pad: 10,
    boxes: {
      slots: id('color-slot-primary'),
      picker: id('hsv-picker'),
      eyedropper: id('pick-from-canvas'),
      add: id('add-custom-color'),
    },
  });
  await closeMenus();

  // Panel Layer.
  await calm();
  await shot(page, 'layers-panel', {
    area: id('right-panel'),
    boxes: {
      tabs: id('tab-layers'),
      list: id('layer-list'),
      visibility: id('layer-visibility'),
      lock: id('layer-lock'),
      drag: id('layer-drag'),
      opacity: id('layer-opacity'),
      blend: id('layer-blend'),
      alpha: id('layer-alpha-lock'),
      add: id('layer-add'),
      duplicate: id('layer-duplicate'),
      merge: id('layer-merge-down'),
      remove: id('layer-delete'),
      more: id('layer-menu'),
      objects: id('object-list'),
    },
  });
  menu = await openMenu('layer-menu');
  await shot(page, 'layers-more-menu', { area: [menu, id('layer-menu')], pad: 10 });
  await closeMenus();
  // Chọn layer đồi để xem chế độ hòa trộn.
  await page.getByTestId('layer-row').nth(1).getByTestId('layer-select').click();
  await settle(200);
  await id('layer-blend').click();
  await settle(300);
  await shot(page, 'blend-menu', {
    area: [page.locator('[role=menu]').last(), id('layer-blend')],
    pad: 10,
  });
  await closeMenus();

  // Layer chú thích + tool pixel → hỏi nơi vẽ.
  await page.getByTestId('layer-row').first().getByTestId('layer-select').click();
  await tool('brush');
  await drag([
    [300, 500],
    [400, 520],
  ]);
  await expect(id('paint-target-dialog')).toBeVisible();
  await settle(300);
  await shot(page, 'paint-target-dialog', { area: id('paint-target-dialog'), pad: 12 });
  await closeMenus();

  // Lịch sử.
  await id('tab-history').click();
  await settle(300);
  await calm();
  await shot(page, 'history-panel', {
    area: id('right-panel'),
    boxes: { list: id('history-list') },
  });
  await id('tab-layers').click();

  // Menu Ảnh, Điều chỉnh, Xem.
  await page.getByTestId('layer-row').nth(3).getByTestId('layer-select').click();
  menu = await openMenu('image-menu');
  await shot(page, 'image-menu', { area: [menu, id('image-menu')], pad: 10 });
  await closeMenus();
  menu = await openMenu('adjust-menu');
  await shot(page, 'adjust-menu', { area: [menu, id('adjust-menu')], pad: 10 });
  await closeMenus();
  menu = await openMenu('view-menu');
  await shot(page, 'view-menu', { area: [menu, id('view-menu')], pad: 10 });
  await closeMenus();

  // Bảng điều chỉnh Độ sáng/Tương phản trên layer nền.
  await page.getByTestId('adjust-menu').click();
  await page.getByTestId('menu-filter.brightnessContrast').click();
  await expect(id('adjust-panel')).toBeVisible();
  await id('filter-input-brightness-amount').fill('20');
  await id('filter-input-brightness-amount').press('Tab');
  await id('filter-input-contrast-amount').fill('15');
  await id('filter-input-contrast-amount').press('Tab');
  await settle(800);
  await calm();
  await shot(page, 'adjust-panel', {
    area: workspace,
    boxes: {
      panel: id('adjust-panel'),
      compare: id('adjust-compare'),
      reset: id('adjust-reset'),
      apply: id('adjust-apply'),
      cancel: id('adjust-cancel'),
    },
  });
  await id('adjust-cancel').click();
  await settle(300);

  // Đổi kích thước, kích thước khung.
  await page.getByTestId('image-menu').click();
  await page.getByTestId('menu-image.resize').click();
  await expect(id('resize-dialog')).toBeVisible();
  await settle(300);
  await shot(page, 'resize-dialog', {
    area: id('resize-dialog'),
    pad: 12,
    boxes: { ratio: id('resize-keep-ratio'), result: id('resize-result') },
  });
  await closeMenus();
  await page.getByTestId('image-menu').click();
  await page.getByTestId('menu-image.canvasSize').click();
  await expect(id('canvas-dialog')).toBeVisible();
  await settle(300);
  await shot(page, 'canvas-size-dialog', {
    area: id('canvas-dialog'),
    pad: 12,
    boxes: { anchor: id('canvas-anchor') },
  });
  await closeMenus();

  // Vùng chọn chữ nhật quanh mặt trời → mini toolbar.
  await page.getByTestId('layer-row').nth(2).getByTestId('layer-select').click();
  await tool('marquee-rect');
  await drag([
    [1020, 140],
    [1340, 460],
  ]);
  await calm();
  await shot(page, 'marquee-selection', {
    area: workspace,
    boxes: {
      mini: id('mini-toolbar'),
      options: id('options-bar'),
      status: id('status-selection'),
    },
  });
  await clickDoc(1180, 300, { button: 'right' });
  await expect(id('canvas-menu')).toBeVisible();
  await settle(300);
  await shot(page, 'selection-menu', { area: id('canvas-menu'), pad: 14 });
  await closeMenus();

  // Biến đổi vùng chọn (Shift+T).
  await page.keyboard.press('Shift+T');
  await settle(300);
  await calm();
  await shot(page, 'floating-transform', {
    area: workspace,
    boxes: {
      commit: id('floating-commit'),
      cancel: id('floating-cancel'),
      mini: id('mini-toolbar'),
    },
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+d');

  // Đũa thần trên bầu trời (layer nền).
  await page.getByTestId('layer-row').nth(3).getByTestId('layer-select').click();
  await tool('wand');
  await options('selection', { tolerance: 0.3 });
  await clickDoc(200, 60);
  await waitIdle();
  await calm();
  await shot(page, 'wand-selection', { area: workspace, boxes: { options: id('options-bar') } });
  await page.keyboard.press('Control+d');

  // Cắt xén.
  await tool('crop');
  await drag([
    [120, 80],
    [1480, 900],
  ]);
  await calm();
  await shot(page, 'crop-tool', { area: workspace, boxes: { options: id('options-bar') } });
  await page.keyboard.press('Escape');
  await tool('brush');

  // Menu chuột phải trên vùng trống.
  await clickDoc(400, 700, { button: 'right' });
  await expect(id('canvas-menu')).toBeVisible();
  await settle(300);
  await shot(page, 'canvas-menu', { area: id('canvas-menu'), pad: 14 });
  await closeMenus();

  // Thu phóng ở thanh trạng thái.
  await id('zoom-level').click();
  await settle(300);
  await shot(page, 'zoom-menu', {
    area: [page.locator('[role=menu]').last(), id('zoom-level')],
    pad: 10,
  });
  await closeMenus();

  // Menu Thêm thao tác.
  menu = await openMenu('editor-menu');
  await shot(page, 'editor-menu', { area: [menu, id('editor-menu')], pad: 10 });
  await closeMenus();

  // Lưới + thước đo.
  await page.getByTestId('view-menu').click();
  await id('menu-view-grid').click();
  await id('menu-view-rulers').click();
  await closeMenus();
  await calm();
  await shot(page, 'grid-rulers', { boxes: { rulers: id('rulers') } });
  await page.getByTestId('view-menu').click();
  await id('menu-view-grid').click();
  await id('menu-view-rulers').click();
  await closeMenus();

  // Zen mode.
  await page.keyboard.press('\\');
  await settle(400);
  await calm();
  await shot(page, 'zen-mode', { boxes: { exit: id('zen-exit') } });
  await page.keyboard.press('\\');
  await settle(300);

  // Command Palette.
  await page.keyboard.press('Control+k');
  await expect(id('command-palette')).toBeVisible();
  await settle(300);
  await shot(page, 'command-palette-all', { area: id('command-palette'), pad: 14 });
  await page.keyboard.type('lam mo', { delay: 20 });
  await settle(400);
  await shot(page, 'command-palette', { area: id('command-palette'), pad: 14 });
  await closeMenus();

  // Bảng phím tắt.
  // Mở qua menu: sau khi đóng palette, focus có thể còn ở ô nhập nên phím `?` không tới app.
  await page.getByTestId('editor-menu').click();
  await id('menu-shortcuts').click();
  await expect(id('shortcuts-dialog')).toBeVisible();
  await settle(300);
  await shot(page, 'shortcuts-dialog', { area: id('shortcuts-dialog'), pad: 12 });
  await closeMenus();

  // Cài đặt.
  await page.getByTestId('editor-menu').click();
  await id('menu-settings').click();
  await expect(id('settings-dialog')).toBeVisible();
  await settle(500);
  await shot(page, 'settings-dialog', { area: id('settings-dialog'), pad: 12 });
  await closeMenus();

  // Giao diện tối.
  await page.evaluate(() => {
    localStorage.setItem('paint-online:theme', 'dark');
  });
  await id('theme-menu-trigger').click();
  await page.getByRole('menuitemradio', { name: 'Tối' }).click();
  await settle(500);
  await calm();
  await shot(page, 'dark-theme');
  await id('theme-menu-trigger').click();
  await page.getByRole('menuitemradio', { name: 'Theo hệ thống' }).click();
  await settle(400);

  // Mở cùng project ở tab thứ hai → chỉ đọc.
  const url = page.url();
  const second = await page.context().newPage();
  await second.goto(url);
  await expect(second.getByTestId('read-only-banner')).toBeVisible({ timeout: 15_000 });
  await second.waitForTimeout(600);
  await second.mouse.move(720, 897);
  await second.waitForTimeout(300);
  const banner = await second.getByTestId('read-only-banner').boundingBox();
  if (banner) {
    await shot(second, 'read-only', {
      area: { x: 0, y: 0, width: 1440, height: banner.y + banner.height + 120 },
      boxes: {
        banner: second.getByTestId('read-only-banner'),
        take: second.getByTestId('take-over'),
      },
    });
  }
  await second.close();
});

// ---------------------------------------------------------------------------
// 3. Hình khối và chú thích trên một ảnh trống
// ---------------------------------------------------------------------------

test('Hình khối', async () => {
  await leaveToHome();
  await settle(300);
  await id('preset-custom').click();
  await id('new-image-width').fill('1400');
  await id('new-image-height').fill('760');
  await id('new-image-create').click();
  await ready();
  await fit();

  await deselect();
  await color('#1C7ED6', '#D0EBFF');
  await tool('rect');
  await deselect();
  await options('shape', {
    strokeWidth: 5,
    fill: true,
    cornerRadius: 18,
    dashed: false,
    shadow: true,
  });
  await drag([
    [80, 90],
    [380, 300],
  ]);
  await tool('ellipse');
  await deselect();
  await color('#E03131', '#FFE3E3');
  await deselect();
  await options('shape', { strokeWidth: 5, fill: true, dashed: true, shadow: false });
  await drag([
    [460, 90],
    [760, 300],
  ]);
  await tool('line');
  await deselect();
  await color('#2B8A3E');
  await deselect();
  await options('shape', { strokeWidth: 8, dashed: false, shadow: false });
  await drag([
    [840, 300],
    [1100, 100],
  ]);
  await tool('polygon');
  await deselect();
  await color('#F08C00', '#FFF3BF');
  await deselect();
  await options('shape', { strokeWidth: 5, fill: true, dashed: false });
  for (const [x, y] of [
    [1180, 300],
    [1250, 90],
    [1330, 300],
  ] as const) {
    await clickDoc(x, y);
  }
  await clickDoc(1180, 300);
  await tool('arrow');
  await deselect();
  await color('#5F3DC4');
  await deselect();
  await options('arrow', {
    strokeWidth: 7,
    head: 'triangle',
    bothEnds: false,
    dashed: false,
    shadow: false,
  });
  await drag([
    [100, 600],
    [520, 600],
  ]);
  // Uốn cong mũi tên bằng handle giữa.
  await drag([
    [310, 600],
    [310, 470],
  ]);
  await deselect();
  await options('arrow', { head: 'open', bothEnds: true });
  await deselect();
  await color('#0B7285');
  await drag([
    [640, 640],
    [960, 500],
  ]);
  await tool('step');
  await deselect();
  await color('#E03131');
  await clickDoc(1080, 560);
  await clickDoc(1170, 560);
  await clickDoc(1260, 560);
  await tool('select');
  await page.keyboard.press('Escape');
  await calm();
  await shot(page, 'shapes-demo', { area: await docRect(0, 0, 1400, 760) });

  // Đa giác đang vẽ dở (hiện các đỉnh).
  await tool('polygon');
  await clickDoc(300, 380);
  await clickDoc(420, 350);
  await clickDoc(470, 440);
  const hover = await at(380, 470);
  await page.mouse.move(hover.x, hover.y, { steps: 5 });
  await settle(200);
  await shot(page, 'polygon-drawing', {
    area: await docRect(200, 300, 380, 220),
  });
  await page.keyboard.press('Escape');

  // Mũi tên cong đang chọn: thấy handle giữa.
  await tool('select');
  await clickDoc(310, 520);
  await calm();
  await shot(page, 'arrow-curve', { area: await docRect(40, 400, 560, 260) });
  await page.keyboard.press('Escape');
});

// ---------------------------------------------------------------------------
// 4. Trang chủ với các project vừa tạo
// ---------------------------------------------------------------------------

test('Trang chủ', async () => {
  await leaveToHome();
  await expect(page.getByTestId('project-card')).toHaveCount(3, { timeout: 15_000 });
  // Nhân bản rồi chuyển một bản vào thùng rác để có ảnh thùng rác.
  await page.getByTestId('project-card').last().getByTestId('project-menu').click();
  await settle(200);
  await id('project-duplicate').click();
  await expect(page.getByTestId('project-card')).toHaveCount(4, { timeout: 15_000 });
  await settle(1500);
  await page.getByTestId('project-card').first().getByTestId('project-menu').click();
  await settle(200);
  await id('project-trash').click();
  await expect(page.getByTestId('project-card')).toHaveCount(3, { timeout: 15_000 });
  await settle(5500);
  await calm();
  await page.locator('main').evaluate((el) => {
    el.scrollTop = 0;
  });
  await shot(page, 'home', {
    boxes: {
      dropzone: id('drop-zone'),
      open: id('open-image'),
      presets: id('preset-full-hd'),
      custom: id('preset-custom'),
      clipboard: id('preset-clipboard'),
      palette: id('palette-button'),
      settings: id('settings-button'),
      theme: id('theme-menu-trigger'),
      projects: id('projects-section'),
    },
  });
  await page.locator('main').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await settle(300);
  await calm();
  await shot(page, 'home-projects', {
    area: id('projects-section'),
    pad: 12,
    boxes: {
      search: id('project-search'),
      sort: id('project-sort'),
      trash: id('open-trash'),
      card: id('project-card'),
      menu: id('project-menu'),
      meter: id('storage-meter'),
    },
  });
  await page.getByTestId('project-card').first().getByTestId('project-menu').click();
  await settle(300);
  await shot(page, 'home-card-menu', {
    area: [page.locator('[role=menu]').last(), page.getByTestId('project-card').first()],
    pad: 12,
  });
  await closeMenus();
  await id('open-trash').click();
  await expect(id('trash-view')).toBeVisible();
  await settle(300);
  await calm();
  await shot(page, 'home-trash', {
    area: id('trash-view'),
    pad: 12,
    boxes: { restore: id('trash-restore'), remove: id('trash-delete'), empty: id('empty-trash') },
  });
});
