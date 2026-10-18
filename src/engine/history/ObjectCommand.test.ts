import { describe, expect, it } from 'vitest';
import { Document } from '../core/Document';
import type { AnnotationObject, RectObject } from '../core/types';
import { VectorLayer } from '../layers/layers';
import { MemoryBudget, TIER_BUDGETS } from '../memory/MemoryBudget';
import { AddLayerCommand, TransactionCommand } from './commands/LayerCommand';
import { ObjectCommand, type ObjectChange } from './commands/ObjectCommand';
import { History } from './History';

/** Logic history của đối tượng vector — không cần canvas (layer vector chỉ là dữ liệu). */

function rect(id: string, x = 0): RectObject {
  return {
    id,
    type: 'rect',
    rotation: 0,
    opacity: 1,
    rect: { x, y: 0, width: 10, height: 10 },
    stroke: { color: '#000000FF', width: 2 },
    cornerRadius: 0,
  };
}

function setup() {
  const budget = new MemoryBudget(TIER_BUDGETS.desktop);
  const doc = Document.create(
    {
      width: 100,
      height: 100,
      background: { kind: 'transparent' },
      layers: [
        { kind: 'raster', name: 'Nền' },
        { kind: 'vector', name: 'Chú thích 1' },
      ],
    },
    budget,
  );
  const layer = doc.layers[1] as VectorLayer;
  return { doc, layer, history: new History(budget) };
}

const ids = (layer: VectorLayer) => layer.objects.map((o) => o.id);

function add(layerId: string, object: AnnotationObject, index: number): ObjectChange {
  return { layerId, before: null, after: object, beforeIndex: -1, afterIndex: index };
}

describe('ObjectCommand (mục 5.6: JSON trước/sau của đối tượng)', () => {
  it('thêm, sửa, xóa; undo/redo đúng thứ tự và tăng rev', () => {
    const { doc, layer, history } = setup();
    const a = rect('a');
    const b = rect('b');
    history.execute(
      new ObjectCommand({ label: 'x', changes: [add(layer.id, a, 0)], area: null }),
      doc,
    );
    history.execute(
      new ObjectCommand({ label: 'x', changes: [add(layer.id, b, 1)], area: null }),
      doc,
    );
    const moved = rect('a', 50);
    history.execute(
      new ObjectCommand({
        label: 'x',
        changes: [{ layerId: layer.id, before: a, after: moved, beforeIndex: 0, afterIndex: 0 }],
        area: null,
      }),
      doc,
    );
    expect(ids(layer)).toEqual(['a', 'b']);
    expect(layer.objects[0]).toBe(moved);
    expect(doc.rev).toBe(3);

    history.undo(doc);
    expect(layer.objects[0]).toBe(a);
    history.undo(doc);
    expect(ids(layer)).toEqual(['a']);
    history.redo(doc);
    history.redo(doc);
    expect(layer.objects[0]).toBe(moved);
    expect(doc.rev).toBe(7);
  });

  it('xóa nhiều đối tượng rồi undo: chèn lại đúng vị trí cũ', () => {
    const { doc, layer, history } = setup();
    layer.objects = ['a', 'b', 'c', 'd'].map((id) => rect(id));
    const [a, , c] = layer.objects;
    history.execute(
      new ObjectCommand({
        label: 'x',
        changes: [
          { layerId: layer.id, before: a ?? null, after: null, beforeIndex: 0, afterIndex: -1 },
          { layerId: layer.id, before: c ?? null, after: null, beforeIndex: 2, afterIndex: -1 },
        ],
        area: null,
      }),
      doc,
    );
    expect(ids(layer)).toEqual(['b', 'd']);
    history.undo(doc);
    expect(ids(layer)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('đổi thứ tự (lên trên cùng) và undo', () => {
    const { doc, layer, history } = setup();
    layer.objects = ['a', 'b', 'c'].map((id) => rect(id));
    const a = layer.objects[0] ?? null;
    history.execute(
      new ObjectCommand({
        label: 'x',
        changes: [{ layerId: layer.id, before: a, after: a, beforeIndex: 0, afterIndex: 2 }],
        area: null,
      }),
      doc,
    );
    expect(ids(layer)).toEqual(['b', 'c', 'a']);
    history.undo(doc);
    expect(ids(layer)).toEqual(['a', 'b', 'c']);
  });

  it('gộp các thay đổi liên tiếp cùng khóa (kéo slider, nudge) thành một bước', () => {
    const { doc, layer, history } = setup();
    let current = rect('a');
    layer.objects = [current];
    for (let i = 1; i <= 5; i++) {
      const next = rect('a', i);
      history.execute(
        new ObjectCommand({
          label: 'nudge',
          changes: [
            { layerId: layer.id, before: current, after: next, beforeIndex: 0, afterIndex: 0 },
          ],
          area: null,
          mergeKey: 'nudge',
        }),
        doc,
      );
      current = next;
    }
    expect(history.steps).toBe(1);
    expect(layer.objects[0]?.type === 'rect' && layer.objects[0].rect.x).toBe(5);
    history.undo(doc);
    expect(layer.objects[0]?.type === 'rect' && layer.objects[0].rect.x).toBe(0);
  });

  it('tạo layer chú thích + đối tượng trong một bước; undo trả layer hoạt động cũ', () => {
    const { doc, history } = setup();
    const background = doc.layers[0];
    doc.activeLayerId = background?.id ?? '';
    const layer = new VectorLayer({ name: 'Chú thích 2' });
    history.execute(
      new TransactionCommand('x', [
        new AddLayerCommand('x', layer, 1),
        new ObjectCommand({ label: 'x', changes: [add(layer.id, rect('a'), 0)], area: null }),
      ]),
      doc,
    );
    expect(doc.layers.map((l) => l.name)).toEqual(['Nền', 'Chú thích 2', 'Chú thích 1']);
    expect(doc.activeLayerId).toBe(layer.id);
    expect(history.steps).toBe(1);
    history.undo(doc);
    expect(doc.layers.map((l) => l.name)).toEqual(['Nền', 'Chú thích 1']);
    expect(doc.activeLayerId).toBe(background?.id);
    history.redo(doc);
    expect(ids(layer)).toEqual(['a']);
  });

  it('Transaction lỗi giữa chừng: hoàn tác phần đã chạy', () => {
    const { doc, layer } = setup();
    const broken = new ObjectCommand({
      label: 'x',
      changes: [add('không-có', rect('z'), 0)],
      area: null,
    });
    const tx = new TransactionCommand('x', [
      new ObjectCommand({ label: 'x', changes: [add(layer.id, rect('a'), 0)], area: null }),
      broken,
    ]);
    expect(() => {
      tx.execute(doc);
    }).toThrow();
    expect(ids(layer)).toEqual([]);
  });
});
