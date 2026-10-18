import { Check, ChevronDown, SlidersHorizontal, Trash2, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from '@/app/shared/IconButton';
import { formatShortcut } from '@/app/shared/shortcut';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import type { Editor } from '@/engine/core/Editor';
import {
  OPTION_SCHEMAS,
  optionFieldPatch,
  readOptionField,
  type OptionField,
  type SliderField,
} from '@/engine/core/options';
import type { AnnotationObject, OptionGroupId, ToolId } from '@/engine/core/types';
import { styleGroupOf, styleOf } from '@/engine/layers/objects/style';
import { getToolDefinition, SELECT_TOOLS } from '@/engine/tools/registry';
import { Button } from '@/components/ui/button';
import { format, t } from '@/i18n';
import { cn } from '@/lib/utils';
import { platformFeatures } from '@/services/platform/features';
import { useDocumentStore } from '@/stores/document';
import { useToolStore } from '@/stores/tool';
import { StylePresets } from './StylePresets';
import { presetKindForObjects, presetKindForTool } from './presets';

const SLIDER_STEPS = 1000;
/** Select có nhiều lựa chọn hơn số này hiển thị dạng menu thả xuống thay vì nút liền nhau. */
const INLINE_CHOICES = 4;

/** Vị trí slider (0..1000) ↔ giá trị, hỗ trợ thang log cho dải rộng (kích thước 1–500 px). */
function toPosition(field: SliderField, value: number): number {
  if (field.scale === 'log') {
    const min = Math.log(field.min);
    const max = Math.log(field.max);
    return Math.round(((Math.log(Math.max(field.min, value)) - min) / (max - min)) * SLIDER_STEPS);
  }
  return Math.round(((value - field.min) / (field.max - field.min)) * SLIDER_STEPS);
}

function fromPosition(field: SliderField, position: number): number {
  const p = position / SLIDER_STEPS;
  if (field.scale === 'log') {
    return Math.exp(Math.log(field.min) + p * (Math.log(field.max) - Math.log(field.min)));
  }
  return field.min + p * (field.max - field.min);
}

const TIMES = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

function display(field: SliderField, value: number): string {
  if (field.unit === 'percent') return `${String(Math.round(value * 100))}%`;
  if (field.unit === 'times') return `${TIMES.format(value)}×`;
  return `${String(Math.round(value))} px`;
}

function label(key: string): string {
  return (t.toolOptions as Record<string, string>)[key] ?? key;
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: OptionField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = `opt-${field.key.replace('.', '-')}`;
  if (field.kind === 'slider') {
    const v = typeof value === 'number' ? value : field.min;
    return (
      <div className="flex items-center gap-2.5" data-testid={`option-${field.key}`}>
        <label htmlFor={id} className="whitespace-nowrap text-muted-foreground">
          {label(field.label)}
        </label>
        <Slider
          id={id}
          className="w-20 xl:w-28"
          min={0}
          max={SLIDER_STEPS}
          step={1}
          value={[toPosition(field, v)]}
          aria-label={label(field.label)}
          aria-valuetext={display(field, v)}
          onValueChange={(values) => {
            onChange(fromPosition(field, values[0] ?? toPosition(field, v)));
          }}
        />
        <span className="w-12 text-right font-medium tabular-nums">{display(field, v)}</span>
      </div>
    );
  }
  if (field.kind === 'select' && field.choices.length > INLINE_CHOICES && !field.swatches) {
    const current = field.choices.find((choice) => choice.value === value);
    // Font hiển thị bằng chính font đó để dễ chọn.
    const preview = (v: string | number) =>
      field.key === 'family' ? { fontFamily: `"${String(v)}"` } : undefined;
    return (
      <div className="flex items-center gap-2" data-testid={`option-${field.key}`}>
        <span className="whitespace-nowrap text-muted-foreground">{label(field.label)}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${label(field.label)}: ${current ? label(current.label) : ''}`}
              className="flex h-7 items-center gap-1 rounded-md bg-muted px-2.5 font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              style={current ? preview(current.value) : undefined}
            >
              {current ? label(current.label) : ''}
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={8}>
            <DropdownMenuRadioGroup
              value={String(value)}
              onValueChange={(next) => {
                const choice = field.choices.find((c) => String(c.value) === next);
                if (choice) onChange(choice.value);
              }}
            >
              {field.choices.map((choice) => (
                <DropdownMenuRadioItem
                  key={String(choice.value)}
                  value={String(choice.value)}
                  style={preview(choice.value)}
                >
                  {label(choice.label)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }
  if (field.kind === 'select') {
    return (
      <div
        className="flex items-center gap-2"
        role="radiogroup"
        aria-label={label(field.label)}
        data-testid={`option-${field.key}`}
      >
        <span className="whitespace-nowrap text-muted-foreground">{label(field.label)}</span>
        <div className="flex rounded-lg bg-muted p-0.5">
          {field.choices.map((choice) => {
            const checked = value === choice.value;
            const text = label(choice.label);
            return (
              <button
                key={String(choice.value)}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={field.swatches ? text : undefined}
                title={field.swatches ? text : undefined}
                onClick={() => {
                  onChange(choice.value);
                }}
                className={cn(
                  'h-7 rounded-md px-2.5 text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  checked && 'bg-card font-medium text-foreground shadow-sm',
                  field.swatches && 'flex w-8 items-center justify-center px-0',
                )}
              >
                {field.swatches ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-4 rounded-full border border-foreground/15',
                      checked && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
                    )}
                    style={{ background: `#${String(choice.value).slice(1)}` }}
                  />
                ) : (
                  text
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  const on = value === true;
  return (
    <button
      type="button"
      aria-pressed={on}
      data-testid={`option-${field.key}`}
      onClick={() => {
        onChange(!on);
      }}
      className={cn(
        'h-7 rounded-md px-2.5 whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
        on && 'bg-primary-soft font-medium text-primary-soft-foreground hover:bg-primary-soft',
      )}
    >
      {label(field.label)}
    </button>
  );
}

/** Field áp dụng cho tool (và preset brush) hiện tại. */
function visibleFields(
  group: OptionGroupId,
  tool: ToolId | null,
  values: Record<string, unknown>,
): OptionField[] {
  const schema = OPTION_SCHEMAS[group];
  if (!schema) return [];
  return (schema.fields as readonly OptionField[]).filter((f) => {
    if (tool && f.onlyFor && !f.onlyFor.includes(tool)) return false;
    if (group === 'brush') {
      // Lưu lượng chỉ có nghĩa với nét stamp; độ cứng không áp dụng cho marker/thư pháp.
      if (f.key === 'flow' && values.preset === 'round') return false;
      if (f.key === 'hardness' && (values.preset === 'marker' || values.preset === 'calligraphy')) {
        return false;
      }
    }
    // Che thông tin: cỡ ô chỉ cho Khảm, độ mờ chỉ cho Làm mờ.
    if (group === 'redact') {
      if (f.key === 'blockSize') return values.mode === 'pixelate';
      if (f.key === 'blurRadius') return values.mode === 'blur';
    }
    return true;
  });
}

function Fields({
  fields,
  values,
  onChange,
}: {
  fields: readonly OptionField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const main = fields.filter((f) => !f.advanced);
  const advanced = fields.filter((f) => f.advanced);
  return (
    <>
      {main.map((field) => (
        <FieldControl
          key={field.key}
          field={field}
          value={readOptionField(values, field.key)}
          onChange={(value) => {
            onChange(field.key, value);
          }}
        />
      ))}
      {advanced.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <IconButton
              size="sm"
              label={t.toolOptions.advanced}
              icon={<SlidersHorizontal />}
              data-testid="options-advanced"
            />
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={10}
            className="flex w-auto flex-col items-start gap-2 p-3"
          >
            {advanced.map((field) => (
              <FieldControl
                key={field.key}
                field={field}
                value={readOptionField(values, field.key)}
                onChange={(value) => {
                  onChange(field.key, value);
                }}
              />
            ))}
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}

/** Tool có thể sửa thuộc tính đối tượng đang chọn (Select và các tool tạo đối tượng). */
/**
 * Hiện thuộc tính đối tượng đang chọn thay cho option của tool: ở tool Chọn, hoặc ở tool tạo đúng
 * loại đó (vừa vẽ xong chỉnh ngay). Đổi sang tool khác (vd. vẽ khung rồi nhấn K) thì hiện option
 * của tool mới.
 */
function editsObjects(tool: ToolId, objects: readonly AnnotationObject[]): boolean {
  if (tool === 'select') return true;
  const def = getToolDefinition(tool);
  if (!def.layerKinds.includes('vector')) return false;
  return objects.every((o) => styleGroupOf(o) === def.optionGroup);
}

function ObjectFields({
  editor,
  objects,
}: {
  editor: Editor;
  objects: readonly AnnotationObject[];
}) {
  // Chỉ hiển thị khi có ít nhất một đối tượng đang chọn.
  const first = objects[0];
  const group = styleGroupOf(first);
  const sameGroup = group !== null && objects.every((o) => styleGroupOf(o) === group);
  const values = sameGroup ? (styleOf(first) as Record<string, unknown>) : {};
  const tool = objects.every((o) => o.type === first.type) ? toolOf(first) : null;
  const presets = presetKindForObjects(objects);
  const blurWarning = objects.some((o) => o.type === 'redact' && o.mode === 'blur');
  return (
    <>
      <span className="font-medium whitespace-nowrap" data-testid="object-props">
        {objects.length === 1
          ? toolNameOf(first)
          : format(t.toolOptions.objectsSelected, { count: objects.length })}
      </span>
      {presets && <StylePresets editor={editor} kind={presets} />}
      {group !== null && sameGroup && (
        <Fields
          fields={visibleFields(group, tool, values)}
          values={values}
          onChange={(key, value) => {
            editor.objects.applyStyle(group, optionFieldPatch(values, key, value));
          }}
        />
      )}
      {blurWarning && <BlurWarning />}
      <IconButton
        size="sm"
        label={t.toolOptions.deleteObject}
        shortcut="Delete"
        icon={<Trash2 />}
        data-testid="delete-object"
        onClick={() => {
          editor.objects.deleteSelected();
        }}
      />
    </>
  );
}

/** Mục 5.4: làm mờ nhẹ có thể bị khôi phục một phần — nhắc dùng Tô kín cho thông tin nhạy cảm. */
function BlurWarning() {
  return (
    <span
      className="flex items-center gap-1 truncate text-warning"
      role="note"
      data-testid="redact-blur-warning"
    >
      <TriangleAlert className="size-3.5 shrink-0" />
      {t.toolOptions.redactBlurWarning}
    </span>
  );
}

/** Loại đối tượng do tool cùng tên tạo ra. */
const OBJECT_TOOLS: readonly ToolId[] = [
  'rect',
  'ellipse',
  'line',
  'arrow',
  'polygon',
  'text',
  'highlight',
  'redact',
  'step',
  'spotlight',
  'magnifier',
];

function toolOf(object: AnnotationObject): ToolId | null {
  return OBJECT_TOOLS.includes(object.type) ? object.type : null;
}

function toolNameOf(object: AnnotationObject): string {
  const tool = toolOf(object);
  return tool ? t.tools[tool] : t.toolOptions.objectLabel;
}

const HINTS: Partial<Record<ToolId, string>> = {
  pencil: t.toolOptions.pencilHint,
  pan: t.toolOptions.panHint,
  zoom: t.toolOptions.zoomHint,
  select: t.toolOptions.selectHint,
  eyedropper: t.toolOptions.eyedropperHint,
  redact: t.toolOptions.redactHint,
  step: t.toolOptions.stepHint,
  spotlight: t.toolOptions.spotlightHint,
  magnifier: t.toolOptions.magnifierHint,
  'marquee-rect': t.toolOptions.selectionHint,
  'marquee-ellipse': t.toolOptions.selectionHint,
  lasso: t.toolOptions.selectionHint,
  wand: t.toolOptions.wandHint,
  crop: t.toolOptions.cropHint,
  gradient: t.toolOptions.gradientHint,
};

/** Đang có pixel nổi: Áp dụng (Enter) / Hủy (Esc) — mục 5.7. */
function FloatingControls({ editor }: { editor: Editor }) {
  return (
    <>
      <span className="truncate text-muted-foreground">{t.toolOptions.floatingHint}</span>
      <Button
        size="xs"
        data-testid="floating-commit"
        onClick={() => {
          editor.selection.commit();
        }}
      >
        <Check />
        {t.menu.commitTransform}
      </Button>
      <Button
        size="xs"
        variant="ghost"
        data-testid="floating-cancel"
        onClick={() => {
          editor.selection.cancel();
        }}
      >
        <X />
        {t.menu.cancelTransform}
      </Button>
    </>
  );
}

/**
 * Options bar (mục 7.2): sinh tự động từ OptionSchema của tool đang hoạt động; khi có đối tượng
 * vector đang chọn, hiển thị và sửa thuộc tính của đối tượng đó. Mỗi thay đổi gọi Editor API —
 * Engine validate rồi phát sự kiện về store.
 */
export function OptionsBar({ editor }: { editor: Editor }) {
  const tool = useToolStore((s) => s.selected);
  const options = useToolStore((s) => s.options);
  const selection = useDocumentStore((s) => s.selection);
  const textEdit = useDocumentStore((s) => s.textEdit);
  const floating = useDocumentStore((s) => s.pixelSelection?.floating === true);

  let content: ReactNode;
  if (textEdit) {
    const values = options.text as unknown as Record<string, unknown>;
    content = (
      <>
        <Fields
          fields={visibleFields('text', 'text', values)}
          values={values}
          onChange={(key, value) => {
            editor.options.set('text', optionFieldPatch(values, key, value));
          }}
        />
        <span className="text-muted-foreground">
          {format(t.toolOptions.textEditing, {
            shortcut: formatShortcut('Mod+Enter', platformFeatures.isApple),
          })}
        </span>
      </>
    );
  } else if (floating && SELECT_TOOLS.includes(tool)) {
    content = <FloatingControls editor={editor} />;
  } else if (selection.objects.length > 0 && editsObjects(tool, selection.objects)) {
    content = <ObjectFields editor={editor} objects={selection.objects} />;
  } else {
    const group = getToolDefinition(tool).optionGroup;
    const values = group ? (options[group] as unknown as Record<string, unknown>) : {};
    const fields = group ? visibleFields(group, tool, values) : [];
    const blurWarning = tool === 'redact' && values.mode === 'blur';
    const hint = blurWarning ? null : tool === 'polygon' ? t.toolOptions.polygonHint : HINTS[tool];
    const presets = presetKindForTool(tool);
    content = (
      <>
        {presets && <StylePresets editor={editor} kind={presets} />}
        {group && fields.length > 0 && (
          <Fields
            fields={fields}
            values={values}
            onChange={(key, value) => {
              editor.options.set(group, optionFieldPatch(values, key, value));
            }}
          />
        )}
        {blurWarning && <BlurWarning />}
        {hint && <span className="truncate text-muted-foreground">{hint}</span>}
      </>
    );
  }

  return (
    <div
      role="group"
      aria-label={t.editor.optionsLabel}
      data-testid="options-bar"
      // Đang gõ chữ: bấm control không lấy focus khỏi ô gõ (Safari không focus nút khi click nên
      // ô gõ sẽ mất focus và kết thúc phiên sửa) — thay đổi áp ngay cho chữ đang gõ.
      onMouseDown={
        textEdit
          ? (e) => {
              e.preventDefault();
            }
          : undefined
      }
      className="surface-glass pointer-events-auto flex h-10 max-w-full shrink-0 [scrollbar-width:none] items-center gap-3.5 overflow-x-auto rounded-xl px-3.5 whitespace-nowrap shadow-island xl:gap-4 [&::-webkit-scrollbar]:hidden"
    >
      {content}
    </div>
  );
}
