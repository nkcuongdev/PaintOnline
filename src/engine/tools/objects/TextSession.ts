import type { ColorsState, ID, TextEditState, TextObject } from '../../core/types';
import { withColor, withStyle } from '../../layers/objects/style';
import type { ObjectController } from './ObjectController';

/**
 * Phiên sửa chữ (mục 5.10): Engine giữ đối tượng đang sửa (ẩn khỏi canvas), UI đặt một textarea
 * thật chồng đúng vị trí để người dùng gõ bằng bộ gõ tiếng Việt (IME). Khi rời ô sửa, chữ được
 * ghi bằng ObjectCommand và render bằng `fillText`.
 */
export class TextSession {
  private state: { objectId: ID | null; object: TextObject } | null = null;

  constructor(
    private readonly objects: ObjectController,
    private readonly emit: (state: TextEditState | null) => void,
    private readonly colors: () => Readonly<ColorsState>,
  ) {}

  get active(): boolean {
    return this.state !== null;
  }

  get current(): TextEditState | null {
    return this.state ? { objectId: this.state.objectId, object: this.state.object } : null;
  }

  /** Bắt đầu sửa: `objectId` = chữ có sẵn (bị ẩn khỏi canvas trong lúc sửa), null = chữ mới. */
  begin(object: TextObject, objectId: ID | null): void {
    if (this.state) this.commit(this.state.object.text);
    this.state = { objectId, object };
    if (objectId) {
      this.objects.select([objectId]);
      this.objects.setOverrides(new Map([[objectId, null]]));
    } else {
      this.objects.clearSelection();
    }
    this.emit(this.current);
  }

  /** Phát lại trạng thái (font vừa tải xong — UI đo lại textarea). */
  refresh(): void {
    if (this.state) this.emit(this.current);
  }

  /** Nội dung đang gõ (UI gọi mỗi lần nhập) — để Engine ghi được khi người dùng click ra ngoài. */
  update(text: string): void {
    if (this.state) this.state.object = { ...this.state.object, text };
  }

  /** Đổi thuộc tính chữ trong lúc sửa (Options bar, bảng màu). */
  restyle(patch: Readonly<Record<string, unknown>>): void {
    if (!this.state) return;
    this.state.object = withStyle(this.state.object, patch, this.colors()) as TextObject;
    this.emit(this.current);
  }

  recolor(slot: 'primary' | 'secondary', color: TextObject['color']): void {
    if (!this.state) return;
    this.state.object = withColor(this.state.object, slot, color) as TextObject;
    this.emit(this.current);
  }

  /** Kết thúc sửa và ghi chữ. Chữ rỗng: không tạo mới / xóa chữ cũ. */
  commit(text: string): void {
    const s = this.state;
    if (!s) return;
    this.state = null;
    this.objects.setOverrides(null);
    const empty = text.trim() === '';
    const next: TextObject = { ...s.object, text };
    if (s.objectId) {
      const hit = this.objects.find(s.objectId);
      if (hit?.object.type === 'text') {
        if (empty) {
          this.objects.select([s.objectId]);
          this.objects.deleteSelected();
        } else if (text !== hit.object.text || !sameStyle(hit.object, next)) {
          this.objects.replace([{ ...next, id: s.objectId }], 'history.editText');
          this.objects.select([s.objectId]);
        }
      }
    } else if (!empty) {
      this.objects.add(next, 'history.addText');
    }
    this.emit(null);
  }

  cancel(): void {
    if (!this.state) return;
    this.state = null;
    this.objects.setOverrides(null);
    this.emit(null);
  }
}

function sameStyle(a: TextObject, b: TextObject): boolean {
  return (
    a.color === b.color &&
    a.background === b.background &&
    a.align === b.align &&
    a.font.family === b.font.family &&
    a.font.size === b.font.size &&
    a.font.weight === b.font.weight &&
    a.font.italic === b.font.italic &&
    (a.outline === undefined) === (b.outline === undefined)
  );
}
