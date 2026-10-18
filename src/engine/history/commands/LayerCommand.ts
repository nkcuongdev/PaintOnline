import type { Document } from '../../core/Document';
import type { AnnotationObject, BlendMode, ID, Rect } from '../../core/types';
import { touchContent, type Layer, type RasterLayer, type VectorLayer } from '../../layers/layers';
import type { Archivable } from '../archive';
import type { Command } from '../types';

/**
 * LayerCommand (mục 5.6): thêm, xóa, đổi thứ tự, thuộc tính layer, gộp layer. Command giữ tham số
 * và chính đối tượng layer bị xóa (surface của nó được nén lúc rảnh — mục 5.6), nên undo khôi phục
 * đúng từng pixel mà không phải chụp lại.
 */

/** Surface của layer raster có nội dung (để nén khi layer nằm ngoài document). */
function surfacesOf(layers: readonly Layer[]): Archivable[] {
  const out: Archivable[] = [];
  for (const layer of layers) {
    if (layer.kind === 'raster' && !layer.surface.isEmpty) out.push(layer.surface);
  }
  return out;
}

/** Giải nén layer raster trước khi đưa lại vào document (ném lỗi cấp phát nếu thiếu bộ nhớ). */
function restoreSurfaces(layers: readonly Layer[]): void {
  for (const layer of layers) {
    if (layer.kind === 'raster') layer.surface.unarchive();
  }
}

/**
 * Thêm một layer: layer mới (Shift+N), nhân bản, layer tự tạo khi dùng shape/text trên layer raster
 * hoặc tool pixel trên layer chú thích (mục 5.3). Layer được chọn làm layer hoạt động; undo trả lại
 * layer hoạt động cũ.
 */
export class AddLayerCommand implements Command {
  readonly timestamp = Date.now();
  private previousActive: ID | null = null;
  private inDocument = false;

  constructor(
    readonly label: string,
    private readonly layer: Layer,
    private readonly index: number,
    /**
     * Layer có nội dung từ lúc tạo (nhân bản): undo giữ nguyên surface để redo. Layer trống thì
     * undo trả bộ nhớ ngay — mọi command vẽ lên nó đã được hoàn tác trước.
     */
    private readonly keepContent = false,
  ) {}

  get layerId(): ID {
    return this.layer.id;
  }

  execute(doc: Document): void {
    this.previousActive = doc.activeLayerId;
    doc.insertLayer(this.layer, this.index);
    doc.activeLayerId = this.layer.id;
    this.inDocument = true;
  }

  undo(doc: Document): void {
    doc.removeLayer(this.layer.id);
    if (this.previousActive) doc.activeLayerId = this.previousActive;
    this.inDocument = false;
    if (this.layer.kind === 'raster' && !this.keepContent) this.layer.surface.release();
  }

  memoryBytes(): number {
    return 0;
  }

  affectedArea(): Rect | null {
    return null;
  }

  dispose(): void {
    // Command bị bỏ khỏi nhánh redo: layer không còn thuộc document.
    if (!this.inDocument) this.layer.dispose();
  }
}

/** Xóa một layer; layer hoạt động chuyển sang layer ngay dưới (hoặc trên nếu là layer đáy). */
export class RemoveLayerCommand implements Command {
  readonly timestamp = Date.now();
  private index = -1;
  private previousActive: ID | null = null;
  private removed = false;

  constructor(
    readonly label: string,
    private readonly layer: Layer,
    /** Layer hoạt động sau khi xóa; bỏ trống = layer kề bên. */
    private readonly nextActive?: ID,
  ) {}

  execute(doc: Document): void {
    const index = doc.indexOfLayer(this.layer.id);
    if (index < 0) throw new Error(`Không thấy layer ${this.layer.id}`);
    this.index = index;
    this.previousActive = doc.activeLayerId;
    const neighbour =
      (index > 0 ? doc.layers.at(index - 1) : undefined) ?? doc.layers.at(index + 1);
    const wasActive = doc.activeLayerId === this.layer.id;
    doc.removeLayer(this.layer.id);
    const next = this.nextActive ?? (wasActive ? neighbour?.id : undefined);
    if (next && doc.getLayer(next)) doc.activeLayerId = next;
    this.removed = true;
  }

  undo(doc: Document): void {
    restoreSurfaces([this.layer]);
    doc.insertLayer(this.layer, this.index);
    if (this.previousActive && doc.getLayer(this.previousActive)) {
      doc.activeLayerId = this.previousActive;
    }
    this.removed = false;
  }

  memoryBytes(): number {
    return 0;
  }

  affectedArea(): Rect | null {
    return null;
  }

  archivables(): readonly Archivable[] {
    return this.removed ? surfacesOf([this.layer]) : [];
  }

  dispose(): void {
    if (this.removed) this.layer.dispose();
  }
}

/** Đổi thứ tự (kéo thả trong panel Layers): đưa layer tới vị trí `to` (chỉ số từ dưới lên). */
export class MoveLayerCommand implements Command {
  readonly timestamp = Date.now();
  private from = -1;

  constructor(
    readonly label: string,
    private readonly layerId: ID,
    private readonly to: number,
  ) {}

  execute(doc: Document): void {
    this.from = doc.indexOfLayer(this.layerId);
    move(doc, this.layerId, this.to);
  }

  undo(doc: Document): void {
    move(doc, this.layerId, this.from);
  }

  memoryBytes(): number {
    return 0;
  }

  affectedArea(): Rect | null {
    return null;
  }
}

function move(doc: Document, id: ID, to: number): void {
  const layer = doc.getLayer(id);
  if (!layer) throw new Error(`Không thấy layer ${id}`);
  const layers = doc.layers.filter((l) => l.id !== id);
  layers.splice(Math.max(0, Math.min(to, layers.length)), 0, layer);
  doc.layers = layers;
}

/** Thuộc tính layer đổi được qua panel Layers (mục 2). */
export interface LayerProps {
  name: string;
  visible: boolean;
  locked: boolean;
  alphaLocked: boolean;
  opacity: number;
  blendMode: BlendMode;
}

const PROPS_MERGE_WINDOW_MS = 1000;

/**
 * Đổi thuộc tính layer. Kéo slider opacity liên tục được gộp thành một bước (các lần đổi cách nhau
 * < 1 s trên cùng layer, cùng thuộc tính).
 */
export class LayerPropsCommand implements Command {
  readonly timestamp = Date.now();
  private lastChange = this.timestamp;
  private before: Partial<LayerProps> = {};
  private after: Partial<LayerProps>;

  constructor(
    readonly label: string,
    private readonly layerId: ID,
    patch: Partial<LayerProps>,
  ) {
    this.after = { ...patch };
  }

  execute(doc: Document): void {
    const layer = this.layer(doc);
    const before: Partial<LayerProps> = {};
    for (const key of Object.keys(this.after) as (keyof LayerProps)[]) {
      (before as Record<string, unknown>)[key] = layer[key];
    }
    this.before = before;
    assign(layer, this.after);
  }

  undo(doc: Document): void {
    assign(this.layer(doc), this.before);
  }

  memoryBytes(): number {
    return 0;
  }

  affectedArea(): Rect | null {
    return null;
  }

  mergeWith(next: Command): boolean {
    if (!(next instanceof LayerPropsCommand) || next.layerId !== this.layerId) return false;
    const keys = Object.keys(this.after).sort().join();
    if (keys !== 'opacity' || Object.keys(next.after).sort().join() !== keys) return false;
    if (next.timestamp - this.lastChange > PROPS_MERGE_WINDOW_MS) return false;
    this.after = { ...next.after };
    this.lastChange = next.timestamp;
    return true;
  }

  private layer(doc: Document): Layer {
    const layer = doc.getLayer(this.layerId);
    if (!layer) throw new Error(`Không thấy layer ${this.layerId}`);
    return layer;
  }
}

function assign(layer: Layer, props: Partial<LayerProps>): void {
  if (props.name !== undefined) layer.name = props.name;
  if (props.visible !== undefined) layer.visible = props.visible;
  if (props.locked !== undefined) layer.locked = props.locked;
  if (props.alphaLocked !== undefined) layer.alphaLocked = props.alphaLocked;
  if (props.opacity !== undefined) layer.opacity = props.opacity;
  if (props.blendMode !== undefined) layer.blendMode = props.blendMode;
}

/**
 * Thay toàn bộ danh sách layer (Merge Visible, Flatten): giữ danh sách trước/sau. Layer bị gộp nằm
 * trong command (surface được nén lúc rảnh); layer kết quả bị giải phóng nếu command rơi khỏi nhánh
 * redo.
 */
export class ReplaceLayersCommand implements Command {
  readonly timestamp = Date.now();
  private before: Layer[] = [];
  private beforeActive: ID = '';
  private applied = false;

  constructor(
    readonly label: string,
    private readonly after: readonly Layer[],
    private readonly afterActive: ID,
  ) {}

  execute(doc: Document): void {
    if (!this.applied && this.before.length === 0) {
      this.before = [...doc.layers];
      this.beforeActive = doc.activeLayerId;
    }
    restoreSurfaces(this.created());
    doc.layers = [...this.after];
    doc.activeLayerId = this.afterActive;
    this.applied = true;
  }

  undo(doc: Document): void {
    restoreSurfaces(this.removed());
    doc.layers = [...this.before];
    doc.activeLayerId = this.beforeActive;
    this.applied = false;
  }

  memoryBytes(): number {
    return 0;
  }

  affectedArea(): Rect | null {
    return null;
  }

  archivables(): readonly Archivable[] {
    return this.applied ? surfacesOf(this.removed()) : [];
  }

  dispose(): void {
    for (const layer of this.applied ? this.removed() : this.created()) layer.dispose();
  }

  private removed(): Layer[] {
    const kept = new Set(this.after);
    return this.before.filter((l) => !kept.has(l));
  }

  private created(): Layer[] {
    const old = new Set(this.before);
    return this.after.filter((l) => !old.has(l));
  }
}

/** Thay danh sách đối tượng của layer chú thích (gộp hai layer chú thích — Merge Down). */
export class SetObjectsCommand implements Command {
  readonly timestamp = Date.now();
  private before: AnnotationObject[] = [];

  constructor(
    readonly label: string,
    private readonly layerId: ID,
    private readonly objects: readonly AnnotationObject[],
  ) {}

  execute(doc: Document): void {
    const layer = this.layer(doc);
    this.before = layer.objects;
    layer.objects = [...this.objects];
    touchContent(layer);
  }

  undo(doc: Document): void {
    const layer = this.layer(doc);
    layer.objects = this.before;
    touchContent(layer);
  }

  memoryBytes(): number {
    return 0;
  }

  affectedArea(): Rect | null {
    return null;
  }

  private layer(doc: Document): VectorLayer {
    const layer = doc.getLayer(this.layerId);
    if (layer?.kind !== 'vector') throw new Error(`Không thấy layer chú thích ${this.layerId}`);
    return layer;
  }
}

/**
 * Rasterize layer chú thích (mục 5.4): thay layer vector bằng layer raster cùng vị trí và thuộc
 * tính, nội dung là ảnh render cuối cùng của các đối tượng. Undo đặt lại layer vector; layer raster
 * được dựng lại từ đối tượng khi redo (cùng id, nên các PaintCommand sau vẫn đúng layer).
 */
export class RasterizeLayerCommand implements Command {
  readonly timestamp = Date.now();
  readonly rasterId = crypto.randomUUID();
  private raster: RasterLayer | null = null;

  constructor(
    readonly label: string,
    private readonly vector: VectorLayer,
    private readonly create: (id: ID, vector: VectorLayer) => RasterLayer,
  ) {}

  execute(doc: Document): void {
    const raster = this.create(this.rasterId, this.vector);
    try {
      doc.replaceLayer(this.vector.id, raster);
    } catch (error) {
      raster.dispose();
      throw error;
    }
    if (doc.activeLayerId === this.vector.id) doc.activeLayerId = raster.id;
    this.raster = raster;
  }

  undo(doc: Document): void {
    const raster = this.raster;
    if (!raster) return;
    doc.replaceLayer(raster.id, this.vector);
    if (doc.activeLayerId === raster.id) doc.activeLayerId = this.vector.id;
    raster.dispose();
    this.raster = null;
  }

  memoryBytes(): number {
    return 0;
  }

  affectedArea(): Rect | null {
    return null;
  }
}

/** Chạy nhiều command như một bước history (mục 5.6 — TransactionCommand). */
export class TransactionCommand implements Command {
  readonly timestamp = Date.now();
  private executed = 0;

  constructor(
    readonly label: string,
    private readonly children: readonly Command[],
  ) {}

  execute(doc: Document): void {
    // Lỗi giữa chừng: hoàn tác phần đã chạy để document không ở trạng thái dở dang.
    this.executed = 0;
    try {
      for (const child of this.children) {
        child.execute(doc);
        this.executed++;
      }
    } catch (error) {
      for (let i = this.executed - 1; i >= 0; i--) this.children[i]?.undo(doc);
      this.executed = 0;
      throw error;
    }
  }

  undo(doc: Document): void {
    for (let i = this.children.length - 1; i >= 0; i--) this.children[i]?.undo(doc);
  }

  memoryBytes(): number {
    return this.children.reduce((sum, c) => sum + c.memoryBytes(), 0);
  }

  affectedArea(): Rect | null {
    let area: Rect | null = null;
    for (const child of this.children) {
      const a = child.affectedArea?.();
      if (!a) return null;
      area = area
        ? {
            x: Math.min(area.x, a.x),
            y: Math.min(area.y, a.y),
            width: Math.max(area.x + area.width, a.x + a.width) - Math.min(area.x, a.x),
            height: Math.max(area.y + area.height, a.y + a.height) - Math.min(area.y, a.y),
          }
        : { ...a };
    }
    return area;
  }

  archivables(old: boolean): readonly Archivable[] {
    return this.children.flatMap((c) => c.archivables?.(old) ?? []);
  }

  dispose(): void {
    for (const child of this.children) child.dispose?.();
  }
}
