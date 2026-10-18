import type { ID } from '@/engine/core/types';
import { broadcast, onChannelMessage, TAB_ID } from './channel';

/**
 * Một tab ghi (mục 6.6, 10.1): khóa Web Locks theo project; tab không giữ khóa mở project ở chế
 * độ chỉ đọc. Trình duyệt không có Web Locks thì dùng BroadcastChannel hỏi/đáp (mục 11.4).
 */
export interface ProjectLock {
  readonly projectId: ID;
  /** Khóa bị tab khác lấy (steal) — tab này phải chuyển sang chỉ đọc. */
  onLost(listener: () => void): () => void;
  release(): void;
}

export interface AcquireOptions {
  /**
   * Chờ tối đa bao lâu nếu tab khác đang giữ (ms). 0 = không chờ (mở project: thấy tab khác giữ
   * thì mở chỉ đọc).
   */
  waitMs?: number;
  /** Hết thời gian chờ thì lấy hẳn khóa (tab giữ khóa bị treo). */
  stealOnTimeout?: boolean;
}

function noop(): void {
  // Thay bằng hàm resolve thật ngay khi Promise được tạo.
}

function lockName(projectId: ID): string {
  return `paint-online:project:${projectId}`;
}

function hasWebLocks(): boolean {
  return typeof navigator !== 'undefined' && 'locks' in navigator;
}

class HeldLock implements ProjectLock {
  private readonly lostListeners = new Set<() => void>();
  private released = false;

  constructor(
    readonly projectId: ID,
    private readonly free: () => void,
  ) {}

  onLost(listener: () => void): () => void {
    this.lostListeners.add(listener);
    return () => {
      this.lostListeners.delete(listener);
    };
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    this.free();
  }

  lost(): void {
    if (this.released) return;
    this.released = true;
    for (const listener of this.lostListeners) listener();
  }
}

/** Lấy khóa ghi của project; null nếu tab khác đang giữ (sau thời gian chờ). */
export function acquireProjectLock(
  projectId: ID,
  options: AcquireOptions = {},
): Promise<ProjectLock | null> {
  return hasWebLocks()
    ? acquireWebLock(projectId, options)
    : acquireChannelLock(projectId, options);
}

async function acquireWebLock(projectId: ID, options: AcquireOptions): Promise<ProjectLock | null> {
  const wait = options.waitMs ?? 0;
  const first = await requestWebLock(
    projectId,
    wait > 0 ? { waitMs: wait } : { ifAvailable: true },
  );
  if (first || !options.stealOnTimeout) return first;
  return requestWebLock(projectId, { steal: true });
}

function requestWebLock(
  projectId: ID,
  mode: { ifAvailable: true } | { waitMs: number } | { steal: true },
): Promise<ProjectLock | null> {
  return new Promise((resolve) => {
    let free: () => void = noop;
    const held = new Promise<void>((r) => {
      free = r;
    });
    let handle: HeldLock | null = null;
    const signal = 'waitMs' in mode ? AbortSignal.timeout(mode.waitMs) : undefined;
    const lockOptions: LockOptions =
      'ifAvailable' in mode
        ? { ifAvailable: true }
        : 'steal' in mode
          ? { steal: true }
          : { signal };
    navigator.locks
      .request(lockName(projectId), lockOptions, async (lock) => {
        if (!lock) {
          resolve(null);
          return;
        }
        handle = new HeldLock(projectId, free);
        resolve(handle);
        await held;
      })
      .catch(() => {
        // Hết thời gian chờ (signal) → không lấy được; đang giữ mà bị lấy mất (steal) → mất khóa.
        if (handle) handle.lost();
        else resolve(null);
      });
  });
}

// --- Fallback BroadcastChannel ---------------------------------------------------------

const PROBE_WAIT_MS = 300;
const held = new Set<ID>();

let responderInstalled = false;
function installResponder(): void {
  if (responderInstalled) return;
  responderInstalled = true;
  onChannelMessage((message) => {
    if (message.type === 'lock-probe' && held.has(message.projectId)) {
      broadcast({ type: 'lock-held', projectId: message.projectId, to: message.from });
    }
  });
}

async function probe(projectId: ID): Promise<boolean> {
  return new Promise((resolve) => {
    const off = onChannelMessage((message) => {
      if (
        message.type === 'lock-held' &&
        message.projectId === projectId &&
        message.to === TAB_ID
      ) {
        off();
        resolve(true);
      }
    });
    broadcast({ type: 'lock-probe', projectId, from: TAB_ID });
    setTimeout(() => {
      off();
      resolve(false);
    }, PROBE_WAIT_MS);
  });
}

async function acquireChannelLock(
  projectId: ID,
  options: AcquireOptions,
): Promise<ProjectLock | null> {
  installResponder();
  const deadline = Date.now() + (options.waitMs ?? 0);
  let taken = await probe(projectId);
  while (taken && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, PROBE_WAIT_MS));
    taken = await probe(projectId);
  }
  if (taken && !options.stealOnTimeout) return null;
  held.add(projectId);
  return new HeldLock(projectId, () => {
    held.delete(projectId);
  });
}
