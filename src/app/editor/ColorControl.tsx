import { ArrowLeftRight, Pipette, Plus } from 'lucide-react';
import { useRef, useState, type SyntheticEvent } from 'react';
import { HsvaColorPicker } from 'react-colorful';
import { colorToHsva, cssHex, hsvaToColor, shortHex, type Hsva } from '@/app/shared/color';
import { IconButton } from '@/app/shared/IconButton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Editor } from '@/engine/core/Editor';
import type { Color } from '@/engine/core/types';
import { normalizeColor } from '@/engine/utils/color';
import { format, t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useDocumentStore } from '@/stores/document';
import { useSettingsStore } from '@/stores/settings';
import { useToolStore } from '@/stores/tool';

/** Bảng 20 màu cơ bản kiểu MS Paint. */
const PALETTE: readonly Color[] = [
  '#000000FF',
  '#7F7F7FFF',
  '#880015FF',
  '#ED1C24FF',
  '#FF7F27FF',
  '#FFF200FF',
  '#22B14CFF',
  '#00A2E8FF',
  '#3F48CCFF',
  '#A349A4FF',
  '#FFFFFFFF',
  '#C3C3C3FF',
  '#B97A57FF',
  '#FFAEC9FF',
  '#FFC90EFF',
  '#EFE4B0FF',
  '#B5E61DFF',
  '#99D9EAFF',
  '#7092BEFF',
  '#C8BFE7FF',
];

type Slot = 'primary' | 'secondary';

function Swatch({
  color,
  onPick,
  onContext,
  label,
}: {
  color: Color;
  onPick: (c: Color) => void;
  onContext: (c: Color) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={t.colors.setSecondaryHint}
      onClick={() => {
        onPick(color);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContext(color);
      }}
      className="bg-checker relative size-6 overflow-hidden rounded-md border border-foreground/10 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.15)] transition-transform hover:scale-110 focus-visible:scale-110"
    >
      <span className="absolute inset-0" style={{ background: cssHex(color) }} />
    </button>
  );
}

/**
 * Màu chính/phụ (mục 2, 7.2): bộ chọn HSV + alpha (react-colorful), mã hex, bảng màu, bảng màu
 * tùy chỉnh, màu gần đây và lấy màu từ ảnh. Mọi thay đổi đi qua `editor.pickColor` — Engine là nguồn
 * sự thật; màu mới cũng áp vào đối tượng/chữ đang chọn.
 */
export function ColorControl({ editor }: { editor: Editor }) {
  const colors = useToolStore((s) => s.colors);
  const editingText = useDocumentStore((s) => s.textEdit !== null);
  const custom = useSettingsStore((s) => s.customPalette);
  const addCustom = useSettingsStore((s) => s.addCustomColor);
  const removeCustom = useSettingsStore((s) => s.removeCustomColor);
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<Slot>('primary');
  const current = colors[slot];
  // Giữ HSV cục bộ: màu xám (s = 0) không mất sắc độ khi kéo tiếp.
  const [hsva, setHsva] = useState<Hsva>(() => colorToHsva(current));
  const [hex, setHex] = useState('');
  const [error, setError] = useState(false);
  const dragging = useRef(false);
  // Màu bên ngoài đổi (eyedropper, đổi chỗ, chọn ô màu): đồng bộ HSV ngay trong lúc render.
  const [synced, setSynced] = useState(current);
  if (synced !== current) {
    setSynced(current);
    if (hsvaToColor(hsva) !== current) setHsva(colorToHsva(current));
  }

  const pick = (target: Slot, color: Color, transient = false) => {
    editor.pickColor(target, color, { transient });
  };

  const submitHex = (e: SyntheticEvent) => {
    e.preventDefault();
    const raw = hex.trim();
    const normalized = normalizeColor(raw.startsWith('#') ? raw : `#${raw}`);
    if (!normalized) {
      setError(true);
      return;
    }
    setError(false);
    pick(slot, normalized);
    setHex('');
  };

  const commitDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    // Thả chuột: ghi màu vào "màu gần đây".
    pick(slot, hsvaToColor(hsva));
  };

  const alphaPercent = Math.round(hsva.a * 100);

  return (
    <div className="flex items-center gap-1.5 pr-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${t.colors.picker}: ${t.colors.primary} ${shortHex(colors.primary)}, ${t.colors.secondary} ${shortHex(colors.secondary)}`}
            data-testid="color-control"
            // Đang gõ chữ: mở bộ chọn màu không kết thúc phiên sửa (màu áp cho chữ đang gõ).
            onMouseDown={
              editingText
                ? (e) => {
                    e.preventDefault();
                  }
                : undefined
            }
            className="relative size-9 shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              className="bg-checker absolute right-0.5 bottom-0.5 size-5 overflow-hidden rounded-[5px] border border-foreground/15"
              aria-hidden="true"
            >
              <span className="block size-full" style={{ background: cssHex(colors.secondary) }} />
            </span>
            <span
              className="bg-checker absolute top-0.5 left-0.5 size-5 overflow-hidden rounded-[5px] border border-foreground/20 shadow-sm ring-2 ring-card"
              aria-hidden="true"
            >
              <span className="block size-full" style={{ background: cssHex(colors.primary) }} />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={10}
          className="w-80 p-3"
          data-testid="color-popover"
          onPointerUp={commitDrag}
          onPointerCancel={commitDrag}
        >
          <div
            className="mb-3 flex items-center gap-1.5"
            role="radiogroup"
            aria-label={t.colors.editing}
          >
            {(['primary', 'secondary'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={slot === s}
                data-testid={`color-slot-${s}`}
                onClick={() => {
                  setSlot(s);
                }}
                className={cn(
                  'flex h-8 flex-1 items-center gap-2 rounded-md px-2 text-xs whitespace-nowrap text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  slot === s ? 'bg-muted font-medium text-foreground' : 'hover:bg-accent',
                )}
              >
                <span className="bg-checker relative size-4 overflow-hidden rounded border border-foreground/20">
                  <span className="absolute inset-0" style={{ background: cssHex(colors[s]) }} />
                </span>
                {s === 'primary' ? t.colors.primary : t.colors.secondary}
              </button>
            ))}
            <IconButton
              size="sm"
              label={t.colors.swap}
              shortcut="X"
              icon={<ArrowLeftRight />}
              onClick={() => {
                editor.colors.swap();
              }}
            />
            <IconButton
              size="sm"
              label={t.colors.pickFromCanvas}
              shortcut="I"
              icon={<Pipette />}
              data-testid="pick-from-canvas"
              onClick={() => {
                setOpen(false);
                editor.tools.setActive('eyedropper');
              }}
            />
          </div>

          <div
            className="color-picker"
            data-testid="hsv-picker"
            onPointerDown={() => {
              dragging.current = true;
            }}
          >
            <HsvaColorPicker
              color={hsva}
              onChange={(next) => {
                setHsva(next);
                pick(slot, hsvaToColor(next), dragging.current);
              }}
            />
          </div>

          <form onSubmit={submitHex} className="mt-3 flex items-center gap-2">
            <label htmlFor="hex-input" className="text-xs text-muted-foreground">
              {t.colors.hex}
            </label>
            <input
              id="hex-input"
              value={hex}
              onChange={(e) => {
                setHex(e.target.value);
                setError(false);
              }}
              placeholder={shortHex(current)}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={error}
              className={cn(
                'h-8 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono text-xs uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring',
                error && 'border-destructive',
              )}
            />
            <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
              {t.colors.alpha} {alphaPercent}%
            </span>
          </form>
          {error && <p className="mt-1.5 text-xs text-destructive">{t.colors.hexInvalid}</p>}

          <p className="mt-3 mb-2 text-xs font-medium text-muted-foreground">{t.colors.palette}</p>
          <div className="grid grid-cols-10 gap-1">
            {PALETTE.map((c) => (
              <Swatch
                key={c}
                color={c}
                label={format(t.colors.pickPrimary, { color: shortHex(c) })}
                onPick={(color) => {
                  pick(slot, color);
                }}
                onContext={(color) => {
                  pick('secondary', color);
                }}
              />
            ))}
          </div>

          <div className="mt-3 mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">{t.colors.custom}</p>
            <IconButton
              size="sm"
              label={t.colors.addCustom}
              icon={<Plus />}
              data-testid="add-custom-color"
              onClick={() => {
                addCustom(current);
              }}
            />
          </div>
          {custom.length === 0 ? (
            <p className="text-[0.6875rem] text-muted-foreground">{t.colors.customEmpty}</p>
          ) : (
            <div className="grid grid-cols-10 gap-1" title={t.colors.removeCustom}>
              {custom.map((c) => (
                <Swatch
                  key={c}
                  color={c}
                  label={format(t.colors.pickPrimary, { color: shortHex(c) })}
                  onPick={(color) => {
                    pick(slot, color);
                  }}
                  onContext={removeCustom}
                />
              ))}
            </div>
          )}

          {colors.recent.length > 0 && (
            <>
              <p className="mt-3 mb-2 text-xs font-medium text-muted-foreground">
                {t.colors.recent}
              </p>
              <div className="grid grid-cols-10 gap-1">
                {colors.recent.slice(0, 10).map((c) => (
                  <Swatch
                    key={c}
                    color={c}
                    label={format(t.colors.pickPrimary, { color: shortHex(c) })}
                    onPick={(color) => {
                      pick(slot, color);
                    }}
                    onContext={(color) => {
                      pick('secondary', color);
                    }}
                  />
                ))}
              </div>
            </>
          )}
          <p className="mt-3 text-[0.6875rem] text-muted-foreground">{t.colors.setSecondaryHint}</p>
        </PopoverContent>
      </Popover>
      <IconButton
        size="sm"
        label={t.colors.swap}
        shortcut="X"
        icon={<ArrowLeftRight />}
        onClick={() => {
          editor.colors.swap();
        }}
      />
    </div>
  );
}
