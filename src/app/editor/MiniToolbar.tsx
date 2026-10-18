import {
  BringToFront,
  Check,
  Copy,
  Crop,
  EyeOff,
  PaintBucket,
  SendToBack,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { IconButton } from '@/app/shared/IconButton';
import {
  displayShortcut,
  getCommand,
  isEnabled,
  runCommand,
  type CommandContext,
} from '@/commands';
import { SELECT_TOOLS } from '@/engine/tools/registry';
import type { Rect } from '@/engine/core/types';
import { t } from '@/i18n';
import { useDocumentStore } from '@/stores/document';
import { useToolStore } from '@/stores/tool';
import { useViewTransform } from './useViewTransform';

/** Khoảng cách từ mép vùng chọn tới thanh (CSS px). */
const GAP = 10;
/** Chiều cao thanh (CSS px) — dùng để chọn đặt trên hay dưới vùng chọn. */
const BAR_HEIGHT = 40;
/** Lề tối thiểu với mép khung canvas. */
const MARGIN = 8;

const ICONS: Readonly<Record<string, ReactNode>> = {
  'edit.copy': <Copy />,
  'image.cropToSelection': <Crop />,
  'selection.delete': <Trash2 />,
  'selection.fill': <PaintBucket />,
  'selection.redact': <EyeOff />,
  'selection.commit': <Check />,
  'selection.cancel': <X />,
  'edit.delete': <Trash2 />,
  'object.bringToFront': <BringToFront />,
  'object.sendToBack': <SendToBack />,
};

/** Mục 7.6: Copy, Crop theo vùng chọn, Xóa, Tô màu, Che thông tin. */
const SELECTION_ITEMS = [
  'edit.copy',
  'image.cropToSelection',
  'selection.fill',
  'selection.redact',
  'selection.delete',
] as const;
const FLOATING_ITEMS = ['selection.commit', 'selection.cancel'] as const;
const OBJECT_ITEMS = ['object.bringToFront', 'object.sendToBack', 'edit.delete'] as const;

/** Đang nhấn chuột/bút trên canvas: ẩn thanh để không che chỗ đang kéo. */
function usePointerHeld(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      // Bấm vào chính thanh (hay UI khác) không ẩn thanh — nếu không nút sẽ biến mất trước khi click.
      if (e.target instanceof Element && e.target.closest('[data-testid="canvas-view"]')) {
        setHeld(true);
      }
    };
    const up = () => {
      setHeld(false);
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, []);
  return held;
}

/**
 * Mini toolbar theo ngữ cảnh (mục 7.6): nổi cạnh vùng chọn pixel (Copy, Cắt xén, Tô màu, Che
 * thông tin, Xóa; Áp dụng/Hủy khi đang di chuyển pixel) hoặc đối tượng đang chọn (Lên trên, Xuống
 * dưới, Xóa). Mỗi nút là một lệnh của Command Registry. Chỉ hiện ở tool Chọn để không che khi vẽ.
 */
export function MiniToolbar({ context }: { context: CommandContext }) {
  const { editor } = context;
  const selection = useDocumentStore((s) => s.pixelSelection);
  const objects = useDocumentStore((s) => s.selection.objects);
  const tool = useToolStore((s) => s.active);
  // Render lại khi khung nhìn đổi; vị trí lấy từ ma trận hiện tại của viewport.
  useViewTransform(editor);
  const held = usePointerHeld();
  const viewport = useDocumentStore((s) => s.viewport);

  if (held) return null;
  let items: readonly string[];
  let bounds: Rect | null;
  if (selection && SELECT_TOOLS.includes(tool)) {
    items = selection.floating ? FLOATING_ITEMS : SELECTION_ITEMS;
    bounds = selection.bounds;
  } else if (objects.length > 0 && tool === 'select') {
    items = OBJECT_ITEMS;
    bounds = editor.objects.selectionBounds();
  } else {
    return null;
  }
  if (!bounds) return null;

  const box = editor.viewport.docRectToScreen(bounds);
  const width = items.length * 34 + 8;
  const room = viewport.width > 0 ? viewport.width : window.innerWidth;
  const left = Math.min(
    Math.max(MARGIN, box.x + box.width / 2 - width / 2),
    Math.max(MARGIN, room - width - MARGIN),
  );
  // Ưu tiên phía trên; không đủ chỗ (sát tool island) thì đặt dưới.
  const above = box.y - GAP - BAR_HEIGHT;
  const top = above >= editor.viewport.occluded.top + MARGIN ? above : box.y + box.height + GAP;

  return (
    <div
      role="toolbar"
      aria-label={selection ? t.menu.selectionLabel : t.menu.objectLabel}
      data-testid="mini-toolbar"
      className="surface-glass absolute z-10 flex items-center gap-0.5 rounded-xl p-1 shadow-island"
      style={{ left, top: Math.max(MARGIN, top) }}
    >
      {items.map((id) => {
        const command = getCommand(id);
        if (!command) return null;
        const destructive = id === 'selection.delete' || id === 'edit.delete';
        return (
          <IconButton
            key={id}
            label={command.label()}
            shortcut={displayShortcut(id)}
            icon={ICONS[id]}
            disabled={!isEnabled(command, context)}
            data-testid={`mini-${id}`}
            className={destructive ? 'text-destructive hover:text-destructive' : undefined}
            onClick={() => {
              runCommand(id, context);
            }}
          />
        );
      })}
    </div>
  );
}
