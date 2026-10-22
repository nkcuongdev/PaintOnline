import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  current: vi.fn(),
  dirty: vi.fn(),
  save: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('@/app/editor/session', () => ({
  getCurrentProject: mocks.current,
  hasUnsavedChanges: mocks.dirty,
  saveCurrentProject: mocks.save,
}));
vi.mock('@/stores/ui', () => ({ toast: mocks.toast }));
import { applyPendingUpdate } from './pwa';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.current.mockReturnValue({ readOnly: false });
  mocks.dirty.mockReturnValue(false);
  mocks.save.mockResolvedValue(true);
});
describe('R01 — activation/reload requires a durable, settled editor', () => {
  it.each(['false', 'reject'])(
    'save %s leaves waiting worker untouched and offers retry',
    async (failure) => {
      if (failure === 'reject') mocks.save.mockRejectedValue(new Error('save failed'));
      else mocks.save.mockResolvedValue(false);
      const update = vi.fn().mockResolvedValue(undefined);
      expect(await applyPendingUpdate(update)).toBe(false);
      expect(update).not.toHaveBeenCalled();
      expect(mocks.toast).toHaveBeenCalledWith(
        'error',
        expect.any(String),
        expect.objectContaining({
          persistent: true,
          action: expect.objectContaining({ run: expect.any(Function) as unknown }) as unknown,
        }),
      );
    },
  );
  it('awaits in-progress encoding; refuses new work made during the save', async () => {
    let finish!: (value: boolean) => void;
    mocks.save.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
    );
    const update = vi.fn().mockResolvedValue(undefined);
    const pending = applyPendingUpdate(update);
    expect(update).not.toHaveBeenCalled();
    mocks.dirty.mockReturnValue(true);
    finish(true);
    expect(await pending).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
  it('refuses activation when the project changed while saving', async () => {
    mocks.save.mockImplementation(() => {
      mocks.current.mockReturnValue({ readOnly: false });
      return true;
    });
    const update = vi.fn().mockResolvedValue(undefined);
    expect(await applyPendingUpdate(update)).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
  it('activates after a successful strict save', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    expect(await applyPendingUpdate(update)).toBe(true);
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(true);
  });
  it.each(['home', 'clean-readonly'])('updates safely from %s', async (mode) => {
    mocks.current.mockReturnValue(mode === 'home' ? null : { readOnly: true });
    const update = vi.fn().mockResolvedValue(undefined);
    expect(await applyPendingUpdate(update)).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(true);
  });
  it('readonly with unsaved work must not reload', async () => {
    mocks.current.mockReturnValue({ readOnly: true });
    mocks.dirty.mockReturnValue(true);
    mocks.save.mockResolvedValue(false);
    const update = vi.fn().mockResolvedValue(undefined);
    expect(await applyPendingUpdate(update)).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
