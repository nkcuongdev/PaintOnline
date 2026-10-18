import type {
  Color,
  PaintTargetKind,
  PaintTargetPolicy,
  ToolOptionsState,
} from '@/engine/core/types';
import type { ProjectRepository } from './projectRepo';
import { isColor, isPaintTargetPolicy, type AppSettings } from './schema';

/**
 * Cài đặt người dùng lưu bền vững (mục 4.2, 6.4): tool options + màu (debounce 1 s sau
 * `toolOptionsChanged`), bảng màu tùy chỉnh, lựa chọn layer đích đã nhớ. Đọc một lần lúc khởi
 * động và truyền vào `EditorDeps.initialOptions`; Engine validate lại theo OptionSchema.
 */

const SAVE_DEBOUNCE_MS = 1000;
const MAX_CUSTOM_COLORS = 20;

const OPTION_GROUPS = [
  'brush',
  'eraser',
  'bucket',
  'gradient',
  'shape',
  'arrow',
  'text',
  'highlight',
  'redact',
  'step',
  'spotlight',
  'magnifier',
  'selection',
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Lọc dữ liệu đọc từ DB: chỉ giữ cấu trúc đúng kiểu; giá trị từng trường do Engine validate. */
export function sanitizeToolOptions(value: unknown): Partial<ToolOptionsState> | undefined {
  if (!isPlainObject(value)) return undefined;
  const out: Record<string, unknown> = {};
  for (const group of OPTION_GROUPS) {
    if (isPlainObject(value[group])) out[group] = value[group];
  }
  if (isColor(value.primary)) out.primary = value.primary;
  if (isColor(value.secondary)) out.secondary = value.secondary;
  if (Array.isArray(value.recent)) out.recent = value.recent.filter(isColor).slice(0, 12);
  return out;
}

export function sanitizeSettings(raw: AppSettings | null): AppSettings {
  if (!raw || !isPlainObject(raw)) return { key: 'app' };
  const palette = Array.isArray(raw.customPalette)
    ? raw.customPalette.filter(isColor).slice(-MAX_CUSTOM_COLORS)
    : undefined;
  const policy: Partial<Record<PaintTargetKind, PaintTargetPolicy>> = {};
  if (isPlainObject(raw.paintPolicy)) {
    for (const kind of ['draw', 'modify'] as const) {
      const value = raw.paintPolicy[kind];
      if (isPaintTargetPolicy(value)) policy[kind] = value;
    }
  }
  return {
    key: 'app',
    toolOptions: sanitizeToolOptions(raw.toolOptions),
    customPalette: palette,
    paintPolicy: policy,
    persistRequested: raw.persistRequested === true,
    backupReminderDismissedAt:
      typeof raw.backupReminderDismissedAt === 'number' ? raw.backupReminderDismissedAt : undefined,
  };
}

export class SettingsStore {
  private current: AppSettings = { key: 'app' };
  private pending: Partial<Omit<AppSettings, 'key'>> = {};
  private timer = 0;

  constructor(private readonly repo: ProjectRepository | null) {}

  get value(): Readonly<AppSettings> {
    return this.current;
  }

  async load(): Promise<AppSettings> {
    if (!this.repo) return this.current;
    try {
      this.current = sanitizeSettings(await this.repo.getSettings());
    } catch {
      this.current = { key: 'app' };
    }
    return this.current;
  }

  /** Cập nhật (ghi trễ 1 s, gộp nhiều thay đổi liên tiếp). */
  update(patch: Partial<Omit<AppSettings, 'key'>>, options: { immediate?: boolean } = {}): void {
    this.current = { ...this.current, ...patch };
    this.pending = { ...this.pending, ...patch };
    window.clearTimeout(this.timer);
    if (options.immediate) {
      void this.flush();
      return;
    }
    this.timer = window.setTimeout(() => {
      void this.flush();
    }, SAVE_DEBOUNCE_MS);
  }

  setToolOptions(options: Partial<ToolOptionsState>): void {
    this.update({ toolOptions: options });
  }

  setCustomPalette(colors: readonly Color[]): void {
    this.update({ customPalette: [...colors] });
  }

  async flush(): Promise<void> {
    window.clearTimeout(this.timer);
    const patch = this.pending;
    this.pending = {};
    if (!this.repo || Object.keys(patch).length === 0) return;
    try {
      await this.repo.putSettings(patch);
    } catch {
      // Không ghi được cài đặt: giữ trong bộ nhớ, thử lại ở lần thay đổi sau.
      this.pending = { ...patch, ...this.pending };
    }
  }
}
