import type { Document } from '../../core/Document';
import type {
  AnnotationObject,
  Color,
  ColorsState,
  ID,
  NoticeCode,
  ObjectSelectionSummary,
  Point,
  Rect,
} from '../../core/types';
import { AddLayerCommand, TransactionCommand } from '../../history/commands/LayerCommand';
import { ObjectCommand, type ObjectChange } from '../../history/commands/ObjectCommand';
import type { Command } from '../../history/types';
import { VectorLayer } from '../../layers/layers';
import {
  boxHandlePosition,
  rectsOverlap,
  rotateAround,
  rectCenter,
} from '../../layers/objects/geometry';
import { objectBounds, rendererFor } from '../../layers/objects/registry';
import { withColor, withStyle } from '../../layers/objects/style';
import type { HandleId, ObjectEnv, ObjectFrame } from '../../layers/objects/types';
import type { PendingObjects } from '../../render/Compositor';
import { unionRect } from '../../utils/rect';
import type { Viewport } from '../../viewport/Viewport';
import type { OverlayContext } from '../types';

/** Những gì ObjectController cần từ Editor. */
export interface ObjectHost {
  document(): Document | null;
  readonly env: ObjectEnv;
  readonly viewport: Viewport;
  /** Chạy command qua history; false nếu bị từ chối (thiếu bộ nhớ — đã báo người dùng). */
  execute(command: Command): boolean;
  invalidate(rect?: Rect): void;
  invalidateOverlay(): void;
  notify(code: NoticeCode): void;
  colors(): Readonly<ColorsState>;
  /** Tên layer tự tạo (chuỗi giao diện do UI cung cấp — quy tắc 13.1.7). */
  layerName(kind: 'raster' | 'vector', n: number): string;
  selectionChanged(summary: ObjectSelectionSummary): void;
}

/** Cạnh/tâm để căn chỉnh đối tượng. */
export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';

/** Độ dời (làm tròn px) để `box` căn với `target` theo `mode`. */
export function alignOffset(mode: AlignMode, box: Rect, target: Rect): [number, number] {
  switch (mode) {
    case 'left':
      return [Math.round(target.x - box.x), 0];
    case 'centerX':
      return [Math.round(target.x + target.width / 2 - (box.x + box.width / 2)), 0];
    case 'right':
      return [Math.round(target.x + target.width - (box.x + box.width)), 0];
    case 'top':
      return [0, Math.round(target.y - box.y)];
    case 'centerY':
      return [0, Math.round(target.y + target.height / 2 - (box.y + box.height / 2))];
    case 'bottom':
      return [0, Math.round(target.y + target.height - (box.y + box.height))];
  }
}

export interface ObjectHit {
  layer: VectorLayer;
  object: AnnotationObject;
  index: number;
}

/** Kích thước handle trên màn hình (CSS px) và vùng bắt chuột quanh handle. */
export const HANDLE_SIZE = 8;
const HANDLE_HIT = 7;
/** Khoảng cách handle xoay phía trên khung (CSS px). */
export const ROTATE_OFFSET = 26;
/** Dung sai bắt trúng đối tượng (CSS px) — đổi sang px document theo zoom. */
const HIT_TOLERANCE = 5;

const ACCENT = '#3B5BDB';

/**
 * Đối tượng vector trong Editor: chọn, tìm theo điểm, bản nháp khi kéo/tạo, ghi thay đổi bằng
 * ObjectCommand và tự tạo layer chú thích khi cần (mục 5.3). Dùng chung cho tool Select và các tool
 * shape (đối tượng vừa tạo được chọn sẵn để sửa ngay).
 */
export class ObjectController {
  private selected: ID[] = [];
  private overrideMap: Map<ID, AnnotationObject | null> | null = null;
  private pendingDraft: PendingObjects | null = null;
  private lastSummaryKey = '';

  constructor(private readonly host: ObjectHost) {}

  // ---------------------------------------------------------------------------
  // Trạng thái vẽ (Compositor đọc)
  // ---------------------------------------------------------------------------

  get overrides(): ReadonlyMap<ID, AnnotationObject | null> | null {
    return this.overrideMap;
  }

  get pending(): PendingObjects | null {
    return this.pendingDraft;
  }

  /** Đặt bản nháp thay thế (đang kéo) — vẽ lại vùng cũ ∪ mới. */
  setOverrides(map: Map<ID, AnnotationObject | null> | null): void {
    const before = this.overrideArea(this.overrideMap);
    this.overrideMap = map && map.size > 0 ? map : null;
    const after = this.overrideArea(this.overrideMap);
    this.invalidateUnion(before, after);
    this.host.invalidateOverlay();
  }

  setPending(draft: PendingObjects | null): void {
    const before = this.pendingArea(this.pendingDraft);
    this.pendingDraft = draft;
    this.invalidateUnion(before, this.pendingArea(draft));
  }

  // ---------------------------------------------------------------------------
  // Tra cứu
  // ---------------------------------------------------------------------------

  /** Dung sai bắt trúng (px document) theo zoom hiện tại. */
  get tolerance(): number {
    return HIT_TOLERANCE / this.host.viewport.zoom;
  }

  find(id: ID): ObjectHit | null {
    const doc = this.host.document();
    if (!doc) return null;
    for (const layer of doc.layers) {
      if (layer.kind !== 'vector') continue;
      const index = layer.objects.findIndex((o) => o.id === id);
      if (index >= 0) return { layer, object: layer.objects[index], index };
    }
    return null;
  }

  /** Đối tượng trên cùng tại điểm `p` (document), trong các layer chú thích đang hiện và không khóa. */
  hitTest(p: Readonly<Point>): ObjectHit | null {
    const doc = this.host.document();
    if (!doc) return null;
    const tolerance = this.tolerance;
    for (let li = doc.layers.length - 1; li >= 0; li--) {
      const layer = doc.layers[li];
      if (layer.kind !== 'vector' || !layer.visible || layer.locked) continue;
      for (let i = layer.objects.length - 1; i >= 0; i--) {
        const object = layer.objects[i];
        if (object.locked) continue;
        if (rendererFor(object)?.hitTest(object, p, tolerance, this.host.env)) {
          return { layer, object, index: i };
        }
      }
    }
    return null;
  }

  /** Đối tượng giao với khung kéo chọn (document). */
  objectsInRect(rect: Readonly<Rect>): ID[] {
    const doc = this.host.document();
    if (!doc) return [];
    const ids: ID[] = [];
    for (const layer of doc.layers) {
      if (layer.kind !== 'vector' || !layer.visible || layer.locked) continue;
      for (const object of layer.objects) {
        if (!object.locked && rectsOverlap(objectBounds(object, this.host.env), rect))
          ids.push(object.id);
      }
    }
    return ids;
  }

  // ---------------------------------------------------------------------------
  // Vùng chọn đối tượng
  // ---------------------------------------------------------------------------

  get selection(): readonly ID[] {
    return this.selected;
  }

  get hasSelection(): boolean {
    return this.selected.length > 0;
  }

  selectedHits(): ObjectHit[] {
    return this.selected.flatMap((id) => this.find(id) ?? []);
  }

  /** Chọn đối tượng; layer của đối tượng đầu tiên thành layer hoạt động. */
  select(ids: readonly ID[]): void {
    const unique = [...new Set(ids)].filter((id) => this.find(id));
    this.selected = unique;
    const first = unique[0] ? this.find(unique[0]) : null;
    const doc = this.host.document();
    if (first && doc && doc.activeLayerId !== first.layer.id) doc.activeLayerId = first.layer.id;
    this.changed();
  }

  clearSelection(): void {
    if (this.selected.length === 0) return;
    this.selected = [];
    this.changed();
  }

  /** Bỏ khỏi vùng chọn các đối tượng không còn tồn tại (sau undo/redo, xóa layer). */
  prune(): void {
    const next = this.selected.filter((id) => this.find(id));
    if (next.length !== this.selected.length) this.selected = next;
    this.changed();
  }

  /** Handle của đối tượng đang chọn (chỉ khi chọn đúng một đối tượng) dưới điểm màn hình. */
  hitHandle(screen: Readonly<Point>): { hit: ObjectHit; handle: HandleId } | null {
    if (this.selected.length !== 1) return null;
    const hit = this.selectedHits().at(0);
    if (!hit) return null;
    const frame = rendererFor(hit.object)?.frame(hit.object, this.host.env);
    if (!frame) return null;
    for (const [handle, pos] of this.handlePositions(frame)) {
      const s = this.host.viewport.docToScreen(pos);
      if (Math.abs(s.x - screen.x) <= HANDLE_HIT && Math.abs(s.y - screen.y) <= HANDLE_HIT) {
        return { hit, handle };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Ghi thay đổi (Command)
  // ---------------------------------------------------------------------------

  /**
   * Layer chú thích để thêm đối tượng mới (mục 5.3): layer hoạt động nếu là layer chú thích; nếu
   * layer hoạt động là raster thì dùng layer chú thích ngay phía trên, chưa có thì tạo "Chú thích N".
   */
  vectorTarget(): { layer: VectorLayer; create: AddLayerCommand | null } | null {
    const doc = this.host.document();
    if (!doc) return null;
    const active = doc.activeLayer;
    if (active.kind === 'vector') {
      if (active.locked) {
        this.host.notify('layer.locked');
        return null;
      }
      if (!active.visible) {
        this.host.notify('layer.hidden');
        return null;
      }
      return { layer: active, create: null };
    }
    const index = doc.indexOfLayer(active.id);
    const above = index + 1 < doc.layers.length ? doc.layers[index + 1] : null;
    if (above?.kind === 'vector' && above.visible && !above.locked) {
      doc.activeLayerId = above.id;
      return { layer: above, create: null };
    }
    const n = doc.layers.filter((l) => l.kind === 'vector').length + 1;
    const layer = new VectorLayer({ name: this.host.layerName('vector', n) });
    return { layer, create: new AddLayerCommand('history.addLayer', layer, index + 1) };
  }

  /** Thêm đối tượng (tự tạo layer chú thích nếu cần) và chọn nó. */
  add(object: AnnotationObject, label: string): boolean {
    const target = this.vectorTarget();
    if (!target) return false;
    const change: ObjectChange = {
      layerId: target.layer.id,
      before: null,
      after: object,
      beforeIndex: -1,
      afterIndex: target.create ? 0 : target.layer.objects.length,
    };
    const objectCommand = new ObjectCommand({
      label,
      changes: [change],
      area: objectBounds(object, this.host.env),
    });
    const command = target.create
      ? new TransactionCommand(label, [target.create, objectCommand])
      : objectCommand;
    if (!this.host.execute(command)) return false;
    this.select([object.id]);
    return true;
  }

  /** Thay đối tượng bằng phiên bản mới (cùng id, cùng vị trí). */
  replace(objects: readonly AnnotationObject[], label: string, mergeKey?: string): boolean {
    const changes: ObjectChange[] = [];
    let area: Rect | null = null;
    for (const next of objects) {
      const hit = this.find(next.id);
      if (!hit || hit.object === next) continue;
      changes.push({
        layerId: hit.layer.id,
        before: hit.object,
        after: next,
        beforeIndex: hit.index,
        afterIndex: hit.index,
      });
      const b = unionRect(
        objectBounds(hit.object, this.host.env),
        objectBounds(next, this.host.env),
      );
      area = area ? unionRect(area, b) : b;
    }
    if (changes.length === 0) return false;
    const ok = this.host.execute(new ObjectCommand({ label, changes, area, mergeKey }));
    this.changed();
    return ok;
  }

  /** Xóa các đối tượng đang chọn. */
  deleteSelected(): boolean {
    const hits = this.selectedHits();
    if (hits.length === 0) return false;
    let area: Rect | null = null;
    const changes = hits.map((hit): ObjectChange => {
      const b = objectBounds(hit.object, this.host.env);
      area = area ? unionRect(area, b) : b;
      return {
        layerId: hit.layer.id,
        before: hit.object,
        after: null,
        beforeIndex: hit.index,
        afterIndex: -1,
      };
    });
    const ok = this.host.execute(
      new ObjectCommand({ label: 'history.deleteObject', changes, area }),
    );
    if (ok) this.clearSelection();
    return ok;
  }

  /** Đưa đối tượng đang chọn lên trên cùng / xuống dưới cùng trong layer của nó. */
  reorderSelected(where: 'front' | 'back'): boolean {
    const hits = this.selectedHits();
    if (hits.length === 0) return false;
    let area: Rect | null = null;
    const changes: ObjectChange[] = [];
    for (const hit of hits) {
      const last = hit.layer.objects.length - 1;
      const target = where === 'front' ? last : 0;
      if (hit.index === target) continue;
      const b = objectBounds(hit.object, this.host.env);
      area = area ? unionRect(area, b) : b;
      changes.push({
        layerId: hit.layer.id,
        before: hit.object,
        after: hit.object,
        beforeIndex: hit.index,
        afterIndex: target,
      });
    }
    if (changes.length === 0) return false;
    return this.host.execute(
      new ObjectCommand({
        label: where === 'front' ? 'history.bringToFront' : 'history.sendToBack',
        changes,
        area,
      }),
    );
  }

  /** Dời đối tượng đang chọn (phím mũi tên) — các lần nudge liên tiếp gộp thành một bước. */
  nudge(dx: number, dy: number): boolean {
    const hits = this.selectedHits();
    const moved = hits.flatMap(
      (hit) => rendererFor(hit.object)?.translate(hit.object, dx, dy) ?? [],
    );
    return this.replace(moved, 'history.moveObject', 'nudge');
  }

  /**
   * Căn chỉnh đối tượng đang chọn (mục 2 — "căn chỉnh"): nhiều đối tượng căn theo hình bao chung;
   * một đối tượng căn theo khung ảnh. Một bước history.
   */
  align(mode: AlignMode): boolean {
    const hits = this.selectedHits();
    const doc = this.host.document();
    if (hits.length === 0 || !doc) return false;
    const boxes = hits.map((hit) => objectBounds(hit.object, this.host.env));
    const target =
      hits.length === 1 ? doc.bounds : boxes.reduce((area, box) => unionRect(area, box));
    const moved = hits.flatMap((hit, i) => {
      const box = boxes[i];
      const [dx, dy] = alignOffset(mode, box, target);
      if (dx === 0 && dy === 0) return [];
      return rendererFor(hit.object)?.translate(hit.object, dx, dy) ?? [];
    });
    if (moved.length === 0) return false;
    return this.replace(moved, 'history.alignObjects');
  }

  /** Áp option (Options bar) lên đối tượng đang chọn. */
  applyStyle(patch: Readonly<Record<string, unknown>>, mergeKey: string): boolean {
    const colors = this.host.colors();
    const next = this.selectedHits().map((hit) => withStyle(hit.object, patch, colors));
    return this.replace(next, 'history.styleObject', mergeKey);
  }

  /**
   * Áp kiểu dựng sẵn (preset — GĐ7) cho đối tượng đang chọn: option + màu chính/phụ trong MỘT bước
   * history.
   */
  applyPreset(
    patch: Readonly<Record<string, unknown>>,
    colors: { primary?: Color; secondary?: Color },
  ): boolean {
    const state = this.host.colors();
    const next = this.selectedHits().map((hit) => {
      let obj = withStyle(hit.object, patch, { ...state, ...colors });
      if (colors.primary) obj = withColor(obj, 'primary', colors.primary);
      if (colors.secondary) obj = withColor(obj, 'secondary', colors.secondary);
      return obj;
    });
    return this.replace(next, 'history.styleObject');
  }

  /** Đổi màu đối tượng đang chọn khi người dùng chọn màu (mục 7.2). */
  applyColor(slot: 'primary' | 'secondary', color: Color, mergeKey: string): boolean {
    const next = this.selectedHits().map((hit) => withColor(hit.object, slot, color));
    return this.replace(next, 'history.styleObject', mergeKey);
  }

  // ---------------------------------------------------------------------------
  // Overlay: khung chọn và handle (CSS px)
  // ---------------------------------------------------------------------------

  renderOverlay({ ctx, viewport }: OverlayContext): void {
    const hits = this.selectedHits();
    if (hits.length === 0) return;
    ctx.save();
    for (const hit of hits) {
      const object = this.overrideMap?.get(hit.object.id) ?? hit.object;
      if (this.overrideMap?.get(hit.object.id) === null) continue;
      const frame = rendererFor(object)?.frame(object, this.host.env);
      if (!frame) continue;
      this.drawFrame(ctx, viewport, frame, hits.length === 1);
    }
    ctx.restore();
  }

  private drawFrame(
    ctx: OverlayContext['ctx'],
    viewport: Viewport,
    frame: ObjectFrame,
    withHandles: boolean,
  ): void {
    const toScreen = (p: Point) => viewport.docToScreen(p);
    ctx.lineWidth = 1;
    ctx.strokeStyle = ACCENT;
    ctx.setLineDash(withHandles ? [] : [4, 3]);
    if (frame.kind === 'box') {
      const c = rectCenter(frame.rect);
      const corners = [
        { x: frame.rect.x, y: frame.rect.y },
        { x: frame.rect.x + frame.rect.width, y: frame.rect.y },
        { x: frame.rect.x + frame.rect.width, y: frame.rect.y + frame.rect.height },
        { x: frame.rect.x, y: frame.rect.y + frame.rect.height },
      ].map((p) => toScreen(rotateAround(p, c, frame.rotation)));
      ctx.beginPath();
      corners.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.stroke();
    } else if (frame.points.length > 1 && !withHandles) {
      ctx.beginPath();
      frame.points.forEach((p, i) => {
        const s = toScreen(p);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (!withHandles) return;

    const handles = this.handlePositions(frame);
    if (frame.kind === 'box' && frame.handles.includes('rotate')) {
      const top = toScreen(boxHandlePosition(frame.rect, frame.rotation, 'n', 0));
      const rot = handles.get('rotate');
      if (rot) {
        const r = toScreen(rot);
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(r.x, r.y);
        ctx.stroke();
      }
    }
    for (const [handle, pos] of handles) {
      const s = toScreen(pos);
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (handle === 'rotate' || handle === 'control' || frame.kind === 'points') {
        ctx.arc(s.x, s.y, HANDLE_SIZE / 2 + (handle === 'control' ? 0 : 0.5), 0, Math.PI * 2);
        if (handle === 'control') ctx.fillStyle = '#E7ECFF';
      } else {
        ctx.rect(s.x - HANDLE_SIZE / 2, s.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
      }
      ctx.fill();
      ctx.stroke();
    }
  }

  /** Vị trí (document) của mọi handle trong khung. */
  private handlePositions(frame: ObjectFrame): Map<HandleId, Point> {
    const map = new Map<HandleId, Point>();
    if (frame.kind === 'box') {
      const offset = ROTATE_OFFSET / this.host.viewport.zoom;
      for (const handle of frame.handles) {
        map.set(handle, boxHandlePosition(frame.rect, frame.rotation, handle, offset));
      }
    } else {
      frame.points.forEach((p, i) => map.set(`p${String(i)}` as HandleId, p));
      if (frame.control) map.set('control', frame.control);
    }
    return map;
  }

  // ---------------------------------------------------------------------------

  private changed(): void {
    const hits = this.selectedHits();
    const layerId = hits.at(0)?.layer.id ?? null;
    const key = `${layerId ?? ''}|${hits.map((h) => h.object.id).join(',')}|${hits.map((h) => objectVersion(h.object)).join(',')}`;
    if (key === this.lastSummaryKey) return;
    this.lastSummaryKey = key;
    this.host.selectionChanged({ layerId, objects: hits.map((h) => h.object) });
    this.host.invalidateOverlay();
  }

  /** Hình bao (document) của các đối tượng đang chọn — mini toolbar đặt cạnh vùng này. */
  selectionBounds(): Rect | null {
    let area: Rect | null = null;
    for (const id of this.selection) {
      const o = this.find(id)?.object;
      if (!o) continue;
      const b = objectBounds(o, this.host.env);
      area = area ? unionRect(area, b) : b;
    }
    return area;
  }

  private overrideArea(map: ReadonlyMap<ID, AnnotationObject | null> | null): Rect | null {
    if (!map) return null;
    let area: Rect | null = null;
    for (const [id, object] of map) {
      const original = this.find(id)?.object;
      for (const o of [original, object]) {
        if (!o) continue;
        const b = objectBounds(o, this.host.env);
        area = area ? unionRect(area, b) : b;
      }
    }
    return area;
  }

  private pendingArea(draft: PendingObjects | null): Rect | null {
    if (!draft) return null;
    let area: Rect | null = null;
    for (const o of draft.objects) {
      const b = objectBounds(o, this.host.env);
      area = area ? unionRect(area, b) : b;
    }
    return area;
  }

  private invalidateUnion(a: Rect | null, b: Rect | null): void {
    const area = a && b ? unionRect(a, b) : (a ?? b);
    if (area) this.host.invalidate(area);
  }
}

/** Đối tượng bất biến: mỗi lần sửa là một object mới — dùng tham chiếu làm "phiên bản". */
const versions = new WeakMap<AnnotationObject, number>();
let versionSeq = 0;
function objectVersion(object: AnnotationObject): number {
  let v = versions.get(object);
  if (v === undefined) {
    v = ++versionSeq;
    versions.set(object, v);
  }
  return v;
}
