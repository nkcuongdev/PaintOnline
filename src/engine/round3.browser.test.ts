import { afterEach, expect, it, vi } from 'vitest';
import type { Editor } from './core/Editor';
import { createTestEditor } from './testing/helpers';
import { SurfaceAllocationError } from './memory/surfaces';
import type { History } from './history/History';
import type { Command } from './history/types';
import { Renderer } from './render/Renderer';

let editor: Editor | null = null;
afterEach(() => {
  vi.restoreAllMocks();
  editor?.dispose();
  editor = null;
});

it.each(['undo', 'redo'] as const)(
  'R04: second %s allocation failure publishes the partial state to render/UI/autosave',
  (direction) => {
    editor = createTestEditor(32, 32);
    editor.layers.add();
    editor.layers.add();
    if (direction === 'redo') editor.historyGoTo(0);
    const history = (editor as unknown as { history: History }).history;
    const before = history.summary().position;
    const rev = editor.document!.rev;
    // Layer commands keep real document/layer ownership; fail the second operation.
    const stack = history.summary().entries;
    expect(stack).toHaveLength(2);
    // Throw before the second command's mutation using its command method.
    const commands = history as unknown as {
      undoStack: Command[];
      redoStack: Command[];
    };
    const second = direction === 'undo' ? commands.undoStack.at(-2)! : commands.redoStack.at(-2)!;
    vi.spyOn(second, direction === 'undo' ? 'undo' : 'execute').mockImplementation(() => {
      throw new SurfaceAllocationError(32, 32);
    });
    const changed = vi.fn();
    const historyChanged = vi.fn();
    const notices = vi.fn();
    editor.on('documentChanged', changed);
    editor.on('historyChanged', historyChanged);
    editor.on('notice', notices);
    const render = vi.spyOn(Renderer.prototype, 'contentChanged');
    expect(editor.historyGoTo(direction === 'undo' ? 0 : 2)).toBe(true);
    expect(editor.document!.rev).toBe(rev + 1);
    expect(history.summary().position).toBe(before + (direction === 'undo' ? -1 : 1));
    expect(editor.document!.layers).toHaveLength(2);
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ rev: rev + 1 }));
    expect(historyChanged).toHaveBeenCalled();
    expect(render).toHaveBeenCalled();
    expect(notices).toHaveBeenCalledWith({ code: 'history.partial' });
  },
);
