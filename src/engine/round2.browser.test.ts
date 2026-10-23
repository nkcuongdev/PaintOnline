import { afterEach, expect, it } from 'vitest';
import type { Editor } from './core/Editor';
import { createTestEditor, pixelAt } from './testing/helpers';
import { inlineWorkerClient } from '@/services/workers/inline';
import { BLEND_MODES, type DocumentBackground, type BlendMode } from './core/types';
import type { DocumentLayerSpec } from './core/Document';
import { SurfaceAllocationError } from './memory/surfaces';
import { vi } from 'vitest';

const editors: Editor[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const e of editors.splice(0)) e.dispose();
  document.body.replaceChildren();
});

it('A07: bottom pair opacity/blend/alpha and raster/vector matrix preserves exact pixels through undo/redo', () => {
  const image = new ImageData(8, 8);
  for (let i = 0; i < image.data.length; i += 4)
    image.data.set([120, 60, 180, i % 8 === 0 ? 128 : 255], i);
  const backgrounds: DocumentBackground[] = [
    { kind: 'transparent' },
    { kind: 'color', color: '#FFFFFFFF' },
  ];
  for (const background of backgrounds)
    for (const blendMode of BLEND_MODES)
      for (const opacity of [0, 0.5, 1])
        for (const kind of ['raster', 'vector'] as const)
          for (const lowerKind of ['raster', 'vector'] as const) {
            const editor = createTestEditor(8, 8);
            try {
              const vector: DocumentLayerSpec = {
                kind: 'vector',
                name: 'upper',
                opacity,
                blendMode,
                objects: [
                  {
                    id: 'rect',
                    type: 'rect',
                    rect: { x: 1, y: 1, width: 4, height: 4 },
                    rotation: 0,
                    opacity: 0.5,
                    fill: '#00FF00FF',
                    cornerRadius: 0,
                  },
                ],
              };
              editor.createDocument({
                width: 8,
                height: 8,
                background,
                layers: [
                  lowerKind === 'raster'
                    ? { kind: 'raster', name: 'lower', image, opacity: 0.5 }
                    : { ...vector, name: 'lower', opacity: 0.5, blendMode: 'normal' },
                  kind === 'raster' ? { kind, name: 'upper', image, opacity, blendMode } : vector,
                ],
              });
              const before = [...editor.readPixels().data];
              expect(
                editor.layers.mergeDown(editor.document!.activeLayerId),
                `${background.kind}/${blendMode}/${opacity}/${lowerKind}/${kind}`,
              ).toBe(true);
              expect([...editor.readPixels().data]).toEqual(before);
              const after = [...editor.readPixels().data];
              expect(editor.undo()).toBe(true);
              expect([...editor.readPixels().data]).toEqual(before);
              expect(editor.redo()).toBe(true);
              expect([...editor.readPixels().data]).toEqual(after);
            } finally {
              editor.dispose();
            }
          }
});

it.each(BLEND_MODES.filter((b): b is Exclude<BlendMode, 'normal'> => b !== 'normal'))(
  'A07: %s above an unrelated layer is blocked before mutation',
  (blendMode) => {
    const editor = createTestEditor(8, 8);
    editors.push(editor);
    editor.layers.add();
    const upper = editor.layers.add()!;
    editor.layers.setProps(upper, { blendMode });
    const before = editor.serialize();
    const history = editor.historySummary();
    const notices: string[] = [];
    editor.on('notice', ({ code }) => {
      notices.push(code);
    });
    // Menu remains enabled so executing the action explains the blocker.
    expect(editor.layers.canMergeDown(upper)).toBe(true);
    expect(editor.layers.mergeDown(upper)).toBe(false);
    expect(notices).toEqual(['layer.mergeBackdrop']);
    expect(editor.serialize()).toEqual(before);
    expect(editor.historySummary()).toEqual(history);
  },
);

it('A07: allocation refusal retains both original layers, pixels, history and memory', () => {
  const editor = createTestEditor(8, 8);
  editors.push(editor);
  const image = new ImageData(8, 8);
  image.data.fill(255);
  editor.createDocument({
    width: 8,
    height: 8,
    background: { kind: 'transparent' },
    layers: [
      { kind: 'raster', name: 'lower', image, opacity: 0.5 },
      { kind: 'raster', name: 'upper', image },
    ],
  });
  const before = editor.serialize();
  const pixels = [...editor.readPixels().data];
  const memory = editor.memory.usedBytes;
  const fail = vi.spyOn(editor.memory, 'reserve').mockImplementation(() => {
    throw new SurfaceAllocationError(8, 8);
  });
  expect(editor.layers.mergeDown(editor.document!.activeLayerId)).toBe(false);
  fail.mockRestore();
  expect(editor.serialize()).toEqual(before);
  expect([...editor.readPixels().data]).toEqual(pixels);
  expect(editor.memory.usedBytes).toBe(memory);
});

it('A11: layer cap covers add/duplicate, auto annotation, floating paste and document creation', async () => {
  const editor = createTestEditor(8, 8);
  editors.push(editor);
  const layers: DocumentLayerSpec[] = Array.from({ length: 200 }, (_, i) => ({
    kind: 'raster',
    name: `layer ${i}`,
  }));
  expect(
    editor.createDocument({ width: 8, height: 8, background: { kind: 'transparent' }, layers }),
  ).toBe(true);
  const before = editor.serialize();
  expect(editor.layers.add()).toBeNull();
  expect(editor.layers.add('vector')).toBeNull();
  expect(editor.layers.duplicate(editor.document!.activeLayerId)).toBeNull();
  editor.tools.setActive('rect');
  editor.dispatchPointer('down', { x: 1, y: 1 });
  editor.dispatchPointer('up', { x: 6, y: 6 });
  expect(editor.serialize()).toEqual(before);
  const bitmap = await createImageBitmap(new ImageData(2, 2));
  expect(editor.selection.paste(bitmap, { x: 1, y: 1 })).toBe(true);
  bitmap.close();
  expect(editor.prepareForOutput()).toBe(false);
  expect(editor.selection.isFloating).toBe(true);
  expect(editor.document!.layers).toHaveLength(200);
  editor.selection.cancel();
  expect(
    editor.createDocument({
      width: 8,
      height: 8,
      background: { kind: 'transparent' },
      layers: [...layers, layers[0]],
    }),
  ).toBe(false);
  expect(editor.serialize()).toEqual(before);
});

it('A07: Merge Down bakes lower opacity, preserves pixels and restores both states with undo/redo', () => {
  const editor = createTestEditor(8, 8);
  editors.push(editor);
  const red = new ImageData(8, 8);
  const blue = new ImageData(4, 4);
  for (let i = 0; i < red.data.length; i += 4) red.data.set([255, 0, 0, 255], i);
  for (let i = 0; i < blue.data.length; i += 4) blue.data.set([0, 0, 255, 255], i);
  editor.createDocument({
    width: 8,
    height: 8,
    background: { kind: 'color', color: '#FFFFFFFF' },
    layers: [
      { kind: 'raster', name: 'lower', opacity: 0.5, image: red },
      { kind: 'raster', name: 'upper', image: blue },
    ],
  });
  const before = [...editor.readPixels().data];
  expect(pixelAt(editor.readPixels(), 1, 1)).toEqual([0, 0, 255, 255]);
  expect(editor.layers.mergeDown(editor.document!.activeLayerId)).toBe(true);
  expect([...editor.readPixels().data]).toEqual(before);
  expect(editor.undo()).toBe(true);
  expect(editor.document!.layers).toHaveLength(2);
  expect(editor.document!.layers[0].opacity).toBe(0.5);
  expect([...editor.readPixels().data]).toEqual(before);
  expect(editor.redo()).toBe(true);
  expect([...editor.readPixels().data]).toEqual(before);
});

it.each(['resolve', 'reject'] as const)(
  'A13: cancel/reopen while old preview will %s starts the current preview without a slider update',
  async (outcome) => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const calls: number[] = [];
    const workers = {
      ...inlineWorkerClient,
      applyFilter: async (request: Parameters<typeof inlineWorkerClient.applyFilter>[0]) => {
        calls.push(request.steps[0].id === 'brightness' ? request.steps[0].amount : 0);
        if (calls.length === 1) {
          await gate;
          if (outcome === 'reject') throw new Error('old preview failed');
        }
        return inlineWorkerClient.applyFilter(request);
      },
    };
    const editor = createTestEditor(8, 8, { workers });
    editors.push(editor);
    const image = new ImageData(8, 8);
    image.data.fill(100);
    for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
    editor.createDocument({
      width: 8,
      height: 8,
      background: { kind: 'transparent' },
      layers: [{ kind: 'raster', name: 'source', image }],
    });
    const host = document.createElement('div');
    host.style.width = '8px';
    host.style.height = '8px';
    document.body.append(host);
    editor.mount(host);
    editor.viewport.setDpr(1);
    editor.viewport.setSize(8, 8);
    editor.viewport.set({ zoom: 1, panX: 0, panY: 0 });
    editor.filters.begin([{ id: 'brightness', amount: 10 }]);
    editor.filters.cancel();
    expect(editor.filters.begin([{ id: 'brightness', amount: 20 }])).toBe(true);
    finish();
    // Drain the known promise chain; no wall-clock race or increased timeout.
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(calls).toEqual([10, 20]);
    expect(editor.filters.previewStats.previews).toBe(1);
    expect(pixelAt(editor.readPixels(), 0, 0)).toEqual([100, 100, 100, 255]);
    expect(editor.filters.state).not.toBeNull();
    editor.flush();
    expect([...editor.displayCanvas!.getContext('2d')!.getImageData(4, 4, 1, 1).data]).toEqual([
      151, 151, 151, 255,
    ]);
  },
);

it('A13: disposing a reopened session while the old worker is pending never recreates preview resources', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const workers = {
    ...inlineWorkerClient,
    applyFilter: async (request: Parameters<typeof inlineWorkerClient.applyFilter>[0]) => {
      calls++;
      await gate;
      return inlineWorkerClient.applyFilter(request);
    },
  };
  const editor = createTestEditor(8, 8, { workers });
  const image = new ImageData(8, 8);
  image.data.fill(255);
  editor.createDocument({
    width: 8,
    height: 8,
    background: { kind: 'transparent' },
    layers: [{ kind: 'raster', name: 'source', image }],
  });
  editor.filters.begin([{ id: 'brightness', amount: 10 }]);
  editor.filters.cancel();
  editor.filters.begin([{ id: 'brightness', amount: 20 }]);
  editor.dispose();
  release();
  for (let i = 0; i < 30; i++) await Promise.resolve();
  expect(calls).toBe(1);
  expect(editor.filters.previewStats.previews).toBe(0);
  expect(editor.memory.usedBytes).toBe(0);
});
