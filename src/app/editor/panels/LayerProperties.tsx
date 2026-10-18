import { ChevronDown, Grid2x2Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Slider } from '@/components/ui/slider';
import type { Editor } from '@/engine/core/Editor';
import { BLEND_MODES, type BlendMode, type LayerSummary } from '@/engine/core/types';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

/** Nhóm blend mode như các app vẽ phổ biến: thường · tối · sáng · tương phản · so sánh · màu. */
const BLEND_GROUPS: readonly (readonly BlendMode[])[] = [
  ['normal'],
  ['multiply', 'darken', 'color-burn'],
  ['screen', 'lighten', 'color-dodge'],
  ['overlay', 'soft-light', 'hard-light'],
  ['difference', 'exclusion'],
  ['hue', 'saturation', 'color', 'luminosity'],
];

/** Thuộc tính của layer hoạt động: opacity, blend mode (16 mode — mục 5.4), khóa trong suốt. */
export function LayerProperties({
  editor,
  layer,
  disabled,
}: {
  editor: Editor;
  layer: LayerSummary;
  disabled: boolean;
}) {
  const locked = disabled || layer.locked;
  const percent = Math.round(layer.opacity * 100);
  return (
    <div className="flex flex-col gap-2.5 border-t px-3 py-3" data-testid="layer-properties">
      <div className="flex items-center gap-3">
        <span className="w-16 shrink-0 text-xs text-muted-foreground">{t.layers.opacity}</span>
        <Slider
          aria-label={t.layers.opacity}
          data-testid="layer-opacity"
          min={0}
          max={100}
          step={1}
          value={[percent]}
          disabled={locked}
          onValueChange={([value]) => {
            editor.layers.setProps(layer.id, { opacity: value / 100 });
          }}
        />
        <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums">
          {percent}%
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="w-16 shrink-0 text-xs text-muted-foreground">{t.layers.blend}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={locked}>
            <button
              type="button"
              aria-label={`${t.layers.blendLabel}: ${t.layers.blendModes[layer.blendMode]}`}
              data-testid="layer-blend"
              className="flex h-7 min-w-0 flex-1 items-center justify-between gap-1 rounded-md bg-muted px-2.5 text-sm font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <span className="truncate">{t.layers.blendModes[layer.blendMode]}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            <DropdownMenuRadioGroup
              value={layer.blendMode}
              onValueChange={(value) => {
                const mode = BLEND_MODES.find((m) => m === value);
                if (mode) editor.layers.setProps(layer.id, { blendMode: mode });
              }}
            >
              {BLEND_GROUPS.map((group, i) => (
                <div key={group[0]}>
                  {i > 0 && <DropdownMenuSeparator />}
                  {group.map((mode) => (
                    <DropdownMenuRadioItem key={mode} value={mode} data-testid={`blend-${mode}`}>
                      {t.layers.blendModes[mode]}
                    </DropdownMenuRadioItem>
                  ))}
                </div>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          aria-label={t.layers.alphaLock}
          aria-pressed={layer.alphaLocked}
          title={`${t.layers.alphaLock} — ${t.layers.alphaLockHint}`}
          disabled={locked || layer.kind !== 'raster'}
          data-testid="layer-alpha-lock"
          onClick={() => {
            editor.layers.setProps(layer.id, { alphaLocked: !layer.alphaLocked });
          }}
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4',
            layer.alphaLocked && 'bg-primary-soft text-primary-soft-foreground',
          )}
        >
          <Grid2x2Check />
        </button>
      </div>
    </div>
  );
}
