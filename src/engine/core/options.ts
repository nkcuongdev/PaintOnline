import {
  REDACT_MAX_BLOCK,
  REDACT_MAX_BLUR,
  REDACT_MIN_BLOCK,
  REDACT_MIN_BLUR,
} from '../layers/objects/redactEffect';
import { MAGNIFIER_MAX_ZOOM, MAGNIFIER_MIN_ZOOM } from '../layers/objects/magnifier';
import { SPOTLIGHT_MAX_DIM, SPOTLIGHT_MIN_DIM } from '../layers/objects/spotlight';
import { STEP_MAX_RADIUS, STEP_MIN_RADIUS } from '../layers/objects/step';
import { isColor, normalizeColor } from '../utils/color';
import type { EventBus } from './EventBus';
import type {
  Color,
  ColorsState,
  EditorEvents,
  OptionGroupId,
  ToolId,
  ToolOptionsMap,
  ToolOptionsState,
} from './types';

// ---------------------------------------------------------------------------
// OptionSchema — sinh control UI (slider, select, toggle) và validate (mục 4.2, 5.3)
// ---------------------------------------------------------------------------

interface FieldBase<K extends string> {
  /** Tên thuộc tính; khóa lồng nhau viết dạng `pressure.size`. */
  key: K | `${K}.${string}`;
  /** Khóa trong `t.toolOptions` (UI tự dịch). */
  label: string;
  /** Hiện trong mục "Nâng cao" của Options bar thay vì trên thanh chính. */
  advanced?: boolean;
  /** Chỉ hiện với các tool này (vd. bo góc chỉ cho Rectangle). */
  onlyFor?: readonly ToolId[];
}

export interface SliderField<K extends string = string> extends FieldBase<K> {
  kind: 'slider';
  min: number;
  max: number;
  step: number;
  /** `percent`: giá trị 0..1 hiển thị dạng %; `px`: số pixel; `times`: hệ số (2×). */
  unit: 'px' | 'percent' | 'times';
  /** Thang logarit cho dải rộng (vd. kích thước 1–500 px). */
  scale?: 'linear' | 'log';
}

export interface SelectField<K extends string = string> extends FieldBase<K> {
  kind: 'select';
  choices: readonly { value: string | number; label: string }[];
  /** Lựa chọn là màu: UI hiển thị ô màu thay vì chữ. */
  swatches?: boolean;
}

export interface ToggleField<K extends string = string> extends FieldBase<K> {
  kind: 'toggle';
}

export type OptionField<K extends string = string> =
  SliderField<K> | SelectField<K> | ToggleField<K>;

export interface OptionSchema<O> {
  readonly fields: readonly OptionField<Extract<keyof O, string>>[];
}

/** Font cho chữ (mục 5.10): 3 font web tự host + font an toàn của hệ thống. */
export const TEXT_FONTS: readonly { value: string; label: string }[] = [
  { value: 'Inter Variable', label: 'fontInter' },
  { value: 'Patrick Hand', label: 'fontHand' },
  { value: 'JetBrains Mono Variable', label: 'fontMono' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Courier New', label: 'Courier New' },
];

/** Màu bút dạ quang (mục 2: highlight vẽ bằng multiply nên cần màu sáng). */
export const HIGHLIGHT_COLORS: readonly { value: Color; label: string }[] = [
  { value: '#FFE45CFF', label: 'highlightYellow' },
  { value: '#9BF28BFF', label: 'highlightGreen' },
  { value: '#8FD8FFFF', label: 'highlightBlue' },
  { value: '#FFA3D6FF', label: 'highlightPink' },
  { value: '#FFBE70FF', label: 'highlightOrange' },
];

export const DEFAULT_TOOL_OPTIONS: ToolOptionsState = {
  primary: '#000000FF',
  secondary: '#FFFFFFFF',
  recent: [],
  brush: {
    preset: 'round',
    size: 8,
    opacity: 1,
    flow: 1,
    hardness: 1,
    smoothing: 0,
    pressure: { size: true, opacity: false },
  },
  eraser: { size: 24, hardness: 1, opacity: 1 },
  bucket: { tolerance: 0.15, contiguous: true, sampleAll: false, expand: 1 },
  gradient: { kind: 'linear', toTransparent: false, opacity: 1 },
  shape: { strokeWidth: 4, fill: false, cornerRadius: 0, dashed: false, shadow: false },
  arrow: { strokeWidth: 6, head: 'triangle', bothEnds: false, dashed: false, shadow: false },
  text: {
    family: 'Inter Variable',
    size: 32,
    weight: 600,
    italic: false,
    align: 'left',
    background: false,
    outline: false,
  },
  highlight: { color: '#FFE45CFF' },
  redact: { mode: 'solid', blockSize: 16, blurRadius: 12 },
  step: { size: 18 },
  spotlight: { shape: 'rect', dim: 0.6 },
  magnifier: { zoom: 2, shape: 'ellipse' },
  selection: {
    mode: 'replace',
    feather: 0,
    antiAlias: true,
    tolerance: 0.15,
    contiguous: true,
    sampleAll: false,
  },
};

const percent = <K extends string>(key: K, label: string, min = 0.01): SliderField<K> => ({
  kind: 'slider',
  key,
  label,
  min,
  max: 1,
  step: 0.01,
  unit: 'percent',
});

const strokeWidth: SliderField<'strokeWidth'> = {
  kind: 'slider',
  key: 'strokeWidth',
  label: 'strokeWidth',
  min: 1,
  max: 60,
  step: 1,
  unit: 'px',
  scale: 'log',
};

/** Schema của các nhóm option — Options bar sinh control từ đây. */
export const OPTION_SCHEMAS: { readonly [G in OptionGroupId]?: OptionSchema<ToolOptionsMap[G]> } = {
  brush: {
    fields: [
      {
        kind: 'select',
        key: 'preset',
        label: 'preset',
        choices: [
          { value: 'round', label: 'presetRound' },
          { value: 'soft', label: 'presetSoft' },
          { value: 'marker', label: 'presetMarker' },
          { value: 'calligraphy', label: 'presetCalligraphy' },
        ],
      },
      {
        kind: 'slider',
        key: 'size',
        label: 'size',
        min: 1,
        max: 500,
        step: 1,
        unit: 'px',
        scale: 'log',
      },
      percent('opacity', 'opacity'),
      percent('hardness', 'hardness', 0),
      {
        kind: 'slider',
        key: 'smoothing',
        label: 'smoothing',
        min: 0,
        max: 60,
        step: 1,
        unit: 'px',
      },
      { ...percent('flow', 'flow'), advanced: true },
      { kind: 'toggle', key: 'pressure.size', label: 'pressureSize', advanced: true },
      { kind: 'toggle', key: 'pressure.opacity', label: 'pressureOpacity', advanced: true },
    ],
  },
  eraser: {
    fields: [
      {
        kind: 'slider',
        key: 'size',
        label: 'size',
        min: 1,
        max: 500,
        step: 1,
        unit: 'px',
        scale: 'log',
      },
      percent('opacity', 'opacity'),
      percent('hardness', 'hardness', 0),
    ],
  },
  bucket: {
    fields: [
      percent('tolerance', 'tolerance', 0),
      { kind: 'toggle', key: 'contiguous', label: 'contiguous' },
      { kind: 'toggle', key: 'sampleAll', label: 'sampleAll' },
      { kind: 'slider', key: 'expand', label: 'expand', min: 0, max: 2, step: 1, unit: 'px' },
    ],
  },
  gradient: {
    fields: [
      {
        kind: 'select',
        key: 'kind',
        label: 'gradientKind',
        choices: [
          { value: 'linear', label: 'gradientLinear' },
          { value: 'radial', label: 'gradientRadial' },
        ],
      },
      { kind: 'toggle', key: 'toTransparent', label: 'toTransparent' },
      percent('opacity', 'opacity'),
    ],
  },
  shape: {
    fields: [
      strokeWidth,
      { kind: 'toggle', key: 'fill', label: 'fill', onlyFor: ['rect', 'ellipse', 'polygon'] },
      {
        kind: 'slider',
        key: 'cornerRadius',
        label: 'cornerRadius',
        min: 0,
        max: 100,
        step: 1,
        unit: 'px',
        onlyFor: ['rect'],
      },
      { kind: 'toggle', key: 'dashed', label: 'dashed' },
      { kind: 'toggle', key: 'shadow', label: 'shadow' },
    ],
  },
  arrow: {
    fields: [
      strokeWidth,
      {
        kind: 'select',
        key: 'head',
        label: 'arrowHead',
        choices: [
          { value: 'triangle', label: 'headTriangle' },
          { value: 'open', label: 'headOpen' },
          { value: 'none', label: 'headNone' },
        ],
      },
      { kind: 'toggle', key: 'bothEnds', label: 'bothEnds' },
      { kind: 'toggle', key: 'dashed', label: 'dashed' },
      { kind: 'toggle', key: 'shadow', label: 'shadow' },
    ],
  },
  text: {
    fields: [
      { kind: 'select', key: 'family', label: 'font', choices: TEXT_FONTS },
      {
        kind: 'slider',
        key: 'size',
        label: 'size',
        min: 8,
        max: 300,
        step: 1,
        unit: 'px',
        scale: 'log',
      },
      {
        kind: 'select',
        key: 'weight',
        label: 'weight',
        choices: [
          { value: 400, label: 'weightRegular' },
          { value: 600, label: 'weightSemibold' },
          { value: 700, label: 'weightBold' },
        ],
      },
      {
        kind: 'select',
        key: 'align',
        label: 'align',
        choices: [
          { value: 'left', label: 'alignLeft' },
          { value: 'center', label: 'alignCenter' },
          { value: 'right', label: 'alignRight' },
        ],
      },
      { kind: 'toggle', key: 'italic', label: 'italic', advanced: true },
      { kind: 'toggle', key: 'background', label: 'textBackground' },
      { kind: 'toggle', key: 'outline', label: 'textOutline' },
    ],
  },
  highlight: {
    fields: [
      { kind: 'select', key: 'color', label: 'color', choices: HIGHLIGHT_COLORS, swatches: true },
    ],
  },
  redact: {
    fields: [
      {
        kind: 'select',
        key: 'mode',
        label: 'redactMode',
        choices: [
          { value: 'solid', label: 'redactSolid' },
          { value: 'pixelate', label: 'redactPixelate' },
          { value: 'blur', label: 'redactBlur' },
        ],
      },
      {
        kind: 'slider',
        key: 'blockSize',
        label: 'blockSize',
        min: REDACT_MIN_BLOCK,
        max: REDACT_MAX_BLOCK,
        step: 1,
        unit: 'px',
      },
      {
        kind: 'slider',
        key: 'blurRadius',
        label: 'blurRadius',
        min: REDACT_MIN_BLUR,
        max: REDACT_MAX_BLUR,
        step: 1,
        unit: 'px',
      },
    ],
  },
  step: {
    fields: [
      {
        kind: 'slider',
        key: 'size',
        label: 'stepSize',
        min: STEP_MIN_RADIUS,
        max: STEP_MAX_RADIUS,
        step: 1,
        unit: 'px',
      },
    ],
  },
  spotlight: {
    fields: [
      {
        kind: 'select',
        key: 'shape',
        label: 'spotlightShape',
        choices: [
          { value: 'rect', label: 'shapeRect' },
          { value: 'ellipse', label: 'shapeEllipse' },
        ],
      },
      {
        kind: 'slider',
        key: 'dim',
        label: 'dim',
        min: SPOTLIGHT_MIN_DIM,
        max: SPOTLIGHT_MAX_DIM,
        step: 0.01,
        unit: 'percent',
      },
    ],
  },
  magnifier: {
    fields: [
      {
        kind: 'slider',
        key: 'zoom',
        label: 'magnifierZoom',
        min: MAGNIFIER_MIN_ZOOM,
        max: MAGNIFIER_MAX_ZOOM,
        step: 0.25,
        unit: 'times',
      },
      {
        kind: 'select',
        key: 'shape',
        label: 'spotlightShape',
        choices: [
          { value: 'ellipse', label: 'shapeEllipse' },
          { value: 'rect', label: 'shapeRect' },
        ],
      },
    ],
  },
  selection: {
    fields: [
      {
        kind: 'select',
        key: 'mode',
        label: 'selectionMode',
        choices: [
          { value: 'replace', label: 'modeReplace' },
          { value: 'add', label: 'modeAdd' },
          { value: 'subtract', label: 'modeSubtract' },
          { value: 'intersect', label: 'modeIntersect' },
        ],
      },
      {
        kind: 'slider',
        key: 'feather',
        label: 'feather',
        min: 0,
        max: 100,
        step: 1,
        unit: 'px',
        onlyFor: ['marquee-rect', 'marquee-ellipse', 'lasso'],
      },
      {
        kind: 'toggle',
        key: 'antiAlias',
        label: 'antiAlias',
        onlyFor: ['marquee-ellipse', 'lasso'],
      },
      { ...percent('tolerance', 'tolerance', 0), onlyFor: ['wand'] },
      { kind: 'toggle', key: 'contiguous', label: 'contiguous', onlyFor: ['wand'] },
      { kind: 'toggle', key: 'sampleAll', label: 'sampleAll', onlyFor: ['wand'] },
    ],
  },
};

function roundToStep(value: number, field: SliderField): number {
  const clamped = Math.min(field.max, Math.max(field.min, value));
  const steps = Math.round((clamped - field.min) / field.step);
  // Khử sai số dấu phẩy động của bước 0,01.
  return Number((field.min + steps * field.step).toFixed(6));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate một bản vá theo schema: số bị kẹp và làm tròn theo bước, select phải nằm trong danh
 * sách, toggle phải là boolean. Khóa không có trong schema chỉ được nhận khi cùng kiểu với giá trị
 * hiện tại. Khóa lạ bị bỏ. Thuộc tính lồng nhau (`pressure`) được validate theo field `pressure.*`.
 */
export function validateOptions<O extends object>(
  current: Readonly<O>,
  patch: Readonly<Partial<O>>,
  schema: OptionSchema<O> | undefined,
): O {
  const fields = new Map<string, OptionField>(
    (schema?.fields ?? []).map((field) => [field.key, field as OptionField]),
  );
  return validateLevel(current, patch, fields, '') as O;
}

function validateLevel(
  current: Readonly<Record<string, unknown>>,
  patch: Readonly<object>,
  fields: ReadonlyMap<string, OptionField>,
  prefix: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in next) || value === undefined) continue;
    const path = prefix + key;
    const field = fields.get(path);
    const existing = next[key];
    if (field?.kind === 'slider') {
      if (typeof value === 'number' && Number.isFinite(value))
        next[key] = roundToStep(value, field);
    } else if (field?.kind === 'select') {
      if (field.choices.some((choice) => choice.value === value)) next[key] = value;
    } else if (field?.kind === 'toggle') {
      if (typeof value === 'boolean') next[key] = value;
    } else if (isRecord(existing)) {
      if (isRecord(value)) next[key] = validateLevel(existing, value, fields, `${path}.`);
    } else if (isSameShape(existing, value)) {
      next[key] = value;
    }
  }
  return next;
}

function isSameShape(a: unknown, b: unknown): boolean {
  if (a === null || b === null) return a === b || (a === null && typeof b === 'string');
  if (typeof a !== typeof b) return false;
  if (typeof a === 'number') return Number.isFinite(b);
  if (typeof a === 'string' && isColor(a)) return isColor(b);
  return true;
}

/** Giá trị của một field (khóa có thể lồng nhau, vd. `pressure.size`). */
export function readOptionField(values: unknown, key: string): unknown {
  let value: unknown = values;
  for (const part of key.split('.')) {
    if (!isRecord(value)) return undefined;
    value = value[part];
  }
  return value;
}

/** Bản vá đặt một field (khóa có thể lồng nhau) — giữ các thuộc tính anh em của nhánh lồng. */
export function optionFieldPatch(values: unknown, key: string, value: unknown): object {
  const parts = key.split('.');
  const build = (node: unknown, index: number): unknown => {
    const part = parts[index] ?? '';
    if (index === parts.length - 1) return { ...(isRecord(node) ? node : {}), [part]: value };
    const child = isRecord(node) ? node[part] : undefined;
    return { ...(isRecord(node) ? node : {}), [part]: build(child, index + 1) };
  };
  const root = build(values, 0) as Record<string, unknown>;
  // Chỉ trả về nhánh gốc bị đổi.
  const top = parts[0] ?? '';
  return { [top]: root[top] };
}

// ---------------------------------------------------------------------------
// OptionsAPI & ColorsAPI (mục 4.2) — Engine là nguồn sự thật
// ---------------------------------------------------------------------------

export interface OptionsAPI {
  get<K extends OptionGroupId>(group: K): Readonly<ToolOptionsMap[K]>;
  /** Validate + phát `toolOptionsChanged`. */
  set<K extends OptionGroupId>(group: K, patch: Partial<ToolOptionsMap[K]>): void;
  all(): Readonly<ToolOptionsMap>;
}

export interface SetColorOptions {
  /**
   * Thay đổi tạm thời (đang kéo trong bộ chọn màu): không ghi vào màu gần đây. Gọi lại không có
   * cờ này khi người dùng thả chuột.
   */
  transient?: boolean;
}

export interface ColorsAPI {
  readonly primary: Color;
  readonly secondary: Color;
  readonly recent: readonly Color[];
  setPrimary(color: Color, options?: SetColorOptions): void;
  setSecondary(color: Color, options?: SetColorOptions): void;
  swap(): void;
  state(): Readonly<ColorsState>;
}

const MAX_RECENT = 12;

/** Độ cứng mặc định theo preset brush: đổi preset mà không chỉ định độ cứng thì dùng giá trị này. */
const BRUSH_PRESET_HARDNESS: Readonly<Record<ToolOptionsMap['brush']['preset'], number>> = {
  round: 1,
  soft: 0.3,
  marker: 1,
  calligraphy: 1,
};

function withPresetDefaults<K extends OptionGroupId>(
  group: K,
  patch: Partial<ToolOptionsMap[K]>,
): Partial<ToolOptionsMap[K]> {
  if (group !== 'brush') return patch;
  const brushPatch = patch as Partial<ToolOptionsMap['brush']>;
  if (brushPatch.preset === undefined || brushPatch.hardness !== undefined) return patch;
  const hardness = BRUSH_PRESET_HARDNESS[brushPatch.preset] as number | undefined;
  if (hardness === undefined) return patch;
  return { ...brushPatch, hardness } as unknown as Partial<ToolOptionsMap[K]>;
}

const GROUPS: readonly OptionGroupId[] = [
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
];

export function createOptionsAPI(
  initial: Partial<ToolOptionsState> | undefined,
  events: EventBus<EditorEvents>,
): OptionsAPI {
  const defaults = DEFAULT_TOOL_OPTIONS;
  const state = {} as Record<OptionGroupId, object>;
  for (const group of GROUPS) {
    state[group] = validateOptions<object>(
      defaults[group],
      initial?.[group] ?? {},
      OPTION_SCHEMAS[group] as OptionSchema<object> | undefined,
    );
  }
  const typed = state as unknown as ToolOptionsMap;

  return {
    get(group) {
      return typed[group];
    },
    set(group, patch) {
      const schema = OPTION_SCHEMAS[group];
      const next = validateOptions(typed[group], withPresetDefaults(group, patch), schema);
      typed[group] = next;
      events.emit('toolOptionsChanged', { group, options: next });
    },
    all() {
      return typed;
    },
  };
}

export function createColorsAPI(
  initial: Partial<ToolOptionsState> | undefined,
  events: EventBus<EditorEvents>,
): ColorsAPI {
  const state: ColorsState = {
    primary: normalizeColor(initial?.primary ?? DEFAULT_TOOL_OPTIONS.primary) ?? '#000000FF',
    secondary: normalizeColor(initial?.secondary ?? DEFAULT_TOOL_OPTIONS.secondary) ?? '#FFFFFFFF',
    recent: (initial?.recent ?? []).flatMap((c) => normalizeColor(c) ?? []).slice(0, MAX_RECENT),
  };

  const emit = () => {
    events.emit('colorsChanged', { ...state, recent: [...state.recent] });
  };

  const remember = (color: Color) => {
    if (state.recent[0] === color) return false;
    state.recent = [color, ...state.recent.filter((c) => c !== color)].slice(0, MAX_RECENT);
    return true;
  };

  const set = (slot: 'primary' | 'secondary', color: Color, options?: SetColorOptions) => {
    const c = normalizeColor(color);
    if (!c) return;
    const changed = c !== state[slot];
    state[slot] = c;
    const remembered = options?.transient === true ? false : remember(c);
    if (changed || remembered) emit();
  };

  return {
    get primary() {
      return state.primary;
    },
    get secondary() {
      return state.secondary;
    },
    get recent() {
      return state.recent;
    },
    setPrimary(color, options) {
      set('primary', color, options);
    },
    setSecondary(color, options) {
      set('secondary', color, options);
    },
    swap() {
      [state.primary, state.secondary] = [state.secondary, state.primary];
      emit();
    },
    state() {
      return { ...state, recent: [...state.recent] };
    },
  };
}
