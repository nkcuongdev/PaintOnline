/**
 * Nhật ký lỗi cục bộ (mục 10.3): dự án không dùng dịch vụ error-tracking, nên lỗi được ghi ngay
 * trong trình duyệt và xem được trong Cài đặt; người dùng tự tải file JSON khi cần báo lỗi. Lỗi gần
 * nhất kèm bản ghi input ("hộp đen" của Editor) để tái hiện bằng `__paint.replay()` (mục 11.1).
 *
 * Lưu ở localStorage (đồng bộ — ghi được cả khi app đang sập; có thể bị chặn ở chế độ riêng tư thì
 * chỉ giữ trong phiên). Không bao giờ gửi đi đâu.
 */

export type ErrorSource = 'window' | 'promise' | 'react' | 'storage' | 'engine';

export interface ErrorEntry {
  at: number;
  source: ErrorSource;
  message: string;
  stack?: string;
  /** Route lúc xảy ra lỗi (`#/project/<id>`). */
  route: string;
  version: string;
  /** Bản ghi input gần nhất (chỉ giữ ở vài lỗi mới nhất để nhật ký không phình to). */
  input?: unknown;
}

const STORAGE_KEY = 'paint-online:error-log';
/** Số lỗi giữ lại; lỗi cũ hơn bị bỏ. */
export const MAX_ENTRIES = 30;
/** Chỉ vài lỗi mới nhất giữ bản ghi input (mỗi bản ghi có thể vài chục KB). */
const MAX_WITH_INPUT = 3;
const MAX_STACK = 4000;
const MAX_MESSAGE = 1000;
/** Lỗi lặp lại liên tục (vd. trong vòng render) chỉ ghi một lần mỗi khoảng này. */
const DEDUPE_MS = 2000;

let memory: ErrorEntry[] | null = null;
let inputProvider: (() => unknown) | null = null;
const listeners = new Set<() => void>();

function read(): ErrorEntry[] {
  if (memory) return memory;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    memory = Array.isArray(parsed) ? (parsed as ErrorEntry[]).filter(isEntry) : [];
  } catch {
    memory = [];
  }
  return memory;
}

function isEntry(value: unknown): value is ErrorEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Partial<ErrorEntry>;
  return typeof e.at === 'number' && typeof e.message === 'string';
}

function write(entries: ErrorEntry[]): void {
  memory = entries;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Bị chặn hoặc đầy: bỏ bản ghi input rồi thử lại; không được nữa thì chỉ giữ trong phiên.
    try {
      const light = entries.map(({ input: _input, ...rest }) => rest);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(light));
    } catch {
      // Chỉ giữ trong bộ nhớ.
    }
  }
  for (const listener of listeners) listener();
}

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: `${error.name}: ${error.message}`.slice(0, MAX_MESSAGE),
      stack: error.stack?.slice(0, MAX_STACK),
    };
  }
  let message: string;
  try {
    message = typeof error === 'string' ? error : JSON.stringify(error);
  } catch {
    message = String(error);
  }
  return { message: message.slice(0, MAX_MESSAGE) };
}

/** Nguồn bản ghi input (Editor đang mở) — app đăng ký khi mở project. */
export function setInputProvider(provider: (() => unknown) | null): void {
  inputProvider = provider;
}

export function recordError(source: ErrorSource, error: unknown): void {
  const { message, stack } = describe(error);
  const entries = read();
  const last = entries.at(-1);
  const now = Date.now();
  if (last?.message === message && now - last.at < DEDUPE_MS) return;
  let input: unknown;
  try {
    input = inputProvider?.() ?? undefined;
  } catch {
    input = undefined;
  }
  const entry: ErrorEntry = {
    at: now,
    source,
    message,
    stack,
    route: typeof window === 'undefined' ? '' : window.location.hash,
    version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
    input,
  };
  const next = [...entries, entry].slice(-MAX_ENTRIES);
  // Bỏ bản ghi input ở các lỗi cũ.
  for (let i = 0; i < next.length - MAX_WITH_INPUT; i++) {
    const old = next[i];
    if (old.input !== undefined) next[i] = { ...old, input: undefined };
  }
  write(next);
}

export function errorLog(): readonly ErrorEntry[] {
  return read();
}

export function clearErrorLog(): void {
  write([]);
}

export function subscribeErrorLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** File JSON để người dùng tự gửi khi báo lỗi. */
export function errorLogBlob(): Blob {
  const payload = {
    format: 'paint-online-error-log',
    version: 1,
    exportedAt: new Date().toISOString(),
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    entries: read(),
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

/** Bắt lỗi chưa xử lý của trang (gọi một lần lúc khởi động). */
export function installErrorCapture(target: Window = window): () => void {
  const onError = (event: ErrorEvent) => {
    // Lỗi tải tài nguyên (img, script) không có `error` — bỏ qua.
    if (event.error === undefined && !event.message) return;
    recordError('window', event.error ?? event.message);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    recordError('promise', event.reason);
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}

/** Chỉ dùng trong test. */
export function resetErrorLogForTest(): void {
  memory = null;
  inputProvider = null;
}
