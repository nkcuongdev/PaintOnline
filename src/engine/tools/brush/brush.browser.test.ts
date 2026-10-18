import { afterEach, describe, expect, it } from 'vitest';
import { GrowableSurface } from '../../memory/GrowableSurface';
import { MemoryBudget, TIER_BUDGETS } from '../../memory/MemoryBudget';
import { createTestEditor, pixelAt } from '../../testing/helpers';
import { Editor } from '../../core/Editor';
import { NO_WORKERS, TEST_PLATFORM } from '../../testing/helpers';
import { BrushStroke } from './BrushStroke';

const editors: Editor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.dispose();
  document.body.replaceChildren();
});

function mountInputEditor(zoom = 1) {
  const editor = new Editor({
    memory: TIER_BUDGETS.desktop,
    platform: { ...TEST_PLATFORM, coalescedEvents: true, predictedEvents: true },
    workers: NO_WORKERS,
    layerName: () => 'Layer',
  });
  editors.push(editor);
  editor.createDocument({
    width: 240,
    height: 120,
    background: { kind: 'transparent' },
    layers: [{ kind: 'raster', name: 'Layer' }],
  });
  const host = document.createElement('div');
  host.style.cssText = 'position: relative; width: 240px; height: 120px';
  document.body.append(host);
  editor.mount(host);
  editor.viewport.setDpr(1);
  editor.viewport.set({ zoom, panX: 0, panY: 0 });
  const overlay = host.querySelectorAll('canvas')[1];
  const rect = overlay.getBoundingClientRect();
  const pointer = (
    type: string,
    x: number,
    y: number,
    predicted: { x: number; y: number }[] = [],
  ) => {
    const sample = (sx: number, sy: number) =>
      new PointerEvent(type, {
        pointerId: 1,
        pointerType: 'mouse',
        clientX: rect.left + sx * zoom,
        clientY: rect.top + sy * zoom,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        bubbles: true,
      });
    const event = sample(x, y);
    Object.defineProperties(event, {
      getCoalescedEvents: { value: () => [sample(x, y)] },
      getPredictedEvents: { value: () => predicted.map((p) => sample(p.x, p.y)) },
    });
    overlay.dispatchEvent(event);
    editor.flush();
  };
  return { editor, overlay, pointer };
}

describe('độ trễ cọ tròn cứng', () => {
  it('chuột đổi hướng: không hiện đuôi dự đoán ngoài vị trí đã nhận', () => {
    const { overlay, pointer } = mountInputEditor();
    pointer('pointerdown', 20, 60);
    pointer('pointermove', 50, 60, [{ x: 150, y: 20 }]);
    const ctx = overlay.getContext('2d');
    if (!ctx) throw new Error('chưa mount');
    expect(pixelAt(ctx.getImageData(0, 0, 240, 120), 100, 40)[3]).toBe(0);
    pointer('pointermove', 50, 80, [{ x: 50, y: 115 }]);
    expect(pixelAt(ctx.getImageData(0, 0, 240, 120), 50, 100)[3]).toBe(0);
    pointer('pointerup', 50, 80);
  });

  it.each(['brush', 'eraser'] as const)('%s 8 px ở zoom 0.52 không mất con trỏ khi kéo', (tool) => {
    const { editor, overlay, pointer } = mountInputEditor(0.52);
    editor.tools.setActive(tool);
    editor.options.set(tool, { size: 8 });
    pointer('pointermove', 20, 60);
    expect(overlay.style.cursor).toBe('crosshair');
    pointer('pointerdown', 20, 60);
    expect(overlay.style.cursor).toBe('crosshair');
    pointer('pointermove', 80, 60);
    expect(overlay.style.cursor).toBe('crosshair');
    pointer('pointerup', 80, 60);
    expect(overlay.style.cursor).toBe('crosshair');
  });

  it('vẽ tới mẫu mới nhất ngay từ pointermove đầu tiên, kể cả khi con trỏ dừng lại', () => {
    const memory = new MemoryBudget(TIER_BUDGETS.desktop);
    const bounds = { x: 0, y: 0, width: 240, height: 120 };
    const buffer = new GrowableSurface(memory, bounds, 'temp');
    const stroke = new BrushStroke(
      memory,
      buffer,
      { size: 8, hardness: 1, flow: 1, cssColor: '#000000', mode: 'line' },
      () => {
        // Kiểm tra pixel trực tiếp trên buffer, không cần renderer.
      },
    );
    try {
      stroke.begin(20, 60);
      for (const x of [80, 140, 200]) {
        stroke.addPoint(x, 60);
        const pixels = buffer.read(bounds);
        expect(pixels).not.toBeNull();
        if (pixels) expect(pixelAt(pixels, x - 1, 60)[3]).toBe(255);
      }
    } finally {
      stroke.release();
      buffer.release();
    }
    expect(memory.usedBytes).toBe(0);
  });

  it.each(['brush', 'eraser'] as const)('%s giữ điểm cuối ở vị trí nhả chuột', (tool) => {
    const editor = createTestEditor(240, 120);
    editors.push(editor);
    if (tool === 'eraser') {
      editor.tools.setActive('brush');
      editor.options.set('brush', { size: 100, hardness: 1, flow: 1 });
      editor.dispatchPointer('down', { x: 20, y: 60 });
      editor.dispatchPointer('move', { x: 220, y: 60 });
      editor.dispatchPointer('up', { x: 220, y: 60 });
    }
    editor.tools.setActive(tool);
    editor.options.set(tool, { size: 8, hardness: 1, opacity: 1 });
    const before = editor.readPixels();
    editor.dispatchPointer('down', { x: 20, y: 60 });
    editor.dispatchPointer('move', { x: 80, y: 60 });
    editor.dispatchPointer('up', { x: 140, y: 60 });
    const after = editor.readPixels();
    expect(pixelAt(after, 139, 60)[3]).toBe(tool === 'brush' ? 255 : 0);
    editor.undo();
    expect(editor.readPixels().data).toEqual(before.data);
    editor.redo();
    expect(editor.readPixels().data).toEqual(after.data);
  });
});
