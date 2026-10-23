import { expect, test, type Page } from '@playwright/test';
import { openEditorFromPreset, waitForStartScreen } from './helpers';

type GateWindow = typeof window & {
  round2Gate?: { id: string; held: number; release: (() => void) | null };
};

async function route(page: Page, id: string | null) {
  await page.evaluate((projectId) => {
    location.hash = projectId ? `#/project/${projectId}` : '#/';
  }, id);
}

/** Hold only a document read in this test's fresh context, keeping native IDB transactions intact. */
async function holdLoad(page: Page, id: string) {
  await page.evaluate((projectId) => {
    const state = window as GateWindow;
    state.round2Gate = { id: projectId, held: 0, release: null };
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const add = IDBRequest.prototype.addEventListener;
    IDBRequest.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (!listener) return;
      if (type !== 'success') {
        add.call(this, type, listener, options);
        return;
      }
      const wrapped = (event: Event) => {
        const gate = state.round2Gate;
        const source = this.source;
        const result = this.result as { projectId?: string } | undefined;
        const invoke = () => {
          if (typeof listener === 'function') listener.call(this, event);
          else listener.handleEvent(event);
        };
        if (
          gate &&
          source instanceof IDBObjectStore &&
          source.name === 'documents' &&
          source.transaction.mode === 'readonly' &&
          result?.projectId === gate.id
        ) {
          gate.held++;
          gate.release = invoke;
        } else invoke();
      };
      add.call(this, type, wrapped, options);
    };
  }, id);
}
async function releaseLoad(page: Page) {
  await page.evaluate(() => {
    const state = window as GateWindow;
    const release = state.round2Gate?.release;
    delete state.round2Gate;
    release?.();
  });
}

test('A06: delayed A → B → A and Back during load keep route, active project and write ownership consistent', async ({
  page,
}) => {
  await openEditorFromPreset(page);
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  const a = (await page.getByTestId('editor-screen').getAttribute('data-project-id'))!;
  await page.getByTestId('back-to-home').click();
  await waitForStartScreen(page);
  await page.getByTestId('preset-square').click();
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  const b = (await page.getByTestId('editor-screen').getAttribute('data-project-id'))!;
  await page.getByTestId('back-to-home').click();
  await waitForStartScreen(page);
  await holdLoad(page, a);
  await route(page, a);
  await expect.poll(() => page.evaluate(() => (window as GateWindow).round2Gate?.held)).toBe(1);
  await route(page, b);
  await expect(page.getByTestId('editor-screen')).toHaveAttribute('data-project-id', b);
  await releaseLoad(page);
  await expect(page.getByTestId('editor-screen')).toHaveAttribute('data-project-id', b);
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  await route(page, a);
  await expect(page.getByTestId('editor-screen')).toHaveAttribute('data-project-id', a);
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  await route(page, null);
  await waitForStartScreen(page);
  // Reinstalling uses the previous wrapper with no gate, so only the new gate holds this read.
  await holdLoad(page, b);
  await route(page, b);
  await expect.poll(() => page.evaluate(() => (window as GateWindow).round2Gate?.held)).toBe(1);
  await page.goBack();
  await waitForStartScreen(page);
  await releaseLoad(page);
  await route(page, b);
  await expect(page.getByTestId('editor-screen')).toHaveAttribute('data-project-id', b);
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  const lockHeld = await page.evaluate(async (projectId) => {
    if (!navigator.locks) return null;
    return navigator.locks.request(
      `paint-online:project:${projectId}`,
      { ifAvailable: true },
      (lock) => lock === null,
    );
  }, b);
  if (lockHeld !== null) expect(lockHeld).toBe(true);
});
