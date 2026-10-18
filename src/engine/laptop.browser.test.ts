import { afterEach, describe, expect, it } from 'vitest';
import type { Editor } from './core/Editor';
import type { AnnotationObject, Point } from './core/types';
import { createTestEditor } from './testing/helpers';

/**
 * GĐ8+9 (laptop — ADR 0028) ở mức engine, trên canvas thật của 3 engine: bám lưới cho tool hình học
 * và tool Chọn, căn chỉnh đối tượng, "Che thông tin" từ vùng chọn (mini toolbar), "hộp đen" input
 * kèm nhật ký lỗi, lưới hiển thị.
 */

const editors: Editor[] = [];
function track(editor: Editor): Editor {
  editors.push(editor);
  return editor;
}

afterEach(() => {
  for (const e of editors.splice(0)) e.dispose();
  document.body.replaceChildren();
});

const objectsOf = (editor: Editor): AnnotationObject[] =>
  editor.document?.layers.flatMap((l) => (l.kind === 'vector' ? l.objects : [])) ?? [];

function drag(editor: Editor, a: Point, b: Point): void {
  editor.dispatchPointer('down', a);
  for (let i = 1; i <= 5; i++) {
    const t = i / 5;
    editor.dispatchPointer('move', { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  editor.dispatchPointer('up', b);
}

function rectOf(object: AnnotationObject | undefined) {
  if (object?.type !== 'rect') throw new Error('không phải khung');
  return object.rect;
}

describe('bám lưới (Grid, căn chỉnh — mục 2, P2)', () => {
  it('tool hình học: điểm đầu và cuối làm tròn tới giao điểm lưới', () => {
    const editor = track(createTestEditor(400, 300));
    editor.setGuides({ grid: true, gridSize: 20, snap: true });
    editor.tools.setActive('rect');
    drag(editor, { x: 13, y: 27 }, { x: 88, y: 61 });
    // (13, 27) → (20, 20); (88, 61) → (80, 60).
    expect(rectOf(objectsOf(editor)[0])).toEqual({ x: 20, y: 20, width: 60, height: 40 });
  });

  it('tắt bám lưới: tọa độ giữ nguyên', () => {
    const editor = track(createTestEditor(400, 300));
    editor.setGuides({ grid: true, gridSize: 20, snap: false });
    editor.tools.setActive('rect');
    drag(editor, { x: 13, y: 27 }, { x: 88, y: 61 });
    expect(rectOf(objectsOf(editor)[0])).toEqual({ x: 13, y: 27, width: 75, height: 34 });
  });

  it('tool Chọn: bấm đúng đối tượng, dời theo bội số khoảng cách lưới', () => {
    const editor = track(createTestEditor(400, 300));
    editor.tools.setActive('redact');
    drag(editor, { x: 40, y: 40 }, { x: 120, y: 100 });
    editor.setGuides({ gridSize: 25, snap: true });
    editor.tools.setActive('select');
    // Bấm giữa vùng che (không nằm trên lưới) vẫn chọn được; kéo (+31, +9) → dời (+25, 0).
    drag(editor, { x: 79, y: 71 }, { x: 110, y: 80 });
    const moved = objectsOf(editor)[0];
    expect(moved?.type === 'redact' && moved.rect).toEqual({ x: 65, y: 40, width: 80, height: 60 });
  });

  it('cỡ lưới bị kẹp trong 4–512 px', () => {
    const editor = track(createTestEditor(100, 100));
    editor.setGuides({ gridSize: 1 });
    expect(editor.guides.gridSize).toBe(4);
    editor.setGuides({ gridSize: 9000 });
    expect(editor.guides.gridSize).toBe(512);
  });
});

describe('căn chỉnh đối tượng (mục 2)', () => {
  it('nhiều đối tượng: căn theo hình bao chung; một bước history', () => {
    const editor = track(createTestEditor(400, 300));
    editor.tools.setActive('rect');
    drag(editor, { x: 40, y: 40 }, { x: 100, y: 80 });
    drag(editor, { x: 150, y: 120 }, { x: 260, y: 200 });
    const ids = objectsOf(editor).map((o) => o.id);
    editor.tools.setActive('select');
    editor.objects.select(ids);
    const steps = editor.historySummary().steps;
    expect(editor.objects.align('left')).toBe(true);
    const [a, b] = objectsOf(editor).map(rectOf);
    expect(a?.x).toBe(40);
    expect(b?.x).toBe(40);
    expect(editor.historySummary().steps).toBe(steps + 1);
    expect(editor.objects.align('bottom')).toBe(true);
    const after = objectsOf(editor).map(rectOf);
    expect(after[0].y + after[0].height).toBe(after[1].y + after[1].height);
    editor.undo();
    editor.undo();
    expect(objectsOf(editor).map(rectOf)[1]).toEqual({ x: 150, y: 120, width: 110, height: 80 });
  });

  it('một đối tượng: căn theo khung ảnh (giữa)', () => {
    const editor = track(createTestEditor(400, 300));
    editor.tools.setActive('rect');
    drag(editor, { x: 10, y: 10 }, { x: 110, y: 60 });
    editor.tools.setActive('select');
    editor.objects.select([objectsOf(editor)[0].id]);
    editor.objects.align('centerX');
    editor.objects.align('centerY');
    const bounds = editor.objects.selectionBounds()!;
    expect(Math.abs(bounds.x + bounds.width / 2 - 200)).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds.y + bounds.height / 2 - 150)).toBeLessThanOrEqual(1);
  });
});

describe('"Che thông tin" từ vùng chọn (mini toolbar — mục 7.6)', () => {
  it('thêm Redact phủ hình bao vùng chọn theo option hiện tại rồi bỏ chọn', () => {
    const editor = track(createTestEditor(300, 200));
    editor.options.set('redact', { mode: 'pixelate', blockSize: 20 });
    editor.selection.select({ kind: 'ellipse', rect: { x: 30, y: 40, width: 100, height: 60 } });
    expect(editor.selection.redact()).toBe(true);
    const redact = objectsOf(editor).find((o) => o.type === 'redact');
    expect(redact?.type === 'redact' && redact.mode).toBe('pixelate');
    expect(redact?.type === 'redact' && redact.strength).toBe(20);
    expect(redact?.type === 'redact' && redact.rect).toEqual({
      x: 30,
      y: 40,
      width: 100,
      height: 60,
    });
    expect(editor.selection.hasSelection).toBe(false);
    expect(editor.canUndo).toBe(true);
  });

  it('không có vùng chọn: không làm gì', () => {
    const editor = track(createTestEditor(100, 100));
    expect(editor.selection.redact()).toBe(false);
    expect(objectsOf(editor)).toHaveLength(0);
  });
});

describe('"hộp đen" input kèm nhật ký lỗi (mục 10.3)', () => {
  it('luôn ghi các thao tác gần nhất, giới hạn số sự kiện', () => {
    const editor = track(createTestEditor(200, 200));
    editor.tools.setActive('rect');
    drag(editor, { x: 10, y: 10 }, { x: 50, y: 50 });
    const recording = editor.recentInput();
    expect(recording?.format).toBe('paint-online-input');
    expect(recording?.events.some((e) => e.type === 'down')).toBe(true);
    expect(recording?.events.some((e) => e.type === 'tool')).toBe(true);
    editor.tools.setActive('pencil');
    editor.dispatchPointer('down', { x: 1, y: 1 });
    for (let i = 0; i < 4000; i++) editor.dispatchPointer('move', { x: i % 200, y: 5 });
    editor.dispatchPointer('up', { x: 5, y: 5 });
    const tail = editor.recentInput();
    expect(tail?.events.length).toBe(1500);
    expect(tail?.events.at(-1)?.type).toBe('up');
  });
});
