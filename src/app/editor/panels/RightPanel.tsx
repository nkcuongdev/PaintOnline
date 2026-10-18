import { History, Layers, PanelRightClose, Sparkles } from 'lucide-react';
import { BeautifyPanel } from '@/app/screenshot/BeautifyPanel';
import { IconButton } from '@/app/shared/IconButton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Editor } from '@/engine/core/Editor';
import { t } from '@/i18n';
import type { ProjectMode } from '@/services/storage/schema';
import { useUiStore, type RightPanelTab } from '@/stores/ui';
import { HistoryPanel } from './HistoryPanel';
import { LayersPanel } from './LayersPanel';

/** Ba tab trong 280 px: bớt lề để chữ không tràn khỏi panel. */
const TRIGGER = 'min-w-0 px-1.5';

/**
 * Panel phải 280 px, thu gọn được (mục 7.2): tab Layers, History, Làm đẹp. Chế độ Screenshot giao
 * diện rút gọn (mục 7.3): chỉ Làm đẹp và History.
 */
export function RightPanel({ editor, mode = 'paint' }: { editor: Editor; mode?: ProjectMode }) {
  const panel = useUiStore((s) => s.rightPanel);
  const setPanel = useUiStore((s) => s.setRightPanel);
  if (!panel.open) return null;
  const screenshot = mode === 'screenshot';
  const tabs: readonly RightPanelTab[] = screenshot
    ? ['beautify', 'history']
    : ['layers', 'history', 'beautify'];
  const fallback = tabs[0] ?? 'layers';
  const tab = tabs.includes(panel.tab) ? panel.tab : fallback;
  return (
    <aside
      aria-label={screenshot ? t.panel.screenshotLabel : t.panel.label}
      data-testid="right-panel"
      data-keyboard-scope="panel"
      className="flex w-[280px] shrink-0 flex-col border-l bg-card"
    >
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = tabs.find((id) => id === value);
          if (next) setPanel({ tab: next });
        }}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="flex items-center gap-1 px-2 pt-2 pb-1.5">
          <TabsList className="min-w-0 flex-1">
            {tabs.includes('layers') && (
              <TabsTrigger value="layers" data-testid="tab-layers" className={TRIGGER}>
                <Layers />
                <span className="truncate">{t.panel.layersTab}</span>
              </TabsTrigger>
            )}
            {screenshot && (
              <TabsTrigger value="beautify" data-testid="tab-beautify" className={TRIGGER}>
                <Sparkles />
                <span className="truncate">{t.panel.beautifyTab}</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="history" data-testid="tab-history" className={TRIGGER}>
              <History />
              <span className="truncate">{t.panel.historyTab}</span>
            </TabsTrigger>
            {!screenshot && (
              <TabsTrigger value="beautify" data-testid="tab-beautify" className={TRIGGER}>
                <Sparkles />
                <span className="truncate">{t.panel.beautifyTab}</span>
              </TabsTrigger>
            )}
          </TabsList>
          <IconButton
            size="sm"
            label={t.panel.collapse}
            icon={<PanelRightClose />}
            data-testid="panel-collapse"
            onClick={() => {
              setPanel({ open: false });
            }}
          />
        </div>
        {tabs.includes('layers') && (
          <TabsContent
            value="layers"
            className="flex min-h-0 flex-col data-[state=inactive]:hidden"
          >
            <LayersPanel editor={editor} />
          </TabsContent>
        )}
        <TabsContent value="history" className="flex min-h-0 flex-col data-[state=inactive]:hidden">
          <HistoryPanel editor={editor} />
        </TabsContent>
        <TabsContent
          value="beautify"
          className="flex min-h-0 flex-col data-[state=inactive]:hidden"
        >
          <BeautifyPanel editor={editor} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
