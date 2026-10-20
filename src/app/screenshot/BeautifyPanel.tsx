import { Slider } from '@/components/ui/slider';
import type { Editor } from '@/engine/core/Editor';
import type { BeautifyBackground, BeautifySettings } from '@/engine/core/types';
import {
  BEAUTIFY_BACKGROUNDS,
  BEAUTIFY_MAX_PADDING,
  BEAUTIFY_MAX_RADIUS,
} from '@/engine/render/beautify';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useDocumentStore } from '@/stores/document';

const BACKGROUNDS = Object.keys(BEAUTIFY_BACKGROUNDS) as BeautifyBackground[];

/** CSS xem trước của một nền (gradient chéo như khi vẽ). */
function swatchStyle(id: BeautifyBackground): React.CSSProperties | undefined {
  const colors = BEAUTIFY_BACKGROUNDS[id];
  if (!colors) return undefined;
  if (colors.length === 1) return { background: colors[0] };
  return { background: `linear-gradient(135deg, ${colors.join(', ')})` };
}

function Toggle({
  label,
  on,
  testId,
  onChange,
}: {
  label: string;
  on: boolean;
  testId: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      data-testid={testId}
      onClick={() => {
        onChange(!on);
      }}
      className="flex w-full items-center justify-between gap-3 rounded-md py-1 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
      <span
        aria-hidden="true"
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          on ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0 size-4 rounded-full bg-white shadow-sm transition-transform',
            on ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}

function Labeled({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">{value}</span>
      </div>
      {children}
    </div>
  );
}

/**
 * Panel "Làm đẹp" (mục 7.3 — GĐ7): khung nền gradient quanh ảnh, khoảng nền, bo góc, bóng. Mỗi thay
 * đổi là một Command (kéo slider liên tục gộp một bước), lưu cùng project và áp khi Copy/Tải
 * xuống/Xuất ảnh. Đổi bất kỳ tùy chọn nào khi đang tắt sẽ bật khung.
 */
export function BeautifyPanel({ editor }: { editor: Editor }) {
  const current = useDocumentStore((s) => s.doc?.beautify ?? null);
  // Giá trị hiển thị khi đang tắt: lần bật gần nhất, hoặc mặc định.
  const shown = current ?? editor.beautify.preferred;
  const enabled = current !== null;

  const update = (patch: Partial<BeautifySettings>) => {
    const wasOff = !enabled;
    editor.beautify.set({ ...shown, ...patch });
    // Vừa bật: vừa khung để thấy cả khung nền.
    if (wasOff) editor.viewport.fit();
  };

  return (
    <div
      className="flex flex-col gap-4 overflow-y-auto px-3 pt-1 pb-4"
      data-testid="beautify-panel"
    >
      <div className="flex flex-col gap-1">
        <Toggle
          label={t.beautify.enable}
          on={enabled}
          testId="beautify-toggle"
          onChange={(on) => {
            if (on) update({});
            else editor.beautify.set(null);
          }}
        />
        <p className="text-xs text-muted-foreground">
          {enabled ? t.beautify.enabledHint : t.beautify.disabledHint}
        </p>
      </div>

      {/* Đang tắt: điều khiển vẫn dùng được (đổi bất kỳ mục nào sẽ bật khung) nên không làm mờ chữ. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t.beautify.background}</legend>
        <div
          role="radiogroup"
          aria-label={t.beautify.background}
          className="grid grid-cols-4 gap-2"
        >
          {BACKGROUNDS.map((id) => {
            const checked = shown.background === id;
            const name = t.beautify.backgrounds[id];
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={name}
                title={name}
                data-testid={`beautify-bg-${id}`}
                onClick={() => {
                  update({ background: id });
                }}
                className={cn(
                  'h-9 rounded-md border border-foreground/10 outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  id === 'transparent' && 'bg-checker',
                  checked && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
                )}
                style={swatchStyle(id)}
              />
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-4">
        <Labeled label={t.beautify.padding} value={`${String(shown.padding)} px`}>
          <Slider
            aria-label={t.beautify.padding}
            data-testid="beautify-padding"
            min={0}
            max={BEAUTIFY_MAX_PADDING}
            step={4}
            value={[shown.padding]}
            onValueChange={(values) => {
              const padding = values.at(0);
              if (padding !== undefined) update({ padding });
            }}
          />
        </Labeled>
        <Labeled label={t.beautify.radius} value={`${String(shown.radius)} px`}>
          <Slider
            aria-label={t.beautify.radius}
            data-testid="beautify-radius"
            min={0}
            max={BEAUTIFY_MAX_RADIUS}
            step={1}
            value={[shown.radius]}
            onValueChange={(values) => {
              const radius = values.at(0);
              if (radius !== undefined) update({ radius });
            }}
          />
        </Labeled>
        <Toggle
          label={t.beautify.shadow}
          on={shown.shadow}
          testId="beautify-shadow"
          onChange={(shadow) => {
            update({ shadow });
          }}
        />
      </div>
    </div>
  );
}
