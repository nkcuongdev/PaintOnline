import type { EventBus } from '../core/EventBus';
import type { EditorEvents, ToolId } from '../core/types';
import { getToolDefinition, TOOL_DEFINITIONS } from './registry';
import type {
  CursorSpec,
  DocPointerEvent,
  HoverEvent,
  OverlayContext,
  Tool,
  ToolContext,
  ToolDefinition,
} from './types';

/**
 * Quản lý tool đang hoạt động, ngăn xếp tool tạm thời (giữ Space → Pan, nhả ra quay lại tool cũ)
 * và chuyển sự kiện con trỏ cho tool (mục 5.3).
 */
export class ToolManager {
  private readonly instances = new Map<ToolId, Tool>();
  private baseTool: ToolId = 'brush';
  private readonly temporary: ToolId[] = [];
  private gesture = false;
  /** Đổi tool trong lúc đang kéo được hoãn tới khi thả (không cắt ngang nét vẽ). */
  private pending: (() => void) | null = null;
  private altKey = false;

  constructor(
    private readonly ctx: ToolContext,
    private readonly events: EventBus<EditorEvents>,
  ) {}

  get definitions(): readonly ToolDefinition[] {
    return TOOL_DEFINITIONS;
  }

  /** Tool đang nhận sự kiện (tool tạm thời nếu có). */
  get activeId(): ToolId {
    return this.temporary.at(-1) ?? this.baseTool;
  }

  /** Tool người dùng đã chọn (không tính tool tạm thời). */
  get selectedId(): ToolId {
    return this.baseTool;
  }

  get isGestureActive(): boolean {
    return this.gesture;
  }

  setActive(id: ToolId): void {
    getToolDefinition(id);
    this.deferIfDragging(() => {
      if (id === this.baseTool && this.temporary.length === 0) return;
      const previous = this.activeId;
      this.baseTool = id;
      this.temporary.length = 0;
      this.switched(previous);
    });
  }

  pushTemporary(id: ToolId): void {
    this.deferIfDragging(() => {
      if (this.activeId === id) return;
      const previous = this.activeId;
      this.temporary.push(id);
      this.switched(previous);
    });
  }

  popTemporary(id: ToolId): void {
    this.deferIfDragging(() => {
      const index = this.temporary.lastIndexOf(id);
      if (index < 0) return;
      const previous = this.activeId;
      this.temporary.splice(index, 1);
      this.switched(previous);
    });
  }

  pointerDown(e: DocPointerEvent): void {
    this.altKey = e.altKey;
    this.gesture = true;
    this.tool().onPointerDown(e);
  }

  pointerMove(e: DocPointerEvent): void {
    if (!this.gesture) return;
    this.altKey = e.altKey;
    this.tool().onPointerMove(e);
  }

  pointerUp(e: DocPointerEvent): void {
    if (!this.gesture) return;
    this.tool().onPointerUp(e);
    this.endGesture();
  }

  cancel(): void {
    if (!this.gesture) return;
    this.tool().onCancel();
    this.endGesture();
  }

  keyDown(e: KeyboardEvent): boolean {
    return this.tool().onKeyDown?.(e) ?? false;
  }

  hover(e: HoverEvent): void {
    if (this.gesture) return;
    this.tool().onHover?.(e);
  }

  setAltKey(altKey: boolean): void {
    this.altKey = altKey;
  }

  cursor(): CursorSpec {
    return this.tool().cursor({ altKey: this.altKey, active: this.gesture });
  }

  renderOverlay(overlay: OverlayContext): void {
    this.tool().renderOverlay?.(overlay);
  }

  dispose(): void {
    this.cancel();
    for (const tool of this.instances.values()) tool.onDeactivate?.();
    this.instances.clear();
  }

  private tool(id: ToolId = this.activeId): Tool {
    let tool = this.instances.get(id);
    if (!tool) {
      tool = getToolDefinition(id).create(this.ctx);
      this.instances.set(id, tool);
    }
    return tool;
  }

  private deferIfDragging(action: () => void): void {
    if (this.gesture) this.pending = action;
    else action();
  }

  private endGesture(): void {
    this.gesture = false;
    const pending = this.pending;
    this.pending = null;
    pending?.();
  }

  private switched(previous: ToolId): void {
    const next = this.activeId;
    if (previous === next) return;
    this.instances.get(previous)?.onDeactivate?.();
    this.tool(next).onActivate?.();
    this.ctx.invalidateOverlay();
    this.events.emit('toolChanged', { tool: next, temporary: this.temporary.length > 0 });
  }
}
