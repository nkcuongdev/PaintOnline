import type { Rect, TextFont } from '../../core/types';
import type { MemoryBudget } from '../../memory/MemoryBudget';
import { createSurface, type Surface } from '../../memory/surfaces';
import { invalidateTextLayouts } from './text';
import { fontCss } from './textLayout';
import type { BackdropSource, ObjectEnv } from './types';

/**
 * Môi trường vẽ đối tượng của một Editor: một canvas 1×1 để đo chữ, và tải font web lười —
 * chờ `document.fonts.load()` để không đo sai kích thước (mục 5.10). Khi font tải xong, mọi bố cục
 * chữ được đo lại và `onFontLoaded` báo Editor vẽ lại.
 */
export class ObjectEnvironment implements ObjectEnv {
  private surface: Surface | null = null;
  private lastFont = '';
  private readonly requested = new Set<string>();
  /** Editor gắn sau khi tạo (cần document và Compositor). */
  documentBounds?: () => Rect | null;
  backdrop?: BackdropSource;

  constructor(
    private readonly memory: MemoryBudget,
    private readonly onFontLoaded: () => void,
  ) {}

  readonly measure = (font: string, text: string): number => {
    this.surface ??= createSurface(this.memory, 1, 1, 'fixed');
    const ctx = this.surface.ctx;
    if (this.lastFont !== font) {
      ctx.font = font;
      this.lastFont = font;
    }
    return ctx.measureText(text).width;
  };

  ensureFont(font: Readonly<TextFont>, sample: string): void {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts) return;
    const css = fontCss(font);
    // Mỗi subset unicode (latin, vietnamese…) có file riêng: khóa theo font + các khối 256 ký tự.
    const blocks = new Set(Array.from(sample, (c) => (c.codePointAt(0) ?? 0) >> 8));
    const key = `${css}|${[...blocks].sort((a, b) => a - b).join(',')}`;
    if (this.requested.has(key)) return;
    this.requested.add(key);
    let ready: boolean;
    try {
      ready = fonts.check(css, sample || 'a');
    } catch {
      ready = true;
    }
    if (ready) return;
    fonts.load(css, sample || 'a').then(
      (loaded) => {
        if (loaded.length === 0) return;
        invalidateTextLayouts();
        this.lastFont = '';
        this.onFontLoaded();
      },
      () => {
        // Font không tải được: tiếp tục dùng font dự phòng.
      },
    );
  }

  dispose(): void {
    this.surface?.release();
    this.surface = null;
  }
}
