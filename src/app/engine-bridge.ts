import type { Editor } from '@/engine/core/Editor';
import type { EditorEvents } from '@/engine/core/types';
import {
  EMPTY_SELECTION,
  INITIAL_DOCUMENT_STATE,
  useDocumentStore,
  type DocumentState,
} from '@/stores/document';
import { useToolStore } from '@/stores/tool';
import { toast, useUiStore } from '@/stores/ui';
import { format, t } from '@/i18n';

/**
 * Cầu nối Engine → Zustand (mục 4.2). Engine phát sự kiện, bridge đẩy BẢN SAO vào store để UI
 * hiển thị; UI không bao giờ ghi store rồi chờ Engine đọc.
 *
 * - toolOptionsChanged, toolChanged, colorsChanged, objectSelectionChanged, textEditChanged,
 *   busyChanged: đồng bộ ngay (slider, thuộc tính đối tượng, ô gõ chữ phản hồi tức thì).
 * - paintTargetRequired, contextMenu: mở hộp thoại/menu qua uiStore.
 * - layersChanged: đồng bộ ngay (thao tác panel Layers, undo — không xảy ra mỗi frame).
 * - documentChanged, historyChanged, selectionChanged, memoryChanged, pointerMoved: gộp theo
 *   requestAnimationFrame.
 * - viewportChanged: throttle 100 ms cho thanh trạng thái.
 */

const VIEWPORT_THROTTLE_MS = 100;

export function connectEditor(editor: Editor): () => void {
  const offs: (() => void)[] = [];
  const on = <K extends keyof EditorEvents>(
    event: K,
    handler: (payload: EditorEvents[K]) => void,
  ) => {
    offs.push(editor.on(event, handler));
  };

  // --- Đồng bộ ngay -----------------------------------------------------------
  const syncTools = () => {
    const all = editor.options.all();
    useToolStore.setState({
      active: editor.tools.active,
      selected: editor.tools.selected,
      temporary: editor.tools.active !== editor.tools.selected,
      options: { ...all },
      colors: editor.colors.state(),
    });
  };
  // Thông báo cho trình đọc màn hình khi đổi tool (không đọc tool tạm thời như Pan khi giữ Space).
  on('toolChanged', ({ tool, temporary }) => {
    if (!temporary)
      useUiStore.getState().announce(format(t.tools.selected, { tool: t.tools[tool] }));
  });
  on('toolChanged', () => {
    useToolStore.setState({
      active: editor.tools.active,
      selected: editor.tools.selected,
      temporary: editor.tools.active !== editor.tools.selected,
    });
  });
  on('toolOptionsChanged', ({ group, options }) => {
    useToolStore.setState((state) => ({ options: { ...state.options, [group]: options } }));
  });
  on('colorsChanged', (colors) => {
    useToolStore.setState({ colors: { ...colors, recent: [...colors.recent] } });
  });
  on('objectSelectionChanged', (selection) => {
    useDocumentStore.setState({ selection });
  });
  on('textEditChanged', (textEdit) => {
    useDocumentStore.setState({ textEdit });
  });
  on('busyChanged', (busy) => {
    useDocumentStore.setState({ busy });
  });
  // Bảng điều chỉnh: slider và tiến trình phản hồi tức thì; phiên đóng thì bảng đóng theo.
  on('filterChanged', (filter) => {
    useDocumentStore.setState({ filter });
    if (!filter) useUiStore.getState().setAdjustment(null);
  });
  on('paintTargetRequired', (request) => {
    useUiStore.getState().setPaintTargetRequest(request);
  });
  on('contextMenu', (menu) => {
    useUiStore.getState().openCanvasMenu(menu);
  });

  // --- Gộp theo frame -----------------------------------------------------------
  let pending: Partial<DocumentState> = {};
  let raf = 0;
  const queue = (patch: Partial<DocumentState>) => {
    pending = { ...pending, ...patch };
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const next = pending;
      pending = {};
      useDocumentStore.setState(next);
    });
  };
  on('documentChanged', (doc) => {
    queue({ doc });
  });
  // Thay đổi cấu trúc layer (thêm, xóa, thuộc tính, undo…) hiếm và do người dùng bấm: đồng bộ ngay
  // để panel Layers phản hồi tức thì (slider opacity bằng bàn phím đọc lại giá trị mới).
  // Thông báo khi đổi layer hoạt động (mục 7.8) — không đọc lại khi chỉ đổi thuộc tính.
  let announcedLayer = editor.document?.activeLayerId ?? null;
  on('layersChanged', (doc) => {
    delete pending.doc;
    useDocumentStore.setState({ doc });
    if (doc.activeLayerId === announcedLayer) return;
    announcedLayer = doc.activeLayerId;
    const active = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (active) {
      useUiStore.getState().announce(format(t.layers.activeChanged, { name: active.name }));
    }
  });
  on('historyChanged', (history) => {
    queue({ history });
  });
  // Vùng chọn đổi liên tục khi kéo pixel nổi: gộp theo frame.
  on('selectionChanged', (pixelSelection) => {
    queue({ pixelSelection });
  });
  on('memoryChanged', (memory) => {
    queue({ memory });
  });
  on('pointerMoved', (pointer) => {
    queue({ pointer });
  });

  // --- Throttle viewport ----------------------------------------------------------
  let lastViewport = 0;
  let viewportTimer = 0;
  // Thông báo mức zoom khi đã dừng thay đổi (mục 7.8).
  let announcedZoom = editor.viewport.zoom;
  let zoomTimer = 0;
  on('viewportChanged', ({ zoom }) => {
    window.clearTimeout(zoomTimer);
    zoomTimer = window.setTimeout(() => {
      if (Math.abs(zoom - announcedZoom) < 1e-6) return;
      announcedZoom = zoom;
      useUiStore.getState().announce(format(t.zoom.changed, { value: Math.round(zoom * 100) }));
    }, 600);
  });
  on('viewportChanged', (viewport) => {
    const now = performance.now();
    window.clearTimeout(viewportTimer);
    const apply = () => {
      lastViewport = performance.now();
      useDocumentStore.setState({ viewport });
    };
    if (now - lastViewport >= VIEWPORT_THROTTLE_MS) apply();
    else viewportTimer = window.setTimeout(apply, VIEWPORT_THROTTLE_MS - (now - lastViewport));
  });

  // --- Thông báo từ Engine (mã → chuỗi tiếng Việt) -------------------------------------
  on('notice', ({ code }) => {
    toast(code === 'memory.layersHigh' ? 'info' : 'error', t.notices[code]);
  });

  // Trạng thái ban đầu.
  syncTools();
  const doc = editor.document;
  const vp = editor.viewport;
  useDocumentStore.setState({
    ...INITIAL_DOCUMENT_STATE,
    doc: doc?.summary() ?? null,
    history: editor.historySummary(),
    viewport: {
      zoom: vp.zoom,
      panX: vp.state.panX,
      panY: vp.state.panY,
      width: vp.width,
      height: vp.height,
    },
    memory: editor.memory.usage(),
    selection: EMPTY_SELECTION,
    pixelSelection: editor.selection.summary,
    textEdit: editor.text.current,
    busy: editor.busy,
    filter: editor.filters.state,
  });

  return () => {
    useUiStore.setState({ paintTargetRequest: null, canvasMenu: null, adjustment: null });
    for (const off of offs) off();
    if (raf) cancelAnimationFrame(raf);
    window.clearTimeout(viewportTimer);
    window.clearTimeout(zoomTimer);
  };
}
