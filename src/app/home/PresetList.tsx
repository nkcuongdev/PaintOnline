import { ClipboardPaste, Plus, Ruler } from 'lucide-react';
import type { ReactNode } from 'react';
import { createBlankProject, pasteFromClipboardButton } from '@/app/editor/actions';
import { openDialog } from '@/stores/ui';
import { format, t } from '@/i18n';
import { SIZE_PRESETS, type SizePreset } from './presets';

/** Khung thu nhỏ đúng tỉ lệ của preset. */
function PresetShape({ preset }: { preset: SizePreset }) {
  const max = 40;
  const scale = max / Math.max(preset.width, preset.height);
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted">
      <span
        aria-hidden="true"
        className="rounded-[3px] border border-foreground/15 bg-card shadow-card transition-colors group-hover:border-primary/50"
        style={{ width: preset.width * scale * 0.8, height: preset.height * scale * 0.8 }}
      />
    </span>
  );
}

const ITEM_CLASS =
  'group flex w-full items-center gap-3 rounded-xl border bg-card p-2.5 pr-3 text-left shadow-card transition-[box-shadow,border-color,transform] duration-150 ease-out-soft hover:-translate-y-px hover:border-primary/40 hover:shadow-card-hover active:translate-y-0';

function ExtraItem({
  icon,
  name,
  hint,
  testId,
  onClick,
}: {
  icon: ReactNode;
  name: string;
  hint: string;
  testId: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button type="button" data-testid={testId} onClick={onClick} className={ITEM_CLASS}>
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-5">
          {icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{name}</span>
          <span className="truncate text-status text-muted-foreground">{hint}</span>
        </span>
        <span className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Plus className="size-4" />
        </span>
      </button>
    </li>
  );
}

/** Danh sách preset "Tạo ảnh mới" ở trang chủ (mục 7.3): kích thước sẵn, tùy chỉnh, từ clipboard. */
export function PresetList() {
  return (
    <section aria-labelledby="new-image-title" className="flex flex-col">
      <h2 id="new-image-title" className="mb-3 px-1 text-[0.875rem] font-semibold">
        {t.home.newSection}
      </h2>
      <ul className="flex flex-col gap-2">
        {SIZE_PRESETS.map((preset) => {
          // Kích thước pixel viết liền, không phân cách hàng nghìn (như thanh trạng thái, mục 7.2).
          const size = format(t.home.sizeLabel, { width: preset.width, height: preset.height });
          return (
            <li key={preset.id}>
              <button
                type="button"
                data-testid={`preset-${preset.id}`}
                aria-label={format(t.home.createPreset, {
                  name: preset.name,
                  width: preset.width,
                  height: preset.height,
                })}
                onClick={() => {
                  void createBlankProject(preset.width, preset.height);
                }}
                className={ITEM_CLASS}
              >
                <PresetShape preset={preset} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{preset.name}</span>
                  <span className="truncate text-status text-muted-foreground">
                    {size} · {preset.hint}
                  </span>
                </span>
                <span className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Plus className="size-4" />
                </span>
              </button>
            </li>
          );
        })}
        <ExtraItem
          icon={<Ruler />}
          name={t.home.customPreset.name}
          hint={t.home.customPreset.hint}
          testId="preset-custom"
          onClick={() => {
            openDialog({ kind: 'newImage' });
          }}
        />
        <ExtraItem
          icon={<ClipboardPaste />}
          name={t.home.clipboardPreset.name}
          hint={t.home.clipboardPreset.hint}
          testId="preset-clipboard"
          onClick={() => {
            void pasteFromClipboardButton();
          }}
        />
      </ul>
    </section>
  );
}
