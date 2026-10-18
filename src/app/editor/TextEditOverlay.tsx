import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Editor } from '@/engine/core/Editor';
import type { TextEditState } from '@/engine/core/types';
import { textPadding } from '@/engine/layers/objects/textLayout';
import { t } from '@/i18n';
import { useDocumentStore } from '@/stores/document';
import { cssHex } from '@/app/shared/color';

/**
 * Vùng mà focus chuyển sang KHÔNG kết thúc phiên sửa: Options bar (font, cỡ, căn lề…), nút và
 * popover chọn màu, menu thả xuống — thay đổi ở đó áp ngay cho chữ đang gõ.
 */
const KEEP_EDITING =
  '[data-testid="options-bar"],[data-testid="color-control"],[data-radix-popper-content-wrapper]';

/** Ký tự 0 độ rộng: giữ dòng trống cuối cùng có chiều cao khi đo. */
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);

interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

/** Khung nhìn cập nhật tức thì (không qua throttle của thanh trạng thái) để ô gõ bám theo ảnh. */
function useViewTransform(editor: Editor): ViewTransform {
  const [view, setView] = useState<ViewTransform>(() => ({
    zoom: editor.viewport.zoom,
    panX: editor.viewport.state.panX,
    panY: editor.viewport.state.panY,
  }));
  useEffect(
    () =>
      editor.on('viewportChanged', ({ zoom, panX, panY }) => {
        setView({ zoom, panX, panY });
      }),
    [editor],
  );
  return view;
}

function TextArea({
  editor,
  state,
  view,
}: {
  editor: Editor;
  state: TextEditState;
  view: ViewTransform;
}) {
  const obj = state.object;
  const [value, setValue] = useState(obj.text);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  const zoom = view.zoom;
  const fontSize = obj.font.size * zoom;
  const pad = obj.background ? textPadding(obj.font.size) * zoom : 0;
  const wrap = obj.wrapWidth !== null;

  const common: CSSProperties = {
    fontFamily: `"${obj.font.family}", sans-serif`,
    fontSize: `${String(fontSize)}px`,
    fontWeight: obj.font.weight,
    fontStyle: obj.font.italic ? 'italic' : 'normal',
    lineHeight: obj.lineHeight,
    letterSpacing: 'normal',
    textAlign: obj.align,
    padding: `${String(pad)}px`,
  };

  // Đo nội dung bằng một bản sao ẩn (mọi trình duyệt — `field-sizing` chưa có trên Firefox/Safari).
  useLayoutEffect(() => {
    const mirror = mirrorRef.current;
    if (!mirror) return;
    setSize({ width: mirror.offsetWidth, height: mirror.offsetHeight });
  }, [
    value,
    fontSize,
    pad,
    obj.font.family,
    obj.font.weight,
    obj.font.italic,
    obj.wrapWidth,
    zoom,
  ]);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.focus({ preventScroll: true });
    area.setSelectionRange(area.value.length, area.value.length);
  }, []);

  // Đổi kiểu chữ trên Options bar: trả focus về ô gõ để gõ tiếp ngay (trừ khi menu/popover đang mở).
  useEffect(() => {
    const area = areaRef.current;
    const active = document.activeElement;
    if (!area || active === area) return;
    if (active instanceof Element && active.closest('[data-radix-popper-content-wrapper]')) return;
    if (active instanceof Element && active.closest('[data-testid="options-bar"]')) {
      area.focus({ preventScroll: true });
    }
  }, [obj]);

  const commit = () => {
    editor.text.commit(areaRef.current?.value ?? value);
  };

  const left = obj.origin.x * zoom + view.panX - pad;
  const top = obj.origin.y * zoom + view.panY - pad;
  const minWidth = Math.max(fontSize * 0.6, 4);
  const width = wrap ? (obj.wrapWidth ?? 0) * zoom : Math.max(minWidth, size.width - pad * 2 + 2);
  const height = Math.max(fontSize * obj.lineHeight, size.height - pad * 2);
  const outline = obj.outline
    ? {
        WebkitTextStroke: `${String(obj.outline.width * 2 * zoom)}px ${cssHex(obj.outline.color)}`,
        paintOrder: 'stroke fill',
      }
    : {};

  return (
    <>
      <div
        ref={mirrorRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-0 left-0"
        style={{
          ...common,
          whiteSpace: wrap ? 'pre-wrap' : 'pre',
          overflowWrap: wrap ? 'break-word' : 'normal',
          width: wrap ? `${String((obj.wrapWidth ?? 0) * zoom)}px` : 'auto',
        }}
      >
        {value + ZERO_WIDTH_SPACE}
      </div>
      <textarea
        ref={areaRef}
        className="text-edit-overlay"
        data-testid="text-editor"
        data-wrap={wrap}
        aria-label={t.text.editorLabel}
        spellCheck={false}
        autoComplete="off"
        value={value}
        rows={1}
        onChange={(e) => {
          setValue(e.target.value);
          editor.text.update(e.target.value);
        }}
        onKeyDown={(e) => {
          // Esc hoặc Ctrl/⌘ + Enter: xong (Enter thường xuống dòng). Không chặn khi đang gõ bộ gõ.
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={(e) => {
          // Cửa sổ mất focus (Alt+Tab) hoặc đang chỉnh kiểu chữ không kết thúc phiên sửa.
          if (!document.hasFocus()) return;
          const next = e.relatedTarget;
          if (next instanceof Element && next.closest(KEEP_EDITING)) return;
          commit();
        }}
        style={{
          ...common,
          ...outline,
          left,
          top,
          width,
          height,
          color: cssHex(obj.color),
          background: obj.background ? cssHex(obj.background) : 'transparent',
          borderRadius: obj.background ? Math.min(8, pad) : 0,
          transform: obj.rotation ? `rotate(${String(obj.rotation)}rad)` : undefined,
        }}
      />
    </>
  );
}

/**
 * Ô gõ chữ (mục 5.10): textarea thật đặt chồng đúng vị trí chữ theo ma trận viewport (cỡ chữ ×
 * zoom), để gõ tiếng Việt bằng bộ gõ (Telex/VNI, IME macOS/iOS) như mọi ô nhập liệu. Khi rời ô,
 * Engine ghi chữ bằng ObjectCommand và vẽ bằng `fillText`.
 */
export function TextEditOverlay({ editor }: { editor: Editor }) {
  const state = useDocumentStore((s) => s.textEdit);
  const view = useViewTransform(editor);
  if (!state) return null;
  return (
    <TextArea
      key={
        state.objectId ?? `new-${String(state.object.origin.x)}-${String(state.object.origin.y)}`
      }
      editor={editor}
      state={state}
      view={view}
    />
  );
}
